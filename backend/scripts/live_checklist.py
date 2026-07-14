import argparse
import json
import mimetypes
import sys
import time
import uuid
from math import ceil
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

CANONICAL_FIELDS = {
    "brand_name",
    "class_type",
    "abv",
    "net_contents",
    "producer",
    "country_of_origin",
    "government_warning",
}
FIELD_STATUSES = {"PASS", "FAIL"}
OVERALL_VERDICTS = {"APPROVED", "NEEDS_REVIEW"}
DEFAULT_APPLICATION_DATA = {
    "brand_name": "NORTHERN LIGHT RIESLING",
    "class_type": "White Wine Blend",
    "abv": "13.8% Alc./Vol.",
    "net_contents": "700 mL",
    "producer": "Northstar Vineyards, Traverse City, MI",
    "country_of_origin": "Canada",
    "government_warning": (
        "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink "
        "alcoholic beverages during pregnancy because of the risk of birth defects. "
        "(2) Consumption of alcoholic beverages impairs your ability to drive a car or operate "
        "machinery, and may cause health problems."
    ),
}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Post a real sample image to a deployed /verify endpoint."
    )
    parser.add_argument(
        "--url",
        required=True,
        help="Backend base URL or full /verify URL, for example https://example.com/verify.",
    )
    parser.add_argument("--image", type=Path, default=_default_image_path())
    parser.add_argument(
        "--application-data",
        type=Path,
        help="Optional JSON file containing exactly the seven canonical application fields.",
    )
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--max-latency-ms", type=int, default=5000)
    parser.add_argument(
        "--runs",
        type=int,
        default=1,
        help="Number of verification requests to run for latency measurement.",
    )
    args = parser.parse_args()

    if args.runs < 1:
        print("--runs must be at least 1", file=sys.stderr)
        return 2

    endpoint = _verify_endpoint(args.url)
    image_path = args.image.resolve()

    if not image_path.exists():
        print(f"Sample image not found: {image_path}", file=sys.stderr)
        return 2

    try:
        application_data = (
            _load_application_data(args.application_data.resolve())
            if args.application_data
            else DEFAULT_APPLICATION_DATA
        )
        results = []
        round_trip_ms = []
        for _ in range(args.runs):
            body, content_type = _multipart_body(image_path, application_data)
            started = time.perf_counter()
            response_body = _post(endpoint, body, content_type, timeout=args.timeout)
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            result = json.loads(response_body)
            _assert_verification_result(result, max_latency_ms=args.max_latency_ms)
            results.append(result)
            round_trip_ms.append(elapsed_ms)
    except (ValueError, AssertionError, OSError, URLError, HTTPError) as exc:
        print(f"Live checklist failed: {exc}", file=sys.stderr)
        return 1

    latest = results[-1]
    if args.runs == 1:
        print(
            "Live checklist passed: "
            f"overall_verdict={latest['overall_verdict']} "
            f"latency_ms={latest['latency_ms']} "
            f"round_trip_ms={round_trip_ms[-1]}"
        )
        return 0

    latency_values = [result["latency_ms"] for result in results]
    print(
        "Live checklist passed: "
        f"runs={args.runs} "
        f"latest_overall_verdict={latest['overall_verdict']} "
        f"latency_p50_ms={_percentile(latency_values, 50)} "
        f"latency_p95_ms={_percentile(latency_values, 95)} "
        f"round_trip_p50_ms={_percentile(round_trip_ms, 50)} "
        f"round_trip_p95_ms={_percentile(round_trip_ms, 95)}"
    )
    return 0


def _default_image_path() -> Path:
    return _demo_input_path("northstar-riesling.png")


def _demo_input_path(filename: str, repo_root: Path | None = None) -> Path:
    root = repo_root or Path(__file__).resolve().parents[2]
    candidates = [
        root / "demo-data" / "inputs" / filename,
        root / "frontend" / "public" / "demo-data" / "inputs" / filename,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def _verify_endpoint(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("--url must be an absolute http(s) URL")
    if parsed.path.rstrip("/").endswith("/verify"):
        return url
    return urljoin(url.rstrip("/") + "/", "verify")


def _load_application_data(path: Path) -> dict[str, str]:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    application_data = payload.get("application_data", payload)
    if set(application_data) != CANONICAL_FIELDS:
        raise ValueError("application data must contain exactly the seven canonical fields")
    return application_data


def _multipart_body(image_path: Path, application_data: dict[str, str]) -> tuple[bytes, str]:
    boundary = f"----ttb-live-check-{uuid.uuid4().hex}"
    content_type = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
    image_bytes = image_path.read_bytes()
    parts = [
        _form_field(boundary, "application_data", json.dumps(application_data)),
        _file_field(boundary, "image", image_path.name, content_type, image_bytes),
        f"--{boundary}--\r\n".encode(),
    ]
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def _form_field(boundary: str, name: str, value: str) -> bytes:
    return (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
        f"{value}\r\n"
    ).encode()


def _file_field(
    boundary: str, name: str, filename: str, content_type: str, value: bytes
) -> bytes:
    header = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode()
    return header + value + b"\r\n"


def _post(endpoint: str, body: bytes, content_type: str, timeout: float) -> str:
    request = Request(
        endpoint,
        data=body,
        headers={"Content-Type": content_type},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8")
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise ValueError(f"{endpoint} returned HTTP {exc.code}: {details}") from exc


def _assert_verification_result(result: object, max_latency_ms: int) -> None:
    assert isinstance(result, dict), "response must be a JSON object"
    assert result.get("overall_verdict") in OVERALL_VERDICTS, "invalid overall_verdict"
    assert isinstance(result.get("latency_ms"), int), "latency_ms must be an integer"
    assert result["latency_ms"] <= max_latency_ms, "latency_ms exceeds configured limit"
    results = result.get("results")
    assert isinstance(results, list), "results must be a list"
    assert {item.get("field") for item in results} == CANONICAL_FIELDS, "unexpected result fields"
    for item in results:
        assert item.get("status") in FIELD_STATUSES, "invalid field status"
        assert {"field", "match_type", "expected", "found", "status", "message"} <= set(item), (
            "field result is missing required keys"
        )


def _percentile(values: list[int], percentile: int) -> int:
    if not values:
        raise ValueError("values must not be empty")
    sorted_values = sorted(values)
    index = ceil((percentile / 100) * len(sorted_values)) - 1
    return sorted_values[max(0, min(index, len(sorted_values) - 1))]


if __name__ == "__main__":
    raise SystemExit(main())
