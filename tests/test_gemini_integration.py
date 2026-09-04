import os

import pytest

from app.config import Settings
from app.llm import GeminiClient


@pytest.mark.integration
@pytest.mark.asyncio
async def test_gemini_generation_if_key_present():
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        pytest.skip("GEMINI_API_KEY not configured")
    settings = Settings()
    client = GeminiClient(key, settings.gemini_model, settings.gemini_embedding_model)
    text = await client.generate_grounded_answer(
        "What is the refund window?",
        "Refund Policy: First-time purchases may be refunded within 7 calendar days.",
        "",
    )
    assert text
