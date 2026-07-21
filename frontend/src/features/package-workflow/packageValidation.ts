import { FIELD_CONFIGS } from "../labelFields";
import type { ApplicationPackageRecord } from "./packageWorkflowUtils";

const HAS_NUMBER_RE = /\d+(?:\.\d+)?/;
const NET_CONTENTS_WITH_UNIT_RE =
  /\d+(?:\.\d+)?\s*(?:fl\.?\s*oz\.?|fluid\s+ounces?|ml|milliliters?|millilitres?|l|liters?|litres?|cl|centiliters?|centilitres?)\b/i;

export function validationMessageFor(record: ApplicationPackageRecord): string | null {
  const missingFields = FIELD_CONFIGS.filter(
    (field) => !record.application_data[field.name].trim()
  );
  if (missingFields.length > 0) {
    return `Enter ${missingFields.map((field) => field.label).join(", ")} before verifying.`;
  }

  const invalidFormats: string[] = [];
  if (!HAS_NUMBER_RE.test(record.application_data.abv)) {
    invalidFormats.push("Alcohol Content with a number, such as 45%");
  }
  if (!NET_CONTENTS_WITH_UNIT_RE.test(record.application_data.net_contents)) {
    invalidFormats.push("Net Contents with an amount and unit, such as 750 mL");
  }
  if (invalidFormats.length > 0) {
    return `Enter ${invalidFormats.join("; ")} before verifying.`;
  }

  return null;
}
