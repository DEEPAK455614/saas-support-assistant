from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


RouteName = Literal[
    "rag_only",
    "tool_only",
    "rag_and_tool",
    "unsupported",
    "validation_error",
    "tool_error",
    "service_error",
]


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    order_id: str | None = Field(default=None, max_length=64)
    customer_id: str | None = Field(default=None, max_length=128)

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("message must not be empty")
        return value

    @field_validator("order_id", "customer_id")
    @classmethod
    def strip_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class EvidenceItem(BaseModel):
    type: Literal["knowledge_base"] = "knowledge_base"
    id: str
    title: str
    score: float = Field(ge=-1.0, le=1.0)


class ToolMetadata(BaseModel):
    name: Literal["get_order_status"] = "get_order_status"
    input: dict[str, Any]
    result: dict[str, Any] | None = None
    error: str | None = None


class ChatResponse(BaseModel):
    answer: str
    route: RouteName
    evidence: list[EvidenceItem] = Field(default_factory=list)
    tool: ToolMetadata | None = None
    verified: bool


class RouteDecision(BaseModel):
    model_config = ConfigDict(frozen=True)
    use_rag: bool
    use_order_tool: bool
    reason: str
