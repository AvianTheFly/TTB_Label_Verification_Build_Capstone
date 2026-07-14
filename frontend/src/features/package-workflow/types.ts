import type { CanonicalLabelField, FieldReviewDecision } from "../../types/api";
import type { ApplicationPackageRecord } from "./packageWorkflowUtils";

export type AbvOperator = "any" | "lt" | "eq" | "gt";

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
export type FieldDecisionMap = Record<CanonicalLabelField, FieldReviewDecision>;
export type PackageRecordKey = Pick<ApplicationPackageRecord, "image_filename">;

export interface ApplicationSummary {
  needs_review: number;
  passed: number;
  total: number;
}

export type PackageCollections = {
  records: ApplicationPackageRecord[];
};
