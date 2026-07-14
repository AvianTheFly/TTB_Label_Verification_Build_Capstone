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
  PackageRecordKey
} from "./types";

export function sortedResults(result: VerificationResult | null): FieldResult[] {
  return result?.results.slice().sort((left, right) => resultOrder(left) - resultOrder(right)) ?? [];
}

export function recordKey(record: PackageRecordKey): string {
  return record.image_filename;
}

export function cardStatusClass(status: VisibleStatus): string {
  if (status === "Approved") {
    return "passed";
  }
  if (status === "Needs Review") {
    return "review";
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
      if (record.status === "Needs Review") {
        summary.needs_review += 1;
      } else if (record.status === "Approved") {
        summary.passed += 1;
      }
      return summary;
    },
    { needs_review: 0, passed: 0, total: 0 }
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
    return "Needs Review";
  }
  return "Approved";
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
