import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendStartupStatus } from "./BackendStartupStatus";
import { getHealth } from "../api/health";

vi.mock("../api/health", () => ({
  getHealth: vi.fn()
}));

let container: HTMLDivElement;
let root: Root;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function renderStatus() {
  await act(async () => {
    root.render(<BackendStartupStatus />);
  });
}

describe("BackendStartupStatus", () => {
  it("shows startup state, reports ready, and hides after a short delay", async () => {
    let resolveHealth: (value: Awaited<ReturnType<typeof getHealth>>) => void = () => undefined;
    vi.mocked(getHealth).mockReturnValue(
      new Promise((resolve) => {
        resolveHealth = resolve;
      })
    );

    await renderStatus();

    expect(container.textContent).toContain("Waking verification service");

    await act(async () => {
      resolveHealth({
        status: "ok",
        service: "ttb-label-verification",
        version: "0.1.0",
        max_batch_items: 25
      });
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Ready to go");

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(container.textContent).not.toContain("Ready to go");
  });

  it("keeps showing the cold-start message while health checks fail", async () => {
    vi.mocked(getHealth).mockRejectedValue(new Error("not ready"));

    await renderStatus();

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Still waking verification service");

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(vi.mocked(getHealth)).toHaveBeenCalledTimes(2);
  });
});
