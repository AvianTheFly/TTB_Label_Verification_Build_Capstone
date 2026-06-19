import { FormEvent, useMemo, useRef, useState } from "react";

import { VerificationApiError, verifyBatch } from "../../api/verification";
import type {
  ApplicationData,
  BatchItemResult,
  BatchResult,
  CanonicalLabelField
} from "../../types/api";
import {
  ACCEPTED_IMAGE_TYPES,
  FIELD_CONFIGS,
  emptyApplicationData,
  fieldLabel,
  formatFileSize,
  formatVerdict,
  resultOrder
} from "../labelFields";

type RowErrors = Partial<Record<CanonicalLabelField | "image", string>>;

interface BatchRow {
  id: number;
  application_data: ApplicationData;
  image: File | null;
  errors: RowErrors;
}

const PROGRESS_DELAY_MS = 700;

function createRow(id: number): BatchRow {
  return {
    id,
    application_data: { ...emptyApplicationData },
    image: null,
    errors: {}
  };
}

function validateRow(row: BatchRow): RowErrors {
  const errors: RowErrors = {};

  if (!row.image) {
    errors.image = "Choose a label image.";
  } else if (!ACCEPTED_IMAGE_TYPES.has(row.image.type)) {
    errors.image = "Choose a JPG, PNG, or WebP image.";
  }

  for (const field of FIELD_CONFIGS) {
    if (!row.application_data[field.name].trim()) {
      errors[field.name] = field.errorMessage;
    }
  }

  return errors;
}

function errorMessageFor(error: unknown): string {
  if (error instanceof VerificationApiError) {
    return error.message;
  }

  return "The batch could not be checked. Please try again.";
}

function statusText(item: BatchItemResult): string {
  if (item.error) {
    return "ITEM ERROR";
  }
  if (!item.result) {
    return "NEEDS REVIEW";
  }
  return formatVerdict(item.result.overall_verdict);
}

