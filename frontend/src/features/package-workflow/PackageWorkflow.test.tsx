import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PackageWorkflow } from "./PackageWorkflow";
import { buildReviewedResultsExport, parseApplicationPackages } from "./packageWorkflowUtils";

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

function imageFile(name: string, type = "image/png"): File {
  return new File([`image-${name}`], name, { type });
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

function extractionResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    brand_name: "Old Tom Distillery",
    class_type: "Kentucky Straight Bourbon Whiskey",
    abv: "45% Alc./Vol. (90 Proof)",
    net_contents: "750ml",
    producer: "OLD TOM DISTILLERY, LOUISVILLE KY",
    country_of_origin: "USA",
    government_warning: "GOVERNMENT WARNING: Test warning text.",
    raw_text: null,
    extraction_confidence: null,
    ...overrides
  };
}

function batchResult(results = [verificationResult()]) {
  return {
    items: results.map((result, index) => ({
      index,
      result,
      error: null
    })),
    summary: {
      passed: results.filter((result) => result.overall_verdict === "APPROVED").length,
      needs_review: results.filter((result) => result.overall_verdict === "NEEDS_REVIEW").length,
      total: results.length
    }
  };
}

function okJson(payload: unknown) {
  return {
    ok: true,
    json: async () => payload
  };
}

function mockWorkflowFetch(result = verificationResult(), compareResult = result) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/extract")) {
        return okJson(extractionResult());
      }
      if (url.endsWith("/verify/batch")) {
        const formData = init?.body as FormData;
        return okJson(batchResult(formData.getAll("images").map(() => result)));
      }
      return okJson(compareResult);
    })
  );
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

async function fillApplicationData(data = canonicalApplicationData) {
  await changeField("Application Value Brand Name", data.brand_name);
  await changeField("Application Value Class / Type", data.class_type);
  await changeField("Application Value Alcohol Content", data.abv);
  await changeField("Application Value Net Contents", data.net_contents);
  await changeField("Application Value Producer", data.producer);
  await changeField("Application Value Country of Origin", data.country_of_origin);
  await changeField("Application Value Government Warning", data.government_warning);
}

async function uploadOpenFillAndVerify(
  image = imageFile("label.png"),
  data = canonicalApplicationData
) {
  await chooseFiles([image]);
  await act(async () => {
    firstPackageButton().click();
  });
  await fillApplicationData(data);
  await clickButton("Verify Batch");
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
  return packageButtonAt(0);
}

function packageButtonAt(index: number): HTMLButtonElement {
  const button = container.querySelectorAll(".package-card__button")[index];
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Missing package button");
  }
  return button;
}

describe("package parser", () => {
  it("creates one pending application for an uploaded image", async () => {
    const result = await parseApplicationPackages([imageFile("label.png")]);

    expect(result.errors).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.incomplete_records).toEqual([]);
    expect(result.records[0].image_filename).toBe("label.png");
    expect(result.records[0].application_data).toEqual({
      brand_name: "",
      class_type: "",
      abv: "",
      net_contents: "",
      producer: "",
      country_of_origin: "",
      government_warning: ""
    });
    expect(result.records[0].status).toBe("Pending Check");
  });

  it("creates one application per uploaded image", async () => {
    const result = await parseApplicationPackages([imageFile("first.png"), imageFile("second.png")]);

    expect(result.errors).toEqual([]);
    expect(result.incomplete_records).toEqual([]);
    expect(result.records.map((record) => record.image_filename)).toEqual([
      "first.png",
      "second.png"
    ]);
  });

  it("keeps image upload order", async () => {
    const result = await parseApplicationPackages([
      imageFile("second.png"),
      imageFile("first.png")
    ]);

    expect(result.errors).toEqual([]);
    expect(result.incomplete_records).toEqual([]);
    expect(result.records.map((record) => record.image_filename)).toEqual([
      "second.png",
      "first.png"
    ]);
  });

  it("rejects non-image files instead of creating incomplete applications", async () => {
    const result = await parseApplicationPackages([
      new File(["{}"], "metadata.json", { type: "application/json" }),
      imageFile("orphan-image.png")
    ]);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].image_filename).toBe("orphan-image.png");
    expect(result.incomplete_records).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "unsupported_image_type",
        filename: "metadata.json"
      })
    ]);
  });

  it("reports readable errors for duplicate or unsupported image files", async () => {
    const result = await parseApplicationPackages([
      imageFile("duplicate.png"),
      imageFile("duplicate.png"),
      imageFile("unsupported.gif", "image/gif")
    ]);

    expect(result.records).toHaveLength(1);
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["duplicate_image_filename", "unsupported_image_type"])
    );
    expect(result.errors.map((error) => error.message).join(" ")).toContain("JPG, PNG, or WEBP");
  });
});

