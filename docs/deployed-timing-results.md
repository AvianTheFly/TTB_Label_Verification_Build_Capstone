# Deployed Timing Results

Recorded during deployed verification testing.

## Single-Label Timing

| Metric | Result |
| --- | ---: |
| Deployed `latency_ms` p50 | 1501 ms |
| Deployed `latency_ms` p95 | 2527 ms |
| Deployed round-trip p50 | 1676 ms |
| Deployed round-trip p95 | 2694 ms |

## Notes

- `latency_ms` is the API-reported single-label verification timing.
- Round-trip timing includes client-to-server request/response overhead.
- Results are under the 5 second single-label target.
