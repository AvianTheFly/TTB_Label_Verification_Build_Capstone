import type { HealthResponse } from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function getHealth(init: Pick<RequestInit, "signal"> = {}): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/health`, init);

  if (!response.ok) {
    throw new Error("Health check failed");
  }

  return response.json() as Promise<HealthResponse>;
}
