import type { CanonicalLabelField, FieldResult, FieldReviewDecision, VerificationResult } from "../../types/api";
import { FIELD_CONFIGS, resultOrder } from "../labelFields";
import { FIELD_DECISIONS } from "./constants";
import type {
  ApplicationPackageRecord,
  VisibleStatus
} from "./packageWorkflowUtils";
import type {
  ApplicationSummary,
  FieldDecisionMap,
  PackageRecordKey,
  ReviewOverrideAction,
  ReviewOverrideWarning
} from "./types";

export function sortedResults(result: VerificationResult | null): FieldResult[] {
  return result?.results.slice().sort((left, right) => resultOrder(left) - resultOrder(right)) ?? [];
}

export function recordKey(record: PackageRecordKey): string {
  return `${record.json_filename}|${record.image_filename}`;
}

export function cardStatusClass(status: VisibleStatus): string {
  if (status === "Passed") {
    return "passed";
  }
  if (status === "Fail") {
    return "fail";
  }
  return "pending";
}

export function applicationNumber(packageId: string): string {
  return packageId.replace(/^application-/, "");
}

export function summarizeApplications(records: ApplicationPackageRecord[]): ApplicationSummary {
  return records.reduce(
    (summary, record) => {
      summary.total += 1;
      if (record.status === "Fail") {
        summary.fail += 1;
      } else if (record.status === "Passed") {
        summary.passed += 1;
      }
      return summary;
    },
    { fail: 0, passed: 0, total: 0 }
  );
}

export function summarizeFieldDecisions(decisions: FieldDecisionMap) {
  return Object.values(decisions).reduce(
    (summary, decision) => {
      summary.total += 1;
      summary[decision] += 1;
      return summary;
    },
    { fail: 0, pass: 0, total: 0 }
  );
}

export function comparisonRuleText(field: CanonicalLabelField): string {
  switch (field) {
    case "brand_name":
      return "PASS when this is clearly the same brand name. Capital letters, spacing, punctuation, or word order can be a little different. FAIL when the brand looks like a different product.";
    case "class_type":
      return "PASS when the label describes the same product type or class. Small spelling or wording differences can be okay. FAIL when the label describes a different kind of alcohol.";
    case "abv":
      return "PASS when the alcohol strength is the same within 0.1 percentage points. Proof is converted to ABV, so 90 proof counts as 45% ABV. FAIL when the number is outside that tolerance or cannot be read.";
    case "net_contents":
      return "PASS when the container size is the same within 1 mL. The tool converts mL, L, and cL, so 750 mL and 0.75 L match. FAIL for different amounts or units the tool cannot convert.";
    case "producer":
      return "PASS when the producer, bottler, or company name and location clearly refer to the same business. Capital letters, punctuation, or small wording differences can be okay. FAIL when the company or location appears different.";
    case "country_of_origin":
      return "PASS when the country means the same place. Common United States wording such as USA, US, and United States of America is treated as United States. FAIL when it names a different country.";
    case "government_warning":
      return "This is strict. PASS only when the warning words and capitalization match exactly, after ignoring extra spaces. Title case, missing punctuation, or changed wording fails. Limitation: AI can have a hard time confirming that GOVERNMENT WARNING: is bold, so a person should still check bold styling.";
  }
}

export function resolvedFieldDecisions(
  record: ApplicationPackageRecord,
  overrides = record.field_decisions
): FieldDecisionMap {
  const fieldResults = new Map(
    record.comparison_result?.results.map((result) => [result.field, result]) ?? []
  );
  return FIELD_CONFIGS.reduce(
    (decisions, field) => {
      decisions[field.name] =
        overrides[field.name] ?? defaultFieldDecision(record, fieldResults.get(field.name));
      return decisions;
    },
    {} as FieldDecisionMap
  );
}

export function statusFromFieldDecisions(
  record: ApplicationPackageRecord,
  overrides = record.field_decisions
): VisibleStatus {
  const decisions = Object.values(resolvedFieldDecisions(record, overrides));
  if (decisions.some((decision) => decision === "fail")) {
    return "Fail";
  }
  return "Passed";
}

export function canMarkApplicationFail(record: ApplicationPackageRecord): boolean {
  const decisions = Object.values(resolvedFieldDecisions(record));
  return decisions.some((decision) => decision === "fail");
}

export function canMarkApplicationPass(record: ApplicationPackageRecord): boolean {
  return Object.values(resolvedFieldDecisions(record)).every((decision) => decision === "pass");
}

export function buildReviewOverrideWarning(
  record: ApplicationPackageRecord,
  action: ReviewOverrideAction
): ReviewOverrideWarning {
  const decisions = resolvedFieldDecisions(record);
  const groupedFields = FIELD_CONFIGS.reduce(
    (groups, field) => {
      groups[decisions[field.name]].push(field.label);
      return groups;
    },
    { fail: [] as string[], pass: [] as string[] }
  );

  const groups =
    action === "pass"
      ? [{ label: "Fail", fields: groupedFields.fail }].filter((group) => group.fields.length > 0)
      : [{ label: "Pass", fields: groupedFields.pass }];

  return {
    action,
    confirmLabel: action === "pass" ? "Proceed With Pass" : "Proceed With Fail",
    groups,
    packageId: record.package_id,
    title:
      action === "pass"
        ? "Pass this application anyway?"
        : "Fail this application anyway?"
  };
}

function defaultFieldDecision(
  record: ApplicationPackageRecord,
  fieldResult: FieldResult | undefined
): FieldReviewDecision {
  if (!fieldResult) {
    return "fail";
  }
  if (fieldResult.status === "PASS") {
    return "pass";
  }
  return "fail";
}

export function allFieldDecisionFilters() {
  return FIELD_DECISIONS.reduce(
    (filters, decision) => {
      filters[decision] = true;
      return filters;
    },
    {} as Record<FieldReviewDecision, boolean>
  );
}
