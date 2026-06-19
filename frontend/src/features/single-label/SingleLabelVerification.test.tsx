import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SingleLabelVerification } from "./SingleLabelVerification";

let container: HTMLDivElement;
let root: Root;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function textInput(name: string): HTMLInputElement | HTMLTextAreaElement {
  const element = container.querySelector(`[name="${name}"]`);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    throw new Error(`Missing field: ${name}`);
  }
  return element;
}

function submitButton(): HTMLButtonElement {
  const button = container.querySelector("button[type='submit']");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Missing submit button");
  }
  return button;
}

function fileInput(): HTMLInputElement {
  const input = container.querySelector("input[type='file']");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Missing file input");
  }
  return input;
}

async function renderSingleLabelVerification() {
  await act(async () => {
    root.render(<SingleLabelVerification />);
  });
}

async function changeField(name: string, value: string) {
  await act(async () => {
    const input = textInput(name);
    const prototype =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function chooseImage(file: File) {
  await act(async () => {
    const input = fileInput();
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

async function fillRequiredForm() {
  await chooseImage(new File(["image"], "label.png", { type: "image/png" }));
  await changeField("brand_name", "OLD TOM DISTILLERY");
  await changeField("class_type", "Kentucky Straight Bourbon Whiskey");
  await changeField("abv", "45% Alc./Vol. (90 Proof)");
  await changeField("net_contents", "750 mL");
  await changeField("producer", "Old Tom Distillery, Louisville, KY");
  await changeField("country_of_origin", "United States");
  await changeField("government_warning", "GOVERNMENT WARNING: Test warning text.");
}

describe("SingleLabelVerification", () => {
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

  it("requires an image and all seven canonical fields before submit", async () => {
    await renderSingleLabelVerification();
    await submitForm();

    expect(container.textContent).toContain("Choose a label image.");
    expect(container.textContent).toContain("Enter the brand name.");
    expect(container.textContent).toContain("Enter the government warning.");
    expect(fileInput().getAttribute("aria-invalid")).toBe("true");
    expect(textInput("brand_name").getAttribute("aria-invalid")).toBe("true");
  });

  it("sends multipart form data with exactly the canonical application fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        overall_verdict: "APPROVED",
        latency_ms: 1200,
        results: []
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderSingleLabelVerification();
    await fillRequiredForm();
    await submitForm();
    await waitForAsyncUpdates();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/verify", {
      method: "POST",
      body: expect.any(FormData)
    });

    const formData = fetchMock.mock.calls[0][1].body as FormData;
    expect(formData.get("image")).toBeInstanceOf(File);
    expect(JSON.parse(String(formData.get("application_data")))).toEqual({
      brand_name: "OLD TOM DISTILLERY",
      class_type: "Kentucky Straight Bourbon Whiskey",
      abv: "45% Alc./Vol. (90 Proof)",
      net_contents: "750 mL",
      producer: "Old Tom Distillery, Louisville, KY",
      country_of_origin: "United States",
      government_warning: "GOVERNMENT WARNING: Test warning text."
    });
  });

  it("renders backend errors in plain English", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: {
            code: "unsupported_file_type",
            message: "Please upload a JPG or PNG label image.",
            details: {}
          }
        })
      })
    );

    await renderSingleLabelVerification();
    await fillRequiredForm();
    await submitForm();
    await waitForAsyncUpdates();

    expect(container.textContent).toContain("Could not check this label.");
    expect(container.textContent).toContain("Please upload a JPG or PNG label image.");
  });

  it("shows a prominent verdict and failed-field details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          overall_verdict: "NEEDS_REVIEW",
          latency_ms: 980,
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
        })
      })
    );

    await renderSingleLabelVerification();
    await fillRequiredForm();
    await submitForm();
    await waitForAsyncUpdates();

    expect(container.textContent).toContain("NEEDS REVIEW");
    expect(container.textContent).toContain("Completed in 980 ms");
    expect(container.textContent).toContain("Expected");
    expect(container.textContent).toContain("OLD TOM DISTILLERY");
    expect(container.textContent).toContain("Found");
    expect(container.textContent).toContain("OTHER DISTILLERY");
    expect(container.textContent).toContain("Reason");
    expect(container.textContent).toContain("Values do not match after normalization.");
  });
});
