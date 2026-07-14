import { FIELD_CONFIGS } from "../labelFields";
import type { ApplicationPackageRecord } from "./packageWorkflowUtils";

const NUMERIC_APPLICATION_FIELDS: Array<{
  example: string;
  label: string;
  name: "abv" | "net_contents";
}> = [
  { name: "abv", label: "Alcohol Content", example: "45%" },
  { name: "net_contents", label: "Net Contents", example: "750 mL" }
];

const HAS_NUMBER_RE = /\d+(?:\.\d+)?/;

export function validationMessageFor(record: ApplicationPackageRecord): string | null {
  const missingFields = FIELD_CONFIGS.filter(
    (field) => !record.application_data[field.name].trim()
  );
  if (missingFields.length > 0) {
    return `Enter ${missingFields.map((field) => field.label).join(", ")} before verifying.`;
  }

  const invalidNumericFields = NUMERIC_APPLICATION_FIELDS.filter(
    (field) => !HAS_NUMBER_RE.test(record.application_data[field.name])
  );
  if (invalidNumericFields.length > 0) {
    return `Enter ${invalidNumericFields
      .map((field) => `${field.label} with a number, such as ${field.example}`)
      .join("; ")} before verifying.`;
  }

  return null;
}
