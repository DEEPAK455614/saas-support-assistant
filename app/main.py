import json
import logging
import re
from functools import lru_cache

from fastapi import Depends, FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.knowledge_base import load_knowledge_base
from app.llm import EmbeddingError, GeminiClient, LLMClientProtocol, LLMError
from app.retrieval import InMemoryRetriever, RetrievalResult
from app.router import decide_route, extract_order_id
from app.schemas import ChatRequest, ChatResponse, EvidenceItem, ToolMetadata
from app.tools import InvalidOrderId, OrderToolError, get_order_status, validate_order_id


logging.basicConfig(level=get_settings().log_level.upper(), format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("saas_support")
app = FastAPI(title="SaaS Support Assistant", version="1.0.0")


class Services:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        self.gemini = GeminiClient(
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
            embedding_model=settings.gemini_embedding_model,
        )
        documents = load_knowledge_base(settings.kb_path)
        self.retriever = InMemoryRetriever(
            documents=documents,
            embedder=self.gemini,
            top_k=settings.top_k,
            threshold=settings.relevance_threshold,
        )


@lru_cache
def get_services() -> Services:
    return Services(get_settings())


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "answer": "The request is invalid. Provide a non-empty message within the allowed length.",
            "route": "validation_error",
            "evidence": [],
            "tool": None,
            "verified": False,
            "errors": [error["msg"] for error in exc.errors()],
        },
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def _kb_context(results: list[RetrievalResult]) -> str:
    return "\n\n".join(
        f"ID: {item.document.id}\nTITLE: {item.document.title}\nCONTENT: {item.document.content}"
        for item in results
    )


def _evidence(results: list[RetrievalResult]) -> list[EvidenceItem]:
    return [
        EvidenceItem(id=item.document.id, title=item.document.title, score=round(item.score, 4))
        for item in results
    ]


def _malformed_order_candidate(message: str) -> str | None:
    match = re.search(r"\border\s+(?:id\s*)?(?:is\s+)?([A-Za-z0-9_-]+)", message, re.IGNORECASE)
    if not match:
        return None
    candidate = match.group(1).upper()
    return candidate if not candidate.startswith("ORD-") else None


@app.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, services: Services = Depends(get_services)) -> ChatResponse:
    if len(payload.message) > services.settings.max_message_length:
        return ChatResponse(
            answer=f"The message is too long. Maximum length is {services.settings.max_message_length} characters.",
            route="validation_error",
            verified=False,
        )

    decision = decide_route(payload.message)
    logger.info("route_decision use_rag=%s use_tool=%s reason=%s", decision.use_rag, decision.use_order_tool, decision.reason)

    order_id: str | None = None
    if decision.use_order_tool:
        raw_order_id = payload.order_id or extract_order_id(payload.message)
        if raw_order_id is None:
            malformed = _malformed_order_candidate(payload.message)
            if malformed:
                return ChatResponse(
                    answer="That order ID is invalid. Please use the format ORD-1234.",
                    route="validation_error",
                    verified=False,
                )
            return ChatResponse(
                answer="Please provide your order ID so I can check its status.",
                route="validation_error",
                verified=False,
            )
        try:
            order_id = validate_order_id(raw_order_id)
        except InvalidOrderId:
            return ChatResponse(
                answer="That order ID is invalid. Please use the format ORD-1234.",
                route="validation_error",
                verified=False,
            )

    retrieval_results: list[RetrievalResult] = []
    if decision.use_rag:
        try:
            candidates = await services.retriever.retrieve(payload.message)
        except EmbeddingError:
            logger.exception("retrieval_failed")
            return ChatResponse(
                answer="I cannot verify that information because knowledge-base retrieval is temporarily unavailable.",
                route="unsupported",
                verified=False,
            )
        top_score = candidates[0].score if candidates else None
        logger.info("retrieval top_score=%s threshold=%s", top_score, services.retriever.threshold)
        if services.retriever.is_relevant(candidates):
            retrieval_results = [item for item in candidates if item.score >= services.retriever.threshold]
        elif not decision.use_order_tool:
            return ChatResponse(
                answer="I cannot verify that information from the available support knowledge base.",
                route="unsupported",
                verified=False,
            )

    weak_combined_context = decision.use_rag and decision.use_order_tool and not retrieval_results

    tool_meta: ToolMetadata | None = None
    tool_result: dict | None = None
    if decision.use_order_tool and order_id:
        logger.info("tool_invocation name=get_order_status order_id=%s", order_id)
        try:
            tool_result = get_order_status(order_id)
            tool_meta = ToolMetadata(
                input={"order_id": order_id},
                result=tool_result,
            )
        except (OrderToolError, Exception) as exc:
            if not isinstance(exc, OrderToolError):
                logger.exception("unexpected_tool_error")
            else:
                logger.warning("order_tool_failure order_id=%s", order_id)
            tool_meta = ToolMetadata(
                input={"order_id": order_id},
                error="order_service_unavailable",
            )
            return ChatResponse(
                answer="I could not check the order because the order service is temporarily unavailable.",
                route="tool_error",
                tool=tool_meta,
                verified=False,
            )

    if tool_result is not None and tool_result.get("found") is False:
        return ChatResponse(
            answer=f"I could not find an order matching {tool_result['order_id']}.",
            route="rag_and_tool" if retrieval_results else "tool_only",
            evidence=_evidence(retrieval_results),
            tool=tool_meta,
            verified=False,
        )

    route = "rag_and_tool" if retrieval_results and tool_result else "rag_only" if retrieval_results else "tool_only"

    kb_context = _kb_context(retrieval_results)
    serialized_tool = json.dumps(tool_result, separators=(",", ":"), sort_keys=True) if tool_result else ""
    try:
        answer = await services.gemini.generate_grounded_answer(payload.message, kb_context, serialized_tool)
    except LLMError:
        logger.exception("generation_failed")
        return ChatResponse(
            answer="I have verified evidence, but I cannot generate a response right now because the language model is unavailable.",
            route=route,
            evidence=_evidence(retrieval_results),
            tool=tool_meta,
            verified=False,
        )

    if weak_combined_context:
        answer += " I could verify the order information, but I could not verify the requested policy information from the knowledge base."

    return ChatResponse(
        answer=answer,
        route=route if not weak_combined_context else "tool_only",
        evidence=_evidence(retrieval_results),
        tool=tool_meta,
        verified=not weak_combined_context,
    )
