from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import json
import base64
import logging
import math
import re
import bcrypt
import jwt
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from groq import Groq, RateLimitError, APIStatusError
import time
import random
import asyncio
import io
from PIL import Image

# ---------- Setup ----------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']

JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALG = 'HS256'

GROQ_API_KEY = os.environ.get('GROQ_API_KEY')
if not GROQ_API_KEY:
    raise RuntimeError("Set GROQ_API_KEY in your .env file.")

# Single shared Groq client for the whole app.
groq_client = Groq(api_key=GROQ_API_KEY)

# Check https://console.groq.com/docs/deprecations for current model status —
# llama-4-scout-17b-16e-instruct and llama-3.3-70b-versatile are deprecated on
# Groq's own timeline (shutdown 07/17/26 and 08/16/26 respectively), replaced here
# with their recommended successors.
VISION_MODEL = "qwen/qwen3.6-27b"
CHAT_MODEL = "openai/gpt-oss-120b"

mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]

app = FastAPI()

api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dietai")


# ---------- Groq call helper (retry on 429) ----------
def groq_call_with_backoff(fn, max_retries: int = 5):
    for attempt in range(max_retries):
        try:
            return fn()
        except RateLimitError:
            if attempt == max_retries - 1:
                raise
            time.sleep((2 ** attempt) + random.uniform(0, 1))
        except APIStatusError as e:
            if e.status_code == 429 and attempt < max_retries - 1:
                time.sleep((2 ** attempt) + random.uniform(0, 1))
            else:
                raise
    raise RuntimeError("Groq API unavailable after retries")


def normalize_item_name(s: str) -> str:
    s = s.strip().lower()
    if s.endswith("es"):
        s = s[:-2]
    elif s.endswith("s") and not s.endswith("ss"):
        s = s[:-1]
    return s


def is_in_pantry(item_name: str, pantry_names: set) -> bool:
    """Loose match: normalized substring overlap in either direction.
    Good enough for 'tomato' matching 'tomatoes' or 'cherry tomato'; not exact
    inventory tracking, so treat it as a helpful default the user can correct."""
    n = normalize_item_name(item_name)
    for p in pantry_names:
        if p and (p in n or n in p):
            return True
    return False


def decode_image(image_b64: str) -> Image.Image:
    raw = base64.b64decode(image_b64)
    return Image.open(io.BytesIO(raw)).convert("RGB")


def crop_normalized_box(image: Image.Image, box: dict, padding: float = 0.06) -> Optional[str]:
    """Crops a region given a normalized {x,y,w,h} box (0.0-1.0, top-left origin),
    with a small padding margin to compensate for imprecise LLM-estimated boxes.
    Returns a base64 JPEG string, or None if the box is degenerate."""
    W, H = image.size
    x = max(0.0, min(1.0, box.get("x", 0)))
    y = max(0.0, min(1.0, box.get("y", 0)))
    w = max(0.0, min(1.0, box.get("w", 0)))
    h = max(0.0, min(1.0, box.get("h", 0)))
    if w <= 0.01 or h <= 0.01:
        return None

    # Pad outward, clamped to image bounds
    px, py = w * padding, h * padding
    x0 = max(0.0, x - px)
    y0 = max(0.0, y - py)
    x1 = min(1.0, x + w + px)
    y1 = min(1.0, y + h + py)

    left, top, right, bottom = int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)
    if right - left < 10 or bottom - top < 10:
        return None  # too small to be a meaningful crop

    crop = image.crop((left, top, right, bottom))
    buf = io.BytesIO()
    crop.save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1]
            if text.startswith("json") or text.startswith("JSON"):
                text = text[4:]
    return text.strip()


def extract_json_object(text: str) -> str:
    """Extract the first balanced JSON object from model output.
    Some reasoning vision models wrap JSON in <think> blocks or markdown fences."""
    text = strip_code_fences(text)
    start = text.find("{")
    if start == -1:
        return text

    depth = 0
    in_string = False
    escape = False
    for i, ch in enumerate(text[start:], start=start):
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return text[start:].strip()


# ---------- Lightweight RAG helpers ----------
RAG_CHUNK_SIZE = 900
RAG_CHUNK_OVERLAP = 180
RAG_TOP_K = 4
RAG_EXTENSIONS = {".md", ".txt"}
RAG_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "for", "from",
    "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "should", "that",
    "the", "this", "to", "what", "when", "with", "you", "your",
}
RAG_KNOWLEDGE_DIRS = [
    Path(p.strip()) for p in os.environ.get(
        "RAG_KNOWLEDGE_DIRS",
        f"{ROOT_DIR / 'knowledge'},{ROOT_DIR.parent / 'memory'}",
    ).split(",")
    if p.strip()
]
_rag_cache = {"signature": None, "chunks": []}


def rag_tokenize(text: str) -> List[str]:
    return [t for t in re.findall(r"[a-zA-Z][a-zA-Z0-9_'-]{1,}", text.lower()) if t not in RAG_STOPWORDS]


def chunk_text(text: str, chunk_size: int = RAG_CHUNK_SIZE, overlap: int = RAG_CHUNK_OVERLAP) -> List[str]:
    clean = re.sub(r"\s+", " ", text).strip()
    if not clean:
        return []
    chunks = []
    start = 0
    while start < len(clean):
        end = min(len(clean), start + chunk_size)
        if end < len(clean):
            boundary = clean.rfind(". ", start, end)
            if boundary > start + chunk_size // 2:
                end = boundary + 1
        chunks.append(clean[start:end].strip())
        if end >= len(clean):
            break
        start = max(0, end - overlap)
    return chunks


