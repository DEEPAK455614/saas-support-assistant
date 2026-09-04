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
    """Thin async wrapper around the current ``google-genai`` SDK."""

    def __init__(
        self,
        api_key: str,
        model: str,
        embedding_model: str,
        timeout_seconds: float = 20.0,
    ) -> None:
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required")
        self.api_key = api_key
        self.model = model
        self.embedding_model = embedding_model
        self.timeout_seconds = timeout_seconds
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from google import genai
                from google.genai import types
            except ImportError as exc:
                raise LLMError("google-genai is not installed") from exc
            self._client = genai.Client(
                api_key=self.api_key,
                http_options=types.HttpOptions(timeout=int(self.timeout_seconds * 1000)),
            )
        return self._client

    async def generate_grounded_answer(self, user_message: str, kb_context: str, tool_result: str) -> str:
        try:
            from google.genai import types

            client = self._get_client()
            response = await client.aio.models.generate_content(
                model=self.model,
                contents=build_grounded_prompt(user_message, kb_context, tool_result),
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    max_output_tokens=700,
                    thinking_config=types.ThinkingConfig(thinking_level="low"),
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

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return await self._embed(texts, task_type="RETRIEVAL_DOCUMENT")

    async def embed_query(self, text: str) -> list[float]:
        vectors = await self._embed([text], task_type="RETRIEVAL_QUERY")
        return vectors[0]

    async def _embed(self, texts: list[str], task_type: str) -> list[list[float]]:
        try:
            from google.genai import types

            client = self._get_client()
            response = await client.aio.models.embed_content(
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
