import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PackageWorkflow } from "./PackageWorkflow";
import { buildReviewedResultsExport, parseApplicationPackages } from "./packageWorkflowUtils";

let container: HTMLDivElement;
let root: Root;
let createdBlobs: Blob[];

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

function imageFile(name: string, type = "image/png"): File {
  return new File([`image-${name}`], name, { type });
}

function jsonFile(
  name: string,
  imageFilename: string,
  applicationData: Record<string, unknown> = canonicalApplicationData
): File {
  return new File(
    [
      JSON.stringify({
        image_filename: imageFilename,
        application_data: applicationData
      })
    ],
    name,
    { type: "application/json" }
  );
}

function verificationResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    overall_verdict: "APPROVED",
    latency_ms: 42,
    results: [
      {
        field: "brand_name",
        match_type: "fuzzy",
        expected: "OLD TOM DISTILLERY",
        found: "Old Tom Distillery",
        status: "PASS",
        message: "Values match after fuzzy normalization."
      },
      {
        field: "class_type",
        match_type: "fuzzy",
        expected: "Kentucky Straight Bourbon Whiskey",
        found: "Kentucky Straight Bourbon Whiskey",
        status: "PASS",
        message: "Values match after fuzzy normalization."
      },
      {
        field: "abv",
        match_type: "numeric",
        expected: "45% Alc./Vol. (90 Proof)",
        found: "45% Alc./Vol. (90 Proof)",
        status: "PASS",
        message: "ABV matches within tolerance."
      },
      {
        field: "net_contents",
        match_type: "unit",
        expected: "750 mL",
        found: "750ml",
        status: "PASS",
        message: "Net contents match."
      },
      {
        field: "producer",
        match_type: "fuzzy",
        expected: "Old Tom Distillery, Louisville, KY",
        found: "OLD TOM DISTILLERY, LOUISVILLE KY",
        status: "PASS",
        message: "Values match after fuzzy normalization."
      },
      {
        field: "country_of_origin",
        match_type: "synonym",
        expected: "United States",
        found: "USA",
        status: "PASS",
        message: "Country matches."
      },
      {
        field: "government_warning",
        match_type: "exact",
        expected: "GOVERNMENT WARNING: Test warning text.",
        found: "GOVERNMENT WARNING: Test warning text.",
        status: "PASS",
        message: "Government warning text matches exactly after whitespace collapse."
      }
    ],
    ...overrides
  };
}

async function renderPackageWorkflow() {
  await act(async () => {
    root.render(<PackageWorkflow />);
  });
}

function fileInput(): HTMLInputElement {
  const input = container.querySelector("input[type='file']");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Missing file input");
  }
  return input;
}

function buttonWithText(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === text
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${text}`);
  }
  return button;
}

function buttonWithLabel(label: string): HTMLButtonElement {
  const button = container.querySelector(`[aria-label="${label}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${label}`);
  }
  return button;
}

async function chooseFiles(files: File[]) {
  await act(async () => {
    Object.defineProperty(fileInput(), "files", {
      configurable: true,
      value: files
    });
    fileInput().dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitForAsyncUpdates();
}

async function clickButton(text: string) {
  await act(async () => {
    buttonWithText(text).click();
  });
  await waitForAsyncUpdates();
}

async function clickButtonLabel(label: string) {
  await act(async () => {
    buttonWithLabel(label).click();
  });
  await waitForAsyncUpdates();
}

async function changeField(label: string, value: string) {
  await act(async () => {
    const input = container.querySelector(`[aria-label="${label}"]`);
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
      throw new Error(`Missing field: ${label}`);
    }
    const prototype =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function waitForAsyncUpdates() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function readFormDataBody(callIndex = 0): FormData {
  return (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[callIndex][1].body as FormData;
}

function firstPackageButton(): HTMLButtonElement {
  const button = container.querySelector(".package-card__button");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Missing package button");
  }
  return button;
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read blob."));
    reader.readAsText(blob);
  });
}

function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read blob."));
    reader.readAsArrayBuffer(blob);
  });
}