def discover_rag_files() -> List[Path]:
    files = []
    for directory in RAG_KNOWLEDGE_DIRS:
        if not directory.exists():
            continue
        for path in directory.rglob("*"):
            if path.is_file() and path.suffix.lower() in RAG_EXTENSIONS:
                files.append(path)
    return sorted(files)


def load_rag_chunks() -> List[dict]:
    files = discover_rag_files()
    signature = tuple((str(path), path.stat().st_mtime_ns) for path in files)
    if _rag_cache["signature"] == signature:
        return _rag_cache["chunks"]

    chunks = []
    for path in files:
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            text = path.read_text(encoding="latin-1")
        except OSError as e:
            logger.warning(f"Skipping RAG file {path}: {e}")
            continue
        for idx, chunk in enumerate(chunk_text(text)):
            tokens = rag_tokenize(chunk)
            if tokens:
                chunks.append({
                    "source": str(path.relative_to(ROOT_DIR.parent)) if path.is_relative_to(ROOT_DIR.parent) else str(path),
                    "chunk_index": idx,
                    "text": chunk,
                    "tf": Counter(tokens),
                    "length": len(tokens),
                })

    _rag_cache["signature"] = signature
    _rag_cache["chunks"] = chunks
    logger.info(f"Loaded {len(chunks)} RAG chunks from {len(files)} files")
    return chunks


def retrieve_rag_context(query: str, top_k: int = RAG_TOP_K) -> List[dict]:
    chunks = load_rag_chunks()
    if not chunks:
        return []

    query_tokens = rag_tokenize(query)
    if not query_tokens:
        return []

    query_tf = Counter(query_tokens)
    doc_count = len(chunks)
    doc_freq = Counter()
    for token in set(query_tokens):
        doc_freq[token] = sum(1 for chunk in chunks if token in chunk["tf"])

    scored = []
    for chunk in chunks:
        score = 0.0
        for token, q_count in query_tf.items():
            if token not in chunk["tf"]:
                continue
            idf = math.log((doc_count + 1) / (doc_freq[token] + 1)) + 1
            score += q_count * chunk["tf"][token] * idf
        if score > 0:
            scored.append((score / math.sqrt(chunk["length"]), chunk))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [
        {"source": chunk["source"], "chunk_index": chunk["chunk_index"], "text": chunk["text"], "score": round(score, 4)}
        for score, chunk in scored[:top_k]
    ]


def format_rag_context(retrieved: List[dict]) -> str:
    if not retrieved:
        return "No relevant local knowledge-base snippets were retrieved for this question."
    blocks = []
    for i, item in enumerate(retrieved, start=1):
        blocks.append(f"[{i}] Source: {item['source']}#chunk-{item['chunk_index']}\n{item['text']}")
    return "\n\n".join(blocks)


# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str = "user"
    has_profile: bool = False

class ProfileIn(BaseModel):
    age: int = Field(gt=0, lt=120)
    gender: Literal["male", "female"]
    height_cm: float = Field(gt=0)
    weight_kg: float = Field(gt=0)
    target_weight_kg: float = Field(gt=0)
    activity_level: Literal["sedentary", "light", "moderate", "active", "athlete"]
    medical_conditions: List[str] = []
    allergies: List[str] = []
    dietary_preference: Literal["vegetarian", "vegan", "eggetarian", "non-vegetarian"]
    daily_budget: Optional[float] = None
    region: str = "Global"
    meal_timings: Dict[str, str] = {}
    goal: Literal[
        "weight_loss", "fat_loss", "weight_gain", "muscle_gain", "maintenance",
        "body_recomposition", "diabetes_management", "heart_healthy",
        "pcos_diet", "pregnancy_nutrition", "sports_nutrition", "general_healthy",
    ]

class FoodLogIn(BaseModel):
    food_name: str
    calories: float
    protein_g: float = 0
    carbs_g: float = 0
    fat_g: float = 0
    fiber_g: float = 0
    sugar_g: float = 0
    sodium_mg: float = 0
    meal_type: str = "snack"  # breakfast/lunch/dinner/snack
    portion: Optional[str] = None

class WaterIn(BaseModel):
    amount_ml: int

class WeightIn(BaseModel):
    weight_kg: float = Field(gt=0, lt=400)

class ChatIn(BaseModel):
    message: str
    session_id: Optional[str] = None

class ImageAnalyzeIn(BaseModel):
    image_base64: str
    mime: str = "image/jpeg"

class PantryItemIn(BaseModel):
    name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None

class OrderIn(BaseModel):
    items: List[str]
    notes: Optional[str] = None

class OrderStatusIn(BaseModel):
    status: str  # pending / ordered / delivered / cancelled

# ---------- Auth helpers ----------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_pw(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())

def create_token(user_id: str, kind: str = "access") -> str:
    delta = timedelta(minutes=60*24*7) if kind == "refresh" else timedelta(hours=12)
    payload = {"sub": user_id, "type": kind, "exp": datetime.now(timezone.utc) + delta}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def set_auth_cookies(response: Response, user_id: str):
    at = create_token(user_id, "access")
    rt = create_token(user_id, "refresh")
    response.set_cookie("access_token", at, httponly=True, samesite="lax", max_age=12*3600, path="/")
    response.set_cookie("refresh_token", rt, httponly=True, samesite="lax", max_age=7*86400, path="/")
    return at


