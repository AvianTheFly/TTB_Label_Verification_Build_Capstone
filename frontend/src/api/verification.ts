import type {
  ApiErrorEnvelope,
  ApplicationData,
  BatchResult,
  BatchVerificationRequestItem,
  ExtractedData,
  ExtractedLabelResponse,
  FieldDecisionOverrides,
  LabelFormatting,
  VerificationResult
} from "../types/api";

export class VerificationApiError extends Error {
  code: string;
  details: Record<string, unknown>;

  constructor(message: string, code = "request_failed", details: Record<string, unknown> = {}) {
    super(message);
    this.name = "VerificationApiError";
    this.code = code;
    this.details = details;
  }
}

const REQUEST_TIMEOUT_MS = 60000;
const EXTRACTED_FIELDS = [
  "brand_name",
  "class_type",
  "abv",
  "net_contents",
  "producer",
  "country_of_origin",
  "government_warning"
] as const;

interface VerificationTimingLog {
  event: "verification_api_request";
  path: string;
  method: string;
  ok: boolean;
  status: number | null;
  round_trip_ms: number;
  backend_latency_ms: number | null;
  overall_verdict?: VerificationResult["overall_verdict"];
  timestamp: string;
}

function getApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL;
  if (!configuredUrl) {
    throw new VerificationApiError(
      "The verification service is not configured. Set VITE_API_BASE_URL and try again.",
      "configuration_error"
    );
  }

  return configuredUrl.replace(/\/+$/, "");
}

function logVerificationTiming(log: VerificationTimingLog): void {
  if (import.meta.env.MODE === "test") {
    return;
  }

  console.info("[ttb-verification-timing]", log);
}

function responseStatus(response: Response): number | null {
  return typeof response.status === "number" ? response.status : null;
}

function backendLatencyFromPayload(payload: unknown): number | null {
  if (
    payload &&
    typeof payload === "object" &&
    "latency_ms" in payload &&
    typeof (payload as { latency_ms?: unknown }).latency_ms === "number"
  ) {
    return (payload as { latency_ms: number }).latency_ms;
  }

  return null;
}

function overallVerdictFromPayload(payload: unknown): VerificationResult["overall_verdict"] | undefined {
  if (
    payload &&
    typeof payload === "object" &&
    "overall_verdict" in payload &&
    ((payload as { overall_verdict?: unknown }).overall_verdict === "APPROVED" ||
      (payload as { overall_verdict?: unknown }).overall_verdict === "NEEDS_REVIEW")
  ) {
    return (payload as { overall_verdict: VerificationResult["overall_verdict"] }).overall_verdict;
  }

  return undefined;
}

function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (!value || typeof value !== "object" || !("error" in value)) {
    return false;
  }

  const error = (value as { error?: unknown }).error;
  return Boolean(
    error &&
      typeof error === "object" &&
      typeof (error as { message?: unknown }).message === "string" &&
      typeof (error as { code?: unknown }).code === "string"
  );
}

async function readError(response: Response): Promise<VerificationApiError> {
  try {
    const payload = (await response.json()) as unknown;
    if (isApiErrorEnvelope(payload)) {
      return new VerificationApiError(
        payload.error.message,
        payload.error.code,
        payload.error.details
      );
    }
  } catch {
    // Fall through to a safe generic message.
  }

  return new VerificationApiError(
    "The verification service could not check this label. Please try again.",
    "request_failed"
  );
}

async function readSuccess<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new VerificationApiError(
      "The verification service returned an unreadable response. Please try again.",
      "bad_response"
    );
  }
}

async function requestVerification<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    logVerificationTiming({
      event: "verification_api_request",
      path,
      method: init.method ?? "GET",
      ok: false,
      status: null,
      round_trip_ms: Math.round(performance.now() - startedAt),
      backend_latency_ms: null,
      timestamp: new Date().toISOString()
    });

    if (error instanceof VerificationApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new VerificationApiError(
        "The verification service took too long to respond. Please try again.",
        "request_timeout"
      );
    }

    throw new VerificationApiError(
      "Could not reach the verification service. Please check the connection and try again.",
      "network_error"
    );
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    logVerificationTiming({
      event: "verification_api_request",
      path,
      method: init.method ?? "GET",
      ok: false,
      status: responseStatus(response),
      round_trip_ms: Math.round(performance.now() - startedAt),
      backend_latency_ms: null,
      timestamp: new Date().toISOString()
    });
    throw await readError(response);
  }

  const payload = await readSuccess<T>(response);
  logVerificationTiming({
    event: "verification_api_request",
    path,
    method: init.method ?? "GET",
    ok: true,
    status: responseStatus(response),
    round_trip_ms: Math.round(performance.now() - startedAt),
    backend_latency_ms: backendLatencyFromPayload(payload),
    overall_verdict: overallVerdictFromPayload(payload),
    timestamp: new Date().toISOString()
  });

  return payload;
}

export async function verifyLabel(
  image: File,
  applicationData: ApplicationData
): Promise<VerificationResult> {
  const formData = new FormData();
  formData.append("image", image);
  formData.append("application_data", JSON.stringify(applicationData));

  return requestVerification<VerificationResult>("/verify", {
      method: "POST",
      body: formData
  });
}

export async function verifyBatch(
  items: BatchVerificationRequestItem[]
): Promise<BatchResult> {
  const formData = new FormData();
  for (const item of items) {
    formData.append("images", item.image);
    formData.append("application_data", JSON.stringify(item.application_data));
  }

  return requestVerification<BatchResult>("/verify/batch", {
      method: "POST",
      body: formData
  });
}

export async function extractLabelText(image: File): Promise<ExtractedData> {
  const formData = new FormData();
  formData.append("image", image);

  const payload = await requestVerification<ExtractedLabelResponse>("/extract", {
      method: "POST",
      body: formData
  });
  const extracted = {} as ExtractedData;
  for (const field of EXTRACTED_FIELDS) {
    const value = payload[field];
    extracted[field] = typeof value === "string" ? value : null;
  }
  return extracted;
}

export async function compareExtractedData(
  applicationData: ApplicationData,
  extractedData: ExtractedData,
  extractedFormatting?: LabelFormatting | null,
  fieldDecisions?: FieldDecisionOverrides
): Promise<VerificationResult> {
  return requestVerification<VerificationResult>("/compare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      application_data: applicationData,
      extracted_data: extractedData,
      ...(extractedFormatting ? { extracted_formatting: extractedFormatting } : {}),
      ...(fieldDecisions ? { field_decisions: fieldDecisions } : {})
    })
  });
}
