from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-3.1-flash-lite", alias="GEMINI_MODEL")
    gemini_embedding_model: str = Field(default="gemini-embedding-001", alias="GEMINI_EMBEDDING_MODEL")
    gemini_timeout_seconds: float = Field(default=12.0, ge=1.0, le=120.0, alias="GEMINI_TIMEOUT_SECONDS")
    relevance_threshold: float = Field(default=0.60, ge=-1.0, le=1.0, alias="RELEVANCE_THRESHOLD")
    top_k: int = Field(default=3, ge=1, le=10, alias="TOP_K")
    max_message_length: int = Field(default=4000, ge=100, le=20000, alias="MAX_MESSAGE_LENGTH")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    kb_path: Path = Field(default=BASE_DIR / "data" / "faq.json", alias="KB_PATH")
    startup_self_test: bool = Field(default=False, alias="STARTUP_SELF_TEST")


@lru_cache
def get_settings() -> Settings:
    return Settings()
