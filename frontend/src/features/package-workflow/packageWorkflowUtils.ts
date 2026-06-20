import type {
  ApplicationData,
  CanonicalLabelField,
  ExtractedData,
  VerificationResult
} from "../../types/api";
import { ACCEPTED_IMAGE_TYPES, FIELD_CONFIGS } from "../labelFields";

export type VisibleStatus = "Pending Check" | "Passed" | "Needs Review" | "Fail";

export interface PackageValidationError {
  code:
    | "invalid_json"
    | "missing_image_filename"
    | "missing_application_data"
    | "missing_canonical_fields"
    | "extra_non_canonical_fields"
    | "duplicate_image_filename"
    | "json_with_no_matching_image"
    | "image_with_no_matching_json"
    | "unsupported_image_type";
  message: string;
  filename: string;
}

export interface ApplicationPackageRecord {
  package_id: string;
  json_filename: string;
  image_filename: string;
  image_file: File;
  image_preview_url: string;
  application_data: ApplicationData;
  original_extracted_data: ExtractedData | null;
  reviewed_extracted_data: ExtractedData | null;
  comparison_result: VerificationResult | null;
  status: VisibleStatus;
  validation_errors: PackageValidationError[];
  item_error: string | null;
}

export interface ReviewedResultsExport {
  schema_version: "application-package-review-v1";
  generated_at: string;
  summary: {
    failed: number;
    passed: number;
    needs_review: number;
    pending: number;
    total: number;
  };
  applications: ReviewedResultsApplication[];
}

export interface ReviewedResultsApplication {
  application_id: string;
  json_filename: string;
  image_filename: string;
  status: VisibleStatus;
  application_data: ApplicationData;
  reviewed_extracted_data: ExtractedData | null;
  field_results: VerificationResult["results"];
  overall_verdict: VerificationResult["overall_verdict"] | null;
  errors: { code: string; message: string }[];
}

interface JsonCandidate {
  file: File;
  parsed: unknown | null;
  image_filename: string | null;
  application_data: ApplicationData | null;
  errors: PackageValidationError[];
}

const IMAGE_EXTENSION_RE = /\.(jpe?g|png|webp)$/i;
const JSON_EXTENSION_RE = /\.json$/i;
const CANONICAL_FIELDS = FIELD_CONFIGS.map((field) => field.name);
const CANONICAL_FIELD_SET = new Set<CanonicalLabelField>(CANONICAL_FIELDS);

export function emptyExtractedData(): ExtractedData {
  return {
    brand_name: null,
    class_type: null,
    abv: null,
    net_contents: null,
    producer: null,
    country_of_origin: null,
    government_warning: null
  };
}

export function extractedDataFromResult(result: VerificationResult): ExtractedData {
  const extracted = emptyExtractedData();
  for (const fieldResult of result.results) {
    extracted[fieldResult.field] = fieldResult.found;
  }
  return extracted;
}

export function statusFromResult(result: VerificationResult): VisibleStatus {
  return result.overall_verdict === "APPROVED" ? "Passed" : "Needs Review";
}

export function hasFailingFields(record: ApplicationPackageRecord): boolean {
  return record.comparison_result?.results.some((fieldResult) => fieldResult.status === "FAIL") ?? false;
}

export function allFieldsPass(record: ApplicationPackageRecord): boolean {
  return (
    record.comparison_result?.results.length === CANONICAL_FIELDS.length &&
    record.comparison_result.results.every((fieldResult) => fieldResult.status === "PASS")
  );
}

export function statusSortRank(status: VisibleStatus): number {
  const ranks: Record<VisibleStatus, number> = {
    "Needs Review": 0,
    Fail: 1,
    "Pending Check": 2,
    Passed: 3
  };

  return ranks[status];
}

export function buildReviewedResultsExport(
  records: ApplicationPackageRecord[],
  generatedAt = new Date().toISOString()
): ReviewedResultsExport {
  const summary = records.reduce(
    (counts, record) => {
      if (record.status === "Fail") {
        counts.failed += 1;
      } else if (record.status === "Passed") {
        counts.passed += 1;
      } else if (record.status === "Needs Review") {
        counts.needs_review += 1;
      } else {
        counts.pending += 1;
      }
      counts.total += 1;
      return counts;
    },
    { failed: 0, passed: 0, needs_review: 0, pending: 0, total: 0 }
  );

  return {
    schema_version: "application-package-review-v1",
    generated_at: generatedAt,
    summary,
    applications: records.map((record) => ({
      application_id: record.package_id,
      json_filename: record.json_filename,
      image_filename: record.image_filename,
      status: record.status,
      application_data: record.application_data,
      reviewed_extracted_data: record.reviewed_extracted_data,
      field_results: record.comparison_result?.results ?? [],
      overall_verdict: record.comparison_result?.overall_verdict ?? null,
      errors: [
        ...record.validation_errors.map((error) => ({
          code: error.code,
          message: error.message
        })),
        ...(record.item_error ? [{ code: "item_error", message: record.item_error }] : [])
      ]
    }))
  };
}

