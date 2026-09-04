import asyncio
import math
from dataclasses import dataclass

from app.knowledge_base import KnowledgeDocument
from app.llm import EmbeddingClientProtocol, EmbeddingError


@dataclass(frozen=True)
class RetrievalResult:
    document: KnowledgeDocument
    score: float


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        raise ValueError("Embedding vectors must be non-empty and have equal dimensions")
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class InMemoryRetriever:
    def __init__(
        self,
        documents: list[KnowledgeDocument],
        embedder: EmbeddingClientProtocol,
        top_k: int = 3,
        threshold: float = 0.72,
    ) -> None:
        self.documents = documents
        self.embedder = embedder
        self.top_k = top_k
        self.threshold = threshold
        self._document_vectors: list[list[float]] | None = None
        self._init_lock = asyncio.Lock()

    async def _ensure_index(self) -> None:
        if self._document_vectors is not None:
            return
        async with self._init_lock:
            if self._document_vectors is None:
                texts = [f"{doc.title}\n{doc.content}" for doc in self.documents]
                self._document_vectors = await self.embedder.embed_documents(texts)

    async def retrieve(self, query: str) -> list[RetrievalResult]:
        await self._ensure_index()
        if self._document_vectors is None:
            raise EmbeddingError("Embedding index is unavailable")
        query_vector = await self.embedder.embed_query(query)
        scored = [
            RetrievalResult(document=doc, score=cosine_similarity(query_vector, vector))
            for doc, vector in zip(self.documents, self._document_vectors, strict=True)
        ]
        scored.sort(key=lambda item: item.score, reverse=True)
        return scored[: self.top_k]

    def is_relevant(self, results: list[RetrievalResult]) -> bool:
        return bool(results) and results[0].score >= self.threshold
