import { DEFAULT_OPENAI_MODEL } from "../constants";
import type { OpenAiDraft, ReviewOverrideWarning } from "../types";

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

interface OpenAiSettingsDialogProps {
  draft: OpenAiDraft;
  error: string | null;
  onCancel: () => void;
  onDraftChange: (draft: OpenAiDraft) => void;
  onProceed: () => void;
}

export function OpenAiSettingsDialog({
  draft,
  error,
  onCancel,
  onDraftChange,
  onProceed
}: OpenAiSettingsDialogProps) {
  return (
    <div className="modal-scrim" role="presentation">
      <section
        aria-labelledby="openai-dialog-title"
        aria-modal="true"
        className="openai-key-panel"
        role="dialog"
      >
        <strong>WARNING: THIS USES REAL API CALLS</strong>
        <h2 id="openai-dialog-title">Use Real AI Vision</h2>
        <p>
          Enter the session settings for real vision mode. The backend confirms authentication
          when the first real vision request is sent.
        </p>
        <label>
          API Key
          <input
            autoComplete="off"
            onChange={(event) => onDraftChange({ ...draft, apiKey: event.target.value })}
            type="password"
            value={draft.apiKey}
          />
        </label>
        <label>
          Model
          <input
            onChange={(event) => onDraftChange({ ...draft, model: event.target.value })}
            placeholder={DEFAULT_OPENAI_MODEL}
            type="text"
            value={draft.model}
          />
        </label>
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="decision-button decision-button--review" onClick={onProceed} type="button">
            Proceed
          </button>
        </div>
      </section>
    </div>
  );
}

