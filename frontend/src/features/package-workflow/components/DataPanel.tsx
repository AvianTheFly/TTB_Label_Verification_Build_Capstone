import { useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";

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
  onApplicationBoldFormattingChange: (packageId: string, isBold: boolean) => void;
  onExtractedDataChange: (
    packageId: string,
    field: CanonicalLabelField,
    value: string
  ) => void;
  onExtractedBoldFormattingChange: (packageId: string, isBold: boolean) => void;
  onFieldEditComplete: (packageId: string) => void;
  onFieldDecision: (
    packageId: string,
    field: CanonicalLabelField,
    decision: FieldReviewDecision
  ) => void;
  record: ApplicationPackageRecord;
}

export function DataPanel({
  onApplicationDataChange,
  onApplicationBoldFormattingChange,
  onExtractedDataChange,
  onExtractedBoldFormattingChange,
  onFieldEditComplete,
  onFieldDecision,
  record
}: DataPanelProps) {
  const [fieldFilters, setFieldFilters] = useState<Record<FieldReviewDecision, boolean>>({
    fail: true,
    pass: true
  });
  const hasExtractedData = record.reviewed_extracted_data !== null;
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
        <div className="data-panel__title">
          <h3 id="data-title">Application Data</h3>
          <p>{visibleFields.length} fields shown</p>
        </div>
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
          const isNumericTextField = field.name === "abv" || field.name === "net_contents";
          const isGovernmentWarningField = field.name === "government_warning";
          const usesWrappedApplicationControl = field.multiline || !isNumericTextField;
          const inputMode = isNumericTextField ? "decimal" : undefined;
          const pattern = isNumericTextField ? ".*[0-9]+(\\.[0-9]+)?.*" : undefined;

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
                  <span className={`data-row__status data-row__status--${selectedDecision}`}>
                    {selectedDecision === "pass" ? "Pass" : "Review"}
                  </span>
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
                  {isGovernmentWarningField ? (
                    <RichWarningTextarea
                      aria-label={`Application Value ${field.label}`}
                      className="application-value-input application-value-input--auto-grow application-value-input--rich"
                      id={applicationId}
                      isLeadInBold={
                        record.application_formatting.government_warning_lead_in_bold === true
                      }
                      onBoldChange={(isBold) =>
                        onApplicationBoldFormattingChange(record.package_id, isBold)
                      }
                      onBlur={() => onFieldEditComplete(record.package_id)}
                      onChange={(value) =>
                        onApplicationDataChange(record.package_id, field.name, value)
                      }
                      value={record.application_data[field.name]}
                    />
                  ) : usesWrappedApplicationControl ? (
                    <AutoGrowApplicationTextarea
                      aria-label={`Application Value ${field.label}`}
                      className="application-value-input application-value-input--auto-grow"
                      id={applicationId}
                      onChange={(event) =>
                        onApplicationDataChange(record.package_id, field.name, event.target.value)
                      }
                      onBlur={() => onFieldEditComplete(record.package_id)}
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
                      onBlur={() => onFieldEditComplete(record.package_id)}
                      inputMode={inputMode}
                      pattern={pattern}
                      title={isNumericTextField ? `${field.label} must include a number.` : undefined}
                      type="text"
                      value={record.application_data[field.name]}
                    />
                  )}
                </div>
                <div className="data-value-group">
                  <label className="data-value-label" htmlFor={extractedId}>
                    AI Detected
                  </label>
                  {isGovernmentWarningField ? (
                    <RichWarningTextarea
                      aria-label={`Extracted Value ${field.label}`}
                      className="application-value-input application-value-input--auto-grow ai-detected-value-input application-value-input--rich"
                      id={extractedId}
                      isLeadInBold={
                        record.reviewed_extracted_formatting?.government_warning_lead_in_bold === true
                      }
                      onBoldChange={(isBold) =>
                        onExtractedBoldFormattingChange(record.package_id, isBold)
                      }
                      onBlur={() => onFieldEditComplete(record.package_id)}
                      onChange={(value) =>
                        onExtractedDataChange(record.package_id, field.name, value)
                      }
                      placeholder="Not detected"
                      readOnly={!hasExtractedData}
                      value={extractedValue}
                    />
                  ) : (
                    <AutoGrowApplicationTextarea
                      aria-label={`Extracted Value ${field.label}`}
                      className="application-value-input application-value-input--auto-grow ai-detected-value-input"
                      id={extractedId}
                      onChange={(event) =>
                        onExtractedDataChange(record.package_id, field.name, event.target.value)
                      }
                      onBlur={() => onFieldEditComplete(record.package_id)}
                      placeholder="Not detected"
                      readOnly={!hasExtractedData}
                      value={extractedValue}
                    />
                  )}
                </div>
              </div>
              {fieldResult?.message && (
                <p className="data-row__message">{fieldResult.message}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface AutoGrowApplicationTextareaProps {
  "aria-label": string;
  className: string;
  id: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur: () => void;
  placeholder?: string;
  readOnly?: boolean;
  value: string;
}

function AutoGrowApplicationTextarea({
  "aria-label": ariaLabel,
  className,
  id,
  onChange,
  onBlur,
  placeholder,
  readOnly = false,
  value
}: AutoGrowApplicationTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      aria-label={ariaLabel}
      className={className}
      id={id}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      readOnly={readOnly}
      ref={textareaRef}
      rows={1}
      value={value}
    />
  );
}

interface RichWarningTextareaProps {
  "aria-label": string;
  className: string;
  id: string;
  isLeadInBold: boolean;
  onBoldChange: (isBold: boolean) => void;
  onBlur: () => void;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  value: string;
}

const WARNING_LEAD_IN = "GOVERNMENT WARNING:";

function RichWarningTextarea({
  "aria-label": ariaLabel,
  className,
  id,
  isLeadInBold,
  onBoldChange,
  onBlur,
  onChange,
  placeholder,
  readOnly = false,
  value
}: RichWarningTextareaProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastRenderedRef = useRef<{ isLeadInBold: boolean; value: string } | null>(null);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const nextHtml = warningHtml(value, isLeadInBold);
    const previous = lastRenderedRef.current;
    const isFocused = document.activeElement === editor;
    const textAlreadyCurrent = editor.textContent === value;
    const boldStateUnchanged = previous?.isLeadInBold === isLeadInBold;
    const htmlAlreadyCurrent = editor.innerHTML === nextHtml;

    if (isFocused && textAlreadyCurrent && boldStateUnchanged && htmlAlreadyCurrent) {
      lastRenderedRef.current = { isLeadInBold, value };
      return;
    }

    if (!htmlAlreadyCurrent) {
      const caretOffset = isFocused ? selectionTextOffset(editor) : null;
      editor.innerHTML = nextHtml;
      if (caretOffset !== null) {
        restoreCaretAtTextOffset(editor, caretOffset);
      }
    }
    lastRenderedRef.current = { isLeadInBold, value };
  }, [isLeadInBold, value]);

  function handleInput(event: FormEvent<HTMLDivElement>) {
    onChange(event.currentTarget.textContent ?? "");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      if (!readOnly) {
        onBoldChange(!isLeadInBold);
      }
    }
  }

  return (
    <div
      aria-label={ariaLabel}
      aria-multiline="true"
      className={className}
      contentEditable={!readOnly}
      data-empty={!value.trim()}
      data-placeholder={placeholder}
      id={id}
      onBlur={onBlur}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      ref={editorRef}
      role="textbox"
      suppressContentEditableWarning
      tabIndex={readOnly ? -1 : 0}
    />
  );
}

function warningHtml(value: string, isLeadInBold: boolean): string {
  if (!isLeadInBold || !value.startsWith(WARNING_LEAD_IN)) {
    return escapeHtml(value);
  }

  return `<strong>${escapeHtml(WARNING_LEAD_IN)}</strong>${escapeHtml(
    value.slice(WARNING_LEAD_IN.length)
  )}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function selectionTextOffset(container: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!container.contains(range.endContainer)) {
    return null;
  }

  const precedingText = range.cloneRange();
  precedingText.selectNodeContents(container);
  precedingText.setEnd(range.endContainer, range.endOffset);
  return precedingText.toString().length;
}

function restoreCaretAtTextOffset(container: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let remainingOffset = offset;
  let currentNode = walker.nextNode();

  while (currentNode) {
    const textLength = currentNode.textContent?.length ?? 0;
    if (remainingOffset <= textLength) {
      setCaret(currentNode, remainingOffset);
      return;
    }

    remainingOffset -= textLength;
    currentNode = walker.nextNode();
  }

  setCaret(container, container.childNodes.length);
}

function setCaret(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
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
