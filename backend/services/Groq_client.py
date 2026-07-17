"""
services/groq_client.py — shared Groq client instance + retry helper.
"""

import os
import time
import random

from groq import Groq, RateLimitError, APIStatusError

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("Set GROQ_API_KEY in your .env file before starting the server.")

client = Groq(api_key=GROQ_API_KEY)

# Confirm current model names at https://console.groq.com/docs/models — these
# change over time as Groq adds/retires models.
VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
CHAT_MODEL = "llama-3.3-70b-versatile"


def call_with_backoff(fn, max_retries: int = 5):
    """Retries a Groq call with exponential backoff on 429 / transient errors."""
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