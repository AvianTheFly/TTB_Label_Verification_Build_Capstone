import type { CanonicalLabelField, FieldReviewDecision } from "../../types/api";
import type { ApplicationPackageRecord } from "./packageWorkflowUtils";

export type IncompleteFilter = "json" | "image";
export type AbvOperator = "any" | "lt" | "eq" | "gt";
export type ReviewOverrideAction = "fail" | "pass";

export interface ReviewOverrideWarning {
  action: ReviewOverrideAction;
  confirmLabel: string;
  groups: Array<{ fields: string[]; label: string }>;
  packageId: string;
  title: string;
}

export interface AdvancedSearchFilters {
  abvOperator: AbvOperator;
  abvValue: string;
  brandName: string;
  classType: string;
  countryOfOrigin: string;
  governmentWarning: string;
  netContents: string;
  producer: string;
}

export type StatusFilters = Record<ApplicationPackageRecord["status"], boolean>;
export type IncompleteFilters = Record<IncompleteFilter, boolean>;
export type FieldDecisionMap = Record<CanonicalLabelField, FieldReviewDecision>;
export type PackageRecordKey = Pick<
  ApplicationPackageRecord,
  "json_filename" | "image_filename"
>;

export interface ApplicationSummary {
  fail: number;
  passed: number;
  total: number;
}

export type PackageCollections = {
  records: ApplicationPackageRecord[];
};
