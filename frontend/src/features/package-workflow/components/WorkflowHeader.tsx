interface WorkflowHeaderProps {
  canVerifyBatch: boolean;
  isChecking: boolean;
  onDownloadDemoData: () => void;
  onVerifyBatch: () => void;
}

export function WorkflowHeader({
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
        <button
          className="secondary-button"
          disabled={isChecking || !canVerifyBatch}
          onClick={onVerifyBatch}
          type="button"
        >
          Verify Batch
        </button>
        <button className="secondary-button" onClick={onDownloadDemoData} type="button">
          Demo Data
        </button>
      </div>
    </div>
  );
}
