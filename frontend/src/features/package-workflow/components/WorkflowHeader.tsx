interface WorkflowHeaderProps {
  isChecking: boolean;
  onDownloadDemoData: () => void;
}

export function WorkflowHeader({
  isChecking,
  onDownloadDemoData
}: WorkflowHeaderProps) {
  return (
    <div className="page-heading page-heading--with-actions">
      <div>
        <p className="phase-label">Application Package Check</p>
        <h1 id="package-title">TTB Label Verification</h1>
      </div>
      <div className="top-actions" aria-label="Application actions">
        {isChecking && (
          <p className="loading-message">
            Checking application...
          </p>
        )}
        <button className="secondary-button" onClick={onDownloadDemoData} type="button">
          Download Demo Data
        </button>
      </div>
    </div>
  );
}
