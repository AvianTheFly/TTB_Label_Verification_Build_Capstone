import type { OpenAiSettings } from "../types";

interface WorkflowHeaderProps {
  incompleteCount: number;
  isChecking: boolean;
  onDownloadDemoData: () => void;
  onOpenAiToggleChange: (checked: boolean) => void;
  onSubmitClick: () => void;
  openAiSettings: OpenAiSettings | null;
  recordCount: number;
  useOpenAiKey: boolean;
}

export function WorkflowHeader({
  incompleteCount,
  isChecking,
  onDownloadDemoData,
  onOpenAiToggleChange,
  onSubmitClick,
  openAiSettings,
  recordCount,
  useOpenAiKey
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
            {useOpenAiKey
              ? "Sending documents to real AI vision service, waiting for ChatGPT to respond..."
              : "Checking uploaded applications..."}
          </p>
        )}
        <button className="secondary-button" onClick={onDownloadDemoData} type="button">
          Download Demo Data
        </button>
        <label className="openai-toggle">
          <input
            checked={useOpenAiKey}
            onChange={(event) => onOpenAiToggleChange(event.target.checked)}
            type="checkbox"
          />
          <span>Use OPENAI KEY</span>
        </label>
        {useOpenAiKey && openAiSettings && (
          <span className="openai-status" aria-label="OpenAI mode status">
            Real AI vision ready: {openAiSettings.model}
          </span>
        )}
        <button
          className="secondary-button"
          disabled={recordCount === 0 && incompleteCount === 0}
          onClick={onSubmitClick}
          type="button"
        >
          Submit
        </button>
      </div>
    </div>
  );
}