describe("package parser", () => {
  it("parses a valid package", async () => {
    const result = await parseApplicationPackages([
      jsonFile("application.json", "label.png"),
      imageFile("label.png")
    ]);

    expect(result.errors).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.incomplete_records).toEqual([]);
    expect(result.records[0].image_filename).toBe("label.png");
    expect(result.records[0].application_data).toEqual(canonicalApplicationData);
    expect(result.records[0].status).toBe("Pending Check");
  });

  it("parses multiple packages", async () => {
    const result = await parseApplicationPackages([
      jsonFile("first.json", "first.png"),
      imageFile("first.png"),
      jsonFile("second.json", "second.png"),
      imageFile("second.png")
    ]);

    expect(result.errors).toEqual([]);
    expect(result.incomplete_records).toEqual([]);
    expect(result.records.map((record) => record.image_filename)).toEqual([
      "first.png",
      "second.png"
    ]);
  });

  it("pairs JSON to image by filename instead of upload order", async () => {
    const result = await parseApplicationPackages([
      imageFile("second.png"),
      jsonFile("first.json", "first.png", {
        ...canonicalApplicationData,
        brand_name: "FIRST BRAND"
      }),
      imageFile("first.png"),
      jsonFile("second.json", "second.png", {
        ...canonicalApplicationData,
        brand_name: "SECOND BRAND"
      })
    ]);

    expect(result.errors).toEqual([]);
    expect(result.incomplete_records).toEqual([]);
    expect(result.records[0].image_filename).toBe("first.png");
    expect(result.records[0].image_file.name).toBe("first.png");
    expect(result.records[0].application_data.brand_name).toBe("FIRST BRAND");
    expect(result.records[1].image_file.name).toBe("second.png");
  });

  it("tracks incomplete packages when a matching image or JSON is missing", async () => {
    const result = await parseApplicationPackages([
      jsonFile("orphan-json.json", "not-uploaded.png"),
      imageFile("orphan-image.png")
    ]);

    expect(result.errors).toEqual([]);
    expect(result.records).toHaveLength(0);
    expect(result.incomplete_records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "json_missing_image",
          json_filename: "orphan-json.json",
          expected_image_filename: "not-uploaded.png"
        }),
        expect.objectContaining({
          kind: "image_missing_json",
          image_filename: "orphan-image.png"
        })
      ])
    );
  });

  it("reports readable errors for invalid packages", async () => {
    const missingFields = { ...canonicalApplicationData };
    delete (missingFields as Partial<typeof canonicalApplicationData>).government_warning;
    const extraFields = {
      ...canonicalApplicationData,
      alcohol_content: "45%"
    };

    const result = await parseApplicationPackages([
      new File(["not-json"], "bad.json", { type: "application/json" }),
      new File([JSON.stringify({ application_data: canonicalApplicationData })], "missing-image.json", {
        type: "application/json"
      }),
      new File([JSON.stringify({ image_filename: "x.png" })], "missing-data.json", {
        type: "application/json"
      }),
      jsonFile("missing-field.json", "missing-field.png", missingFields),
      imageFile("missing-field.png"),
      jsonFile("extra-field.json", "extra-field.png", extraFields),
      imageFile("extra-field.png"),
      jsonFile("duplicate-a.json", "duplicate.png"),
      jsonFile("duplicate-b.json", "duplicate.png"),
      imageFile("duplicate.png"),
      imageFile("unsupported.gif", "image/gif")
    ]);

    expect(result.records).toHaveLength(0);
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "invalid_json",
        "missing_image_filename",
        "missing_application_data",
        "missing_canonical_fields",
        "extra_non_canonical_fields",
        "duplicate_image_filename",
        "unsupported_image_type"
      ])
    );
    expect(result.errors.map((error) => error.message).join(" ")).toContain("government_warning");
    expect(result.errors.map((error) => error.message).join(" ")).toContain("alcohol_content");
  });
});

