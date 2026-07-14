import type { RefObject } from "react";

import type { CanonicalLabelField, FieldReviewDecision } from "../../../types/api";
import type { ApplicationPackageRecord } from "../packageWorkflowUtils";
import {
  applicationNumber,
  cardStatusClass,
  resolvedFieldDecisions,
  summarizeFieldDecisions
} from "../recordStatus";
import { DataPanel } from "./DataPanel";
import { ZoomableLabelImage } from "./ZoomableLabelImage";

interface ApplicationDetailDialogProps {
  detailHeadingRef: RefObject<HTMLHeadingElement>;
  onApplicationDataChange: (
    packageId: string,
    field: CanonicalLabelField,
    value: string
  ) => void;
  onExtractedDataChange: (
    packageId: string,
    field: CanonicalLabelField,
    value: string
  ) => void;
  onFieldEditComplete: (packageId: string) => void;
  onClose: () => void;
  onFieldDecision: (
    packageId: string,
    field: CanonicalLabelField,
    decision: FieldReviewDecision
  ) => void;
  onVerify: (packageId: string) => void;
  isVerifying: boolean;
  record: ApplicationPackageRecord;
}

export function ApplicationDetailDialog({
  detailHeadingRef,
  onApplicationDataChange,
  onClose,
  onExtractedDataChange,
  onFieldEditComplete,
  onFieldDecision,
  onVerify,
  isVerifying,
  record
}: ApplicationDetailDialogProps) {
  const title = record.application_data.brand_name.trim() || record.image_filename;
  const fieldSummary = summarizeFieldDecisions(resolvedFieldDecisions(record));
  const reviewLabel =
    fieldSummary.fail === 1 ? "1 field to review" : `${fieldSummary.fail} fields to review`;

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
          <div className="detail-title-group">
            <div className="detail-title-copy">
              <p className="detail-kicker">Application Review</p>
              <h2 id="detail-title" ref={detailHeadingRef} tabIndex={-1}>
                {title}
              </h2>
              <div className="detail-meta-strip" aria-label="Application metadata">
                <span className="detail-meta-chip detail-meta-chip--strong">
                  Application #{applicationNumber(record.package_id)}
                </span>
                <span className="detail-meta-chip">{reviewLabel}</span>
                <span className="detail-meta-chip">{fieldSummary.pass} passed</span>
                <span className="detail-meta-chip detail-meta-chip--file">
                  {record.image_filename}
                </span>
              </div>
            </div>
          </div>
          <div className="detail-panel__status-area">
            <span
              aria-label={`Current status: ${record.status}`}
              className={`status-chip status-chip--large status-chip--${cardStatusClass(record.status)}`}
            >
              {record.status}
            </span>
          </div>
          <div className="detail-panel__actions">
            <button
              className="detail-verify-button"
              disabled={isVerifying}
              onClick={() => onVerify(record.package_id)}
              type="button"
            >
              Verify
            </button>
            <button
              aria-label="Close detail view"
              className="detail-close-button"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>
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
              onExtractedDataChange={onExtractedDataChange}
              onFieldEditComplete={onFieldEditComplete}
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

      </section>
    </div>
  );
}
