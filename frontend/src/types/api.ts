export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
}

export type CanonicalLabelField =
  | "brand_name"
  | "class_type"
  | "abv"
  | "net_contents"
  | "producer"
  | "country_of_origin"
  | "government_warning";

export interface ApplicationData {
  brand_name: string;
  class_type: string;
  abv: string;
  net_contents: string;
  producer: string;
  country_of_origin: string;
  government_warning: string;
}

export interface ExtractedData {
  brand_name: string | null;
  class_type: string | null;
  abv: string | null;
  net_contents: string | null;
  producer: string | null;
  country_of_origin: string | null;
  government_warning: string | null;
}

export interface ExtractedLabelResponse extends ExtractedData {
  raw_text?: string | null;
  extraction_confidence?: number | null;
}

export type FieldStatus = "PASS" | "FAIL";
export type OverallVerdict = "APPROVED" | "NEEDS_REVIEW";
export type MatchType = "fuzzy" | "numeric" | "unit" | "synonym" | "exact";
export type FieldReviewDecision = "fail" | "pass";

export interface FieldResult {
  field: CanonicalLabelField;
  match_type: MatchType;
  expected: string;
  found: string | null;
  status: FieldStatus;
  message: string;
}

export interface VerificationResult {
  results: FieldResult[];
  overall_verdict: OverallVerdict;
  latency_ms: number | null;
}

export interface BatchItemError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export interface BatchItemResult {
  index: number;
  result: VerificationResult | null;
  error: BatchItemError | null;
}

export interface BatchSummary {
  passed: number;
  needs_review: number;
  total: number;
}

export interface BatchResult {
  items: BatchItemResult[];
  summary: BatchSummary;
}

export interface BatchVerificationRequestItem {
  image: File;
  application_data: ApplicationData;
}

export type FieldDecisionOverrides = Partial<Record<CanonicalLabelField, FieldReviewDecision>>;

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}
