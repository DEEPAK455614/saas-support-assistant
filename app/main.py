import json
import logging
import re
from contextlib import asynccontextmanager
from functools import lru_cache

from fastapi import Depends, FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse, Response

from app.config import Settings, get_settings
from app.demo import DEMO_HTML
from app.knowledge_base import KnowledgeBaseError, load_knowledge_base
from app.llm import EmbeddingError, GeminiClient, LLMError
from app.retrieval import InMemoryRetriever, RetrievalResult
from app.router import decide_route, extract_order_id
from app.schemas import ChatRequest, ChatResponse, EvidenceItem, ToolMetadata
from app.tools import InvalidOrderId, OrderToolError, get_order_status, validate_order_id


logging.basicConfig(level=get_settings().log_level.upper(), format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("saas_support")


class ServiceConfigurationError(RuntimeError):
    pass


class Services:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        if not settings.gemini_api_key:
            raise ServiceConfigurationError("GEMINI_API_KEY is not configured")

        self.gemini = GeminiClient(
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
            embedding_model=settings.gemini_embedding_model,
            timeout_seconds=settings.gemini_timeout_seconds,
        )
        try:
            documents = load_knowledge_base(settings.kb_path)
        except KnowledgeBaseError as exc:
            raise ServiceConfigurationError("Knowledge base could not be loaded") from exc

        self.retriever = InMemoryRetriever(
            documents=documents,
            embedder=self.gemini,
            top_k=settings.top_k,
            threshold=settings.relevance_threshold,
        )


@lru_cache
def get_services() -> Services:
    return Services(get_settings())


async def _run_startup_self_test() -> None:
    """One-shot deployment diagnostic. Enabled only with STARTUP_SELF_TEST=true."""
    try:
        services = get_services()
        cases = [
            ("related_refund", "What is your refund policy?"),
            ("related_password", "How do I reset my password?"),
            ("related_cancel", "How can I cancel my subscription?"),
            ("unrelated_sports", "Who won the FIFA World Cup?"),
            ("unrelated_weather", "What is the weather in Tokyo?"),
            ("unrelated_history", "Who was the first Roman emperor?"),
        ]
        related_scores: list[float] = []
        unrelated_scores: list[float] = []
        refund_context = ""

        for tag, query in cases:
            results = await services.retriever.retrieve(query)
            top = results[0] if results else None
            score = top.score if top else -1.0
            if tag.startswith("related_"):
                related_scores.append(score)
            else:
                unrelated_scores.append(score)
            if tag == "related_refund" and top:
                refund_context = f"ID: {top.document.id}\nTITLE: {top.document.title}\nCONTENT: {top.document.content}"
            logger.info(
                "startup_self_test retrieval tag=%s top_id=%s score=%.4f",
                tag,
                top.document.id if top else None,
                score,
            )

        if related_scores and unrelated_scores:
            min_related = min(related_scores)
            max_unrelated = max(unrelated_scores)
            midpoint = (min_related + max_unrelated) / 2
            logger.info(
                "startup_self_test calibration min_related=%.4f max_unrelated=%.4f midpoint=%.4f configured_threshold=%.4f",
                min_related,
                max_unrelated,
                midpoint,
                services.retriever.threshold,
            )

        await services.gemini.generate_grounded_answer(
            "What is your refund policy?",
            refund_context,
            "",
        )
        logger.info("startup_self_test generation status=ok model=%s", services.settings.gemini_model)
    except Exception as exc:
        logger.exception("startup_self_test status=failed error_type=%s", type(exc).__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    if settings.startup_self_test:
        await _run_startup_self_test()
    yield


app = FastAPI(
    title="SaaS Support Assistant",
    version="1.1.0",
    description="Grounded SaaS support API using Gemini, local RAG, and a deterministic order-status tool.",
    lifespan=lifespan,
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={
            "answer": "The request is invalid. Provide a non-empty message within the allowed length.",
            "route": "validation_error",
            "evidence": [],
            "tool": None,
            "verified": False,
            "errors": [error["msg"] for error in exc.errors()],
        },
    )


@app.exception_handler(ServiceConfigurationError)
async def service_configuration_handler(_: Request, exc: ServiceConfigurationError) -> JSONResponse:
    logger.error("service_configuration_error: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "answer": "The AI support service is not configured correctly. Please contact the service administrator.",
            "route": "service_error",
            "evidence": [],
            "tool": None,
            "verified": False,
        },
    )


@app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
async def root(request: Request) -> Response:
    if request.method == "HEAD":
        return Response(status_code=status.HTTP_200_OK)
    return HTMLResponse(DEMO_HTML)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "saas-support-assistant"}


@app.get("/ready")
async def ready(settings: Settings = Depends(get_settings)) -> JSONResponse:
    configured = bool(settings.gemini_api_key)
    return JSONResponse(
        status_code=status.HTTP_200_OK if configured else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "status": "configured" if configured else "not_configured",
            "gemini_api_key_configured": configured,
            "gemini_model": settings.gemini_model,
            "embedding_model": settings.gemini_embedding_model,
        },
    )


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
    explicit = re.search(r"\bORD-[A-Za-z0-9_-]+\b", message, re.IGNORECASE)
    if explicit:
        candidate = explicit.group(0).upper()
        try:
            validate_order_id(candidate)
        except InvalidOrderId:
            return candidate
        return None

    match = re.search(r"\border\s+(?:id\s*)?(?:is\s+)?([A-Za-z0-9_-]+)", message, re.IGNORECASE)
    if not match:
        return None
    candidate = match.group(1).upper()
    try:
        validate_order_id(candidate)
    except InvalidOrderId:
        return candidate
    return None


@app.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, services: Services = Depends(get_services)) -> ChatResponse:
    if len(payload.message) > services.settings.max_message_length:
        return ChatResponse(
            answer=f"The message is too long. Maximum length is {services.settings.max_message_length} characters.",
            route="validation_error",
            verified=False,
        )

    decision = decide_route(payload.message)
    logger.info(
        "route_decision use_rag=%s use_tool=%s reason=%s",
        decision.use_rag,
        decision.use_order_tool,
        decision.reason,
    )

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
                answer="Knowledge-base retrieval is temporarily unavailable, so I cannot verify that information.",
                route="service_error",
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
            tool_meta = ToolMetadata(input={"order_id": order_id}, result=tool_result)
        except OrderToolError:
            logger.warning("order_tool_failure order_id=%s", order_id)
            tool_meta = ToolMetadata(input={"order_id": order_id}, error="order_service_unavailable")
            return ChatResponse(
                answer="I could not check the order because the order service is temporarily unavailable.",
                route="tool_error",
                tool=tool_meta,
                verified=False,
            )
        except Exception:
            logger.exception("unexpected_tool_error order_id=%s", order_id)
            tool_meta = ToolMetadata(input={"order_id": order_id}, error="order_service_unavailable")
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
            answer="Verified evidence was found, but the language model is temporarily unavailable, so I cannot safely compose the final answer.",
            route="service_error",
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
