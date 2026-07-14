import type {
  CanonicalLabelField,
  ExtractedData,
  FieldDecisionOverrides,
  LabelFormatting,
  VerificationResult
} from "../../types/api";
import { createPreviewUrl } from "./filePreviews";
import {
  ApplicationPackageRecord,
  emptyExtractedData,
  emptyLabelFormatting,
  extractedFormattingFromResult,
  extractedDataFromResult,
  statusFromResult
} from "./packageWorkflowUtils";
import { recordKey, statusFromFieldDecisions } from "./recordStatus";

export function mergeParsedRecords(
  currentRecords: ApplicationPackageRecord[],
  parsedRecords: ApplicationPackageRecord[]
): ApplicationPackageRecord[] {
  const currentByKey = new Map(currentRecords.map((record) => [recordKey(record), record]));

  return parsedRecords.map((record) => {
    const existing = currentByKey.get(recordKey(record));
    if (!existing) {
      return {
        ...record,
        image_preview_url: createPreviewUrl(record.image_file)
      };
    }

    const imageChanged = existing.image_file !== record.image_file;
    return {
      ...existing,
      image_file: record.image_file,
      image_filename: record.image_filename,
      image_preview_url: imageChanged
        ? createPreviewUrl(record.image_file)
        : existing.image_preview_url,
      original_extracted_data: imageChanged ? null : existing.original_extracted_data,
      original_extracted_formatting: imageChanged ? null : existing.original_extracted_formatting,
      reviewed_extracted_data: imageChanged ? null : existing.reviewed_extracted_data,
      reviewed_extracted_formatting: imageChanged ? null : existing.reviewed_extracted_formatting,
      comparison_result: imageChanged ? null : existing.comparison_result,
      field_decisions: imageChanged ? {} : existing.field_decisions,
      status: imageChanged ? "Pending Check" : existing.status,
      item_error: imageChanged ? null : existing.item_error
    };
  });
}

export function previewUrlsToRevoke(
  currentRecords: ApplicationPackageRecord[],
  nextRecords: ApplicationPackageRecord[]
): string[] {
  return currentRecords
    .filter(
      (record) =>
        !nextRecords.some(
          (nextRecord) => nextRecord.image_preview_url === record.image_preview_url
        )
    )
    .map((record) => record.image_preview_url);
}

export function updateApplicationField(
  record: ApplicationPackageRecord,
  field: CanonicalLabelField,
  value: string
): ApplicationPackageRecord {
  return {
    ...record,
    application_data: {
      ...record.application_data,
      [field]: value
    },
    comparison_result: record.comparison_result
      ? {
          ...record.comparison_result,
          results: record.comparison_result.results.map((fieldResult) =>
            fieldResult.field === field
              ? {
                  ...fieldResult,
                  expected: value
                }
              : fieldResult
          )
        }
      : record.comparison_result,
    item_error: null
  };
}

export function updateApplicationFormatting(
  record: ApplicationPackageRecord,
  formatting: LabelFormatting
): ApplicationPackageRecord {
  return {
    ...record,
    application_formatting: formatting,
    item_error: null
  };
}

export function updateExtractedField(
  record: ApplicationPackageRecord,
  field: CanonicalLabelField,
  value: string
): ApplicationPackageRecord {
  const reviewedValue = value.trim() ? value : null;
  const reviewedExtractedData: ExtractedData = {
    ...(record.reviewed_extracted_data ?? emptyExtractedData()),
    [field]: reviewedValue
  };

  return {
    ...record,
    reviewed_extracted_data: reviewedExtractedData,
    comparison_result: record.comparison_result
      ? {
          ...record.comparison_result,
          results: record.comparison_result.results.map((fieldResult) =>
            fieldResult.field === field
              ? {
                  ...fieldResult,
                  found: reviewedValue
                }
              : fieldResult
          )
        }
      : record.comparison_result
  };
}

export function updateExtractedFormatting(
  record: ApplicationPackageRecord,
  formatting: LabelFormatting
): ApplicationPackageRecord {
  return {
    ...record,
    reviewed_extracted_formatting: formatting,
    comparison_result: record.comparison_result
      ? {
          ...record.comparison_result,
          extracted_formatting: formatting
        }
      : record.comparison_result
  };
}

export function applyVerificationResult(
  record: ApplicationPackageRecord,
  result: VerificationResult
): ApplicationPackageRecord {
  const extractedData = extractedDataFromResult(result);
  const extractedFormatting = extractedFormattingFromResult(result);
  return {
    ...record,
    original_extracted_data: record.original_extracted_data ?? extractedData,
    original_extracted_formatting: record.original_extracted_formatting ?? extractedFormatting,
    reviewed_extracted_data: extractedData,
    reviewed_extracted_formatting: extractedFormatting,
    comparison_result: result,
    field_decisions: {},
    status: statusFromResult(result),
    item_error: null
  };
}

export function applyComparisonResult(
  record: ApplicationPackageRecord,
  result: VerificationResult,
  fieldDecisions: FieldDecisionOverrides
): ApplicationPackageRecord {
  return {
    ...record,
    reviewed_extracted_formatting:
      result.extracted_formatting ?? record.reviewed_extracted_formatting ?? emptyLabelFormatting(),
    field_decisions: fieldDecisions,
    comparison_result: result,
    status: statusFromFieldDecisions(
      { ...record, comparison_result: result },
      fieldDecisions
    ),
    item_error: null
  };
}
