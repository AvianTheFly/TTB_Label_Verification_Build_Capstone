import type { FieldReviewDecision } from "../../types/api";
import type { VisibleStatus } from "./packageWorkflowUtils";

export const SAMPLE_LABELS_ARCHIVE_PATH = "demo-data/demo-inputs.zip";
export const SAMPLE_LABELS_DOWNLOAD_FILENAME = "sample-labels.zip";
export const FIELD_DECISIONS: FieldReviewDecision[] = ["fail", "pass"];
export const VISIBLE_STATUSES: VisibleStatus[] = [
  "Pending Check",
  "Approved",
  "Needs Review"
];
