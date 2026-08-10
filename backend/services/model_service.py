import os
import io
import base64

from tenacity import retry
from tenacity import stop_after_attempt
from tenacity import wait_fixed
from pydantic import BaseModel
from groq import Groq, RateLimitError, APIStatusError

from services.prompts import FOOD_ANALYSIS_PROMPT
from services.parser import parse_json

client = Groq(api_key=GROQ_API_KEY)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_fixed(3)
)
def ask_gemini(prompt, image=None):

    contents = [prompt]

    if image:
        contents.append(image)

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=contents
    )

    return response.text


def analyze_food(image_b64):

    image = Image.open(
        io.BytesIO(
            base64.b64decode(image_b64)
        )
    )

    text = ask_gemini(
        FOOD_ANALYSIS_PROMPT,
        image
    )

    return parse_json(text)