def user_out(u: dict) -> dict:
    return {"id": u["id"], "email": u["email"], "name": u.get("name", ""), "role": u.get("role", "user"), "has_profile": bool(u.get("profile"))}


# ---------- Nutrition helpers ----------
ACTIVITY_FACTORS = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "active": 1.725, "athlete": 1.9}

def calc_bmr(gender: str, weight: float, height: float, age: int) -> float:
    base = 10*weight + 6.25*height - 5*age
    return base + 5 if gender.lower() == "male" else base - 161

def calc_tdee(bmr: float, activity: str) -> float:
    return bmr * ACTIVITY_FACTORS.get(activity, 1.2)

def calc_target_calories(tdee: float, goal: str) -> int:
    if goal in ("weight_loss", "fat_loss"):
        return int(tdee - 500)
    if goal in ("weight_gain", "muscle_gain"):
        return int(tdee + 400)
    if goal == "body_recomposition":
        return int(tdee - 200)  # small deficit, protein does the heavy lifting
    if goal == "pregnancy_nutrition":
        return int(tdee + 300)  # modest surplus; NOT medical advice, just a default
    # maintenance, diabetes_management, heart_healthy, pcos_diet,
    # sports_nutrition, general_healthy — maintenance calories as a safe default
    return int(tdee)

def macro_targets(target_cal: int, weight_kg: float, goal: str) -> dict:
    high_protein_goals = ("muscle_gain", "weight_gain", "body_recomposition", "sports_nutrition")
    protein_g = round(weight_kg * (1.8 if goal in high_protein_goals else 1.4))

    # Slightly different fat/carb splits for a few goals where it commonly matters;
    # everything else uses the standard 25% fat split.
    if goal == "heart_healthy":
        fat_pct = 0.25  # keep moderate, lean toward unsaturated in the meal-plan prompt instead
    elif goal in ("diabetes_management", "pcos_diet"):
        fat_pct = 0.30  # slightly higher fat / lower carb tends to help glycemic control
    else:
        fat_pct = 0.25

    fat_g = round((target_cal * fat_pct) / 9)
    carbs_g = round((target_cal - protein_g*4 - fat_g*9) / 4)
    sugar_g = 25 if goal in ("diabetes_management", "pcos_diet") else 36
    return {"calories": target_cal, "protein_g": protein_g, "carbs_g": carbs_g, "fat_g": fat_g,
            "fiber_g": 30, "sugar_g": sugar_g, "sodium_mg": 2300, "water_ml": 3000}


# ---------- Groq text helper (replaces the old Ollama call) ----------
async def llm_text(system: str, prompt: str, json_mode: bool = False, max_tokens: int = 1500) -> str:
    def do_call():
        kwargs = dict(
            model=CHAT_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            max_tokens=max_tokens,
        )
        if json_mode:
            # Constrains Groq's decoding so the output is guaranteed valid JSON syntax
            # (still your job to ensure the *shape* matches what you asked for).
            kwargs["response_format"] = {"type": "json_object"}
            # gpt-oss-120b is a reasoning model — it spends part of max_tokens on
            # internal "thinking" before writing the actual JSON. "low" keeps more
            # of the budget for the real output (a previous "" failed_generation
            # was this: reasoning ate the whole token budget, content came back empty).
        return groq_client.chat.completions.create(**kwargs)
    try:
        completion = groq_call_with_backoff(do_call)
    except APIStatusError as e:
        logger.error(f"Groq request failed: {e}")
        raise HTTPException(status_code=502, detail=f"Groq API error: {e}")
    return completion.choices[0].message.content


async def llm_json(system: str, prompt: str, max_attempts: int = 3, max_tokens: int = 3000) -> dict:
    """Calls llm_text in JSON mode and parses the result, retrying on parse
    failure (rare, but LLMs occasionally still slip in a stray character)."""
    last_raw = None
    for attempt in range(max_attempts):
        raw = await llm_text(system, prompt, json_mode=True, max_tokens=max_tokens)
        last_raw = raw
        text = strip_code_fences(raw)
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.warning(f"JSON parse attempt {attempt + 1}/{max_attempts} failed: {e}. Raw: {text[:500]}")
    raise HTTPException(
        status_code=502,
        detail=f"Model repeatedly returned invalid JSON. Last output: {(last_raw or '')[:300]}",
    )


# ---------- Groq vision helper (replaces the old Gemini call) ----------
def llm_vision(system: str, prompt: str, image_b64: str, mime: str = "image/jpeg", json_mode: bool = False) -> str:
    def do_call():
        kwargs = dict(
            model=VISION_MODEL,
            messages=[
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{image_b64}"},
                        },
                    ],
                },
            ],
            temperature=0.2,
            max_tokens=2500,
        )
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
            kwargs["reasoning_effort"] = "none"
        return groq_client.chat.completions.create(**kwargs)
    completion = groq_call_with_backoff(do_call)
    return completion.choices[0].message.content


