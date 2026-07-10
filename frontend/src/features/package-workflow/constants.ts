import type { FieldReviewDecision } from "../../types/api";
import type { VisibleStatus } from "./packageWorkflowUtils";

export const DEMO_DATA_ARCHIVE_FILENAME = "demo-inputs.zip";
export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
export const FIELD_DECISIONS: FieldReviewDecision[] = ["fail", "review", "pass"];
export const VISIBLE_STATUSES: VisibleStatus[] = [
  "Pending Check",
  "Passed",
  "Needs Review",
  "Fail"
];

