interface WorkflowHeaderProps {
  isChecking: boolean;
  onDownloadDemoData: () => void;
}

export function WorkflowHeader({
  isChecking,
  onDownloadDemoData
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
            Checking application
          </p>
        )}
        <button className="secondary-button" onClick={onDownloadDemoData} type="button">
          Demo Data
        </button>
      </div>
    </div>
  );
}