export async function parseApplicationPackages(files: File[]): Promise<{
  records: ApplicationPackageRecord[];
  errors: PackageValidationError[];
}> {
  const images = new Map<string, File>();
  const errors: PackageValidationError[] = [];
  const jsonFiles: File[] = [];

  for (const file of files) {
    if (isJsonFile(file)) {
      jsonFiles.push(file);
    } else if (isSupportedImageFile(file)) {
      if (images.has(file.name)) {
        errors.push({
          code: "duplicate_image_filename",
          filename: file.name,
          message: `${file.name} appears more than once. Each image filename must be unique.`
        });
      } else {
        images.set(file.name, file);
      }
    } else {
      errors.push({
        code: "unsupported_image_type",
        filename: file.name,
        message: `${file.name} is not a supported image or application JSON file.`
      });
    }
  }

  const candidates = await Promise.all(jsonFiles.map(parseJsonCandidate));
  for (const candidate of candidates) {
    errors.push(...candidate.errors);
  }

  const filenameCounts = new Map<string, number>();
  for (const candidate of candidates) {
    if (candidate.image_filename) {
      filenameCounts.set(
        candidate.image_filename,
        (filenameCounts.get(candidate.image_filename) ?? 0) + 1
      );
    }
  }

  for (const candidate of candidates) {
    if (!candidate.image_filename) {
      continue;
    }

    if ((filenameCounts.get(candidate.image_filename) ?? 0) > 1) {
      errors.push({
        code: "duplicate_image_filename",
        filename: candidate.file.name,
        message: `${candidate.image_filename} is named by more than one application JSON file.`
      });
    }

    if (!images.has(candidate.image_filename)) {
      errors.push({
        code: "json_with_no_matching_image",
        filename: candidate.file.name,
        message: `${candidate.file.name} names ${candidate.image_filename}, but that image was not uploaded.`
      });
    }
  }

  const referencedImageNames = new Set(
    candidates
      .map((candidate) => candidate.image_filename)
      .filter((imageFilename): imageFilename is string => Boolean(imageFilename))
  );
  for (const imageName of images.keys()) {
    if (!referencedImageNames.has(imageName)) {
      errors.push({
        code: "image_with_no_matching_json",
        filename: imageName,
        message: `${imageName} does not have a matching application JSON file.`
      });
    }
  }

  const records = candidates
    .filter((candidate) => isValidCandidate(candidate, errors, images, filenameCounts))
    .map((candidate, index) => {
      const imageFile = images.get(candidate.image_filename as string) as File;
      return {
        package_id: `application-${index + 1}`,
        json_filename: candidate.file.name,
        image_filename: candidate.image_filename as string,
        image_file: imageFile,
        image_preview_url: "",
        application_data: candidate.application_data as ApplicationData,
        original_extracted_data: null,
        reviewed_extracted_data: null,
        comparison_result: null,
        status: "Pending Check" as VisibleStatus,
        validation_errors: [],
        item_error: null
      };
    });

  return { records, errors };
}

function isJsonFile(file: File): boolean {
  return file.type === "application/json" || JSON_EXTENSION_RE.test(file.name);
}

function isSupportedImageFile(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.has(file.type) || IMAGE_EXTENSION_RE.test(file.name);
}

async function parseJsonCandidate(file: File): Promise<JsonCandidate> {
  const errors: PackageValidationError[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFileText(file)) as unknown;
  } catch {
    return {
      file,
      parsed: null,
      image_filename: null,
      application_data: null,
      errors: [
        {
          code: "invalid_json",
          filename: file.name,
          message: `${file.name} could not be read as application JSON.`
        }
      ]
    };
  }

  if (!isRecord(parsed)) {
    return {
      file,
      parsed,
      image_filename: null,
      application_data: null,
      errors: [
        {
          code: "invalid_json",
          filename: file.name,
          message: `${file.name} must contain a JSON object.`
        }
      ]
    };
  }

  const imageFilename =
    typeof parsed.image_filename === "string" && parsed.image_filename.trim()
      ? parsed.image_filename
      : null;
  if (!imageFilename) {
    errors.push({
      code: "missing_image_filename",
      filename: file.name,
      message: `${file.name} is missing image_filename.`
    });
  }

  const applicationDataValue = parsed.application_data;
  if (!isRecord(applicationDataValue)) {
    errors.push({
      code: "missing_application_data",
      filename: file.name,
      message: `${file.name} is missing application_data.`
    });
    return {
      file,
      parsed,
      image_filename: imageFilename,
      application_data: null,
      errors
    };
  }

  const applicationKeys = Object.keys(applicationDataValue);
  const missingFields = CANONICAL_FIELDS.filter((field) => {
    const value = applicationDataValue[field];
    return typeof value !== "string" || !value.trim();
  });
  const extraFields = applicationKeys.filter(
    (field): field is string => !CANONICAL_FIELD_SET.has(field as CanonicalLabelField)
  );

  if (missingFields.length > 0) {
    errors.push({
      code: "missing_canonical_fields",
      filename: file.name,
      message: `${file.name} is missing: ${missingFields.join(", ")}.`
    });
  }

  if (extraFields.length > 0) {
    errors.push({
      code: "extra_non_canonical_fields",
      filename: file.name,
      message: `${file.name} has unsupported fields: ${extraFields.join(", ")}.`
    });
  }

  const applicationData = CANONICAL_FIELDS.reduce((data, field) => {
    data[field] =
      typeof applicationDataValue[field] === "string" ? applicationDataValue[field] : "";
    return data;
  }, {} as ApplicationData);

  return {
    file,
    parsed,
    image_filename: imageFilename,
    application_data: applicationData,
    errors
  };
}

function isValidCandidate(
  candidate: JsonCandidate,
  allErrors: PackageValidationError[],
  images: Map<string, File>,
  filenameCounts: Map<string, number>
): boolean {
  if (!candidate.image_filename || !candidate.application_data || candidate.errors.length > 0) {
    return false;
  }

  if ((filenameCounts.get(candidate.image_filename) ?? 0) > 1) {
    return false;
  }

  if (!images.has(candidate.image_filename)) {
    return false;
  }

  return !allErrors.some(
    (error) =>
      error.filename === candidate.image_filename &&
      error.code === "duplicate_image_filename"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsText(file);
  });
}
