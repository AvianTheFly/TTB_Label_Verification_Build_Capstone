import type {
  ApplicationData,
  CanonicalLabelField,
  ExtractedData,
  FieldReviewDecision,
  LabelFormatting,
  VerificationResult
} from "../../types/api";
import { ACCEPTED_IMAGE_TYPES, FIELD_CONFIGS, emptyApplicationData } from "../labelFields";

export type VisibleStatus = "Pending Check" | "Approved" | "Needs Review";
export interface PackageValidationError {
  code:
    | "duplicate_image_filename"
    | "unsupported_image_type";
  message: string;
  filename: string;
}

export interface ApplicationPackageRecord {
  package_id: string;
  image_filename: string;
  image_file: File;
  image_preview_url: string;
  application_data: ApplicationData;
  application_formatting: LabelFormatting;
  original_extracted_data: ExtractedData | null;
  original_extracted_formatting: LabelFormatting | null;
  reviewed_extracted_data: ExtractedData | null;
  reviewed_extracted_formatting: LabelFormatting | null;
  comparison_result: VerificationResult | null;
  field_decisions: Partial<Record<CanonicalLabelField, FieldReviewDecision>>;
  status: VisibleStatus;
  validation_errors: PackageValidationError[];
  item_error: string | null;
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

export function emptyLabelFormatting(): LabelFormatting {
  return {
    government_warning_lead_in_bold: null
  };
}

export function extractedDataFromResult(result: VerificationResult): ExtractedData {
  const extracted = emptyExtractedData();
  for (const fieldResult of result.results) {
    extracted[fieldResult.field] = fieldResult.found;
  }
  return extracted;
}

export function extractedFormattingFromResult(result: VerificationResult): LabelFormatting {
  return result.extracted_formatting ?? emptyLabelFormatting();
}

export function statusFromResult(result: VerificationResult): VisibleStatus {
  return result.overall_verdict === "APPROVED" ? "Approved" : "Needs Review";
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
    "Pending Check": 1,
    Approved: 2
  };

  return ranks[status];
}

export async function parseApplicationPackages(files: File[]): Promise<{
  records: ApplicationPackageRecord[];
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
    image_filename: imageFile.name,
    image_file: imageFile,
    image_preview_url: "",
    application_data: { ...emptyApplicationData },
    application_formatting: emptyLabelFormatting(),
    original_extracted_data: null,
    original_extracted_formatting: null,
    reviewed_extracted_data: null,
    reviewed_extracted_formatting: null,
    comparison_result: null,
    field_decisions: {},
    status: "Pending Check" as VisibleStatus,
    validation_errors: [],
    item_error: null
  }));

  return { records, errors };
}

export function isSupportedImageFile(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.has(file.type) || IMAGE_EXTENSION_RE.test(file.name);
}