def llm_vision_multi(system: str, prompt: str, images_b64: List[str], mime: str = "image/jpeg") -> str:
    """Sends several images in ONE Groq call (one message, multiple image_url
    blocks) instead of one call per image — far fewer round trips and far less
    exposure to per-request rate limits, while still keeping each item visually
    isolated (each image only shows one cropped food item)."""
    content = [{"type": "text", "text": prompt}]
    for img_b64 in images_b64:
        content.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_b64}"}})

    def do_call():
        return groq_client.chat.completions.create(
            model=VISION_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": content},
            ],
            temperature=0.2,
            max_tokens=1800,
            response_format={"type": "json_object"},
        )
    completion = groq_call_with_backoff(do_call)
    return completion.choices[0].message.content


# ---------- Routes ----------
@api.get("/")
async def root():
    return {"message": "Diet Planner AI API", "ok": True}


# Auth
@api.post("/auth/register")
async def register(data: RegisterIn, response: Response):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Email already registered")
    uid = str(uuid.uuid4())
    doc = {"id": uid, "email": email, "name": data.name, "password_hash": hash_pw(data.password),
           "role": "user", "created_at": datetime.now(timezone.utc).isoformat()}
    await db.users.insert_one(doc)
    token = set_auth_cookies(response, uid)
    return {"user": user_out(doc), "token": token}


