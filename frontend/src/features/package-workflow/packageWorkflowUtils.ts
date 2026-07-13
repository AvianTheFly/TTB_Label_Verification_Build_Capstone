import type {
  ApplicationData,
  CanonicalLabelField,
  ExtractedData,
  FieldReviewDecision,
  VerificationResult
} from "../../types/api";
import { ACCEPTED_IMAGE_TYPES, FIELD_CONFIGS, emptyApplicationData } from "../labelFields";

export type VisibleStatus = "Pending Check" | "Passed" | "Needs Review" | "Fail";
export interface PackageValidationError {
  code:
    | "duplicate_image_filename"
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
  field_decisions: Partial<Record<CanonicalLabelField, FieldReviewDecision>>;
  status: VisibleStatus;
  validation_errors: PackageValidationError[];
  item_error: string | null;
}

export interface IncompleteApplicationRecord {
  incomplete_id: string;
  kind: "json_missing_image" | "image_missing_json";
  json_filename: string | null;
  image_filename: string | null;
  expected_image_filename: string | null;
  application_data: ApplicationData | null;
  image_file: File | null;
  image_preview_url: string;
  message: string;
}

export interface SubmissionResultsExport {
  schema_version: "pretend-submission-results-v1";
  generated_at: string;
  applications: SubmissionResultApplication[];
}

export interface SubmissionResultApplication {
  application_id: string;
  application_filename: string | null;
  image_filename: string | null;
  status: "pass" | "fail";
  reason: string;
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

const IMAGE_EXTENSION_RE = /\.(jpe?g|png|webp)$/i;
const CANONICAL_FIELDS = FIELD_CONFIGS.map((field) => field.name);

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
      field_results: reviewedFieldResults(record),
      overall_verdict:
        record.comparison_result || Object.keys(record.field_decisions).length > 0
          ? record.status === "Passed"
            ? "APPROVED"
            : "NEEDS_REVIEW"
          : null,
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

function reviewedFieldResults(record: ApplicationPackageRecord): VerificationResult["results"] {
  return (record.comparison_result?.results ?? []).map((fieldResult) => {
    const decision = record.field_decisions[fieldResult.field];
    if (!decision) {
      return fieldResult;
    }

    if (decision === "pass") {
      return {
        ...fieldResult,
        status: "PASS",
        message: "Reviewer marked this field as pass."
      };
    }

    return {
      ...fieldResult,
      status: "FAIL",
      message:
        decision === "fail"
          ? "Reviewer marked this field as fail."
          : "Reviewer marked this field as needs review."
    };
  });
}

export async function parseApplicationPackages(files: File[]): Promise<{
  records: ApplicationPackageRecord[];
  incomplete_records: IncompleteApplicationRecord[];
  errors: PackageValidationError[];
}> {
  const images = new Map<string, File>();
  const errors: PackageValidationError[] = [];

  for (const file of files) {
    if (isSupportedImageFile(file)) {
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
        message: `${file.name} was not added. Choose a JPG, PNG, or WEBP label image.`
      });
    }
  }

  const records = Array.from(images.values()).map((imageFile, index) => ({
    package_id: `application-${index + 1}`,
    json_filename: "",
    image_filename: imageFile.name,
    image_file: imageFile,
    image_preview_url: "",
    application_data: { ...emptyApplicationData },
    original_extracted_data: null,
    reviewed_extracted_data: null,
    comparison_result: null,
    field_decisions: {},
    status: "Pending Check" as VisibleStatus,
    validation_errors: [],
    item_error: null
  }));

  return { records, incomplete_records: [], errors };
}

export function buildSubmissionResultsExport(
  records: ApplicationPackageRecord[],
  incompleteRecords: IncompleteApplicationRecord[],
  generatedAt = new Date().toISOString()
): SubmissionResultsExport {
  return {
    schema_version: "pretend-submission-results-v1",
    generated_at: generatedAt,
    applications: [
      ...records.map((record) => ({
        application_id: record.package_id,
        application_filename: record.json_filename || null,
        image_filename: record.image_filename,
        status: record.status === "Passed" ? "pass" as const : "fail" as const,
        reason: record.status === "Passed" ? "Application marked pass." : `Application marked ${record.status}.`
      })),
      ...incompleteRecords.map((record, index) => ({
        application_id: `incomplete-application-${index + 1}`,
        application_filename: record.json_filename,
        image_filename: record.image_filename ?? record.expected_image_filename,
        status: "fail" as const,
        reason:
          record.kind === "json_missing_image"
            ? "Incomplete application is missing an image."
            : "Incomplete application is missing application data."
      }))
    ]
  };
}

export async function buildPretendSubmissionZip(
  records: ApplicationPackageRecord[],
  incompleteRecords: IncompleteApplicationRecord[]
): Promise<Blob> {
  const files: ZipSourceFile[] = [];

  for (const record of records) {
    files.push({
      path: `applications/${record.image_filename}`,
      data: await readBlobArrayBuffer(record.image_file)
    });
  }

  for (const record of incompleteRecords) {
    if (record.json_filename && record.application_data) {
      files.push({
        path: `applications/${record.json_filename}`,
        data: JSON.stringify(
          {
            image_filename: record.expected_image_filename,
            application_data: record.application_data
          },
          null,
          2
        )
      });
    }
    if (record.image_filename && record.image_file) {
      files.push({
        path: `applications/${record.image_filename}`,
        data: await readBlobArrayBuffer(record.image_file)
      });
    }
  }

  files.push({
    path: "results/submission-results.json",
    data: JSON.stringify(buildSubmissionResultsExport(records, incompleteRecords), null, 2)
  });

  return createStoredZip(files);
}

interface ZipSourceFile {
  path: string;
  data: ArrayBuffer | string;
}

function createStoredZip(files: ZipSourceFile[]): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const dataBytes = typeof file.data === "string" ? encoder.encode(file.data) : new Uint8Array(file.data);
    const crc = crc32(dataBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    chunks.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralDirectory.push(centralHeader);

    offset += localHeader.length + dataBytes.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralDirectory.reduce((size, chunk) => size + chunk.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);

  return new Blob([...chunks, ...centralDirectory, endRecord].map(uint8ArrayToArrayBuffer), {
    type: "application/zip"
  });
}

function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsArrayBuffer(blob);
  });
}

function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isSupportedImageFile(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.has(file.type) || IMAGE_EXTENSION_RE.test(file.name);
}
