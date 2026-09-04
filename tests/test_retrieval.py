import pytest

from app.knowledge_base import KnowledgeDocument
from app.retrieval import InMemoryRetriever, cosine_similarity
from tests.conftest import FakeEmbedder


def test_cosine_similarity_identity():
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)


@pytest.mark.asyncio
async def test_retrieval_threshold_behavior():
    docs = [
        KnowledgeDocument("refund", "Refund Policy", "Refund requests are accepted within seven days."),
        KnowledgeDocument("password", "Password Reset", "Reset passwords from the sign-in page."),
    ]
    retriever = InMemoryRetriever(docs, FakeEmbedder(), top_k=2, threshold=0.20)

    related = await retriever.retrieve("refund within seven days")
    unrelated = await retriever.retrieve("football world cup winner")

    assert retriever.is_relevant(related) is True
    assert retriever.is_relevant(unrelated) is False
    assert related[0].document.id == "refund"