@api.post("/auth/login")
async def login(data: LoginIn, response: Response):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_pw(data.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = set_auth_cookies(response, user["id"])
    return {"user": user_out(user), "token": token}


@api.post("/auth/logout")
async def logout(response: Response, _: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user_out(user)


# Profile
@api.post("/profile")
async def save_profile(data: ProfileIn, user: dict = Depends(get_current_user)):
    bmr = calc_bmr(data.gender, data.weight_kg, data.height_cm, data.age)
    tdee = calc_tdee(bmr, data.activity_level)
    target_cal = calc_target_calories(tdee, data.goal)
    targets = macro_targets(target_cal, data.weight_kg, data.goal)
    profile_doc = data.model_dump()
    profile_doc.update({"bmr": round(bmr), "tdee": round(tdee), "targets": targets,
                        "updated_at": datetime.now(timezone.utc).isoformat()})
    await db.users.update_one({"id": user["id"]}, {"$set": {"profile": profile_doc}})
    return {"profile": profile_doc}


@api.get("/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "profile": 1})
    return u.get("profile") if u else None


# Meal plan
@api.post("/meal-plan/generate")
async def generate_meal_plan(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    profile = u.get("profile") if u else None
    if not profile:
        raise HTTPException(400, "Complete your profile first")

    required_fields = ["gender", "activity_level", "dietary_preference", "goal", "age", "weight_kg", "height_cm", "target_weight_kg"]
    missing = [f for f in required_fields if not profile.get(f)]
    if missing or "targets" not in profile:
        raise HTTPException(
            400,
            f"Your profile is incomplete ({', '.join(missing) or 'targets missing'}). "
            "Please re-save your profile before generating a plan.",
        )

    targets = profile["targets"]
    system = ("You are an expert dietitian. Output ONLY valid JSON. No markdown. No code fences. "
              "Structure: {\"meals\":[{\"meal\":\"Breakfast\",\"time\":\"08:00\",\"food\":\"...\",\"ingredients\":[\"...\"],\"calories\":int,\"protein_g\":int,\"carbs_g\":int,\"fat_g\":int,\"why\":\"...\"}],\"daily_totals\":{\"calories\":int,\"protein_g\":int,\"carbs_g\":int,\"fat_g\":int},\"tips\":[\"...\"]}")
    prompt = (f"Create a 1-day personalized meal plan.\n"
              f"User: {profile['gender']}, age {profile['age']}, {profile['weight_kg']}kg, target {profile['target_weight_kg']}kg.\n"
              f"Goal: {profile['goal']}. Activity: {profile['activity_level']}.\n"
              f"Diet: {profile['dietary_preference']}. Region: {profile.get('region','Global')}.\n"
              f"Allergies: {', '.join(profile.get('allergies',[])) or 'none'}.\n"
              f"Medical: {', '.join(profile.get('medical_conditions',[])) or 'none'}.\n"
              f"Targets: {targets['calories']} kcal, P {targets['protein_g']}g, C {targets['carbs_g']}g, F {targets['fat_g']}g.\n"
              f"Include 5-6 meals: Breakfast, Snack, Lunch, Evening, Dinner, optionally Before Sleep.")
    raw_note = "Note: your entire response must be a single valid JSON object with no extra text."
    plan = await llm_json(system, prompt + "\n" + raw_note)

    plan_doc = {"id": str(uuid.uuid4()), "user_id": user["id"], "plan": plan,
                "created_at": datetime.now(timezone.utc).isoformat()}
    await db.meal_plans.insert_one(plan_doc)
    return {"id": plan_doc["id"], "plan": plan, "created_at": plan_doc["created_at"]}

@api.get("/meal-plan/latest")
async def latest_plan(user: dict = Depends(get_current_user)):
    doc = await db.meal_plans.find_one({"user_id": user["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    return doc


# Live food detection: stage 1 locates bounding boxes on the full image, then
# ALL crops are sent back to the model together in a single follow-up call —
# each crop is still visually isolated (one food item per image), which is what
# fixes "right box, wrong label" mixups, but batching keeps this to exactly 2
# Groq requests total regardless of how many items are found (fast + far less
# exposure to rate limits than one call per item).
MAX_DETECTED_ITEMS = 5

LOCALIZE_SYSTEM = (
    "You are a food region locator. Look at the image and find every distinct "
    "food/drink item's approximate location. Do NOT try to identify what each item "
    "is precisely — a rough guess name is fine, it will be re-checked separately.\n"
    "Return ONLY JSON, no markdown:\n"
    "{\"items\":[{\"name\":\"rough guess\",\"box\":{\"x\":0.0,\"y\":0.0,\"w\":0.0,\"h\":0.0}}]}\n"
    "Box values are fractions (0.0-1.0) of image width/height, origin top-left. "
    f"Return at most {MAX_DETECTED_ITEMS} items — the largest/clearest ones. "
    "If no food is visible, return {\"items\":[]}."
)


def build_live_detect_system(diet: str, allergies: str, medical: str, goal: str) -> str:
    return (
        "You are a real-time food detection and nutrition assistant. Look at the image "
        "and return the largest, clearest food or drink items visible. Estimate boxes, "
        "names, nutrition, and whether each item fits the user's diet.\n"
        f"User diet: {diet}. Allergies: {allergies}. Medical: {medical}. Goal: {goal}.\n"
        "RULES for `fit`:\n"
        "- false if it violates dietary preference or contains a listed allergen\n"
        "- false if it is clearly unsuitable for the user's medical condition or goal\n"
        "- true otherwise.\n"
        "Return ONLY JSON, no markdown:\n"
        "{\"items\":[{\"name\":\"...\",\"box\":{\"x\":0.0,\"y\":0.0,\"w\":0.0,\"h\":0.0},"
        "\"calories\":int,\"protein_g\":number,\"carbs_g\":number,\"fat_g\":number,"
        "\"confidence\":0.0,\"fit\":true,\"reason\":\"short why\"}]}\n"
        "Box values are fractions from 0.0 to 1.0 of image width/height, origin top-left. "
        f"Return at most {MAX_DETECTED_ITEMS} items. If no food is visible, return "
        "{\"items\":[]}."
    )


def build_identify_system(diet: str, allergies: str, medical: str, goal: str) -> str:
    return (
        "You are a food identification and nutrition expert. You will be shown several "
        "cropped photos, each containing exactly ONE food or drink item, in order "
        "(image 1, image 2, ...). For EACH image, identify the item precisely, estimate "
        "its nutrition, and decide if it fits the user's diet.\n"
        f"User diet: {diet}. Allergies: {allergies}. Medical: {medical}. Goal: {goal}.\n"
        "RULES for `fit`:\n"
        "- false if it violates dietary preference (e.g. meat for vegetarian/vegan; dairy/eggs for vegan)\n"
        "- false if it contains a listed allergen\n"
        "- false if clearly harmful for the user's medical condition or strongly opposes their goal "
        "(e.g. deep-fried/sugary for weight_loss or diabetes)\n"
        "- true otherwise.\n"
        "Return ONLY JSON, no markdown, with one entry per image IN ORDER:\n"
        "{\"items\":[{\"name\":\"...\",\"calories\":int,\"protein_g\":number,\"carbs_g\":number,"
        "\"fat_g\":number,\"confidence\":0.0,\"fit\":true,\"reason\":\"short why\"}]}\n"
        "Keep names short (1-3 words). If an image contains no identifiable food, "
        "set its name to \"unknown\" and confidence to 0. The items array length MUST "
        "exactly match the number of images shown."
    )


@api.post("/food/detect")
async def detect_food(body: ImageAnalyzeIn, user: dict = Depends(get_current_user)):
    if not body.image_base64:
        raise HTTPException(400, "Image required")
    img_b64 = body.image_base64.split(",", 1)[1] if body.image_base64.startswith("data:") else body.image_base64

    try:
        u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
        profile = (u or {}).get("profile") or {}
        diet = profile.get("dietary_preference", "any")
        allergies = ", ".join(profile.get("allergies", [])) or "none"
        medical = ", ".join(profile.get("medical_conditions", [])) or "none"
        goal = profile.get("goal", "general")

        # Live mode uses one compact vision request per frame. The upload flow can
        # spend more tokens on deep analysis; live scanning must stay lightweight
        # to avoid Groq image payload limits and rate-limit pressure.
        live_system = build_live_detect_system(diet, allergies, medical, goal)
        raw = await asyncio.to_thread(
            llm_vision, live_system, "Detect visible food items and return the JSON described.",
            img_b64, body.mime, True,
        )
        text = extract_json_object(raw)
        try:
            detected = json.loads(text)
        except json.JSONDecodeError:
            logger.error(f"Live detect parse: {text[:300]}")
            return {"items": []}

        items = []
        for result in detected.get("items", [])[:MAX_DETECTED_ITEMS]:
            if not result or str(result.get("name", "unknown")).lower() == "unknown":
                continue
            box = result.get("box") or {}
            clamped_box = {k: max(0.0, min(1.0, float(box.get(k, 0)))) for k in ("x", "y", "w", "h")}
            if clamped_box["w"] <= 0.01 or clamped_box["h"] <= 0.01:
                continue
            items.append({
                "name": result.get("name", "food"),
                "box": clamped_box,
                "calories": result.get("calories", 0),
                "protein_g": result.get("protein_g", 0),
                "carbs_g": result.get("carbs_g", 0),
                "fat_g": result.get("fat_g", 0),
                "confidence": result.get("confidence", 0),
                "fit": result.get("fit", True),
                "reason": result.get("reason", ""),
            })

        return {"items": items}

    except HTTPException:
        raise
    except APIStatusError as e:
        logger.error(f"Groq live detection failed: status={e.status_code} error={e}")
        if e.status_code == 413:
            raise HTTPException(413, "Live frame is too large. Try upload mode or reduce camera resolution.")
        if e.status_code == 400:
            raise HTTPException(502, "Groq could not process this live frame. Try better lighting or upload a photo.")
        if e.status_code in (401, 403):
            raise HTTPException(502, "Groq API key is invalid or does not have access to this vision model.")
        if e.status_code == 429:
            raise HTTPException(429, "Groq rate limit or credits issue. Live scan is slowing down.")
        raise HTTPException(502, "Groq live vision API failed. Try again.")
    except Exception as e:
        # Catch-all so a bad frame NEVER kills the connection outright (which is
        # what shows up in the browser as a confusing CORS/net::ERR_FAILED error).
        logger.error(f"detect_food failed: {e}")
        raise HTTPException(status_code=502, detail="Detection failed, try again.")



# Single-item food analysis (Groq vision) — used for a manual "analyze this photo" flow
@api.post("/food/analyze")
async def analyze_food_api(body: ImageAnalyzeIn, user: dict = Depends(get_current_user)):
    if not body.image_base64:
        raise HTTPException(400, "Image required")
    img_b64 = body.image_base64.split(",", 1)[1] if body.image_base64.startswith("data:") else body.image_base64

    system = "You are a certified nutrition expert analyzing a single food photo."
    prompt = """Return ONLY valid JSON, no markdown fences, matching exactly this shape:
{
 "food_name": "",
 "ingredients": [],
 "portion": "",
 "estimated_weight_g": 0,
 "calories": 0,
 "protein_g": 0,
 "carbs_g": 0,
 "fat_g": 0,
 "fiber_g": 0,
 "confidence": 0.0
}"""

    try:
        raw = await asyncio.to_thread(llm_vision, system, prompt, img_b64, body.mime, True)
    except APIStatusError as e:
        logger.error(f"Groq food analysis failed: status={e.status_code} error={e}")
        if e.status_code in (400, 413):
            raise HTTPException(413, "Image is too large or invalid. Try a smaller, clearer image.")
        if e.status_code in (401, 403):
            raise HTTPException(502, "Groq API key is invalid or does not have access to this vision model.")
        if e.status_code == 429:
            raise HTTPException(429, "Groq rate limit or credits issue. Try again later or check billing.")
        raise HTTPException(502, "Groq vision API failed. Try again.")
    except Exception as e:
        logger.error(f"Food analysis failed: {e}")
        raise HTTPException(502, "Food analysis failed. Try again.")
    text = strip_code_fences(raw)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.error(f"Analyze parse: {text[:300]}")
        raise HTTPException(502, "Could not parse food analysis. Try again.")


# Food logging
@api.post("/log/food")
async def log_food(data: FoodLogIn, user: dict = Depends(get_current_user)):
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["logged_at"] = datetime.now(timezone.utc).isoformat()
    doc["date"] = datetime.now(timezone.utc).date().isoformat()
    await db.food_logs.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/log/today")
async def todays_log(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    logs = await db.food_logs.find({"user_id": user["id"], "date": today}, {"_id": 0}).to_list(200)
    water = await db.water_logs.find({"user_id": user["id"], "date": today}, {"_id": 0}).to_list(200)
    totals = {"calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0, "sugar_g": 0, "sodium_mg": 0}
    for entry in logs:
        for k in totals:
            totals[k] += entry.get(k, 0) or 0
    water_ml = sum(w.get("amount_ml", 0) for w in water)
    return {"logs": logs, "totals": totals, "water_ml": water_ml}


@api.delete("/log/food/{log_id}")
async def delete_log(log_id: str, user: dict = Depends(get_current_user)):
    res = await db.food_logs.delete_one({"id": log_id, "user_id": user["id"]})
    return {"deleted": res.deleted_count}


@api.post("/log/water")
async def log_water(data: WaterIn, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], "amount_ml": data.amount_ml,
           "logged_at": datetime.now(timezone.utc).isoformat(),
           "date": datetime.now(timezone.utc).date().isoformat()}
    await db.water_logs.insert_one(doc)
    doc.pop("_id", None)
    return doc


# Weight tracking — one entry per day (re-logging the same day updates it)
@api.get("/weight/today")
async def weight_today(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    entry = await db.weight_logs.find_one({"user_id": user["id"], "date": today}, {"_id": 0})
    return {"logged": entry is not None, "entry": entry}


@api.get("/weight/history")
async def weight_history(user: dict = Depends(get_current_user)):
    entries = await db.weight_logs.find({"user_id": user["id"]}, {"_id": 0}).sort("date", 1).to_list(365)
    return {"entries": entries}


@api.post("/weight/log")
async def log_weight(data: WeightIn, user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    now = datetime.now(timezone.utc).isoformat()

    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], "weight_kg": data.weight_kg,
           "date": today, "logged_at": now}
    await db.weight_logs.update_one(
        {"user_id": user["id"], "date": today},
        {"$set": {"weight_kg": data.weight_kg, "logged_at": now},
         "$setOnInsert": {"id": doc["id"], "user_id": user["id"], "date": today}},
        upsert=True,
    )

    # Keep the profile's weight (and derived BMR/TDEE/targets) in sync with the
    # latest weigh-in, since the dashboard reads "current weight" from profile.
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    profile = (u or {}).get("profile")
    if profile:
        bmr = calc_bmr(profile["gender"], data.weight_kg, profile["height_cm"], profile["age"])
        tdee = calc_tdee(bmr, profile["activity_level"])
        target_cal = calc_target_calories(tdee, profile["goal"])
        targets = macro_targets(target_cal, data.weight_kg, profile["goal"])
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "profile.weight_kg": data.weight_kg,
                "profile.bmr": round(bmr), "profile.tdee": round(tdee), "profile.targets": targets,
                "profile.updated_at": now,
            }},
        )

    entry = await db.weight_logs.find_one({"user_id": user["id"], "date": today}, {"_id": 0})
    return entry


# Grocery list
@api.post("/grocery/generate")
async def grocery_list(user: dict = Depends(get_current_user)):
    plan_doc = await db.meal_plans.find_one({"user_id": user["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    if not plan_doc:
        raise HTTPException(400, "Generate a meal plan first")
    items = []
    for m in plan_doc["plan"].get("meals", []):
        items.extend(m.get("ingredients", []))
    system = ("You consolidate meal-plan ingredients into a clean grocery shopping list. "
              "Return ONLY JSON: {\"categories\":[{\"name\":\"Produce\",\"items\":[\"...\"]}]} with realistic categories "
              "(Produce, Proteins, Dairy, Grains, Pantry, Snacks). No markdown.")
    result = await llm_json(
        system,
        "Consolidate these ingredients (combine duplicates): " + ", ".join(items),
    )

    # Cross-check against the user's pantry so the UI can flag what's missing.
    pantry_docs = await db.pantry_items.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    pantry_names = {normalize_item_name(p["name"]) for p in pantry_docs}

    missing_items = []
    for cat in result.get("categories", []):
        enriched = []
        for raw_item in cat.get("items", []):
            in_stock = is_in_pantry(raw_item, pantry_names)
            enriched.append({"name": raw_item, "in_stock": in_stock})
            if not in_stock:
                missing_items.append(raw_item)
        cat["items"] = enriched

    result["missing_items"] = missing_items
    return result


# Pantry — tracks what the user already has at home
@api.get("/pantry")
async def list_pantry(user: dict = Depends(get_current_user)):
    items = await db.pantry_items.find({"user_id": user["id"]}, {"_id": 0}).sort("name", 1).to_list(500)
    return {"items": items}


@api.post("/pantry")
async def add_pantry_item(data: PantryItemIn, user: dict = Depends(get_current_user)):
    norm = normalize_item_name(data.name)
    existing = await db.pantry_items.find_one({"user_id": user["id"], "normalized_name": norm})
    now = datetime.now(timezone.utc).isoformat()
    if existing:
        update = {"quantity": data.quantity, "unit": data.unit, "updated_at": now}
        await db.pantry_items.update_one({"id": existing["id"]}, {"$set": update})
        existing.update(update)
        existing.pop("_id", None)
        return existing
    doc = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "name": data.name,
        "normalized_name": norm, "quantity": data.quantity, "unit": data.unit,
        "updated_at": now,
    }
    await db.pantry_items.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/pantry/{item_id}")
async def delete_pantry_item(item_id: str, user: dict = Depends(get_current_user)):
    res = await db.pantry_items.delete_one({"id": item_id, "user_id": user["id"]})
    return {"deleted": res.deleted_count}


# Orders — cart of missing items, saved internally and exportable as a plain-text list
def build_export_text(items: List[str], notes: Optional[str] = None) -> str:
    lines = [f"ForkFit Grocery Order — {datetime.now(timezone.utc).strftime('%b %d, %Y')}", ""]
    lines += [f"- {item}" for item in items]
    if notes:
        lines += ["", f"Notes: {notes}"]
    return "\n".join(lines)


@api.post("/grocery/order")
async def create_order(data: OrderIn, user: dict = Depends(get_current_user)):
    if not data.items:
        raise HTTPException(400, "No items to order")
    now = datetime.now(timezone.utc).isoformat()
    export_text = build_export_text(data.items, data.notes)
    doc = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "items": data.items,
        "notes": data.notes, "status": "pending", "export_text": export_text,
        "created_at": now, "updated_at": now,
    }
    await db.orders.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/orders")
async def list_orders(user: dict = Depends(get_current_user)):
    orders = await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"orders": orders}


@api.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    doc = await db.orders.find_one({"id": order_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Order not found")
    return doc


@api.patch("/orders/{order_id}/status")
async def update_order_status(order_id: str, data: OrderStatusIn, user: dict = Depends(get_current_user)):
    valid = {"pending", "ordered", "delivered", "cancelled"}
    if data.status not in valid:
        raise HTTPException(400, f"status must be one of {sorted(valid)}")
    now = datetime.now(timezone.utc).isoformat()
    res = await db.orders.update_one(
        {"id": order_id, "user_id": user["id"]},
        {"$set": {"status": data.status, "updated_at": now}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Order not found")
    doc = await db.orders.find_one({"id": order_id, "user_id": user["id"]}, {"_id": 0})
    return doc


@api.get("/orders/{order_id}/export")
async def export_order(order_id: str, user: dict = Depends(get_current_user)):
    doc = await db.orders.find_one({"id": order_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Order not found")
    return Response(content=doc["export_text"], media_type="text/plain")


# Chat (diet coach) — single route, backed by Groq, with history persisted in Mongo
@api.post("/chat")
async def chat(data: ChatIn, user: dict = Depends(get_current_user)):
    sid = data.session_id or f"chat-{user['id']}"

    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    profile = (u or {}).get("profile") or {}

    history_docs = await db.chat_messages.find(
        {"user_id": user["id"], "session_id": sid}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)

    retrieved_context = retrieve_rag_context(data.message)
    rag_context_text = format_rag_context(retrieved_context)

    system = (
        "You are ForkFit Coach, a supportive, evidence-based diet and nutrition assistant. "
        "You are warm, practical, and non-judgmental. Never diagnose medical or eating-disorder "
        "conditions — if symptoms suggest one, gently suggest a doctor or registered dietitian. "
        "Do not give precise numeric restriction plans to anyone showing signs of disordered eating. "
        "Keep responses concise (3-6 sentences) unless asked for something detailed like a meal plan. "
        "Ground suggestions in the user's profile and targets when relevant. "
        "Use the retrieved knowledge-base context below when it is relevant. If the context does not "
        "answer the question, say so briefly and rely on general nutrition guidance instead of inventing facts."
    )
    if profile:
        system += f"\n\nUser profile/targets: {json.dumps(profile.get('targets', {}))}, goal: {profile.get('goal')}"
    system += f"\n\nRetrieved knowledge-base context:\n{rag_context_text}"

    messages = [{"role": "system", "content": system}]
    for m in history_docs:
        messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": data.message})

    def do_call():
        return groq_client.chat.completions.create(
            model=CHAT_MODEL,
            messages=messages,
            temperature=0.6,
            max_tokens=600,
        )

    completion = groq_call_with_backoff(do_call)
    reply = completion.choices[0].message.content

    now = datetime.now(timezone.utc).isoformat()
    await db.chat_messages.insert_many([
        {"id": str(uuid.uuid4()), "user_id": user["id"], "session_id": sid,
         "role": "user", "content": data.message, "created_at": now},
        {"id": str(uuid.uuid4()), "user_id": user["id"], "session_id": sid,
         "role": "assistant", "content": reply, "created_at": now},
    ])

    return {
        "reply": reply,
        "session_id": sid,
        "rag_sources": [
            {"source": item["source"], "chunk_index": item["chunk_index"], "score": item["score"]}
            for item in retrieved_context
        ],
    }


@api.get("/chat/history")
async def chat_history(user: dict = Depends(get_current_user), session_id: Optional[str] = None):
    sid = session_id or f"chat-{user['id']}"
    msgs = await db.chat_messages.find({"user_id": user["id"], "session_id": sid}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"messages": msgs, "session_id": sid}


# Recommendations
@api.get("/recommendations")
async def recommendations(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    profile = u.get("profile") if u else None
    if not profile:
        return {"items": []}
    targets = profile["targets"]
    logs = await db.food_logs.find({"user_id": user["id"], "date": today}, {"_id": 0}).to_list(200)
    water = await db.water_logs.find({"user_id": user["id"], "date": today}, {"_id": 0}).to_list(200)
    totals = {"calories": 0, "protein_g": 0, "fiber_g": 0, "sugar_g": 0}
    for entry in logs:
        for k in totals:
            totals[k] += entry.get(k, 0) or 0
    water_ml = sum(w.get("amount_ml", 0) for w in water)
    items = []
    if totals["protein_g"] < targets["protein_g"] * 0.7:
        deficit = int(targets["protein_g"] - totals["protein_g"])
        items.append({"icon": "drumstick", "text": f"Increase protein by {deficit}g today (eggs, paneer, tofu, chicken)."})
    if water_ml < targets["water_ml"] * 0.6:
        items.append({"icon": "droplet", "text": f"Drink {targets['water_ml'] - water_ml} ml more water."})
    if totals["sugar_g"] > targets["sugar_g"]:
        items.append({"icon": "candy", "text": "You're over your sugar limit. Swap desserts for fruit."})
    if totals["fiber_g"] < targets["fiber_g"] * 0.5:
        items.append({"icon": "leaf", "text": "Add more fiber: oats, salad greens, beans."})
    if totals["calories"] > targets["calories"] * 1.1:
        items.append({"icon": "trending-up", "text": "Calories over target. Consider lighter dinner."})
    if not items:
        items.append({"icon": "sparkles", "text": "Great work! Stay consistent and hydrated."})
    return {"items": items}


# ---------- Lifecycle ----------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.food_logs.create_index([("user_id", 1), ("date", 1)])
    await db.water_logs.create_index([("user_id", 1), ("date", 1)])
    await db.meal_plans.create_index([("user_id", 1), ("created_at", -1)])
    await db.chat_messages.create_index([("user_id", 1), ("session_id", 1), ("created_at", 1)])
    await db.pantry_items.create_index([("user_id", 1), ("normalized_name", 1)], unique=True)
    await db.orders.create_index([("user_id", 1), ("created_at", -1)])
    await db.weight_logs.create_index([("user_id", 1), ("date", 1)], unique=True)
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@dietai.com").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": admin_email, "name": "Admin",
            "password_hash": hash_pw(admin_pw), "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Seeded admin user: {admin_email}")


@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', 'http://localhost:3000').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
