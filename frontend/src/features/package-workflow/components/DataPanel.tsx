import { useState } from "react";

import type { CanonicalLabelField, FieldReviewDecision } from "../../../types/api";
import { FIELD_CONFIGS } from "../../labelFields";
import { FIELD_DECISIONS } from "../constants";
import type { ApplicationPackageRecord } from "../packageWorkflowUtils";
import { emptyExtractedData } from "../packageWorkflowUtils";
import {
  comparisonRuleText,
  resolvedFieldDecisions,
  sortedResults,
  summarizeFieldDecisions
} from "../recordStatus";
import { SectionStats } from "./SectionStats";

interface DataPanelProps {
  onApplicationDataChange: (
    packageId: string,
    field: CanonicalLabelField,
    value: string
  ) => void;
  onFieldDecision: (
    packageId: string,
    field: CanonicalLabelField,
    decision: FieldReviewDecision
  ) => void;
  record: ApplicationPackageRecord;
}

export function DataPanel({ onApplicationDataChange, onFieldDecision, record }: DataPanelProps) {
  const [fieldFilters, setFieldFilters] = useState<Record<FieldReviewDecision, boolean>>({
    fail: true,
    pass: true
  });
  const extractedData = record.reviewed_extracted_data ?? emptyExtractedData();
  const fieldResults = new Map(
    sortedResults(record.comparison_result).map((result) => [result.field, result])
  );
  const fieldDecisions = resolvedFieldDecisions(record);
  const fieldSummary = summarizeFieldDecisions(fieldDecisions);
  const visibleFields = FIELD_CONFIGS.filter((field) => fieldFilters[fieldDecisions[field.name]]);

  function toggleFieldFilter(filter: FieldReviewDecision | "total") {
    setFieldFilters((current) => {
      if (filter === "total") {
        const allActive = FIELD_DECISIONS.every((decision) => current[decision]);
        return {
          fail: !allActive,
          pass: !allActive
        };
      }

      if (FIELD_DECISIONS.every((decision) => current[decision])) {
        return {
          fail: filter === "fail",
          pass: filter === "pass"
        };
      }

      return {
        ...current,
        [filter]: !current[filter]
      };
    });
  }

  return (
    <section className="data-panel" aria-labelledby="data-title">
      <div className="data-panel__header">
        <h3 id="data-title">Data</h3>
        <SectionStats
          items={[
            {
              active: FIELD_DECISIONS.every((decision) => fieldFilters[decision]),
              filterKey: "total",
              label: "total",
              value: fieldSummary.total,
              tone: "neutral"
            },
            {
              active: fieldFilters.fail,
              filterKey: "fail",
              label: "fail",
              value: fieldSummary.fail,
              tone: "fail"
            },
            {
              active: fieldFilters.pass,
              filterKey: "pass",
              label: "passed",
              value: fieldSummary.pass,
              tone: "passed"
            }
          ]}
          onToggle={(filterKey) => toggleFieldFilter(filterKey as FieldReviewDecision | "total")}
        />
      </div>
      <div className="data-grid">
        {visibleFields.map((field) => {
          const applicationId = `application-${field.name}`;
          const extractedId = `extracted-${field.name}`;
          const fieldResult = fieldResults.get(field.name);
          const extractedValue = extractedData[field.name] ?? "";
          const selectedDecision = fieldDecisions[field.name];
          const inputMode = field.name === "abv" || field.name === "net_contents" ? "decimal" : undefined;

          return (
            <div
              className={`data-row data-row--${
                fieldResult?.status.toLowerCase() ?? "pending"
              } data-row--field-${field.name}`}
              key={field.name}
            >
              <div className="data-row__heading">
                <div className="data-row__title">
                  <h4>{field.label}</h4>
                  <button
                    aria-label={`${field.label} comparison rule`}
                    className="field-info-button"
                    type="button"
                  >
                    i
                    <span className="field-info-tooltip" role="tooltip">
                      {comparisonRuleText(field.name)}
                    </span>
                  </button>
                </div>
                <div className="field-decision-buttons" aria-label={`${field.label} field decision`}>
                  <FieldDecisionButton
                    decision="fail"
                    fieldLabel={field.label}
                    isActive={selectedDecision === "fail"}
                    onClick={() => onFieldDecision(record.package_id, field.name, "fail")}
                  />
                  <FieldDecisionButton
                    decision="pass"
                    fieldLabel={field.label}
                    isActive={selectedDecision === "pass"}
                    onClick={() => onFieldDecision(record.package_id, field.name, "pass")}
                  />
                </div>
              </div>
              <div className="data-pair">
                <div className="data-value-group">
                  <label className="data-value-label" htmlFor={applicationId}>
                    Application
                  </label>
                  {field.multiline ? (
                    <textarea
                      aria-label={`Application Value ${field.label}`}
                      className="application-value-input application-value-input--multiline"
                      id={applicationId}
                      onChange={(event) =>
                        onApplicationDataChange(record.package_id, field.name, event.target.value)
                      }
                      value={record.application_data[field.name]}
                    />
                  ) : (
                    <input
                      aria-label={`Application Value ${field.label}`}
                      className="application-value-input"
                      id={applicationId}
                      onChange={(event) =>
                        onApplicationDataChange(record.package_id, field.name, event.target.value)
                      }
                      inputMode={inputMode}
                      type="text"
                      value={record.application_data[field.name]}
                    />
                  )}
                </div>
                <div className="data-value-group">
                  <span className="data-value-label">AI Detected</span>
                  <p
                    aria-label={`Extracted Value ${field.label}`}
                    className="ai-detected-value-text"
                    id={extractedId}
                  >
                    {extractedValue || "Not detected"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface FieldDecisionButtonProps {
  decision: FieldReviewDecision;
  fieldLabel: string;
  isActive: boolean;
  onClick: () => void;
}

function FieldDecisionButton({ decision, fieldLabel, isActive, onClick }: FieldDecisionButtonProps) {
  const label = decision === "fail" ? "Fail" : "Pass";

  return (
    <button
      aria-label={`${label} ${fieldLabel}`}
      aria-pressed={isActive}
      className={`field-icon-button field-icon-button--${decision}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      <DecisionIcon decision={decision} />
    </button>
  );
}

function DecisionIcon({ decision }: { decision: FieldReviewDecision }) {
  if (decision === "pass") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M8.5 21H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3.5v11Zm2 0V10.8L14.8 3l1.6.6c1.2.5 1.8 1.8 1.4 3l-.9 2.4H20a2 2 0 0 1 2 2.3l-1 7.8A2.2 2.2 0 0 1 18.8 21h-8.3Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M15.5 3H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3.5V3Zm-2 0v10.2L9.2 21l-1.6-.6a2.3 2.3 0 0 1-1.4-3l.9-2.4H4a2 2 0 0 1-2-2.3l1-7.8A2.2 2.2 0 0 1 5.2 3h8.3Z" />
    </svg>
  );
}
