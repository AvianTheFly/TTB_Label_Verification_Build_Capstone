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

describe("package parser", () => {
  it("parses a valid package", async () => {
    const result = await parseApplicationPackages([
      jsonFile("application.json", "label.png"),
      imageFile("label.png")
    ]);

    expect(result.errors).toEqual([]);
    expect(result.records).toHaveLength(1);
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
    expect(result.records[0].image_filename).toBe("first.png");
    expect(result.records[0].image_file.name).toBe("first.png");
    expect(result.records[0].application_data.brand_name).toBe("FIRST BRAND");
    expect(result.records[1].image_file.name).toBe("second.png");
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
      jsonFile("orphan-json.json", "not-uploaded.png"),
      imageFile("orphan-image.png"),
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
        "json_with_no_matching_image",
        "image_with_no_matching_json",
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
    expect(container.textContent).toContain("Submit");
    expect(container.textContent).toContain("Applications");
    expect(container.textContent).not.toContain("Check Applications");
    expect(container.textContent).not.toContain("Single Label");
    expect(container.textContent).not.toContain("Batch Upload");
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
    expect(fetch).toHaveBeenCalledTimes(2);
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
      body: expect.any(FormData)
    });
    expect((readFormDataBody().get("image") as File).name).toBe("label.png");
    expect(JSON.parse(String(readFormDataBody().get("application_data")))).toEqual(
      canonicalApplicationData
    );
    expect(container.textContent).toContain("Passed");
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
      body: expect.any(FormData)
    });
    const formData = readFormDataBody();
    expect((formData.getAll("images")[0] as File).name).toBe("first.png");
    expect((formData.getAll("images")[1] as File).name).toBe("second.png");

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
    expect(container.textContent).toContain("Application:");
    expect(container.textContent).toContain("AI Detected:");
    expect(container.textContent).not.toContain("Backend Results");
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

    expect(buttonWithText("FAIL").disabled).toBe(false);
    expect(buttonWithText("PASS").disabled).toBe(true);
    await clickButton("FAIL");
    expect(container.textContent).toContain("Fail");
    expect(container.textContent).not.toContain("Data");
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
    expect(container.textContent).not.toContain("Data");

    await act(async () => {
      firstPackageButton().click();
    });
    const overlay = container.querySelector(".detail-overlay");
    expect(overlay).not.toBeNull();
    await act(async () => {
      overlay?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(container.textContent).not.toContain("Data");
  });

  it("reverts reviewed values back to AI extracted values", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => verificationResult()
        })
        .mockResolvedValue({
          ok: true,
          json: async () => verificationResult()
        })
    );

    await renderPackageWorkflow();
    await chooseFiles([jsonFile("application.json", "label.png"), imageFile("label.png")]);
    await act(async () => {
      firstPackageButton().click();
    });
    expect(container.querySelector('[aria-label="Extracted Value Brand Name"]')?.textContent).toBe(
      "Old Tom Distillery"
    );

    await clickButton("Revert back to AI extracted values");
    expect(container.querySelector('[aria-label="Extracted Value Brand Name"]')?.textContent).toBe(
      "Old Tom Distillery"
    );
  });

  it("exports reviewed results JSON with reviewed extracted data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => verificationResult()
      })
    );

    await renderPackageWorkflow();
    await chooseFiles([jsonFile("application.json", "label.png"), imageFile("label.png")]);
    await clickButton("Submit");

    expect(createdBlobs).toHaveLength(1);
    const exportJson = JSON.parse(await readBlobText(createdBlobs[0]));
    expect(exportJson.schema_version).toBe("application-package-review-v1");
    expect(typeof exportJson.generated_at).toBe("string");
    expect(exportJson.summary).toEqual({
      failed: 0,
      passed: 1,
      needs_review: 0,
      pending: 0,
      total: 1
    });
    expect(exportJson.applications[0]).toMatchObject({
      application_id: "application-1",
      image_filename: "label.png",
      application_data: canonicalApplicationData,
      reviewed_extracted_data: {
        brand_name: "Old Tom Distillery"
      },
      overall_verdict: "APPROVED",
      errors: []
    });
    expect(exportJson.applications[0].field_results).toHaveLength(7);
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
