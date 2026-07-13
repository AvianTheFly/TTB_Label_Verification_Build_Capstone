import importlib.util
from pathlib import Path


def load_live_checklist():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "live_checklist.py"
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


def test_live_checklist_default_sample_paths_exist() -> None:
    live_checklist = load_live_checklist()

    assert live_checklist._default_image_path().exists()
    assert live_checklist._default_application_data_path().exists()


def test_live_checklist_falls_back_to_frontend_demo_inputs(tmp_path: Path) -> None:
    live_checklist = load_live_checklist()
    fallback_input = (
        tmp_path
        / "frontend"
        / "public"
        / "demo-data"
        / "inputs"
        / "northstar-riesling.png"
    )
    fallback_input.parent.mkdir(parents=True)
    fallback_input.write_bytes(b"sample")

    assert live_checklist._demo_input_path("northstar-riesling.png", tmp_path) == fallback_input