export function BatchVerification() {
  const nextId = useRef(2);
  const resultRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<BatchRow[]>([createRow(1)]);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLongProgress, setShowLongProgress] = useState(false);

  const hasRowErrors = useMemo(
    () => rows.some((row) => Object.values(row.errors).some(Boolean)),
    [rows]
  );

  function addRow() {
    const id = nextId.current;
    nextId.current += 1;
    setRows((current) => [...current, createRow(id)]);
  }

  function removeRow(id: number) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  function updateField(rowId: number, field: CanonicalLabelField, value: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const errors = { ...row.errors };
        delete errors[field];
        return {
          ...row,
          application_data: { ...row.application_data, [field]: value },
          errors
        };
      })
    );
  }

  function updateImage(rowId: number, file: File | null) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const errors = { ...row.errors };
        delete errors.image;
        return { ...row, image: file, errors };
      })
    );
  }

  function toggleItem(index: number) {
    setOpenItems((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rowsWithErrors = rows.map((row) => ({ ...row, errors: validateRow(row) }));
    setRows(rowsWithErrors);
    setSubmitError(null);
    setResult(null);

    if (rowsWithErrors.some((row) => Object.keys(row.errors).length > 0)) {
      return;
    }

    setIsSubmitting(true);
    setShowLongProgress(false);
    const progressTimer = window.setTimeout(() => setShowLongProgress(true), PROGRESS_DELAY_MS);

    try {
      const batchResult = await verifyBatch(
        rowsWithErrors.map((row) => ({
          image: row.image as File,
          application_data: row.application_data
        }))
      );
      setResult(batchResult);
      setOpenItems(new Set([batchResult.items[0]?.index ?? 0]));
      window.requestAnimationFrame(() => resultRef.current?.focus());
    } catch (error) {
      setSubmitError(errorMessageFor(error));
    } finally {
      window.clearTimeout(progressTimer);
      setIsSubmitting(false);
      setShowLongProgress(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="tool-layout" aria-labelledby="batch-title">
        <div className="page-heading">
          <p className="phase-label">Batch Upload</p>
          <h1 id="batch-title">Verify Multiple Labels</h1>
        </div>

        {result && (
          <section className="result-panel" aria-labelledby="batch-result-title" ref={resultRef} tabIndex={-1}>
            <div className="result-summary">
              <p className="result-label">Batch Summary</p>
              <h2 id="batch-result-title">Batch Complete</h2>
            </div>

            <div className="summary-grid" aria-label="Batch summary counts">
              <div>
                <span>{result.summary.passed}</span>
                <strong>Passed</strong>
              </div>
              <div>
                <span>{result.summary.needs_review}</span>
                <strong>Needs Review</strong>
              </div>
              <div>
                <span>{result.summary.total}</span>
                <strong>Total</strong>
              </div>
            </div>

            <div className="batch-results" aria-label="Individual label results">
              {result.items.map((item) => {
                const isOpen = openItems.has(item.index);
                const detailsId = `batch-item-${item.index}-details`;
                const sortedResults = item.result?.results
                  .slice()
                  .sort((left, right) => resultOrder(left) - resultOrder(right));

                return (
                  <article className="batch-result-item" key={item.index}>
                    <div className="batch-result-item__topline">
                      <div>
                        <h3>Label {item.index + 1}</h3>
                        <p>{statusText(item)}</p>
                      </div>
                      <button
                        aria-controls={isOpen ? detailsId : undefined}
                        aria-expanded={isOpen}
                        className="secondary-button"
                        onClick={() => toggleItem(item.index)}
                        type="button"
                      >
                        {isOpen ? "Hide Details" : "View Details"}
                      </button>
                    </div>

                    {isOpen && item.error && (
                      <div className="error-panel batch-item-error" id={detailsId}>
                        <strong>Could not check this label.</strong>
                        <p>{item.error.message}</p>
                      </div>
                    )}

                    {isOpen && sortedResults && (
                      <div className="field-results" id={detailsId}>
                        {sortedResults.map((fieldResult) => (
                          <article
                            className={`field-result field-result--${fieldResult.status.toLowerCase()}`}
                            key={fieldResult.field}
                          >
                            <div className="field-result__topline">
                              <h4>{fieldLabel(fieldResult.field)}</h4>
                              <span className="status-badge">{fieldResult.status}</span>
                            </div>

                            {fieldResult.status === "FAIL" && (
                              <dl className="field-result__details">
                                <div>
                                  <dt>Expected</dt>
                                  <dd>{fieldResult.expected || "Not provided"}</dd>
                                </div>
                                <div>
                                  <dt>Found</dt>
                                  <dd>{fieldResult.found || "Not found"}</dd>
                                </div>
                                <div>
                                  <dt>Reason</dt>
                                  <dd>{fieldResult.message}</dd>
                                </div>
                              </dl>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <form className="verification-form" onSubmit={handleSubmit} noValidate>
          <div className="batch-toolbar">
            <h2>Labels In This Batch</h2>
            <button className="secondary-button" onClick={addRow} type="button">
              Add Label
            </button>
          </div>

          {rows.map((row, index) => (
            <section className="batch-entry" aria-labelledby={`batch-entry-${row.id}`} key={row.id}>
              <div className="batch-entry__heading">
                <h3 id={`batch-entry-${row.id}`}>Label {index + 1}</h3>
                {rows.length > 1 && (
                  <button
                    className="danger-button"
                    onClick={() => removeRow(row.id)}
                    type="button"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="form-section">
                <label className="file-picker" htmlFor={`batch-image-${row.id}`}>
                  <span className="file-picker__action">Choose Image</span>
                  <span className="file-picker__text">
                    {row.image
                      ? `${row.image.name} (${formatFileSize(row.image.size)})`
                      : "No image chosen"}
                  </span>
                </label>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  aria-describedby={row.errors.image ? `batch-image-${row.id}-error` : undefined}
                  aria-invalid={Boolean(row.errors.image)}
                  className="file-input"
                  id={`batch-image-${row.id}`}
                  onChange={(event) => updateImage(row.id, event.target.files?.[0] ?? null)}
                  type="file"
                />
                {row.errors.image && (
                  <p className="field-error" id={`batch-image-${row.id}-error`}>
                    {row.errors.image}
                  </p>
                )}
              </div>

              <div className="field-grid">
                {FIELD_CONFIGS.map((field) => {
                  const inputId = `batch-${row.id}-${field.name}`;
                  const errorId = `${inputId}-error`;
                  const describedBy = row.errors[field.name] ? errorId : undefined;

                  return (
                    <div
                      className={`form-field ${field.multiline ? "form-field--wide" : ""}`}
                      key={field.name}
                    >
                      <label htmlFor={inputId}>{field.label}</label>
                      {field.multiline ? (
                        <textarea
                          aria-describedby={describedBy}
                          aria-invalid={Boolean(row.errors[field.name])}
                          id={inputId}
                          name={field.name}
                          onChange={(event) => updateField(row.id, field.name, event.target.value)}
                          rows={4}
                          value={row.application_data[field.name]}
                        />
                      ) : (
                        <input
                          aria-describedby={describedBy}
                          aria-invalid={Boolean(row.errors[field.name])}
                          id={inputId}
                          name={field.name}
                          onChange={(event) => updateField(row.id, field.name, event.target.value)}
                          type="text"
                          value={row.application_data[field.name]}
                        />
                      )}
                      {row.errors[field.name] && (
                        <p className="field-error" id={errorId}>
                          {row.errors[field.name]}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {submitError && (
            <div className="error-panel" role="alert">
              <strong>Could not check this batch.</strong>
              <p>{submitError}</p>
            </div>
          )}

          {hasRowErrors && (
            <div className="error-panel" role="alert">
              <strong>Please fix the highlighted items.</strong>
              <p>Each label needs one image and all seven application fields.</p>
            </div>
          )}

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Checking Batch..." : "Verify Batch"}
          </button>

          {isSubmitting && (
            <div className="loading-message" role="status">
              <p>Checking {rows.length} labels now.</p>
              {showLongProgress && <p>This can take a little longer for larger batches.</p>}
            </div>
          )}
        </form>
      </section>
    </main>
  );
}