describe("PackageWorkflow", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_BASE_URL", "http://127.0.0.1:8000");
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((value: Blob | File) => `blob:${(value as File).name}`)
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
    expect(fileInput().accept).toBe("image/*");
    expect(container.textContent).toContain("Choose Images");
    expect(container.textContent).toContain("Demo Data");
    expect(container.textContent).not.toContain("Submit");
    expect(container.textContent).toContain("Upload Labels");
    expect(container.textContent).toContain("Applications");
    expect(container.textContent).not.toContain("Incomplete Applications");
    expect(container.textContent).not.toContain("Use OPENAI KEY");
    expect(container.textContent).not.toContain("API Key");
    expect(container.textContent).not.toContain("Check Applications");
    expect(container.textContent).not.toContain("Single Label");
    expect(container.textContent).not.toContain("Batch Upload");
  });

  it("does not render OpenAI key controls", async () => {
    await renderPackageWorkflow();

    expect(container.textContent).not.toContain("WARNING: THIS USES REAL API CALLS");
    expect(container.textContent).not.toContain("Use Real AI Vision");
    expect(container.textContent).not.toContain("Use OPENAI KEY");
    expect(container.querySelector('input[type="password"]')).toBeNull();
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
    await clickButton("Demo Data");

    expect(anchors).toHaveLength(1);
    expect(anchors[0].download).toBe("demo-inputs.zip");
    expect(anchors[0].href).toContain("/demo-data/demo-inputs.zip");
  });

  it("adds selected images as applications immediately", async () => {
    mockWorkflowFetch();

    await renderPackageWorkflow();
    await chooseFiles([imageFile("first.png"), imageFile("second.png")]);

    expect(container.textContent).not.toContain("Review Images");
    expect(container.textContent).toContain("first.png");
    expect(container.textContent).toContain("second.png");
    expect(container.querySelectorAll(".package-card")).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:8000/extract", {
      method: "POST",
      body: expect.any(FormData),
      signal: expect.any(AbortSignal)
    });
  });

  it("adds later uploads to the current batch instead of replacing them", async () => {
    mockWorkflowFetch();

    await renderPackageWorkflow();
    await chooseFiles([imageFile("first.png")]);
    await chooseFiles([imageFile("second.png")]);

    expect(container.textContent).toContain("first.png");
    expect(container.textContent).toContain("second.png");
    expect(container.textContent).toContain("2 total");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shows non-image files as unsupported and keeps image uploads as applications", async () => {
    mockWorkflowFetch();

    await renderPackageWorkflow();
    await chooseFiles([new File(["{}"], "metadata.json", { type: "application/json" })]);

    expect(container.textContent).not.toContain("Incomplete Applications");
    expect(container.textContent).toContain("metadata.json was not added");
    expect(fetch).not.toHaveBeenCalled();

    await chooseFiles([imageFile("label.png")]);

    expect(container.textContent).toContain("Applications");
    expect(container.textContent).toContain("label.png");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("filters applications and updates section counts from search text", async () => {
    mockWorkflowFetch();

    await renderPackageWorkflow();
    await chooseFiles([imageFile("first.png"), imageFile("second.png")]);

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

    expect(container.textContent).toContain("second.png");
    expect(container.textContent).not.toContain("first.png");
    expect(container.textContent).toContain("1 total");
  });

  it("does not show incomplete-application filters", async () => {
    await renderPackageWorkflow();
    await chooseFiles([
      new File(["{}"], "metadata.json", { type: "application/json" }),
      imageFile("lonely.png")
    ]);

    expect(container.textContent).toContain("1 total");
    expect(container.textContent).toContain("lonely.png");
    expect(container.textContent).toContain("metadata.json was not added");
    expect(container.textContent).not.toContain("1 json");
    expect(container.textContent).not.toContain("1 images");
  });

  it("expands advanced search and refines by alcohol content", async () => {
    vi.stubGlobal("fetch", vi.fn());

    await renderPackageWorkflow();
    await chooseFiles([imageFile("lower.png"), imageFile("higher.png")]);
    await act(async () => {
      packageButtonAt(0).click();
    });
    await fillApplicationData({
      ...canonicalApplicationData,
      abv: "12.5%",
      brand_name: "LOWER ABV"
    });
    await clickButton("Close");
    await act(async () => {
      packageButtonAt(1).click();
    });
    await fillApplicationData({
      ...canonicalApplicationData,
      abv: "45%",
      brand_name: "HIGHER ABV"
    });
    await clickButton("Close");

    await clickButton("Filters");

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

  it("calls /verify/batch after application fields are entered and submitted", async () => {
    mockWorkflowFetch();

    await renderPackageWorkflow();
    await uploadOpenFillAndVerify();

    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:8000/verify/batch", {
      method: "POST",
      body: expect.any(FormData),
      signal: expect.any(AbortSignal)
    });
    const formData = readFormDataBody(1);
    expect((formData.get("images") as File).name).toBe("label.png");
    expect(JSON.parse(String(formData.get("application_data")))).toEqual(
      canonicalApplicationData
    );
    expect(formData.get("use_real_vision")).toBeNull();
    expect(formData.get("openai_api_key")).toBeNull();
    expect(formData.get("openai_model")).toBeNull();
    expect(container.textContent).toContain("Approved");
  });

  it("runs extraction on upload and waits for the batch action before /verify/batch", async () => {
    mockWorkflowFetch();

    await renderPackageWorkflow();
    await chooseFiles([imageFile("first.png"), imageFile("second.png")]);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      "http://127.0.0.1:8000/extract"
    );
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[1][0]).toBe(
      "http://127.0.0.1:8000/extract"
    );

    await act(async () => {
      packageButtonAt(0).click();
    });
    await fillApplicationData({ ...canonicalApplicationData, brand_name: "FIRST BRAND" });
    await clickButton("Close");
    await act(async () => {
      packageButtonAt(1).click();
    });
    await fillApplicationData({ ...canonicalApplicationData, brand_name: "SECOND BRAND" });
    await clickButton("Verify Batch");

    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:8000/verify/batch", {
      method: "POST",
      body: expect.any(FormData),
      signal: expect.any(AbortSignal)
    });
    const formData = readFormDataBody(2);
    expect(formData.getAll("images").map((file) => (file as File).name)).toEqual([
      "first.png",
      "second.png"
    ]);
    expect(formData.get("use_real_vision")).toBeNull();
    expect(formData.get("openai_api_key")).toBeNull();
    expect(formData.get("openai_model")).toBeNull();

    expect(container.textContent).toContain("FIRST BRAND");
    expect(container.textContent).toContain("SECOND BRAND");
    expect(container.textContent).toContain("Approved");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("blocks verification when numeric application fields do not include numbers", async () => {
    mockWorkflowFetch();

    await renderPackageWorkflow();
    await chooseFiles([imageFile("label.png")]);
    await act(async () => {
      firstPackageButton().click();
    });
    await fillApplicationData({
      ...canonicalApplicationData,
      abv: "forty five percent",
      net_contents: "standard bottle"
    });
    await clickButton("Verify Batch");

    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      "http://127.0.0.1:8000/extract"
    );
    expect(container.textContent).toContain("Alcohol Content with a number");
    expect(container.textContent).toContain("Net Contents with a number");
  });

  it("opens detail view with brand header, image, read-only values, and field decision icons", async () => {
    mockWorkflowFetch();

    await renderPackageWorkflow();
    await uploadOpenFillAndVerify();

    const image = container.querySelector('img[alt="Label image for OLD TOM DISTILLERY"]');
    expect(image).not.toBeNull();
    expect(container.querySelector("#detail-title")?.textContent).toBe("OLD TOM DISTILLERY");
    expect(container.textContent).toContain("Application Data");
    expect(container.textContent).toContain("Application #");
    expect(container.querySelector(".data-row--field-government_warning")).not.toBeNull();
    expect(container.textContent).toContain("Application");
    expect(container.textContent).toContain("AI Detected");
    expect(container.textContent).toContain("Hover Mouse Over Image To Zoom In");
    expect(container.textContent).not.toContain("Backend Results");
    expect(container.textContent).not.toContain("AI Reasoning");

    const applicationBrand = container.querySelector('[aria-label="Application Value Brand Name"]');
    const applicationAbv = container.querySelector('[aria-label="Application Value Alcohol Content"]');
    const applicationNetContents = container.querySelector('[aria-label="Application Value Net Contents"]');
    const extractedBrand = container.querySelector('[aria-label="Extracted Value Brand Name"]');
    expect(applicationBrand).toBeInstanceOf(HTMLTextAreaElement);
    expect(applicationBrand?.classList.contains("application-value-input--auto-grow")).toBe(true);
    expect((applicationBrand as HTMLTextAreaElement).rows).toBe(1);
    expect(applicationAbv).toBeInstanceOf(HTMLInputElement);
    expect(applicationNetContents).toBeInstanceOf(HTMLInputElement);
    expect((applicationAbv as HTMLInputElement).inputMode).toBe("decimal");
    expect((applicationNetContents as HTMLInputElement).inputMode).toBe("decimal");
    expect((applicationAbv as HTMLInputElement).pattern).toContain("[0-9]");
    expect((applicationNetContents as HTMLInputElement).pattern).toContain("[0-9]");
    expect(extractedBrand).toBeInstanceOf(HTMLParagraphElement);
    expect(extractedBrand?.textContent).toBe("Old Tom Distillery");
    expect(buttonWithText("Close")).toBeInstanceOf(HTMLButtonElement);
    expect(container.querySelector('[aria-label="Fail Brand Name"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Needs review Brand Name"]')).toBeNull();
    expect(container.querySelector('[aria-label="Pass Brand Name"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Brand Name comparison rule"]')).not.toBeNull();
    expect(container.textContent).toContain("same within 0.1 percentage points");
    expect(container.textContent).toContain("same within 1 mL");
    expect(container.textContent).toContain("AI can have a hard time confirming");
  });

  it("closes detail when the status button is clicked", async () => {
    mockWorkflowFetch();

    await renderPackageWorkflow();
    await uploadOpenFillAndVerify();

    expect(container.querySelector("#data-title")).not.toBeNull();
    await clickButtonLabel("Close detail view");
    expect(container.querySelector("#data-title")).toBeNull();
  });

  it("filters detail data fields from the data header count buttons", async () => {
    mockWorkflowFetch(
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
    );

    await renderPackageWorkflow();
    await uploadOpenFillAndVerify();

    const dataPanel = container.querySelector(".data-panel");
    if (!(dataPanel instanceof HTMLElement)) {
      throw new Error("Missing data panel");
    }

    expect(dataPanel.textContent).toContain("7 total");
    expect(dataPanel.textContent).toContain("1 fail");
    expect(dataPanel.textContent).toContain("6 passed");

    const failFilter = Array.from(dataPanel.querySelectorAll("button")).find(
      (button) => button.textContent === "1 fail"
    );
    if (!(failFilter instanceof HTMLButtonElement)) {
      throw new Error("Missing fail field filter");
    }

    await act(async () => {
      failFilter.click();
    });
    await waitForAsyncUpdates();

    expect(failFilter.getAttribute("aria-pressed")).toBe("true");
    expect(dataPanel.textContent).toContain("Brand Name");
    expect(dataPanel.textContent).not.toContain("Class Type");
  });

  it("shows a magnified label pane that can freeze, reset, and rotate with the image", async () => {
    mockWorkflowFetch();

    await renderPackageWorkflow();
    await chooseFiles([imageFile("label.png")]);
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

  it("shows needs review when any backend field result fails", async () => {
    mockWorkflowFetch(
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
    );

    await renderPackageWorkflow();
    await uploadOpenFillAndVerify();

    expect(container.textContent).toContain("Needs Review");
    expect(container.textContent).toContain("fail");
    expect(() => buttonWithText("FAIL")).toThrow("Missing button: FAIL");
    expect(() => buttonWithText("PASS")).toThrow("Missing button: PASS");
  });

  it("does not open detail from card hover and closes detail when clicking outside", async () => {
    mockWorkflowFetch();

    await renderPackageWorkflow();
    await chooseFiles([imageFile("label.png")]);
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
    mockWorkflowFetch(
      verificationResult(),
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
    );

    await renderPackageWorkflow();
    await uploadOpenFillAndVerify();

    await clickButtonLabel("Fail Brand Name");
    expect(fetch).toHaveBeenLastCalledWith("http://127.0.0.1:8000/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
      signal: expect.any(AbortSignal)
    });
    expect(JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[2][1].body)).toMatchObject({
      field_decisions: { brand_name: "fail" }
    });
    expect(container.textContent).toContain("Needs Review");
  });

  it("exports pending items honestly", () => {
    const exportJson = buildReviewedResultsExport([
      {
        package_id: "application-1",
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
      needs_review: 0,
      passed: 0,
      pending: 1,
      total: 1
    });
    expect(exportJson.applications[0]).toMatchObject({
      application_id: "application-1",
      image_filename: "label.png",
      status: "Pending Check",
      application_data: canonicalApplicationData,
      reviewed_extracted_data: null,
      field_results: [],
      overall_verdict: null,
      errors: []
    });
    expect("expected_label_data" in exportJson.applications[0]).toBe(false);
  });

  it("builds export JSON with item errors when present", () => {
    const exported = buildReviewedResultsExport(
      [
        {
          package_id: "application-1",
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
      needs_review: 1,
      passed: 0,
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
