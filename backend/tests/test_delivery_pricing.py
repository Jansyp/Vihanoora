import pytest

# Load the project's .env before importing the commerce router, which imports the DB client.
import server  # noqa: F401
from routers.commerce_routes import (
    FREE_SHIPPING_THRESHOLD,
    STANDARD_DELIVERY_CHARGE,
    calculate_delivery_charge,
)


@pytest.mark.parametrize(
    ("eligible_subtotal", "expected_delivery"),
    [(0, 50), (100, 50), (150, 50), (299, 50), (300, 0), (999, 0)],
)
def test_delivery_charge_uses_eligible_subtotal(eligible_subtotal, expected_delivery):
    settings = {"delivery_charge": STANDARD_DELIVERY_CHARGE, "free_shipping_threshold": FREE_SHIPPING_THRESHOLD}
    assert calculate_delivery_charge(eligible_subtotal, settings) == expected_delivery


def test_delivery_eligibility_is_fixed_at_300_even_if_settings_are_stale():
    assert calculate_delivery_charge(299, {"delivery_charge": 50, "free_shipping_threshold": 199}) == 50
    assert calculate_delivery_charge(300, {"delivery_charge": 50, "free_shipping_threshold": 199}) == 0
