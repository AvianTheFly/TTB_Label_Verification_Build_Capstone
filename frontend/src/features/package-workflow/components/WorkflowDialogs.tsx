import type { ReviewOverrideWarning } from "../types";

interface ReviewOverrideDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
  warning: ReviewOverrideWarning;
}

export function ReviewOverrideDialog({
  onCancel,
  onConfirm,
  warning
}: ReviewOverrideDialogProps) {
  return (
    <div className="modal-scrim" role="presentation">
      <section
        aria-labelledby="review-warning-title"
        aria-modal="true"
        className="warning-dialog"
        role="dialog"
      >
        <div className="warning-dialog__marker">!</div>
        <div className="warning-dialog__content">
          <p className="result-label">Review override</p>
          <h2 id="review-warning-title">{warning.title}</h2>
          <p>
            {warning.action === "pass"
              ? "The application still has fields that are not marked as pass."
              : "All fields are currently marked as pass."}
          </p>
          <div className="warning-dialog__field-list" aria-label="Affected fields">
            {warning.groups.map((group) => (
              <div className="warning-dialog__field-group" key={group.label}>
                <strong>{group.label}</strong>
                <span>{group.fields.join(", ")}</span>
              </div>
            ))}
          </div>
          <div className="dialog-actions">
            <button className="secondary-button" onClick={onCancel} type="button">
              Cancel
            </button>
            <button
              className={`decision-button decision-button--${warning.action}`}
              onClick={onConfirm}
              type="button"
            >
              {warning.confirmLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

interface SubmitWarningDialogProps {
  onCancel: () => void;
  onProceedWithDownload: () => void;
  onProceedWithoutDownload: () => void;
}

export function SubmitWarningDialog({
  onCancel,
  onProceedWithDownload,
  onProceedWithoutDownload
}: SubmitWarningDialogProps) {
  return (
    <div className="modal-scrim" role="presentation">
      <section
        aria-labelledby="submit-warning-title"
        aria-modal="true"
        className="submit-warning-dialog"
        role="dialog"
      >
        <div className="warning-dialog__marker">!</div>
        <div className="warning-dialog__content">
          <p className="result-label">Pretend submission</p>
          <h2 id="submit-warning-title">This is the pretend submission.</h2>
          <p>This will download the application documents with pass/fail attached.</p>
          <div className="dialog-actions dialog-actions--three">
            <button className="secondary-button" onClick={onCancel} type="button">
              Cancel
            </button>
            <button className="secondary-button" onClick={onProceedWithoutDownload} type="button">
              Proceed Without Download
            </button>
            <button
              className="decision-button decision-button--pass"
              onClick={onProceedWithDownload}
              type="button"
            >
              Proceed With Download
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

