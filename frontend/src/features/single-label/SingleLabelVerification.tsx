import { FormEvent, useMemo, useRef, useState } from "react";

import { VerificationApiError, verifyLabel } from "../../api/verification";
import {
  ACCEPTED_IMAGE_TYPES,
  FIELD_CONFIGS,
  emptyApplicationData,
  fieldLabel,
  formatFileSize,
  formatVerdict,
  resultOrder
} from "../labelFields";
import type { ApplicationData, CanonicalLabelField, VerificationResult } from "../../types/api";

type FormErrors = Partial<Record<CanonicalLabelField | "image", string>>;

function validateForm(applicationData: ApplicationData, image: File | null): FormErrors {
  const errors: FormErrors = {};

  if (!image) {
    errors.image = "Choose a label image.";
  } else if (!ACCEPTED_IMAGE_TYPES.has(image.type)) {
    errors.image = "Choose a JPG, PNG, or WebP image.";
  }

  for (const field of FIELD_CONFIGS) {
    if (!applicationData[field.name].trim()) {
      errors[field.name] = field.errorMessage;
    }
  }

  return errors;
}

function errorMessageFor(error: unknown): string {
  if (error instanceof VerificationApiError) {
    return error.message;
  }

  return "The label could not be checked. Please try again.";
}

export function SingleLabelVerification() {
  const [applicationData, setApplicationData] = useState<ApplicationData>(emptyApplicationData);
  const [image, setImage] = useState<File | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const sortedResults = useMemo(
    () => result?.results.slice().sort((left, right) => resultOrder(left) - resultOrder(right)),
    [result]
  );
  const hasFormErrors = Object.values(errors).some(Boolean);

  function updateField(field: CanonicalLabelField, value: string) {
    setApplicationData((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function updateImage(file: File | null) {
    setImage(file);
    setErrors((current) => {
      const next = { ...current };
      delete next.image;
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateForm(applicationData, image);
    setErrors(nextErrors);
    setSubmitError(null);

    if (Object.keys(nextErrors).length > 0 || !image) {
      setResult(null);
      return;
    }

    setIsSubmitting(true);
    try {
      const verificationResult = await verifyLabel(image, applicationData);
      setResult(verificationResult);
      window.requestAnimationFrame(() => resultRef.current?.focus());
    } catch (error) {
      setResult(null);
      setSubmitError(errorMessageFor(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="tool-layout" aria-labelledby="page-title">
        <div className="page-heading">
          <p className="phase-label">Single Label Check</p>
          <h1 id="page-title">TTB Label Verification</h1>
        </div>

        {result && (
          <section
            className={`result-panel result-panel--${result.overall_verdict === "APPROVED" ? "approved" : "review"}`}
            aria-labelledby="result-title"
            ref={resultRef}
            tabIndex={-1}
          >
            <div className="result-summary">
              <p className="result-label">Result</p>
              <h2 id="result-title">{formatVerdict(result.overall_verdict)}</h2>
              {typeof result.latency_ms === "number" && (
                <p className="result-latency">Completed in {result.latency_ms} ms</p>
              )}
            </div>

            <div className="field-results" aria-label="Field results">
              {sortedResults?.map((fieldResult) => (
                <article
                  className={`field-result field-result--${fieldResult.status.toLowerCase()}`}
                  key={fieldResult.field}
                >
                  <div className="field-result__topline">
                    <h3>{fieldLabel(fieldResult.field)}</h3>
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
          </section>
        )}

        <form className="verification-form" onSubmit={handleSubmit} noValidate>
          <section className="form-section" aria-labelledby="image-title">
            <h2 id="image-title">Label Image</h2>
            <label className="file-picker" htmlFor="label-image">
              <span className="file-picker__action">Choose Image</span>
              <span className="file-picker__text">
                {image ? `${image.name} (${formatFileSize(image.size)})` : "No image chosen"}
              </span>
            </label>
            <input
              accept="image/jpeg,image/png,image/webp"
              aria-describedby={errors.image ? "image-error" : undefined}
              aria-invalid={Boolean(errors.image)}
              className="file-input"
              id="label-image"
              name="image"
              onChange={(event) => updateImage(event.target.files?.[0] ?? null)}
              type="file"
            />
            {errors.image && (
              <p className="field-error" id="image-error">
                {errors.image}
              </p>
            )}
          </section>

          <section className="form-section" aria-labelledby="fields-title">
            <h2 id="fields-title">Application Fields</h2>
            <div className="field-grid">
              {FIELD_CONFIGS.map((field) => {
                const inputId = `field-${field.name}`;
                const errorId = `${inputId}-error`;
                const describedBy = errors[field.name] ? errorId : undefined;

                return (
                  <div
                    className={`form-field ${field.multiline ? "form-field--wide" : ""}`}
                    key={field.name}
                  >
                    <label htmlFor={inputId}>{field.label}</label>
                    {field.multiline ? (
                      <textarea
                        aria-describedby={describedBy}
                        aria-invalid={Boolean(errors[field.name])}
                        id={inputId}
                        name={field.name}
                        onChange={(event) => updateField(field.name, event.target.value)}
                        rows={5}
                        value={applicationData[field.name]}
                      />
                    ) : (
                      <input
                        aria-describedby={describedBy}
                        aria-invalid={Boolean(errors[field.name])}
                        id={inputId}
                        name={field.name}
                        onChange={(event) => updateField(field.name, event.target.value)}
                        type="text"
                        value={applicationData[field.name]}
                      />
                    )}
                    {errors[field.name] && (
                      <p className="field-error" id={errorId}>
                        {errors[field.name]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {submitError && (
            <div className="error-panel" role="alert">
              <strong>Could not check this label.</strong>
              <p>{submitError}</p>
            </div>
          )}

          {hasFormErrors && (
            <div className="error-panel" role="alert">
              <strong>Please fix the highlighted items.</strong>
              <p>Choose one image and complete each application field before checking the label.</p>
            </div>
          )}

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Checking Label..." : "Verify Label"}
          </button>

          {isSubmitting && (
            <p className="loading-message" role="status">
              Checking the label now.
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
