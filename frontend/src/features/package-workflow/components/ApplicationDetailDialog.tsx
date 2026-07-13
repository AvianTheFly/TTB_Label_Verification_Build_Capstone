import type { RefObject } from "react";

import type { CanonicalLabelField, FieldReviewDecision } from "../../../types/api";
import type { ApplicationPackageRecord } from "../packageWorkflowUtils";
import { applicationNumber, cardStatusClass } from "../recordStatus";
import { DataPanel } from "./DataPanel";
import { ZoomableLabelImage } from "./ZoomableLabelImage";

interface ApplicationDetailDialogProps {
  detailHeadingRef: RefObject<HTMLHeadingElement>;
  isChecking: boolean;
  onApplicationDataChange: (
    packageId: string,
    field: CanonicalLabelField,
    value: string
  ) => void;
  onClose: () => void;
  onFieldDecision: (
    packageId: string,
    field: CanonicalLabelField,
    decision: FieldReviewDecision
  ) => void;
  onVerify: (packageId: string) => void;
  record: ApplicationPackageRecord;
}

export function ApplicationDetailDialog({
  detailHeadingRef,
  isChecking,
  onApplicationDataChange,
  onClose,
  onFieldDecision,
  onVerify,
  record
}: ApplicationDetailDialogProps) {
  const title = record.application_data.brand_name.trim() || record.image_filename;

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
            <div className="detail-title-copy">
              <p className="detail-kicker">Application Review</p>
              <h2 id="detail-title" ref={detailHeadingRef} tabIndex={-1}>
                {title}
              </h2>
              <div className="detail-meta-strip" aria-label="Application metadata">
                <span>Application #{applicationNumber(record.package_id)}</span>
                <span>{record.image_filename}</span>
              </div>
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
              alt={`Label image for ${title}`}
              src={record.image_preview_url}
            />
          )}

          <div className="detail-fields">
            <DataPanel
              onApplicationDataChange={onApplicationDataChange}
              onFieldDecision={onFieldDecision}
              record={record}
            />
          </div>
        </div>

        {record.item_error && (
          <div className="error-panel" role="alert">
            <strong>This application needs attention.</strong>
            <p>{record.item_error}</p>
          </div>
        )}

        <div className="decision-actions" aria-label="Application decision">
          <button
            className="decision-button decision-button--verify"
            disabled={isChecking}
            onClick={() => onVerify(record.package_id)}
            type="button"
          >
            {isChecking ? "VERIFYING..." : "VERIFY"}
          </button>
        </div>
      </section>
    </div>
  );
}
