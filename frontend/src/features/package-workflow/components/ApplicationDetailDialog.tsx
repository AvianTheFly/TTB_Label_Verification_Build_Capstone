import type { RefObject } from "react";

import type { CanonicalLabelField, FieldReviewDecision } from "../../../types/api";
import type { ApplicationPackageRecord, VisibleStatus } from "../packageWorkflowUtils";
import { applicationNumber, cardStatusClass } from "../recordStatus";
import { DataPanel } from "./DataPanel";
import { ZoomableLabelImage } from "./ZoomableLabelImage";

interface ApplicationDetailDialogProps {
  detailHeadingRef: RefObject<HTMLHeadingElement>;
  onClose: () => void;
  onFailClick: (record: ApplicationPackageRecord) => void;
  onFieldDecision: (
    packageId: string,
    field: CanonicalLabelField,
    decision: FieldReviewDecision
  ) => void;
  onPassClick: (record: ApplicationPackageRecord) => void;
  onSetRecordStatus: (packageId: string, status: VisibleStatus) => void;
  record: ApplicationPackageRecord;
  selectedCanFail: boolean;
  selectedCanPass: boolean;
}

export function ApplicationDetailDialog({
  detailHeadingRef,
  onClose,
  onFailClick,
  onFieldDecision,
  onPassClick,
  onSetRecordStatus,
  record,
  selectedCanFail,
  selectedCanPass
}: ApplicationDetailDialogProps) {
  return (
    <div
      className="detail-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-labelledby="detail-title"
        aria-modal="true"
        className="detail-panel"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="detail-panel__header">
          <button
            aria-label="Close detail view"
            className="detail-close-button"
            onClick={onClose}
            type="button"
          >
            X
          </button>
          <div className="detail-title-group">
            <div>
              <p className="result-label">Application #</p>
              <p className="detail-application-id">{applicationNumber(record.package_id)}</p>
            </div>
            <div>
              <p className="result-label">Brand Name</p>
              <h2 id="detail-title" ref={detailHeadingRef} tabIndex={-1}>
                {record.application_data.brand_name}
              </h2>
            </div>
          </div>
          <button
            aria-label={`Close detail view. Current status: ${record.status}`}
            className={`status-chip status-chip--large status-chip--button status-chip--${cardStatusClass(record.status)}`}
            onClick={onClose}
            type="button"
          >
            {record.status}
          </button>
        </div>

        <div className="detail-layout">
          {record.image_preview_url && (
            <ZoomableLabelImage
              alt={`Label image for ${record.application_data.brand_name}`}
              src={record.image_preview_url}
            />
          )}

          <div className="detail-fields">
            <DataPanel onFieldDecision={onFieldDecision} record={record} />
          </div>
        </div>

        <div className="review-actions" aria-label="Review decision">
          <button
            aria-disabled={!selectedCanFail}
            className={`decision-button decision-button--fail ${
              selectedCanFail ? "" : "decision-button--disabled"
            }`}
            onClick={() => onFailClick(record)}
            type="button"
          >
            FAIL
          </button>
          <button
            className="decision-button decision-button--review"
            onClick={() => onSetRecordStatus(record.package_id, "Needs Review")}
            type="button"
          >
            NEEDS REVIEW
          </button>
          <button
            aria-disabled={!selectedCanPass}
            className={`decision-button decision-button--pass ${
              selectedCanPass ? "" : "decision-button--disabled"
            }`}
            onClick={() => onPassClick(record)}
            type="button"
          >
            PASS
          </button>
        </div>
      </section>
    </div>
  );
}

