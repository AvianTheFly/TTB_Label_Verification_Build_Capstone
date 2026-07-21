interface WorkflowHeaderProps {
  canVerifyBatch: boolean;
  checkingMessage: string | null;
  isChecking: boolean;
  onDownloadSampleLabels: () => void;
  onVerifyBatch: () => void;
}

export function WorkflowHeader({
  canVerifyBatch,
  checkingMessage,
  isChecking,
  onDownloadSampleLabels,
  onVerifyBatch
}: WorkflowHeaderProps) {
  return (
    <div className="page-heading page-heading--with-actions app-command">
      <div className="app-command__title">
        <p className="phase-label">Application Review</p>
        <h1 id="package-title">TTB Label Verification</h1>
      </div>
      <div className="top-actions" aria-label="Application actions">
        {isChecking && (
          <p className="loading-message" role="status">
            {checkingMessage ?? "Reading labels"}
          </p>
        )}
        <div className="batch-action-group">
          <button
            className="secondary-button"
            disabled={isChecking || !canVerifyBatch}
            onClick={onVerifyBatch}
            title="Verify all complete applications"
            type="button"
          >
            Verify Batch
          </button>
        </div>
        <button className="secondary-button" onClick={onDownloadSampleLabels} type="button">
          Sample Labels
        </button>
      </div>
    </div>
  );
}
