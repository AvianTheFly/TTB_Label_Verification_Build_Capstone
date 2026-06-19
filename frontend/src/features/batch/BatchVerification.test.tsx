import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BatchVerification } from "./BatchVerification";

let container: HTMLDivElement;
let root: Root;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const canonicalApplicationData = {
  brand_name: "OLD TOM DISTILLERY",
  class_type: "Kentucky Straight Bourbon Whiskey",
  abv: "45% Alc./Vol. (90 Proof)",
  net_contents: "750 mL",
  producer: "Old Tom Distillery, Louisville, KY",
  country_of_origin: "United States",
  government_warning: "GOVERNMENT WARNING: Test warning text."
};

async function renderBatchVerification() {
  await act(async () => {
    root.render(<BatchVerification />);
  });
}

function textInput(name: string, rowIndex: number): HTMLInputElement | HTMLTextAreaElement {
  const elements = Array.from(container.querySelectorAll(`[name="${name}"]`));
  const element = elements[rowIndex];
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    throw new Error(`Missing field: ${name} at row ${rowIndex}`);
  }
  return element;
}

function fileInput(rowIndex: number): HTMLInputElement {
  const inputs = Array.from(container.querySelectorAll("input[type='file']"));
  const input = inputs[rowIndex];
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing file input at row ${rowIndex}`);
  }
  return input;
}

function submitButton(): HTMLButtonElement {
  const button = container.querySelector("button[type='submit']");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Missing submit button");
  }
  return button;
}

async function clickButtonWithText(text: string) {
  await act(async () => {
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === text
    );
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Missing button: ${text}`);
    }
    button.click();
  });
}

async function addRows(totalRows: number) {
  while (container.querySelectorAll("input[type='file']").length < totalRows) {
    await clickButtonWithText("Add Label");
  }
}

async function changeField(rowIndex: number, name: string, value: string) {
  await act(async () => {
    const input = textInput(name, rowIndex);
    const prototype =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function chooseImage(rowIndex: number, file: File) {
  await act(async () => {
    const input = fileInput(rowIndex);
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file]
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submitForm() {
  await act(async () => {
    submitButton().click();
  });
}

async function waitForAsyncUpdates() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function fillRow(rowIndex: number) {
  await chooseImage(rowIndex, new File([`image-${rowIndex}`], `label-${rowIndex}.png`, { type: "image/png" }));
  for (const [field, value] of Object.entries(canonicalApplicationData)) {
    await changeField(rowIndex, field, value);
  }
}

async function fillRows(count: number) {
  await addRows(count);
  for (let index = 0; index < count; index += 1) {
    await fillRow(index);
  }
}

function makeBatchResponse() {
  return {
    summary: { passed: 1, needs_review: 2, total: 3 },
    items: [
      {
        index: 0,
        result: {
          overall_verdict: "APPROVED",
          latency_ms: 800,
          results: []
        },
        error: null
      },
      {
        index: 1,
        result: {
          overall_verdict: "NEEDS_REVIEW",
          latency_ms: 940,
          results: [
            {
              field: "brand_name",
              match_type: "fuzzy",
              expected: "OLD TOM DISTILLERY",
              found: "OTHER DISTILLERY",
              status: "FAIL",
              message: "Values do not match after normalization."
            }
          ]
        },
        error: null
      },
      {
        index: 2,
        result: null,
        error: {
          code: "unsupported_file_type",
          message: "Please upload a JPG, PNG, or WEBP label image.",
          details: { field: "image" }
        }
      }
    ]
  };
}

describe("BatchVerification", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_BASE_URL", "http://127.0.0.1:8000");
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("creates multipart request with three image and application-data pairs by index", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: { passed: 3, needs_review: 0, total: 3 },
        items: []
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderBatchVerification();
    await fillRows(3);
    await submitForm();
    await waitForAsyncUpdates();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/verify/batch", {
      method: "POST",
      body: expect.any(FormData)
    });

    const formData = fetchMock.mock.calls[0][1].body as FormData;
    const images = formData.getAll("images");
    const applicationItems = formData.getAll("application_data");
    expect(images).toHaveLength(3);
    expect(applicationItems).toHaveLength(3);
    expect((images[0] as File).name).toBe("label-0.png");
    expect((images[1] as File).name).toBe("label-1.png");
    expect(JSON.parse(String(applicationItems[0]))).toEqual(canonicalApplicationData);
    expect(JSON.parse(String(applicationItems[1]))).toEqual(canonicalApplicationData);
  });

  it("does not use non-canonical field names in application-data payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ summary: { passed: 1, needs_review: 0, total: 1 }, items: [] })
      })
    );

    await renderBatchVerification();
    await fillRows(1);
    await submitForm();
    await waitForAsyncUpdates();

    const formData = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as FormData;
    const payload = JSON.parse(String(formData.getAll("application_data")[0]));
    expect(Object.keys(payload)).toEqual([
      "brand_name",
      "class_type",
      "abv",
      "net_contents",
      "producer",
      "country_of_origin",
      "government_warning"
    ]);
    expect(payload.alcohol_content).toBeUndefined();
    expect(payload.producer_name_address).toBeUndefined();
  });

  it("renders progress while the batch is processing", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      )
    );

    await renderBatchVerification();
    await fillRows(3);
    await submitForm();

    expect(container.textContent).toContain("Checking 3 labels now.");

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ summary: { passed: 3, needs_review: 0, total: 3 }, items: [] })
      });
    });
    await waitForAsyncUpdates();
  });

  it("renders summary counts and opens individual result drill-down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => makeBatchResponse()
      })
    );

    await renderBatchVerification();
    await fillRows(3);
    await submitForm();
    await waitForAsyncUpdates();

    expect(container.textContent).toContain("Batch Complete");
    expect(container.textContent).toContain("Passed");
    expect(container.textContent).toContain("Needs Review");
    expect(container.textContent).toContain("Total");
    expect(container.textContent).toContain("Label 2");

    const firstToggle = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Hide Details"
    );
    expect(firstToggle?.getAttribute("aria-expanded")).toBe("true");

    const closedToggle = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "View Details"
    );
    expect(closedToggle?.getAttribute("aria-expanded")).toBe("false");

    await clickButtonWithText("View Details");

    expect(container.textContent).toContain("Expected");
    expect(container.textContent).toContain("OLD TOM DISTILLERY");
    expect(container.textContent).toContain("Found");
    expect(container.textContent).toContain("OTHER DISTILLERY");
    expect(container.textContent).toContain("Reason");
    expect(container.textContent).toContain("Values do not match after normalization.");
  });

  it("renders item-level errors readably", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          summary: { passed: 0, needs_review: 1, total: 1 },
          items: [
            {
              index: 0,
              result: null,
              error: {
                code: "validation_error",
                message: "This label is missing an image.",
                details: { field: "image" }
              }
            }
          ]
        })
      })
    );

    await renderBatchVerification();
    await fillRows(1);
    await submitForm();
    await waitForAsyncUpdates();

    expect(container.textContent).toContain("Could not check this label.");
    expect(container.textContent).toContain("This label is missing an image.");
  });

  it("marks batch image and text inputs invalid after an empty submit", async () => {
    await renderBatchVerification();
    await submitForm();

    expect(container.textContent).toContain("Each label needs one image and all seven application fields.");
    expect(fileInput(0).getAttribute("aria-invalid")).toBe("true");
    expect(textInput("brand_name", 0).getAttribute("aria-invalid")).toBe("true");
  });
});
