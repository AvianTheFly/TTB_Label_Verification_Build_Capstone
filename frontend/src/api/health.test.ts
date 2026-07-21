import { afterEach, describe, expect, it, vi } from "vitest";

import { getHealth } from "./health";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("getHealth", () => {
  it("aborts a health request that does not respond", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const rejection = expect(getHealth()).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(8000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/health",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});
