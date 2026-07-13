import importlib.util
from pathlib import Path


def load_live_checklist():
    script_path = Path(__file__).resolve().parents[2] / "scripts" / "live_checklist.py"
    spec = importlib.util.spec_from_file_location("live_checklist", script_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_live_checklist_accepts_well_formed_verification_result() -> None:
    live_checklist = load_live_checklist()

    live_checklist._assert_verification_result(
        {
            "overall_verdict": "NEEDS_REVIEW",
            "latency_ms": 1200,
            "results": [
                {
                    "field": field,
                    "match_type": "exact",
                    "expected": "expected",
                    "found": "found",
                    "status": "PASS",
                    "message": "ok",
                }
                for field in live_checklist.CANONICAL_FIELDS
            ],
        },
        max_latency_ms=5000,
    )


def test_live_checklist_rejects_invalid_verdict_literal() -> None:
    live_checklist = load_live_checklist()

    try:
        live_checklist._assert_verification_result(
            {"overall_verdict": "REJECTED", "latency_ms": 10, "results": []},
            max_latency_ms=5000,
        )
    except AssertionError as exc:
        assert "invalid overall_verdict" in str(exc)
    else:
        raise AssertionError("Expected invalid verdict assertion")


def test_live_checklist_rejects_invalid_field_status_literal() -> None:
    live_checklist = load_live_checklist()

    try:
        live_checklist._assert_verification_result(
            {
                "overall_verdict": "APPROVED",
                "latency_ms": 10,
                "results": [
                    {
                        "field": field,
                        "match_type": "exact",
                        "expected": "expected",
                        "found": "found",
                        "status": "REVIEW",
                        "message": "bad",
                    }
                    for field in live_checklist.CANONICAL_FIELDS
                ],
            },
            max_latency_ms=5000,
        )
    except AssertionError as exc:
        assert "invalid field status" in str(exc)
    else:
        raise AssertionError("Expected invalid field status assertion")


def test_live_checklist_percentile_uses_nearest_rank() -> None:
    live_checklist = load_live_checklist()

    values = [500, 100, 300, 200, 400]

    assert live_checklist._percentile(values, 50) == 300
    assert live_checklist._percentile(values, 95) == 500
