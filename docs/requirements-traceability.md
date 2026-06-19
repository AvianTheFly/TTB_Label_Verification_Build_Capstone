# Requirements Traceability

This file keeps AI coding agents anchored to the two source-of-truth documents before implementation begins.

## Source Documents

- `TTB_Label_Verification_Build_Playbook 1.pdf`
- `Additional Project Requirements`

## Product Requirements

| Requirement | Source | Implementation Anchor |
| --- | --- | --- |
| Standalone proof-of-concept, no COLA integration | Additional requirements, IT context | Keep integrations out of scope unless explicitly added later |
| No database for MVP; request-scoped processing | Playbook architecture | Backend remains stateless; no persistence layer |
| Do not store sensitive data for prototype | Additional requirements, IT context | No persisted uploads, extracted data, or application data |
| Single-label result target under 5 seconds | Both source documents | Phase 3 measures `latency_ms`; Phase 6 tunes and reports live latency |
| Batch upload is required | Both source documents | Phase 5 owns `/verify/batch` and batch UI |
| UI usable by non-technical older users | Both source documents | Phase 4 owns clear single-label UX; Phase 6 accessibility pass |
| Government warning exact and case-sensitive | Both source documents | Phase 1 exact comparison; Phases 3, 6, and 7 regression checks |
| `GOVERNMENT WARNING:` lead-in all caps and bold | Additional requirements, Jenny context | Text exactness required; style detection optional unless planned and documented |
| Warning failures surface extracted text | Playbook architecture | Field result `found` value must include extracted warning text |
| Vision output must be structured JSON | Playbook Phase 2 | Vision service interface returns typed `ExtractedLabel` |
| Unknown extracted fields may be null | Playbook Phase 2 | `ExtractedLabel` fields nullable |
| Imperfect images degrade gracefully | Both source documents | Vision service returns partial data or safe error category |
| Provider/network dependency isolated | Additional requirements, IT context | All provider code behind `VisionService` interface |
| Secrets only in environment variables | Playbook, additional deliverables | `.env` ignored; `.env.example` placeholders only |
| Source repo and README required | Additional requirements deliverables | Phase 7 submission gate |
| Deployed application URL required | Both source documents | Phase 0 deploy early; Phase 7 final live verification |
| Document approach, tools, assumptions, limitations | Additional requirements deliverables | Phase 7 README |

## Canonical Field Contract

The playbook's data model uses these API/model fields:

- `brand_name`
- `class_type`
- `abv`
- `net_contents`
- `producer`
- `country_of_origin`
- `government_warning`

User-facing labels may use friendlier text such as "Alcohol Content" and "Producer", but API and model fields must keep the names above.

## Warning Statement Scope

The source documents make the government warning the strictest check. The MVP must:

- compare warning text exactly and case-sensitively after whitespace collapse only,
- reject title-case or missing-colon variants,
- surface the extracted warning text on failure,
- document whether visual styling, such as bold text on the `GOVERNMENT WARNING:` lead-in, is actually detected.

Do not silently claim style compliance if the vision service only extracts text.
