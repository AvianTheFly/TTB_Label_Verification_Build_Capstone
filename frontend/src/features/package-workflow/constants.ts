import type { FieldReviewDecision } from "../../types/api";
import type { VisibleStatus } from "./packageWorkflowUtils";

export const DEMO_DATA_ARCHIVE_FILENAME = "demo-inputs.zip";
export const FIELD_DECISIONS: FieldReviewDecision[] = ["fail", "pass"];
export const VISIBLE_STATUSES: VisibleStatus[] = [
  "Pending Check",
  "Approved",
  "Needs Review"
];
