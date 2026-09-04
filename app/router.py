import re

from app.schemas import RouteDecision


ORDER_ID_IN_TEXT = re.compile(r"\bORD-(?:\d{4}|FAIL)\b", re.IGNORECASE)
ORDER_INTENT_TERMS = (
    "order",
    "shipment",
    "shipping status",
    "delivery",
    "tracking",
    "track my",
    "where is my",
    "where's my",
)
POLICY_HINT_TERMS = (
    "refund",
    "cancel",
    "cancellation",
    "subscription",
    "plan",
    "billing",
    "bill",
    "password",
    "account deletion",
    "delete account",
    "trial",
    "data retention",
    "support hours",
    "support availability",
    "upgrade",
    "downgrade",
)


def extract_order_id(message: str) -> str | None:
    match = ORDER_ID_IN_TEXT.search(message)
    return match.group(0).upper() if match else None


def looks_like_order_request(message: str) -> bool:
    lowered = message.lower()
    return bool(ORDER_ID_IN_TEXT.search(message)) or any(term in lowered for term in ORDER_INTENT_TERMS)


def looks_like_policy_request(message: str) -> bool:
    lowered = message.lower()
    return any(term in lowered for term in POLICY_HINT_TERMS)


def decide_route(message: str) -> RouteDecision:
    """Deterministic first-pass routing. Retrieval relevance is checked later."""
    order_needed = looks_like_order_request(message)
    policy_hint = looks_like_policy_request(message)

    if order_needed and policy_hint:
        return RouteDecision(use_rag=True, use_order_tool=True, reason="order_and_policy_signals")
    if order_needed:
        return RouteDecision(use_rag=False, use_order_tool=True, reason="order_signal")
    return RouteDecision(use_rag=True, use_order_tool=False, reason="kb_relevance_check")
