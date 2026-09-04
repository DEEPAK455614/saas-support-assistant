import asyncio
from typing import Protocol

from app.prompts import SYSTEM_INSTRUCTION, build_grounded_prompt


class LLMError(RuntimeError):
    pass


class EmbeddingError(RuntimeError):
    pass


class LLMClientProtocol(Protocol):
    async def generate_grounded_answer(self, user_message: str, kb_context: str, tool_result: str) -> str: ...


class EmbeddingClientProtocol(Protocol):
    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
    async def embed_query(self, text: str) -> list[float]: ...


class GeminiClient:
    """Thin wrapper around the current google-genai SDK.

    Imports are lazy so unit tests can run without the Gemini package or credentials.
    The synchronous SDK operations are moved to a worker thread so FastAPI's event loop
    is not blocked.
    """

    def __init__(self, api_key: str, model: str, embedding_model: str) -> None:
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required")
        self.api_key = api_key
        self.model = model
        self.embedding_model = embedding_model
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from google import genai
            except ImportError as exc:
                raise LLMError("google-genai is not installed") from exc
            self._client = genai.Client(api_key=self.api_key)
        return self._client

    async def generate_grounded_answer(self, user_message: str, kb_context: str, tool_result: str) -> str:
        def _call() -> str:
            try:
                from google.genai import types
                client = self._get_client()
                response = client.models.generate_content(
                    model=self.model,
                    contents=build_grounded_prompt(user_message, kb_context, tool_result),
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_INSTRUCTION,
                        max_output_tokens=500,
                    ),
                )
                text = (response.text or "").strip()
                if not text:
                    raise LLMError("Gemini returned an empty response")
                return text
            except LLMError:
                raise
            except Exception as exc:
                raise LLMError("Gemini generation request failed") from exc

        return await asyncio.to_thread(_call)

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return await self._embed(texts, task_type="RETRIEVAL_DOCUMENT")

    async def embed_query(self, text: str) -> list[float]:
        vectors = await self._embed([text], task_type="RETRIEVAL_QUERY")
        return vectors[0]

    async def _embed(self, texts: list[str], task_type: str) -> list[list[float]]:
        def _call() -> list[list[float]]:
            try:
                from google.genai import types
                client = self._get_client()
                response = client.models.embed_content(
                    model=self.embedding_model,
                    contents=texts,
                    config=types.EmbedContentConfig(
                        task_type=task_type,
                        output_dimensionality=768,
                    ),
                )
                vectors = [list(item.values) for item in (response.embeddings or [])]
                if len(vectors) != len(texts):
                    raise EmbeddingError("Gemini returned an unexpected embedding count")
                return vectors
            except EmbeddingError:
                raise
            except Exception as exc:
                raise EmbeddingError("Gemini embedding request failed") from exc

        return await asyncio.to_thread(_call)
