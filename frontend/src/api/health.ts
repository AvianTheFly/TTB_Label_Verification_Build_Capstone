import type { HealthResponse } from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const HEALTH_TIMEOUT_MS = 8000;

export async function getHealth(init: Pick<RequestInit, "signal"> = {}): Promise<HealthResponse> {
  const timeoutController = init.signal ? null : new AbortController();
  const timeout = timeoutController
    ? window.setTimeout(() => timeoutController.abort(), HEALTH_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/health`, {
      ...init,
      signal: init.signal ?? timeoutController?.signal
    });

    if (!response.ok) {
      throw new Error("Health check failed");
    }

    return response.json() as Promise<HealthResponse>;
  } finally {
    if (timeout !== null) {
      window.clearTimeout(timeout);
    }
  }
}
