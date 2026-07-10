import type {
  ApiErrorEnvelope,
  ApplicationData,
  BatchResult,
  BatchVerificationRequestItem,
  ExtractedData,
  FieldDecisionOverrides,
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
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
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
    throw await readError(response);
  }

  return readSuccess<T>(response);
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

export async function compareExtractedData(
  applicationData: ApplicationData,
  extractedData: ExtractedData,
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
      ...(fieldDecisions ? { field_decisions: fieldDecisions } : {})
    })
  });
}
