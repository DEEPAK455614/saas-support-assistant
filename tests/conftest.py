import hashlib
import math
from collections import Counter
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.knowledge_base import load_knowledge_base
from app.main import app, get_services
from app.retrieval import InMemoryRetriever


class FakeEmbedder:
    """Deterministic bag-of-token hashing embedder for unit tests only."""

    DIM = 256

    @staticmethod
    def _embed(text: str) -> list[float]:
        tokens = [token.strip(".,!?;:()><-/").lower() for token in text.split()]
        stop = {"the","a","an","is","are","am","i","my","your","you","and","or","to","of","in","on","at","for","from","with","what","who","can","do","does","this","that","it","be","get"}
        normalized = []
        for token in tokens:
            if token in stop or not token:
                continue
            if token.startswith("cancel"):
                token = "cancel"
            elif token.startswith("refund"):
                token = "refund"
            elif token.startswith("deliver"):
                token = "delivery"
            normalized.append(token)
        counts = Counter(normalized)
        vec = [0.0] * FakeEmbedder.DIM
        for token, count in counts.items():
            digest = hashlib.sha256(token.encode()).digest()
            idx = int.from_bytes(digest[:2], "big") % FakeEmbedder.DIM
            vec[idx] += float(count)
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(text) for text in texts]

    async def embed_query(self, text: str) -> list[float]:
        return self._embed(text)


class FakeLLM:
    async def generate_grounded_answer(self, user_message: str, kb_context: str, tool_result: str) -> str:
        if tool_result and kb_context:
            return "The order status is verified from the order tool, and the applicable policy is verified from the knowledge base."
        if tool_result:
            return "The order status shown here is verified from the order tool."
        return "This answer is based only on the retrieved knowledge-base policy."


class FakeServices:
    def __init__(self) -> None:
        root = Path(__file__).resolve().parents[1]
        documents = load_knowledge_base(root / "data" / "faq.json")
        self.settings = Settings(GEMINI_API_KEY="test", RELEVANCE_THRESHOLD=0.18, TOP_K=3)
        self.gemini = FakeLLM()
        self.retriever = InMemoryRetriever(documents, FakeEmbedder(), top_k=3, threshold=0.18)


@pytest.fixture
def client():
    fake = FakeServices()
    app.dependency_overrides[get_services] = lambda: fake
    app.dependency_overrides[get_settings] = lambda: fake.settings
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
