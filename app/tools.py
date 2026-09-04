import re
from copy import deepcopy
from typing import Any


ORDER_ID_PATTERN = re.compile(r"^ORD-\d{4}$")
FAIL_ORDER_ID = "ORD-FAIL"

MOCK_ORDERS: dict[str, dict[str, Any]] = {
    "ORD-1001": {
        "status": "shipped",
        "carrier": "DHL",
        "tracking_number": "DHL123456",
        "estimated_delivery": "2026-09-08",
    },
    "ORD-1002": {"status": "processing"},
    "ORD-1003": {"status": "delivered", "delivered_on": "2026-09-02"},
}


class InvalidOrderId(ValueError):
    pass


class OrderToolError(RuntimeError):
    pass


def validate_order_id(order_id: str) -> str:
    normalized = order_id.strip().upper()
    if normalized == FAIL_ORDER_ID:
        return normalized
    if not ORDER_ID_PATTERN.fullmatch(normalized):
        raise InvalidOrderId("Order ID must use the format ORD-1234.")
    return normalized


def get_order_status(order_id: str) -> dict[str, Any]:
    """Deterministic mock order lookup. It never fabricates an order."""
    normalized = validate_order_id(order_id)
    if normalized == FAIL_ORDER_ID:
        raise OrderToolError("Simulated order service failure")

    record = MOCK_ORDERS.get(normalized)
    if record is None:
        return {"order_id": normalized, "found": False}

    return {"order_id": normalized, "found": True, **deepcopy(record)}
