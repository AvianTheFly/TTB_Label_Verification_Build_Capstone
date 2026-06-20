import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  VerificationApiError,
  compareExtractedData,
  verifyBatch,
  verifyLabel
} from "../../api/verification";
import type {
  CanonicalLabelField,
  FieldResult,
  VerificationResult
} from "../../types/api";
import { FIELD_CONFIGS, resultOrder } from "../labelFields";
import {
  ApplicationPackageRecord,
  PackageValidationError,
  VisibleStatus,
  allFieldsPass,
  buildReviewedResultsExport,
  emptyExtractedData,
  extractedDataFromResult,
  hasFailingFields,
  parseApplicationPackages,
  statusSortRank,
  statusFromResult
} from "./packageWorkflowUtils";

function errorMessageFor(error: unknown): string {
  if (error instanceof VerificationApiError) {
    return error.message;
  }

  return "The verification service could not check these applications. Please try again.";
}

function sortedResults(result: VerificationResult | null): FieldResult[] {
  return result?.results.slice().sort((left, right) => resultOrder(left) - resultOrder(right)) ?? [];
}

function createPreviewUrl(file: File): string {
  if (typeof URL.createObjectURL === "function") {
    return URL.createObjectURL(file);
  }

  return "";
}

function revokePreviewUrl(url: string) {
  if (url && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
}

export function PackageWorkflow() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const recordsRef = useRef<ApplicationPackageRecord[]>([]);
  const uploadedFilesRef = useRef<File[]>([]);
  const compareTimerRef = useRef<number | null>(null);
  const [records, setRecords] = useState<ApplicationPackageRecord[]>([]);
  const [validationErrors, setValidationErrors] = useState<PackageValidationError[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isRechecking, setIsRechecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [recheckError, setRecheckError] = useState<string | null>(null);

  const selectedRecord = records.find((record) => record.package_id === selectedPackageId) ?? null;
  const sortedRecords = useMemo(
    () =>
      records
        .slice()
        .sort(
          (left, right) =>
            statusSortRank(left.status) - statusSortRank(right.status) ||
            left.package_id.localeCompare(right.package_id)
        ),
    [records]
  );
  const selectedCanFail = selectedRecord ? hasFailingFields(selectedRecord) : false;
  const selectedCanPass = selectedRecord ? allFieldsPass(selectedRecord) : false;

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(
    () => () => {
      if (compareTimerRef.current !== null) {
        window.clearTimeout(compareTimerRef.current);
      }
      for (const record of recordsRef.current) {
        revokePreviewUrl(record.image_preview_url);
      }
    },
    []
  );

  async function importFiles(fileList: FileList | File[]) {
    const files = mergeFilesByName(uploadedFilesRef.current, Array.from(fileList));
    uploadedFilesRef.current = files;

    const parsed = await parseApplicationPackages(files);
    const currentRecords = recordsRef.current;
    const currentByKey = new Map(currentRecords.map((record) => [recordKey(record), record]));
    const recordsToCheck: ApplicationPackageRecord[] = [];
    const nextRecords = parsed.records.map((record) => {
      const existing = currentByKey.get(recordKey(record));
      if (existing) {
        return {
          ...existing,
          image_file: record.image_file,
          application_data: record.application_data,
          json_filename: record.json_filename,
          image_filename: record.image_filename
        };
      }

      const nextRecord = {
        ...record,
        image_preview_url: createPreviewUrl(record.image_file)
      };
      recordsToCheck.push(nextRecord);
      return nextRecord;
    });

    for (const record of currentRecords) {
      if (!nextRecords.some((nextRecord) => nextRecord.image_preview_url === record.image_preview_url)) {
        revokePreviewUrl(record.image_preview_url);
      }
    }

    setRecords(nextRecords);
    setValidationErrors(parsed.errors);
    setSelectedPackageId((current) =>
      current && nextRecords.some((record) => record.package_id === current) ? current : null
    );
    setCheckError(null);
    setRecheckError(null);

    void checkApplications(recordsToCheck);
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      void importFiles(event.target.files);
      event.target.value = "";
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void importFiles(event.dataTransfer.files);
  }

  async function checkApplications(recordsToCheck: ApplicationPackageRecord[]) {
    const validRecords = recordsToCheck.filter((record) => record.validation_errors.length === 0);
    if (validRecords.length === 0) {
      return;
    }

    setIsChecking(true);
    setCheckError(null);
    setRecheckError(null);

    try {
      if (validRecords.length === 1) {
        const record = validRecords[0];
        const result = await verifyLabel(record.image_file, record.application_data);
        updateRecordWithResult(record.package_id, result);
        return;
      }

      const batchResult = await verifyBatch(
        validRecords.map((record) => ({
          image: record.image_file,
          application_data: record.application_data
        }))
      );

      setRecords((current) =>
        current.map((record) => {
          const batchIndex = validRecords.findIndex(
            (validRecord) => validRecord.package_id === record.package_id
          );
          if (batchIndex < 0) {
            return record;
          }

          const item = batchResult.items.find((candidate) => candidate.index === batchIndex);
          if (!item) {
            return record;
          }

          if (item.result) {
            const extractedData = extractedDataFromResult(item.result);
            return {
              ...record,
              original_extracted_data: extractedData,
              reviewed_extracted_data: extractedData,
              comparison_result: item.result,
              status: statusFromResult(item.result),
              item_error: null
            };
          }

          return {
            ...record,
            comparison_result: null,
            status: "Needs Review",
            item_error: item.error?.message ?? "This application could not be checked."
          };
        })
      );
    } catch (error) {
      setCheckError(errorMessageFor(error));
    } finally {
      setIsChecking(false);
    }
  }

  function updateRecordWithResult(packageId: string, result: VerificationResult) {
    const extractedData = extractedDataFromResult(result);
    setRecords((current) =>
      current.map((record) =>
        record.package_id === packageId
          ? {
              ...record,
              original_extracted_data: record.original_extracted_data ?? extractedData,
              reviewed_extracted_data: extractedData,
              comparison_result: result,
              status: statusFromResult(result),
              item_error: null
            }
          : record
      )
    );
  }

  function openDetail(packageId: string) {
    setSelectedPackageId(packageId);
    window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
  }

  function closeDetail() {
    setSelectedPackageId(null);
  }

  function updateExtractedField(field: CanonicalLabelField, value: string) {
    if (!selectedRecord) {
      return;
    }

    const currentExtracted = selectedRecord.reviewed_extracted_data ?? emptyExtractedData();
    const nextExtracted = {
      ...currentExtracted,
      [field]: value
    };
    setRecords((current) =>
      current.map((record) =>
        record.package_id === selectedRecord.package_id
          ? {
              ...record,
              reviewed_extracted_data: nextExtracted
            }
          : record
      )
    );
    scheduleCompare(selectedRecord.package_id, selectedRecord.application_data, nextExtracted);
  }

  function scheduleCompare(
    packageId: string,
    applicationData: ApplicationPackageRecord["application_data"],
    extractedData: ApplicationPackageRecord["reviewed_extracted_data"]
  ) {
    if (compareTimerRef.current !== null) {
      window.clearTimeout(compareTimerRef.current);
    }

    compareTimerRef.current = window.setTimeout(() => {
      void recheckExtractedText(packageId, applicationData, extractedData ?? emptyExtractedData());
    }, 350);
  }

  async function recheckExtractedText(
    packageId: string,
    applicationData: ApplicationPackageRecord["application_data"],
    extractedData: ApplicationPackageRecord["reviewed_extracted_data"]
  ) {
    setIsRechecking(true);
    setRecheckError(null);
    try {
      const result = await compareExtractedData(applicationData, extractedData ?? emptyExtractedData());
      setRecords((current) =>
        current.map((record) =>
          record.package_id === packageId
            ? {
                ...record,
                reviewed_extracted_data: extractedData ?? emptyExtractedData(),
                comparison_result: result,
                status: statusFromResult(result),
                item_error: null
              }
            : record
        )
      );
    } catch (error) {
      setRecheckError(errorMessageFor(error));
    } finally {
      setIsRechecking(false);
    }
  }

  function setRecordStatus(packageId: string, status: VisibleStatus) {
    setRecords((current) =>
      current.map((record) => (record.package_id === packageId ? { ...record, status } : record))
    );
    closeDetail();
  }

  function revertExtractedData(record: ApplicationPackageRecord) {
    const revertedData = record.original_extracted_data ?? emptyExtractedData();
    setRecords((current) =>
      current.map((candidate) =>
        candidate.package_id === record.package_id
          ? {
              ...candidate,
              reviewed_extracted_data: revertedData
            }
          : candidate
      )
    );
    scheduleCompare(record.package_id, record.application_data, revertedData);
  }

  function downloadReviewedResults() {
    const payload = buildReviewedResultsExport(records);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "reviewed-results.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <section className="tool-layout package-workflow" aria-labelledby="package-title">
        <div className="page-heading">
          <p className="phase-label">Application Package Check</p>
          <h1 id="package-title">TTB Label Verification</h1>
        </div>

        <div
          aria-label="Application package upload"
          className={`package-dropzone ${isDragging ? "package-dropzone--active" : ""}`}
          data-testid="package-upload-area"
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div>
            <h2>Drop Application Packages</h2>
            <p>JSON and label image files</p>
          </div>
          <button
            className="secondary-button"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            Choose Files
          </button>
          <input
            accept=".json,application/json,image/jpeg,image/png,image/webp"
            className="file-input"
            multiple
            onChange={handleFileInputChange}
            ref={fileInputRef}
            type="file"
          />
        </div>

        {validationErrors.length > 0 && (
          <section className="error-panel package-errors" aria-label="Validation errors">
            <strong>Some files need attention.</strong>
            <ul>
              {validationErrors.map((error, index) => (
                <li key={`${error.code}-${error.filename}-${index}`}>{error.message}</li>
              ))}
            </ul>
          </section>
        )}

        {checkError && (
          <div className="error-panel" role="alert">
            <strong>Could not check applications.</strong>
            <p>{checkError}</p>
          </div>
        )}

        <div className="package-actions package-actions--export">
          {isChecking && <p className="loading-message">Checking uploaded applications...</p>}
          <button
            className="secondary-button"
            disabled={records.length === 0}
            onClick={downloadReviewedResults}
            type="button"
          >
            Submit
          </button>
        </div>

        <section className="applications-section" aria-labelledby="applications-title">
          <div className="section-rule">
            <h2 id="applications-title">Applications</h2>
          </div>
          <div className="package-grid" aria-label="Uploaded applications">
          {records.length === 0 ? (
            <div className="empty-state">
              <h2>No Applications Loaded</h2>
              <p>Choose JSON and image files to begin.</p>
            </div>
          ) : (
            sortedRecords.map((record) => (
              <article
                className={`package-card package-card--${cardStatusClass(record.status)}`}
                key={record.package_id}
              >
                <button
                  className="package-card__button"
                  onClick={() => openDetail(record.package_id)}
                  type="button"
                >
                  {record.image_preview_url ? (
                    <img alt="" className="package-card__thumbnail" src={record.image_preview_url} />
                  ) : (
                    <span className="package-card__thumbnail package-card__thumbnail--blank" />
                  )}
                  <span className="package-card__body">
                    <strong>{record.application_data.brand_name}</strong>
                    <span className="status-chip">{record.status}</span>
                    {record.item_error && <span className="package-card__error">{record.item_error}</span>}
                  </span>
                </button>
              </article>
            ))
          )}
          </div>
        </section>

        {selectedRecord && (
          <div
            className="detail-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeDetail();
              }
            }}
            role="presentation"
          >
          <section
            aria-labelledby="detail-title"
            aria-modal="true"
            className="detail-panel"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="detail-panel__header">
              <button
                aria-label="Close detail view"
                className="detail-close-button"
                onClick={closeDetail}
                type="button"
              >
                X
              </button>
              <div className="detail-title-group">
                <div>
                  <p className="result-label">Application #</p>
                  <p className="detail-application-id">{applicationNumber(selectedRecord.package_id)}</p>
                </div>
                <div>
                  <p className="result-label">Brand Name</p>
                  <h2 id="detail-title" ref={detailHeadingRef} tabIndex={-1}>
                    {selectedRecord.application_data.brand_name}
                  </h2>
                </div>
              </div>
              <span className={`status-chip status-chip--large status-chip--${cardStatusClass(selectedRecord.status)}`}>
                {selectedRecord.status}
              </span>
            </div>

            <div className="review-actions review-actions--top" aria-label="Review decision">
              <button
                className="decision-button decision-button--fail"
                disabled={!selectedCanFail}
                onClick={() => setRecordStatus(selectedRecord.package_id, "Fail")}
                type="button"
              >
                FAIL
              </button>
              <button
                className="decision-button decision-button--review"
                onClick={() => setRecordStatus(selectedRecord.package_id, "Needs Review")}
                type="button"
              >
                NEEDS REVIEW
              </button>
              <button
                className="decision-button decision-button--pass"
                disabled={!selectedCanPass}
                onClick={() => setRecordStatus(selectedRecord.package_id, "Passed")}
                type="button"
              >
                PASS
              </button>
            </div>

            <div className="detail-layout">
              <div className="detail-image-frame">
                {selectedRecord.image_preview_url && (
                  <img
                    alt={`Label image for ${selectedRecord.application_data.brand_name}`}
                    src={selectedRecord.image_preview_url}
                  />
                )}
              </div>

              <div className="detail-fields">
                <DataPanel
                  onChange={updateExtractedField}
                  onRevert={() => revertExtractedData(selectedRecord)}
                  record={selectedRecord}
                />
              </div>
            </div>

            {recheckError && (
              <div className="error-panel" role="alert">
                <strong>Could not recheck extracted text.</strong>
                <p>{recheckError}</p>
              </div>
            )}

            {isRechecking && <p className="loading-message">Rechecking extracted text...</p>}

            <div className="review-actions" aria-label="Review decision">
              <button
                className="decision-button decision-button--fail"
                disabled={!selectedCanFail}
                onClick={() => setRecordStatus(selectedRecord.package_id, "Fail")}
                type="button"
              >
                FAIL
              </button>
              <button
                className="decision-button decision-button--review"
                onClick={() => setRecordStatus(selectedRecord.package_id, "Needs Review")}
                type="button"
              >
                NEEDS REVIEW
              </button>
              <button
                className="decision-button decision-button--pass"
                disabled={!selectedCanPass}
                onClick={() => setRecordStatus(selectedRecord.package_id, "Passed")}
                type="button"
              >
                PASS
              </button>
            </div>
          </section>
          </div>
        )}
      </section>
    </main>
  );
}

