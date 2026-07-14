interface WorkflowHeaderProps {
  batchLimit: number;
  canVerifyBatch: boolean;
  isChecking: boolean;
  onDownloadDemoData: () => void;
  onVerifyBatch: () => void;
}

export function WorkflowHeader({
  batchLimit,
  canVerifyBatch,
  isChecking,
  onDownloadDemoData,
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
            Reading labels
          </p>
        )}
        <div className="batch-action-group">
          <button
            className="secondary-button"
            disabled={isChecking || !canVerifyBatch}
            onClick={onVerifyBatch}
            title={`Runs /verify/batch for up to ${batchLimit} complete applications.`}
            type="button"
          >
            Verify Batch
          </button>
          <p className="batch-action-hint">
            Up to {batchLimit} applications. Runs full image extraction and comparison.
          </p>
        </div>
        <button className="secondary-button" onClick={onDownloadDemoData} type="button">
          Demo Data
        </button>
      </div>
    </div>
  );
}
