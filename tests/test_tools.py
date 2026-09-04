import pytest

from app.tools import InvalidOrderId, OrderToolError, get_order_status


def test_known_order():
    result = get_order_status("ORD-1001")
    assert result["found"] is True
    assert result["status"] == "shipped"
    assert result["tracking_number"] == "DHL123456"


def test_unknown_order_is_controlled():
    result = get_order_status("ORD-9999")
    assert result == {"order_id": "ORD-9999", "found": False}


def test_invalid_order_id():
    with pytest.raises(InvalidOrderId):
        get_order_status("abc")


def test_simulated_failure():
    with pytest.raises(OrderToolError):
        get_order_status("ORD-FAIL")