interface DataPanelProps {
  onRevert: () => void;
  record: ApplicationPackageRecord;
  onChange: (field: CanonicalLabelField, value: string) => void;
}

function DataPanel({ onRevert, record, onChange }: DataPanelProps) {
  const extractedData = record.reviewed_extracted_data ?? emptyExtractedData();
  const fieldResults = new Map(sortedResults(record.comparison_result).map((result) => [result.field, result]));
  const hoverTimerRef = useRef<number | null>(null);
  const [hoveredField, setHoveredField] = useState<CanonicalLabelField | null>(null);
  const [pinnedFields, setPinnedFields] = useState<Set<CanonicalLabelField>>(() => new Set());

  useEffect(
    () => () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    },
    []
  );

  function scheduleFieldHover(field: CanonicalLabelField) {
    if (pinnedFields.has(field)) {
      return;
    }
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = window.setTimeout(() => setHoveredField(field), 1000);
  }

  function clearFieldHover(field: CanonicalLabelField) {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (!pinnedFields.has(field) && hoveredField === field) {
      setHoveredField(null);
    }
  }

  function togglePinnedField(field: CanonicalLabelField) {
    setPinnedFields((current) => {
      const next = new Set(current);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
    setHoveredField(null);
  }

  return (
    <section className="data-panel" aria-labelledby="data-title">
      <div className="data-panel__header">
        <h3 id="data-title">Data</h3>
        <button className="secondary-button" onClick={onRevert} type="button">
          Revert back to AI extracted values
        </button>
      </div>
      <div className="data-grid">
        {FIELD_CONFIGS.map((field) => {
          const applicationId = `application-${field.name}`;
          const extractedId = `extracted-${field.name}`;
          const fieldResult = fieldResults.get(field.name);
          const extractedValue = extractedData[field.name] ?? "";
          const statusLabel = fieldResult
            ? fieldResult.status === "PASS"
              ? "PASS"
              : record.status === "Fail"
                ? "FAIL"
                : "Needs Review"
            : "Pending Check";
          const isExpanded = pinnedFields.has(field.name) || hoveredField === field.name;

          return (
            <div
              className={`data-row data-row--${fieldResult?.status.toLowerCase() ?? "pending"} ${isExpanded ? "data-row--expanded" : ""}`}
              key={field.name}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("input, textarea, button")) {
                  return;
                }
                togglePinnedField(field.name);
              }}
              onMouseEnter={() => scheduleFieldHover(field.name)}
              onMouseLeave={() => clearFieldHover(field.name)}
            >
              <div className="data-row__heading">
                <h4>{field.label}</h4>
                <span className="field-status">{statusLabel}</span>
              </div>
              <div className="data-pair">
                <div className="data-value-group">
                  <span className="data-value-label">Application:</span>
                  <p
                    aria-label={`Application Value ${field.label}`}
                    className="application-value-text"
                    id={applicationId}
                  >
                    {record.application_data[field.name]}
                  </p>
                </div>
                <div className="data-value-group">
                  <label htmlFor={extractedId}>Actual:</label>
                  <input
                    aria-label={`Extracted Value ${field.label}`}
                    id={extractedId}
                    name={field.name}
                    onChange={(event) => onChange(field.name, event.target.value)}
                    type="text"
                    value={extractedValue}
                  />
                </div>
              </div>
              {fieldResult && <p className="data-row__message">{fieldResult.message}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function mergeFilesByName(currentFiles: File[], incomingFiles: File[]): File[] {
  const filesByName = new Map(currentFiles.map((file) => [file.name, file]));
  for (const file of incomingFiles) {
    filesByName.set(file.name, file);
  }

  return Array.from(filesByName.values());
}

function recordKey(record: Pick<ApplicationPackageRecord, "json_filename" | "image_filename">): string {
  return `${record.json_filename}|${record.image_filename}`;
}

function cardStatusClass(status: VisibleStatus): string {
  if (status === "Passed") {
    return "passed";
  }
  if (status === "Fail") {
    return "fail";
  }
  if (status === "Needs Review") {
    return "review";
  }
  return "pending";
}

function applicationNumber(packageId: string): string {
  return packageId.replace(/^application-/, "");
}