describe("PackageWorkflow", () => {
  beforeEach(() => {
    createdBlobs = [];
    vi.stubEnv("VITE_API_BASE_URL", "http://127.0.0.1:8000");
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((value: Blob | File) => {
        if (value instanceof Blob && !(value instanceof File)) {
          createdBlobs.push(value);
          return `blob:export-${createdBlobs.length}`;
        }
        return `blob:${(value as File).name}`;
      })
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("renders the upload area", async () => {
    await renderPackageWorkflow();

    expect(container.querySelector('[data-testid="package-upload-area"]')).not.toBeNull();
    expect(container.textContent).toContain("Choose Files");
    expect(container.textContent).toContain("Download Demo Data");
    expect(container.textContent).toContain("Use OPENAI KEY");
    expect(container.textContent).toContain("Submit");
    expect(container.textContent).toContain("Applications");
    expect(container.textContent).toContain("Incomplete Applications");
    expect(container.textContent).toContain("No Incomplete Applications");
    expect(container.textContent).not.toContain("Check Applications");
    expect(container.textContent).not.toContain("Single Label");
    expect(container.textContent).not.toContain("Batch Upload");
  });

  it("shows OpenAI key warning inputs when enabled", async () => {
    await renderPackageWorkflow();

    await act(async () => {
      const checkbox = container.querySelector('input[type="checkbox"]');
      if (!(checkbox instanceof HTMLInputElement)) {
        throw new Error("Missing OpenAI checkbox");
      }
      checkbox.click();
    });

    expect(container.textContent).toContain("WARNING: THIS USES REAL API CALLS");
    expect(container.textContent).toContain("API Key");
    expect(container.textContent).toContain("Model");
    await clickButton("Cancel");
    expect(container.textContent).not.toContain("WARNING: THIS USES REAL API CALLS");
  });

  it("downloads demo inputs as one archive", async () => {
    const anchors: HTMLAnchorElement[] = [];
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === "a") {
        anchors.push(element as HTMLAnchorElement);
      }
      return element;
    }) as typeof document.createElement);

    await renderPackageWorkflow();
    await clickButton("Download Demo Data");

    expect(anchors).toHaveLength(1);
    expect(anchors[0].download).toBe("demo-inputs.zip");
    expect(anchors[0].href).toContain("/demo-data/demo-inputs.zip");
  });

  it("adds later uploads to the current batch instead of replacing them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => verificationResult()
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([jsonFile("first.json", "first.png"), imageFile("first.png")]);
    await chooseFiles([
      jsonFile("second.json", "second.png", {
        ...canonicalApplicationData,
        brand_name: "SECOND BRAND"
      }),
      imageFile("second.png")
    ]);

    expect(container.textContent).toContain("OLD TOM DISTILLERY");
    expect(container.textContent).toContain("SECOND BRAND");
    expect(container.textContent).toContain("2 total");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shows incomplete uploads and moves them to applications when the pair arrives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => verificationResult()
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([jsonFile("application.json", "label.png")]);

    expect(container.textContent).toContain("Incomplete Applications");
    expect(container.textContent).toContain("1 total");
    expect(container.textContent).toContain("1 json");
    expect(container.textContent).toContain("Incomplete Application 1");
    expect(container.textContent).toContain("Missing Image");
    expect(container.textContent).not.toContain("application.json is waiting for label.png.");
    expect(fetch).not.toHaveBeenCalled();

    await chooseFiles([imageFile("label.png")]);

    expect(container.textContent).toContain("Applications");
    expect(container.textContent).toContain("OLD TOM DISTILLERY");
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:8000/verify", {
      method: "POST",
      body: expect.any(FormData),
      signal: expect.any(AbortSignal)
    });
  });

  it("filters applications and updates section counts from search text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          summary: { passed: 2, needs_review: 0, total: 2 },
          items: [
            { index: 0, result: verificationResult(), error: null },
            { index: 1, result: verificationResult(), error: null }
          ]
        })
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([
      jsonFile("first.json", "first.png"),
      imageFile("first.png"),
      jsonFile("second.json", "second.png", {
        ...canonicalApplicationData,
        brand_name: "SECOND BRAND"
      }),
      imageFile("second.png"),
      jsonFile("waiting.json", "missing.png")
    ]);

    await act(async () => {
      const search = container.querySelector('input[type="search"]');
      if (!(search instanceof HTMLInputElement)) {
        throw new Error("Missing search field");
      }
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(search, "second");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitForAsyncUpdates();

    expect(container.textContent).toContain("SECOND BRAND");
    expect(container.textContent).not.toContain("OLD TOM DISTILLERY");
    expect(container.textContent).toContain("1 total");
    expect(container.textContent).toContain("No Matching Incomplete Applications");
  });

  it("uses incomplete header count buttons as filters", async () => {
    await renderPackageWorkflow();
    await chooseFiles([jsonFile("waiting.json", "missing.png"), imageFile("lonely.png")]);

    expect(container.textContent).toContain("2 total");
    expect(container.textContent).toContain("1 json");
    expect(container.textContent).toContain("1 images");

    await clickButton("1 images");

    expect(container.textContent).toContain("2 total");
    expect(container.textContent).toContain("1 json");
    expect(buttonWithText("2 total").getAttribute("aria-pressed")).toBe("false");
    expect(buttonWithText("1 json").getAttribute("aria-pressed")).toBe("false");
    expect(buttonWithText("1 images").getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).not.toContain("Missing Image");
    expect(container.textContent).toContain("Incomplete Application 1");
    expect(container.textContent).toContain("Missing Application Data");
    expect(container.textContent).not.toContain("lonely.png is waiting for a matching application JSON file.");
  });

  it("expands advanced search and refines by alcohol content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          summary: { passed: 2, needs_review: 0, total: 2 },
          items: [
            { index: 0, result: verificationResult(), error: null },
            { index: 1, result: verificationResult(), error: null }
          ]
        })
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([
      jsonFile("lower.json", "lower.png", {
        ...canonicalApplicationData,
        abv: "12.5%",
        brand_name: "LOWER ABV"
      }),
      imageFile("lower.png"),
      jsonFile("higher.json", "higher.png", {
        ...canonicalApplicationData,
        abv: "45%",
        brand_name: "HIGHER ABV"
      }),
      imageFile("higher.png")
    ]);

    await clickButton("Advanced Search");

    await act(async () => {
      const abvLabel = Array.from(container.querySelectorAll("label")).find((label) =>
        label.textContent?.includes("Alcohol Content")
      );
      const operator = abvLabel?.querySelector("select");
      const value = abvLabel?.querySelector("input");
      if (!(operator instanceof HTMLSelectElement) || !(value instanceof HTMLInputElement)) {
        throw new Error("Missing ABV filters");
      }
      const operatorSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      operatorSetter?.call(operator, "gt");
      operator.dispatchEvent(new Event("change", { bubbles: true }));
      valueSetter?.call(value, "20");
      value.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitForAsyncUpdates();

    expect(container.textContent).toContain("HIGHER ABV");
    expect(container.textContent).not.toContain("LOWER ABV");
    expect(container.textContent).toContain("1 total");
  });

  it("calls /verify automatically when one application is uploaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => verificationResult()
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([jsonFile("application.json", "label.png"), imageFile("label.png")]);

    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:8000/verify", {
      method: "POST",
      body: expect.any(FormData),
      signal: expect.any(AbortSignal)
    });
    expect((readFormDataBody().get("image") as File).name).toBe("label.png");
    expect(JSON.parse(String(readFormDataBody().get("application_data")))).toEqual(
      canonicalApplicationData
    );
    expect(readFormDataBody().get("use_real_vision")).toBe("false");
    expect(readFormDataBody().get("openai_api_key")).toBeNull();
    expect(readFormDataBody().get("openai_model")).toBeNull();
    expect(container.textContent).toContain("Passed");
  });

  it("sends temporary OpenAI settings when OpenAI key mode is enabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => verificationResult()
      })
    );

    await renderPackageWorkflow();
    await act(async () => {
      const checkbox = container.querySelector('input[type="checkbox"]');
      if (!(checkbox instanceof HTMLInputElement)) {
        throw new Error("Missing OpenAI checkbox");
      }
      checkbox.click();
    });
    await act(async () => {
      const apiKeyInput = Array.from(container.querySelectorAll("label")).find((label) =>
        label.textContent?.includes("API Key")
      )?.querySelector("input");
      if (!(apiKeyInput instanceof HTMLInputElement)) {
        throw new Error("Missing API key input");
      }
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(apiKeyInput, "sk-test");
      apiKeyInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickButton("Proceed");
    await chooseFiles([jsonFile("application.json", "label.png"), imageFile("label.png")]);

    expect(readFormDataBody().get("use_real_vision")).toBe("true");
    expect(readFormDataBody().get("openai_api_key")).toBe("sk-test");
    expect(readFormDataBody().get("openai_model")).toBe("gpt-4.1-mini");
    expect(container.textContent).toContain("Real AI vision ready: gpt-4.1-mini");
  });

  it("rechecks existing applications with temporary OpenAI settings after enabling real vision", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => verificationResult()
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([jsonFile("application.json", "label.png"), imageFile("label.png")]);
    expect(readFormDataBody(0).get("use_real_vision")).toBe("false");

    await act(async () => {
      const checkbox = container.querySelector('input[type="checkbox"]');
      if (!(checkbox instanceof HTMLInputElement)) {
        throw new Error("Missing OpenAI checkbox");
      }
      checkbox.click();
    });
    await act(async () => {
      const apiKeyInput = Array.from(container.querySelectorAll("label")).find((label) =>
        label.textContent?.includes("API Key")
      )?.querySelector("input");
      if (!(apiKeyInput instanceof HTMLInputElement)) {
        throw new Error("Missing API key input");
      }
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(apiKeyInput, "sk-later-test");
      apiKeyInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickButton("Proceed");
    await waitForAsyncUpdates();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(readFormDataBody(1).get("use_real_vision")).toBe("true");
    expect(readFormDataBody(1).get("openai_api_key")).toBe("sk-later-test");
    expect(readFormDataBody(1).get("openai_model")).toBe("gpt-4.1-mini");
  });

  it("calls /verify/batch automatically for multiple applications and maps index results by record", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          summary: { passed: 1, needs_review: 1, total: 2 },
          items: [
            {
              index: 0,
              result: verificationResult({
                overall_verdict: "NEEDS_REVIEW",
                results: [
                  {
                    field: "brand_name",
                    match_type: "fuzzy",
                    expected: "FIRST BRAND",
                    found: "WRONG BRAND",
                    status: "FAIL",
                    message: "Values do not match after fuzzy normalization."
                  }
                ]
              }),
              error: null
            },
            {
              index: 1,
              result: verificationResult(),
              error: null
            }
          ]
        })
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([
      imageFile("second.png"),
      jsonFile("first.json", "first.png", {
        ...canonicalApplicationData,
        brand_name: "FIRST BRAND"
      }),
      imageFile("first.png"),
      jsonFile("second.json", "second.png")
    ]);

    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:8000/verify/batch", {
      method: "POST",
      body: expect.any(FormData),
      signal: expect.any(AbortSignal)
    });
    const formData = readFormDataBody();
    expect((formData.getAll("images")[0] as File).name).toBe("first.png");
    expect((formData.getAll("images")[1] as File).name).toBe("second.png");
    expect(formData.get("use_real_vision")).toBe("false");
    expect(formData.get("openai_api_key")).toBeNull();
    expect(formData.get("openai_model")).toBeNull();

    const firstCard = container.textContent ?? "";
    expect(firstCard).toContain("FIRST BRAND");
    expect(firstCard).toContain("Needs Review");
    expect(firstCard).toContain("OLD TOM DISTILLERY");
    expect(firstCard).toContain("Passed");
  });

  it("opens detail view with brand header, image, read-only values, and field decision icons", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => verificationResult()
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([jsonFile("application.json", "label.png"), imageFile("label.png")]);
    await act(async () => {
      firstPackageButton().click();
    });

    const image = container.querySelector('img[alt="Label image for OLD TOM DISTILLERY"]');
    expect(image).not.toBeNull();
    expect(container.querySelector("#detail-title")?.textContent).toBe("OLD TOM DISTILLERY");
    expect(container.textContent).toContain("Data");
    expect(container.textContent).toContain("Application #");
    expect(container.querySelector(".data-row--field-government_warning")).not.toBeNull();
    expect(container.textContent).toContain("Application");
    expect(container.textContent).toContain("AI Detected");
    expect(container.textContent).toContain("Hover Mouse Over Image To Zoom In");
    expect(container.textContent).not.toContain("Backend Results");
    expect(container.textContent).not.toContain("AI Reasoning");
    expect(container.textContent).not.toContain("label.png");

    const applicationBrand = container.querySelector('[aria-label="Application Value Brand Name"]');
    const extractedBrand = container.querySelector('[aria-label="Extracted Value Brand Name"]');
    expect(applicationBrand).toBeInstanceOf(HTMLParagraphElement);
    expect(extractedBrand).toBeInstanceOf(HTMLParagraphElement);
    expect(extractedBrand?.textContent).toBe("Old Tom Distillery");
    expect(buttonWithText("X")).toBeInstanceOf(HTMLButtonElement);
    expect(container.querySelector('[aria-label="Fail Brand Name"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Needs review Brand Name"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Pass Brand Name"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Brand Name comparison rule"]')).not.toBeNull();
    expect(container.textContent).toContain("same within 0.1 percentage points");
    expect(container.textContent).toContain("same within 1 mL");
    expect(container.textContent).toContain("AI can have a hard time confirming");
  });

  it("closes detail when the status button is clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => verificationResult()
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([jsonFile("application.json", "label.png"), imageFile("label.png")]);
    await act(async () => {
      firstPackageButton().click();
    });

    expect(container.querySelector("#data-title")).not.toBeNull();
    await clickButtonLabel("Close detail view. Current status: Passed");
    expect(container.querySelector("#data-title")).toBeNull();
  });

  it("filters detail data fields from the data header count buttons", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          verificationResult({
            overall_verdict: "NEEDS_REVIEW",
            results: [
              {
                field: "brand_name",
                match_type: "fuzzy",
                expected: "OLD TOM DISTILLERY",
                found: "WRONG BRAND",
                status: "FAIL",
                message: "Values do not match after fuzzy normalization."
              },
              ...verificationResult().results.slice(1)
            ]
          })
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([jsonFile("application.json", "label.png"), imageFile("label.png")]);
    await act(async () => {
      firstPackageButton().click();
    });

    const dataPanel = container.querySelector(".data-panel");
    if (!(dataPanel instanceof HTMLElement)) {
      throw new Error("Missing data panel");
    }

    expect(dataPanel.textContent).toContain("7 total");
    expect(dataPanel.textContent).toContain("0 fail");
    expect(dataPanel.textContent).toContain("1 needs review");
    expect(dataPanel.textContent).toContain("6 passed");

    const reviewFilter = Array.from(dataPanel.querySelectorAll("button")).find(
      (button) => button.textContent === "1 needs review"
    );
    if (!(reviewFilter instanceof HTMLButtonElement)) {
      throw new Error("Missing review field filter");
    }

    await act(async () => {
      reviewFilter.click();
    });
    await waitForAsyncUpdates();

    expect(reviewFilter.getAttribute("aria-pressed")).toBe("true");
    expect(dataPanel.textContent).toContain("Brand Name");
    expect(dataPanel.textContent).not.toContain("Class Type");
  });

  it("shows a magnified label pane that can freeze, reset, and rotate with the image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => verificationResult()
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([jsonFile("application.json", "label.png"), imageFile("label.png")]);
    await act(async () => {
      firstPackageButton().click();
    });

    const imageFrame = container.querySelector(".detail-image-frame");
    const zoomPane = container.querySelector(".detail-zoom-pane");
    if (!(imageFrame instanceof HTMLDivElement) || !(zoomPane instanceof HTMLDivElement)) {
      throw new Error("Missing zoomable label image");
    }
    const labelImage = imageFrame.querySelector("img");
    const zoomImage = zoomPane.querySelector("img");
    if (!(labelImage instanceof HTMLImageElement) || !(zoomImage instanceof HTMLImageElement)) {
      throw new Error("Missing zoom images");
    }
    const zoomClip = zoomPane.querySelector(".detail-zoom-pane__clip");
    expect(zoomClip?.classList.contains("detail-zoom-pane__clip--active")).toBe(false);

    vi.spyOn(imageFrame, "getBoundingClientRect").mockReturnValue({
      bottom: 400,
      height: 400,
      left: 10,
      right: 210,
      top: 0,
      width: 200,
      x: 10,
      y: 0,
      toJSON: () => ({})
    });
    vi.spyOn(labelImage, "getBoundingClientRect").mockReturnValue({
      bottom: 360,
      height: 320,
      left: 30,
      right: 190,
      top: 40,
      width: 160,
      x: 30,
      y: 40,
      toJSON: () => ({})
    });
    vi.spyOn(zoomPane, "getBoundingClientRect").mockReturnValue({
      bottom: 540,
      height: 100,
      left: 10,
      right: 210,
      top: 440,
      width: 200,
      x: 10,
      y: 440,
      toJSON: () => ({})
    });

    await act(async () => {
      imageFrame.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 160,
          clientY: 300
        })
      );
    });

    expect(zoomPane.getAttribute("aria-label")).toBe("Magnified label image");
    expect(zoomPane.classList.contains("detail-zoom-pane--active")).toBe(true);
    expect(zoomClip?.classList.contains("detail-zoom-pane__clip--active")).toBe(true);
    expect((labelImage as HTMLElement).style.width).toBe("200px");
    expect((labelImage as HTMLElement).style.height).toBe("200px");
    expect((labelImage as HTMLElement).style.top).toBe("100px");
    expect((zoomImage as HTMLElement).style.left).toBe("-50px");
    expect((zoomImage as HTMLElement).style.top).toBe("-150px");
    expect((zoomImage as HTMLElement).style.transformOrigin).toBe("150px 200px");
    expect((zoomImage as HTMLElement).style.transform).toContain("scale(4.3)");
    const lens = imageFrame.querySelector(".detail-image-frame__lens");
    expect((lens as HTMLElement).style.width).toBe("72px");
    expect((lens as HTMLElement).style.height).toBe("42px");
    expect(lens?.textContent).toBe("");
    expect(container.textContent).toContain("Click to Lock");
    expect(container.textContent).toContain("Drag to move image");

    await act(async () => {
      imageFrame.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          clientX: 160,
          clientY: 300
        })
      );
      imageFrame.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          clientX: 160,
          clientY: 300
        })
      );
      imageFrame.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 60,
          clientY: 100
        })
      );
    });

    expect(imageFrame.classList.contains("detail-image-frame--frozen")).toBe(true);
    expect((zoomImage as HTMLElement).style.left).toBe("-50px");
    expect((zoomImage as HTMLElement).style.top).toBe("-150px");
    expect(container.textContent).not.toContain("Click to Lock");

    await act(async () => {
      imageFrame.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));
      imageFrame.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 60,
          clientY: 100
        })
      );
    });

    expect(imageFrame.classList.contains("detail-image-frame--frozen")).toBe(true);
    expect((zoomImage as HTMLElement).style.left).toBe("-50px");
    expect((zoomImage as HTMLElement).style.top).toBe("-150px");

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 229,
          clientY: 419
        })
      );
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 60,
          clientY: 100
        })
      );
    });

    expect(imageFrame.classList.contains("detail-image-frame--frozen")).toBe(false);
    expect((zoomImage as HTMLElement).style.left).toBe("50px");
    expect((zoomImage as HTMLElement).style.top).toBe("50px");
    expect((zoomImage as HTMLElement).style.transformOrigin).toBe("50px 0px");

    await act(async () => {
      buttonWithLabel("Rotate image right").click();
    });

    expect((labelImage as HTMLElement).style.transform).toBe("translate(0px, 0px) rotate(5deg)");
    expect((zoomImage as HTMLElement).style.transform).toContain("rotate(5deg)");

    await act(async () => {
      imageFrame.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          clientX: 100,
          clientY: 200
        })
      );
      imageFrame.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 300,
          clientY: 200
        })
      );
      imageFrame.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          clientX: 300,
          clientY: 200
        })
      );
    });

    expect((labelImage as HTMLElement).style.transform).toMatch(/translate\(\d+(\.\d+)?px, 0px\) rotate\(5deg\)/);
  });

  it("uses backend field results to enable review decision buttons", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          verificationResult({
            overall_verdict: "NEEDS_REVIEW",
            results: [
              {
                field: "brand_name",
                match_type: "fuzzy",
                expected: "OLD TOM DISTILLERY",
                found: "WRONG BRAND",
                status: "FAIL",
                message: "Values do not match after fuzzy normalization."
              }
            ]
          })
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([jsonFile("application.json", "label.png"), imageFile("label.png")]);
    await act(async () => {
      firstPackageButton().click();
    });

    expect(buttonWithText("FAIL").getAttribute("aria-disabled")).toBe("false");
    expect(buttonWithText("PASS").getAttribute("aria-disabled")).toBe("true");
    await clickButton("FAIL");
    expect(container.textContent).toContain("Fail");
    expect(container.querySelector("#data-title")).toBeNull();
  });

  it("warns before overriding a grayed out pass decision", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          verificationResult({
            overall_verdict: "NEEDS_REVIEW",
            results: [
              {
                field: "brand_name",
                match_type: "fuzzy",
                expected: "OLD TOM DISTILLERY",
                found: "WRONG BRAND",
                status: "FAIL",
                message: "Values do not match after fuzzy normalization."
              }
            ]
          })
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([jsonFile("application.json", "label.png"), imageFile("label.png")]);
    await act(async () => {
      firstPackageButton().click();
    });

    await clickButton("PASS");
    expect(container.textContent).toContain("Pass this application anyway?");
    expect(container.textContent).toContain("Needs Review");
    expect(container.textContent).toContain("Brand Name");
    await clickButton("Cancel");
    expect(container.querySelector("#data-title")).not.toBeNull();

    await clickButton("PASS");
    await clickButton("Proceed With Pass");
    expect(container.textContent).toContain("Passed");
    expect(container.querySelector("#data-title")).toBeNull();
  });

  it("warns before overriding a grayed out fail decision", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => verificationResult()
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([jsonFile("application.json", "label.png"), imageFile("label.png")]);
    await act(async () => {
      firstPackageButton().click();
    });

    expect(buttonWithText("FAIL").getAttribute("aria-disabled")).toBe("true");
    await clickButton("FAIL");
    expect(container.textContent).toContain("Fail this application anyway?");
    expect(container.textContent).toContain("Pass");
    expect(container.textContent).toContain("Brand Name");
    await clickButton("Proceed With Fail");
    expect(container.textContent).toContain("Fail");
    expect(container.querySelector("#data-title")).toBeNull();
  });

  it("does not open detail from card hover and closes detail when clicking outside", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => verificationResult()
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([jsonFile("application.json", "label.png"), imageFile("label.png")]);
    vi.useFakeTimers();
    await act(async () => {
      firstPackageButton().dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      vi.advanceTimersByTime(2500);
    });
    expect(container.querySelector("#data-title")).toBeNull();

    await act(async () => {
      firstPackageButton().click();
    });
    const overlay = container.querySelector(".detail-overlay");
    expect(overlay).not.toBeNull();
    await act(async () => {
      overlay?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(container.querySelector("#data-title")).toBeNull();
  });

  it("field decision icons override the application status", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => verificationResult()
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () =>
            verificationResult({
              overall_verdict: "NEEDS_REVIEW",
              results: [
                {
                  field: "brand_name",
                  match_type: "fuzzy",
                  expected: "OLD TOM DISTILLERY",
                  found: "Old Tom Distillery",
                  status: "FAIL",
                  message: "Reviewer marked this field as needs review."
                },
                ...verificationResult().results.slice(1)
              ]
            })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () =>
            verificationResult({
              overall_verdict: "NEEDS_REVIEW",
              results: [
                {
                  field: "brand_name",
                  match_type: "fuzzy",
                  expected: "OLD TOM DISTILLERY",
                  found: "Old Tom Distillery",
                  status: "FAIL",
                  message: "Reviewer marked this field as fail."
                },
                ...verificationResult().results.slice(1)
              ]
            })
        })
    );

    await renderPackageWorkflow();
    await chooseFiles([jsonFile("application.json", "label.png"), imageFile("label.png")]);
    await act(async () => {
      firstPackageButton().click();
    });

    await clickButtonLabel("Needs review Brand Name");
    expect(fetch).toHaveBeenLastCalledWith("http://127.0.0.1:8000/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
      signal: expect.any(AbortSignal)
    });
    expect(JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1].body)).toMatchObject({
      field_decisions: { brand_name: "review" }
    });
    expect(container.textContent).toContain("Needs Review");
    await clickButtonLabel("Fail Brand Name");
    expect(JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[2][1].body)).toMatchObject({
      field_decisions: { brand_name: "fail" }
    });
    expect(container.textContent).toContain("Fail");
  });

  it("opens pretend submission warning and downloads one zip with applications and results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => verificationResult()
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([
      jsonFile("application.json", "label.png"),
      imageFile("label.png"),
      jsonFile("waiting.json", "missing.png")
    ]);
    await clickButton("Submit");

    expect(container.textContent).toContain("This is the pretend submission.");
    expect(container.textContent).toContain("This will download the application documents with pass/fail attached.");
    expect(container.textContent).toContain("Proceed Without Download");
    expect(container.textContent).toContain("Proceed With Download");
    await clickButton("Cancel");
    expect(createdBlobs).toHaveLength(0);

    await clickButton("Submit");
    await clickButton("Proceed Without Download");
    expect(createdBlobs).toHaveLength(0);

    await clickButton("Submit");
    await clickButton("Proceed With Download");
    expect(createdBlobs).toHaveLength(1);
    expect(createdBlobs[0].type).toBe("application/zip");
    const bytes = new Uint8Array(await readBlobArrayBuffer(createdBlobs[0]));
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const zipText = await readBlobText(createdBlobs[0]);
    expect(zipText).toContain("applications/application.json");
    expect(zipText).toContain("applications/label.png");
    expect(zipText).toContain("applications/waiting.json");
    expect(zipText).toContain("results/submission-results.json");
    expect(zipText).toContain('"schema_version": "pretend-submission-results-v1"');
    expect(zipText).toContain('"application_id": "application-1"');
    expect(zipText).toContain('"status": "pass"');
    expect(zipText).toContain('"application_id": "incomplete-application-1"');
    expect(zipText).toContain('"status": "fail"');
  });

  it("exports pending items honestly", () => {
    const exportJson = buildReviewedResultsExport([
      {
        package_id: "application-1",
        json_filename: "application.json",
        image_filename: "label.png",
        image_file: imageFile("label.png"),
        image_preview_url: "",
        application_data: canonicalApplicationData,
        original_extracted_data: null,
        reviewed_extracted_data: null,
        comparison_result: null,
        field_decisions: {},
        status: "Pending Check",
        validation_errors: [],
        item_error: null
      }
    ]);

    expect(exportJson.summary).toEqual({
      failed: 0,
      passed: 0,
      needs_review: 0,
      pending: 1,
      total: 1
    });
    expect(exportJson.applications[0]).toMatchObject({
      application_id: "application-1",
      image_filename: "label.png",
      status: "Pending Check",
      reviewed_extracted_data: null,
      field_results: [],
      overall_verdict: null,
      errors: []
    });
  });

  it("builds export JSON with item errors when present", () => {
    const exported = buildReviewedResultsExport(
      [
        {
          package_id: "application-1",
          json_filename: "application.json",
          image_filename: "label.png",
          image_file: imageFile("label.png"),
          image_preview_url: "",
          application_data: canonicalApplicationData,
          original_extracted_data: null,
          reviewed_extracted_data: null,
          comparison_result: null,
          field_decisions: {},
          status: "Needs Review",
          validation_errors: [],
          item_error: "This application could not be checked."
        }
      ],
      "2026-06-20T00:00:00.000Z"
    );

    expect(exported.generated_at).toBe("2026-06-20T00:00:00.000Z");
    expect(exported.summary).toEqual({
      failed: 0,
      passed: 0,
      needs_review: 1,
      pending: 0,
      total: 1
    });
    expect(exported.applications[0].errors).toEqual([
      { code: "item_error", message: "This application could not be checked." }
    ]);
  });

  it("does not contain frontend comparison tolerance logic", () => {
    const modules = import.meta.glob("../../**/*.{ts,tsx}", {
      eager: true,
      import: "default",
      query: "?raw"
    }) as Record<string, string>;
    const source = Object.entries(modules)
      .filter(([path]) => !path.endsWith(".test.tsx"))
      .map(([, contents]) => contents)
      .join("\n");

    expect(source).not.toMatch(/ABV_TOLERANCE|NET_CONTENTS_TOLERANCE|token_sort|rapidfuzz/i);
    expect(source).not.toMatch(/parse_abv|parse_net_contents|fuzzyThreshold|unitTolerance/i);
  });
});
