import json
import re
from typing import List, Optional
import os
from groq import Client

# Define the COACH_SYSTEM_PROMPT with an appropriate default value
COACH_SYSTEM_PROMPT = "This is the default system prompt for the coach."


def parse_json(text: str):

    text = text.replace("```json", "")
    text = text.replace("```JSON", "")
    text = text.replace("```", "").strip()

    match = re.search(r"\{.*\}", text, re.DOTALL)

    if not match:
        raise ValueError("No JSON found")

    return json.loads(match.group())

def chat_with_coach(
    messages: List[dict],
    user_profile: Optional[dict] = None,
    today_calories_logged: Optional[int] = None,
) -> dict:
    context_lines = []
    if user_profile:
        context_lines.append(f"User profile: {json.dumps(user_profile)}")
    if today_calories_logged is not None:
        context_lines.append(f"Calories logged today so far: {today_calories_logged}")
 
    system_content = COACH_SYSTEM_PROMPT
    if context_lines:
        system_content += "\n\nContext:\n" + "\n".join(context_lines)
 
    full_messages = [{"role": "system", "content": system_content}] + messages
    # Initialize the OpenAI client
    client = groq.Client(api_key=os.environ["GROQ_API_KEY"])

    def do_call():
        return client.chat.completions.create(
            model=CHAT_MODEL,
            messages=full_messages,
            temperature=0.6,
            max_tokens=600,
        )
 
    completion = call_with_backoff(do_call)
    reply = completion.choices[0].message.content
 
    return {"reply": reply, "model_used": CHAT_MODEL}