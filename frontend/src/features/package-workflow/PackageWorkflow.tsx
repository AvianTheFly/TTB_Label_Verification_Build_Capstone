import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";

import {
  VerificationApiError,
  compareExtractedData,
  verifyBatch,
  verifyLabel
} from "../../api/verification";
import type { RealVisionSettings } from "../../api/verification";
import type {
  CanonicalLabelField,
  FieldReviewDecision,
  FieldResult,
  VerificationResult
} from "../../types/api";
import { FIELD_CONFIGS, resultOrder } from "../labelFields";
import {
  ApplicationPackageRecord,
  IncompleteApplicationRecord,
  PackageValidationError,
  VisibleStatus,
  buildPretendSubmissionZip,
  emptyExtractedData,
  extractedDataFromResult,
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

type IncompleteFilter = "json" | "image";
type AbvOperator = "any" | "lt" | "eq" | "gt";
type ReviewOverrideAction = "fail" | "pass";

interface ReviewOverrideWarning {
  action: ReviewOverrideAction;
  confirmLabel: string;
  groups: Array<{ fields: string[]; label: string }>;
  packageId: string;
  title: string;
}

interface OpenAiSettings {
  apiKey: string;
  model: string;
}

interface OpenAiDraft {
  apiKey: string;
  model: string;
}

interface AdvancedSearchFilters {
  abvOperator: AbvOperator;
  abvValue: string;
  brandName: string;
  classType: string;
  countryOfOrigin: string;
  governmentWarning: string;
  netContents: string;
  producer: string;
}

const VISIBLE_STATUSES: VisibleStatus[] = ["Pending Check", "Passed", "Needs Review", "Fail"];
const FIELD_DECISIONS: FieldReviewDecision[] = ["fail", "review", "pass"];

function matchesApplicationSearch(
  record: ApplicationPackageRecord,
  searchTerm: string,
  statusFilters: Record<VisibleStatus, boolean>,
  advancedFilters: AdvancedSearchFilters
): boolean {
  if (!statusFilters[record.status]) {
    return false;
  }

  if (!matchesAdvancedApplicationFilters(record, advancedFilters)) {
    return false;
  }

  const normalizedSearch = normalizeSearchTerm(searchTerm);
  if (!normalizedSearch) {
    return true;
  }

  return [
    record.package_id,
    record.json_filename,
    record.image_filename,
    record.status,
    record.item_error ?? "",
    ...Object.values(record.application_data),
    ...Object.values(record.reviewed_extracted_data ?? {})
  ].some((value) => normalizeSearchTerm(value ?? "").includes(normalizedSearch));
}

function matchesIncompleteSearch(
  record: IncompleteApplicationRecord,
  searchTerm: string,
  incompleteFilters: Record<IncompleteFilter, boolean>
): boolean {
  const filterKey = incompleteFilterKey(record);
  if (!incompleteFilters[filterKey]) {
    return false;
  }

  const normalizedSearch = normalizeSearchTerm(searchTerm);
  if (!normalizedSearch) {
    return true;
  }

  return [
    record.incomplete_id,
    record.json_filename ?? "",
    record.image_filename ?? "",
    record.expected_image_filename ?? "",
    record.message
  ].some((value) => normalizeSearchTerm(value).includes(normalizedSearch));
}

function normalizeSearchTerm(value: string): string {
  return value.trim().toLowerCase();
}

function allStatusFilters(): Record<VisibleStatus, boolean> {
  return {
    "Pending Check": true,
    Passed: true,
    "Needs Review": true,
    Fail: true
  };
}

function allIncompleteFilters(): Record<IncompleteFilter, boolean> {
  return {
    json: true,
    image: true
  };
}

function incompleteFilterKey(record: IncompleteApplicationRecord): IncompleteFilter {
  return record.kind === "json_missing_image" ? "json" : "image";
}

function matchesAdvancedApplicationFilters(record: ApplicationPackageRecord, filters: AdvancedSearchFilters): boolean {
  const data = record.application_data;
  if (!textIncludes(data.brand_name, filters.brandName)) {
    return false;
  }
  if (!textIncludes(data.class_type, filters.classType)) {
    return false;
  }
  if (!textIncludes(data.net_contents, filters.netContents)) {
    return false;
  }
  if (!textIncludes(data.producer, filters.producer)) {
    return false;
  }
  if (!textIncludes(data.country_of_origin, filters.countryOfOrigin)) {
    return false;
  }
  if (!textIncludes(data.government_warning, filters.governmentWarning)) {
    return false;
  }
  return matchesAbvFilter(data.abv, filters.abvOperator, filters.abvValue);
}

function textIncludes(value: string, filter: string): boolean {
  const normalizedFilter = normalizeSearchTerm(filter);
  return !normalizedFilter || normalizeSearchTerm(value).includes(normalizedFilter);
}

function matchesAbvFilter(value: string, operator: AbvOperator, filterValue: string): boolean {
  if (operator === "any" || !filterValue.trim()) {
    return true;
  }

  const recordAbv = parseAbv(value);
  const targetAbv = parseAbv(filterValue);
  if (recordAbv === null || targetAbv === null) {
    return false;
  }

  if (operator === "lt") {
    return recordAbv < targetAbv;
  }
  if (operator === "gt") {
    return recordAbv > targetAbv;
  }
  return Math.abs(recordAbv - targetAbv) < 0.001;
}

function parseAbv(value: string): number | null {
  const match = value.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function PackageWorkflow() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const recordsRef = useRef<ApplicationPackageRecord[]>([]);
  const incompleteRecordsRef = useRef<IncompleteApplicationRecord[]>([]);
  const uploadedFilesRef = useRef<File[]>([]);
  const dragDepthRef = useRef(0);
  const [records, setRecords] = useState<ApplicationPackageRecord[]>([]);
  const [incompleteRecords, setIncompleteRecords] = useState<IncompleteApplicationRecord[]>([]);
  const [validationErrors, setValidationErrors] = useState<PackageValidationError[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [useOpenAiKey, setUseOpenAiKey] = useState(false);
  const [isOpenAiDialogOpen, setIsOpenAiDialogOpen] = useState(false);
  const [openAiDraft, setOpenAiDraft] = useState<OpenAiDraft>({ apiKey: "", model: "gpt-4.1-mini" });
  const [openAiSettings, setOpenAiSettings] = useState<OpenAiSettings | null>(null);
  const [openAiDialogError, setOpenAiDialogError] = useState<string | null>(null);
  const [reviewOverrideWarning, setReviewOverrideWarning] = useState<ReviewOverrideWarning | null>(null);
  const [isSubmitWarningOpen, setIsSubmitWarningOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
  const [statusFilters, setStatusFilters] = useState<Record<VisibleStatus, boolean>>({
    "Pending Check": true,
    Passed: true,
    "Needs Review": true,
    Fail: true
  });
  const [incompleteFilters, setIncompleteFilters] = useState<Record<IncompleteFilter, boolean>>({
    json: true,
    image: true
  });
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedSearchFilters>({
    abvOperator: "any",
    abvValue: "",
    brandName: "",
    classType: "",
    countryOfOrigin: "",
    governmentWarning: "",
    netContents: "",
    producer: ""
  });

  const selectedRecord = records.find((record) => record.package_id === selectedPackageId) ?? null;
  const searchMatchedRecords = useMemo(
    () => records.filter((record) => matchesApplicationSearch(record, searchTerm, allStatusFilters(), advancedFilters)),
    [records, searchTerm, advancedFilters]
  );
  const searchMatchedIncompleteRecords = useMemo(
    () => incompleteRecords.filter((record) => matchesIncompleteSearch(record, searchTerm, allIncompleteFilters())),
    [incompleteRecords, searchTerm]
  );
  const filteredRecords = useMemo(
    () => searchMatchedRecords.filter((record) => statusFilters[record.status]),
    [searchMatchedRecords, statusFilters]
  );
  const filteredIncompleteRecords = useMemo(
    () => searchMatchedIncompleteRecords.filter((record) => incompleteFilters[incompleteFilterKey(record)]),
    [searchMatchedIncompleteRecords, incompleteFilters]
  );
  const applicationSummary = summarizeApplications(searchMatchedRecords);
  const incompleteSummary = summarizeIncompleteApplications(searchMatchedIncompleteRecords);
  const sortedRecords = useMemo(
    () =>
      filteredRecords
        .slice()
        .sort(
          (left, right) =>
            statusSortRank(left.status) - statusSortRank(right.status) ||
            left.package_id.localeCompare(right.package_id)
        ),
    [filteredRecords]
  );
  const selectedCanFail = selectedRecord ? canMarkApplicationFail(selectedRecord) : false;
  const selectedCanPass = selectedRecord ? canMarkApplicationPass(selectedRecord) : false;

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    incompleteRecordsRef.current = incompleteRecords;
  }, [incompleteRecords]);

  useEffect(
    () => () => {
      for (const record of recordsRef.current) {
        revokePreviewUrl(record.image_preview_url);
      }
      for (const record of incompleteRecordsRef.current) {
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
    const currentIncompleteRecords = incompleteRecordsRef.current;
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
    const nextIncompleteRecords = parsed.incomplete_records.map((record) => ({
      ...record,
      image_preview_url: record.image_file ? createPreviewUrl(record.image_file) : ""
    }));

    for (const record of currentRecords) {
      if (!nextRecords.some((nextRecord) => nextRecord.image_preview_url === record.image_preview_url)) {
        revokePreviewUrl(record.image_preview_url);
      }
    }
    for (const record of currentIncompleteRecords) {
      revokePreviewUrl(record.image_preview_url);
    }

    setRecords(nextRecords);
    setIncompleteRecords(nextIncompleteRecords);
    setValidationErrors(parsed.errors);
    setSelectedPackageId((current) =>
      current && nextRecords.some((record) => record.package_id === current) ? current : null
    );
    setCheckError(null);

    void checkApplications(recordsToCheck);
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      void importFiles(event.target.files);
      event.target.value = "";
    }
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    void importFiles(event.dataTransfer.files);
  }

  async function checkApplications(
    recordsToCheck: ApplicationPackageRecord[],
    submittedRealVisionSettings?: RealVisionSettings
  ) {
    const validRecords = recordsToCheck.filter((record) => record.validation_errors.length === 0);
    if (validRecords.length === 0) {
      return;
    }

    setIsChecking(true);
    setCheckError(null);

    try {
      if (validRecords.length === 1) {
        const record = validRecords[0];
        const result = await verifyLabel(
          record.image_file,
          record.application_data,
          submittedRealVisionSettings ?? realVisionSettings()
        );
        updateRecordWithResult(record.package_id, result);
        return;
      }

      const batchResult = await verifyBatch(
        validRecords.map((record) => ({
          image: record.image_file,
          application_data: record.application_data
        })),
        submittedRealVisionSettings ?? realVisionSettings()
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
              field_decisions: {},
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
              field_decisions: {},
              status: statusFromResult(result),
              item_error: null
            }
          : record
      )
    );
  }

  function openDetail(packageId: string) {
    setSelectedPackageId(packageId);
  }

  function closeDetail() {
    setSelectedPackageId(null);
  }

  function handlePassClick(record: ApplicationPackageRecord) {
    if (canMarkApplicationPass(record)) {
      setRecordStatus(record.package_id, "Passed");
      return;
    }

    setReviewOverrideWarning(buildReviewOverrideWarning(record, "pass"));
  }

  function handleFailClick(record: ApplicationPackageRecord) {
    if (canMarkApplicationFail(record)) {
      void markApplicationFailed(record.package_id);
      return;
    }

    setReviewOverrideWarning(buildReviewOverrideWarning(record, "fail"));
  }

  function confirmReviewOverride() {
    if (!reviewOverrideWarning) {
      return;
    }

    if (reviewOverrideWarning.action === "pass") {
      setRecordStatus(reviewOverrideWarning.packageId, "Passed");
    } else {
      setRecordStatus(reviewOverrideWarning.packageId, "Fail");
    }
    setReviewOverrideWarning(null);
  }

  function handleOpenAiToggleChange(checked: boolean) {
    if (checked) {
      setOpenAiDialogError(null);
      setIsOpenAiDialogOpen(true);
      return;
    }

    setUseOpenAiKey(false);
    setOpenAiSettings(null);
    setOpenAiDialogError(null);
  }

  function proceedWithOpenAiSettings() {
    const apiKey = openAiDraft.apiKey.trim();
    const model = openAiDraft.model.trim() || "gpt-4.1-mini";

    if (!apiKey) {
      setOpenAiDialogError("Enter an OpenAI API key before using the real AI vision service.");
      return;
    }

    const nextSettings = { apiKey, model };
    setOpenAiSettings(nextSettings);
    setOpenAiDraft({ apiKey: "", model });
    setUseOpenAiKey(true);
    setIsOpenAiDialogOpen(false);
    setOpenAiDialogError(null);
    void checkApplications(recordsRef.current, nextSettings);
  }

  function cancelOpenAiSettings() {
    setIsOpenAiDialogOpen(false);
    setOpenAiDialogError(null);
  }

  function realVisionSettings(): RealVisionSettings | undefined {
    if (!useOpenAiKey || !openAiSettings) {
      return undefined;
    }

    return {
      apiKey: openAiSettings.apiKey,
      model: openAiSettings.model
    };
  }

  function setRecordStatus(packageId: string, status: VisibleStatus) {
    setRecords((current) =>
      current.map((record) => (record.package_id === packageId ? { ...record, status } : record))
    );
    closeDetail();
  }

  async function setFieldDecision(
    packageId: string,
    field: CanonicalLabelField,
    decision: FieldReviewDecision
  ) {
    const record = recordsRef.current.find((candidate) => candidate.package_id === packageId);
    if (!record) {
      return;
    }

    const fieldDecisions = {
      ...record.field_decisions,
      [field]: decision
    };
    await applyBackendFieldDecisions(record, fieldDecisions);
  }

  async function applyBackendFieldDecisions(
    record: ApplicationPackageRecord,
    fieldDecisions: ApplicationPackageRecord["field_decisions"]
  ) {
    setCheckError(null);
    try {
      const result = await compareExtractedData(
        record.application_data,
        record.reviewed_extracted_data ?? emptyExtractedData(),
        fieldDecisions
      );
      setRecords((current) =>
        current.map((candidate) =>
          candidate.package_id === record.package_id
            ? {
                ...candidate,
                field_decisions: fieldDecisions,
                comparison_result: result,
                status: statusFromFieldDecisions(
                  { ...candidate, comparison_result: result },
                  fieldDecisions
                ),
                item_error: null
              }
            : candidate
        )
      );
    } catch (error) {
      setCheckError(errorMessageFor(error));
    }
  }

  async function markApplicationFailed(packageId: string) {
    const record = recordsRef.current.find((candidate) => candidate.package_id === packageId);
    if (!record) {
      return;
    }

    const fieldDecisions = promoteReviewFieldsToFail(record);
    await applyBackendFieldDecisions(record, fieldDecisions);
    closeDetail();
  }

  async function downloadPretendSubmission() {
    const archive = await buildPretendSubmissionZip(records, incompleteRecords);
    const url = URL.createObjectURL(archive);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pretend-submission.zip";
    link.click();
    URL.revokeObjectURL(url);
  }

  function proceedWithoutDownload() {
    setIsSubmitWarningOpen(false);
  }

  async function proceedWithDownload() {
    await downloadPretendSubmission();
    setIsSubmitWarningOpen(false);
  }

  function downloadDemoData() {
    const link = document.createElement("a");
    link.href = `${import.meta.env.BASE_URL}demo-data/${DEMO_DATA_ARCHIVE_FILENAME}`;
    link.download = DEMO_DATA_ARCHIVE_FILENAME;
    link.click();
  }

  function toggleStatusFilter(status: VisibleStatus | "total") {
    setStatusFilters((current) => {
      if (status === "total") {
        const allActive = VISIBLE_STATUSES.every((candidate) => current[candidate]);
        return {
          "Pending Check": !allActive,
          Passed: !allActive,
          "Needs Review": !allActive,
          Fail: !allActive
        };
      }

      if (VISIBLE_STATUSES.every((candidate) => current[candidate])) {
        return {
          "Pending Check": status === "Pending Check",
          Passed: status === "Passed",
          "Needs Review": status === "Needs Review",
          Fail: status === "Fail"
        };
      }

      return {
        ...current,
        [status]: !current[status]
      };
    });
  }

  function toggleIncompleteFilter(filter: IncompleteFilter | "total") {
    setIncompleteFilters((current) => {
      if (filter === "total") {
        const allActive = current.json && current.image;
        return {
          image: !allActive,
          json: !allActive
        };
      }

      if (current.json && current.image) {
        return {
          image: filter === "image",
          json: filter === "json"
        };
      }

      return {
        ...current,
        [filter]: !current[filter]
      };
    });
  }

  function updateAdvancedFilter<Key extends keyof AdvancedSearchFilters>(
    key: Key,
    value: AdvancedSearchFilters[Key]
  ) {
    setAdvancedFilters((current) => ({
      ...current,
      [key]: value
    }));
  }

  return (
    <main className="app-shell">
      <section className="tool-layout package-workflow" aria-labelledby="package-title">
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
            <button className="secondary-button" onClick={downloadDemoData} type="button">
              Download Demo Data
            </button>
            <label className="openai-toggle">
              <input
                checked={useOpenAiKey}
                onChange={(event) => handleOpenAiToggleChange(event.target.checked)}
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
              disabled={records.length === 0 && incompleteRecords.length === 0}
              onClick={() => setIsSubmitWarningOpen(true)}
              type="button"
            >
              Submit
            </button>
          </div>
        </div>

        <div
          className={`package-drop-surface ${isDragging ? "package-drop-surface--active" : ""}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div
            aria-label="Application package upload"
            className={`package-dropzone ${isDragging ? "package-dropzone--active" : ""}`}
            data-testid="package-upload-area"
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

        <section className="search-panel" aria-label="Search applications">
          <label className="search-panel__field">
            <span>Search</span>
            <input
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Brand, application value, filename, or message"
              type="search"
              value={searchTerm}
            />
          </label>
          <button
            aria-expanded={isAdvancedSearchOpen}
            className="secondary-button"
            onClick={() => setIsAdvancedSearchOpen((isOpen) => !isOpen)}
            type="button"
          >
            Advanced Search
          </button>
          {isAdvancedSearchOpen && (
            <div className="advanced-search-panel">
              <label className="advanced-search-field">
                <span>Brand Name</span>
                <input
                  onChange={(event) => updateAdvancedFilter("brandName", event.target.value)}
                  type="text"
                  value={advancedFilters.brandName}
                />
              </label>
              <label className="advanced-search-field">
                <span>Class Type</span>
                <input
                  onChange={(event) => updateAdvancedFilter("classType", event.target.value)}
                  type="text"
                  value={advancedFilters.classType}
                />
              </label>
              <label className="advanced-search-field">
                <span>Alcohol Content %</span>
                <span className="advanced-search-field__pair">
                  <select
                    onChange={(event) => updateAdvancedFilter("abvOperator", event.target.value as AbvOperator)}
                    value={advancedFilters.abvOperator}
                  >
                    <option value="any">Any</option>
                    <option value="lt">Less than</option>
                    <option value="eq">Equal to</option>
                    <option value="gt">Greater than</option>
                  </select>
                  <input
                    inputMode="decimal"
                    onChange={(event) => updateAdvancedFilter("abvValue", event.target.value)}
                    placeholder="14"
                    type="text"
                    value={advancedFilters.abvValue}
                  />
                </span>
              </label>
              <label className="advanced-search-field">
                <span>Net Contents</span>
                <input
                  onChange={(event) => updateAdvancedFilter("netContents", event.target.value)}
                  type="text"
                  value={advancedFilters.netContents}
                />
              </label>
              <label className="advanced-search-field">
                <span>Producer</span>
                <input
                  onChange={(event) => updateAdvancedFilter("producer", event.target.value)}
                  type="text"
                  value={advancedFilters.producer}
                />
              </label>
              <label className="advanced-search-field">
                <span>Country of Origin</span>
                <input
                  onChange={(event) => updateAdvancedFilter("countryOfOrigin", event.target.value)}
                  type="text"
                  value={advancedFilters.countryOfOrigin}
                />
              </label>
              <label className="advanced-search-field advanced-search-field--wide">
                <span>Government Warning</span>
                <input
                  onChange={(event) => updateAdvancedFilter("governmentWarning", event.target.value)}
                  type="text"
                  value={advancedFilters.governmentWarning}
                />
              </label>
            </div>
          )}
        </section>

        <section className="applications-section" aria-labelledby="applications-title">
          <div className="section-rule">
            <h2 id="applications-title">Applications</h2>
            <SectionStats
              items={[
                {
                  active: VISIBLE_STATUSES.every((status) => statusFilters[status]),
                  filterKey: "total",
                  label: "total",
                  value: applicationSummary.total,
                  tone: "neutral"
                },
                {
                  active: statusFilters.Fail,
                  filterKey: "Fail",
                  label: "fail",
                  value: applicationSummary.fail,
                  tone: "fail"
                },
                {
                  active: statusFilters["Needs Review"],
                  filterKey: "Needs Review",
                  label: "needs review",
                  value: applicationSummary.needsReview,
                  tone: "review"
                },
                {
                  active: statusFilters.Passed,
                  filterKey: "Passed",
                  label: "passed",
                  value: applicationSummary.passed,
                  tone: "passed"
                }
              ]}
              onToggle={(filterKey) => toggleStatusFilter(filterKey as VisibleStatus | "total")}
            />
          </div>
          <div className="package-grid" aria-label="Uploaded applications">
          {filteredRecords.length === 0 ? (
            <div className="empty-state">
              <h2>{records.length === 0 ? "No Applications Loaded" : "No Matching Applications"}</h2>
              <p>{records.length === 0 ? "Choose JSON and image files to begin." : "Adjust search filters to show more applications."}</p>
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
                    <span className={`status-chip status-chip--${cardStatusClass(record.status)}`}>
                      {record.status}
                    </span>
                    {record.item_error && <span className="package-card__error">{record.item_error}</span>}
                  </span>
                </button>
              </article>
            ))
          )}
          </div>
        </section>

          <section
            className="applications-section applications-section--incomplete"
            aria-labelledby="incomplete-applications-title"
          >
            <div className="section-rule section-rule--incomplete">
              <h2 id="incomplete-applications-title">Incomplete Applications</h2>
              <SectionStats
                items={[
                  {
                    active: incompleteFilters.json && incompleteFilters.image,
                    filterKey: "total",
                    label: "total",
                    value: incompleteSummary.total,
                    tone: "neutral"
                  },
                  {
                    active: incompleteFilters.json,
                    filterKey: "json",
                    label: "json",
                    value: incompleteSummary.json,
                    tone: "review"
                  },
                  {
                    active: incompleteFilters.image,
                    filterKey: "image",
                    label: "images",
                    value: incompleteSummary.images,
                    tone: "pending"
                  }
                ]}
                onToggle={(filterKey) => toggleIncompleteFilter(filterKey as IncompleteFilter | "total")}
              />
            </div>
            <div className="package-grid" aria-label="Incomplete applications">
              {filteredIncompleteRecords.length === 0 ? (
                <div className="empty-state empty-state--compact">
                  <h2>
                    {incompleteRecords.length === 0 ? "No Incomplete Applications" : "No Matching Incomplete Applications"}
                  </h2>
                  <p>
                    {incompleteRecords.length === 0
                      ? "Unpaired JSON or image files will appear here."
                      : "Adjust search filters to show more incomplete items."}
                  </p>
                </div>
              ) : (
                filteredIncompleteRecords.map((record, index) => (
                  <article className="package-card package-card--incomplete" key={record.incomplete_id}>
                    <div className="package-card__button package-card__button--static">
                      {record.image_preview_url ? (
                        <img alt="" className="package-card__thumbnail" src={record.image_preview_url} />
                      ) : (
                        <span className="package-card__thumbnail package-card__thumbnail--blank" />
                      )}
                      <span className="package-card__body">
                        <strong>Incomplete Application {index + 1}</strong>
                        <span className="status-chip status-chip--pending">
                          {record.kind === "json_missing_image" ? "Missing Image" : "Missing Application Data"}
                        </span>
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

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
              <button
                aria-label={`Close detail view. Current status: ${selectedRecord.status}`}
                className={`status-chip status-chip--large status-chip--button status-chip--${cardStatusClass(selectedRecord.status)}`}
                onClick={closeDetail}
                type="button"
              >
                {selectedRecord.status}
              </button>
            </div>

            <div className="detail-layout">
              {selectedRecord.image_preview_url && (
                <ZoomableLabelImage
                  alt={`Label image for ${selectedRecord.application_data.brand_name}`}
                  src={selectedRecord.image_preview_url}
                />
              )}

              <div className="detail-fields">
                <DataPanel
                  onFieldDecision={setFieldDecision}
                  record={selectedRecord}
                />
              </div>
            </div>

            <div className="review-actions" aria-label="Review decision">
              <button
                aria-disabled={!selectedCanFail}
                className={`decision-button decision-button--fail ${selectedCanFail ? "" : "decision-button--disabled"}`}
                onClick={() => handleFailClick(selectedRecord)}
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
                aria-disabled={!selectedCanPass}
                className={`decision-button decision-button--pass ${selectedCanPass ? "" : "decision-button--disabled"}`}
                onClick={() => handlePassClick(selectedRecord)}
                type="button"
              >
                PASS
              </button>
            </div>
          </section>
          </div>
        )}

        {reviewOverrideWarning && (
          <div className="modal-scrim" role="presentation">
            <section
              aria-labelledby="review-warning-title"
              aria-modal="true"
              className="warning-dialog"
              role="dialog"
            >
              <div className="warning-dialog__marker">!</div>
              <div className="warning-dialog__content">
                <p className="result-label">Review override</p>
                <h2 id="review-warning-title">{reviewOverrideWarning.title}</h2>
                <p>
                  {reviewOverrideWarning.action === "pass"
                    ? "The application still has fields that are not marked as pass."
                    : "All fields are currently marked as pass."}
                </p>
                <div className="warning-dialog__field-list" aria-label="Affected fields">
                  {reviewOverrideWarning.groups.map((group) => (
                    <div className="warning-dialog__field-group" key={group.label}>
                      <strong>{group.label}</strong>
                      <span>{group.fields.join(", ")}</span>
                    </div>
                  ))}
                </div>
                <div className="dialog-actions">
                  <button
                    className="secondary-button"
                    onClick={() => setReviewOverrideWarning(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className={`decision-button decision-button--${reviewOverrideWarning.action}`}
                    onClick={confirmReviewOverride}
                    type="button"
                  >
                    {reviewOverrideWarning.confirmLabel}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {isSubmitWarningOpen && (
          <div className="modal-scrim" role="presentation">
            <section
              aria-labelledby="submit-warning-title"
              aria-modal="true"
              className="submit-warning-dialog"
              role="dialog"
            >
              <div className="warning-dialog__marker">!</div>
              <div className="warning-dialog__content">
                <p className="result-label">Pretend submission</p>
                <h2 id="submit-warning-title">This is the pretend submission.</h2>
                <p>
                  This will download the application documents with pass/fail attached.
                </p>
                <div className="dialog-actions dialog-actions--three">
                  <button
                    className="secondary-button"
                    onClick={() => setIsSubmitWarningOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="secondary-button"
                    onClick={proceedWithoutDownload}
                    type="button"
                  >
                    Proceed Without Download
                  </button>
                  <button
                    className="decision-button decision-button--pass"
                    onClick={() => void proceedWithDownload()}
                    type="button"
                  >
                    Proceed With Download
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {isOpenAiDialogOpen && (
          <div className="modal-scrim" role="presentation">
            <section
              aria-labelledby="openai-dialog-title"
              aria-modal="true"
              className="openai-key-panel"
              role="dialog"
            >
              <strong>WARNING: THIS USES REAL API CALLS</strong>
              <h2 id="openai-dialog-title">Use Real AI Vision</h2>
              <p>
                Enter the session settings for real vision mode. The backend confirms
                authentication when the first real vision request is sent.
              </p>
              <label>
                API Key
                <input
                  autoComplete="off"
                  onChange={(event) =>
                    setOpenAiDraft((current) => ({ ...current, apiKey: event.target.value }))
                  }
                  type="password"
                  value={openAiDraft.apiKey}
                />
              </label>
              <label>
                Model
                <input
                  onChange={(event) =>
                    setOpenAiDraft((current) => ({ ...current, model: event.target.value }))
                  }
                  placeholder="gpt-4.1-mini"
                  type="text"
                  value={openAiDraft.model}
                />
              </label>
              {openAiDialogError && <p className="dialog-error">{openAiDialogError}</p>}
              <div className="dialog-actions">
                <button className="secondary-button" onClick={cancelOpenAiSettings} type="button">
                  Cancel
                </button>
                <button className="decision-button decision-button--review" onClick={proceedWithOpenAiSettings} type="button">
                  Proceed
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

interface ZoomableLabelImageProps {
  alt: string;
  src: string;
}

function ZoomableLabelImage({ alt, src }: ZoomableLabelImageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const zoomPaneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    didDrag: boolean;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const frozenRef = useRef(false);
  const leftFrozenImageRef = useRef(false);
  const panRef = useRef({ x: 0, y: 0 });
  const [zoomPosition, setZoomPosition] = useState({
    active: false,
    frozen: false,
    lensHeight: 96,
    lensLeft: 50,
    lensTop: 50,
    lensWidth: 96,
    zoomImageHeight: 0,
    zoomImageLeft: 0,
    zoomImageTop: 0,
    zoomImageWidth: 0,
    zoomOriginX: 0,
    zoomOriginY: 0,
    x: 50,
    y: 50
  });
  const [imageNaturalSize, setImageNaturalSize] = useState({ height: 1, width: 1 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    function handleWindowPointerMove(event: globalThis.PointerEvent) {
      const frame = frameRef.current;
      if (!frame || !frozenRef.current) {
        return;
      }

      const rect = frame.getBoundingClientRect();
      const isBeyondLeaveBuffer =
        event.clientX < rect.left - ZOOM_LEAVE_BUFFER_PX ||
        event.clientX > rect.right + ZOOM_LEAVE_BUFFER_PX ||
        event.clientY < rect.top - ZOOM_LEAVE_BUFFER_PX ||
        event.clientY > rect.bottom + ZOOM_LEAVE_BUFFER_PX;

      if (isBeyondLeaveBuffer) {
        leftFrozenImageRef.current = true;
        return;
      }

      const isInsideEnterBuffer =
        event.clientX > rect.left + ZOOM_ENTER_BUFFER_PX &&
        event.clientX < rect.right - ZOOM_ENTER_BUFFER_PX &&
        event.clientY > rect.top + ZOOM_ENTER_BUFFER_PX &&
        event.clientY < rect.bottom - ZOOM_ENTER_BUFFER_PX;

      if (leftFrozenImageRef.current && isInsideEnterBuffer) {
        frozenRef.current = false;
        leftFrozenImageRef.current = false;
        setZoomPosition((current) => ({ ...current, frozen: false }));
        updateZoomPositionFromCoordinates(event.clientX, event.clientY, { force: true });
      }
    }

    window.addEventListener("pointermove", handleWindowPointerMove);
    return () => window.removeEventListener("pointermove", handleWindowPointerMove);
  }, []);

  function updateZoomPosition(event: PointerEvent<HTMLDivElement>, options: { force?: boolean } = {}) {
    if (frozenRef.current && !options.force) {
      return;
    }

    updateZoomPositionFromCoordinates(event.clientX, event.clientY, options);
  }

  function startImagePointer(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      didDrag: false,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: panRef.current.x,
      startPanY: panRef.current.y
    };
  }

  function moveImagePointer(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      updateZoomPosition(event);
      return;
    }

    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    if (Math.hypot(deltaX, deltaY) < IMAGE_DRAG_THRESHOLD_PX && !drag.didDrag) {
      updateZoomPosition(event);
      return;
    }

    drag.didDrag = true;
    const frameRect = frameRef.current?.getBoundingClientRect();
    if (!frameRect) {
      return;
    }
    const imageLayout = containedImageLayout(frameRect, imageNaturalSize);

    const nextPan = constrainImagePan(
      {
        x: drag.startPanX + deltaX,
        y: drag.startPanY + deltaY
      },
      rotation,
      imageLayout,
      frameRect
    );
    panRef.current = nextPan;
    setPan(nextPan);
    if (!frozenRef.current) {
      updateZoomPositionFromCoordinates(event.clientX, event.clientY);
    }
  }

  function endImagePointer(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    if (!drag.didDrag) {
      toggleFrozenZoom(event);
    }
  }

  function updateZoomPositionFromCoordinates(
    clientX: number,
    clientY: number,
    options: { force?: boolean } = {}
  ) {
    if (frozenRef.current && !options.force) {
      return;
    }

    const frameRect = frameRef.current?.getBoundingClientRect();
    const zoomRect = zoomPaneRef.current?.getBoundingClientRect();
    const imageLayout = frameRect ? containedImageLayout(frameRect, imageNaturalSize) : null;
    const imagePoint = imagePointFromClientPoint(clientX, clientY, imageLayout, panRef.current, rotation);
    const x = imageLayout && imageLayout.width > 0 ? (imagePoint.x / imageLayout.width) * 100 : 50;
    const y = imageLayout && imageLayout.height > 0 ? (imagePoint.y / imageLayout.height) * 100 : 50;
    const clampedX = Math.min(100, Math.max(0, x));
    const clampedY = Math.min(100, Math.max(0, y));
    const lensSize = lensSizeForZoomPane(imageLayout, zoomRect);
    const lensLeft = frameRect ? clientX - frameRect.left : 50;
    const lensTop = frameRect ? clientY - frameRect.top : 50;
    const zoomOriginX = imageLayout ? (clampedX / 100) * imageLayout.width : 0;
    const zoomOriginY = imageLayout ? (clampedY / 100) * imageLayout.height : 0;
    const zoomImageWidth = imageLayout?.width ?? 0;
    const zoomImageHeight = imageLayout?.height ?? 0;

    setZoomPosition({
      active: true,
      frozen: frozenRef.current,
      lensHeight: lensSize.height,
      lensLeft,
      lensTop,
      lensWidth: lensSize.width,
      zoomImageHeight,
      zoomImageLeft: zoomRect ? zoomRect.width / 2 - zoomOriginX : 0,
      zoomImageTop: zoomRect ? zoomRect.height / 2 - zoomOriginY : 0,
      zoomImageWidth,
      zoomOriginX,
      zoomOriginY,
      x: clampedX,
      y: clampedY
    });
  }

  function toggleFrozenZoom(event: PointerEvent<HTMLDivElement>) {
    if (frozenRef.current) {
      frozenRef.current = false;
      leftFrozenImageRef.current = false;
      setZoomPosition((current) => ({ ...current, frozen: false }));
      updateZoomPosition(event, { force: true });
      return;
    }

    updateZoomPosition(event, { force: true });
    frozenRef.current = true;
    leftFrozenImageRef.current = false;
    setZoomPosition((current) => ({ ...current, active: true, frozen: true }));
  }

  function centerZoom() {
    setZoomPosition((current) => ({ ...current, active: true }));
  }

  function restZoom() {
    if (frozenRef.current) {
      return;
    }

    leftFrozenImageRef.current = false;
    setZoomPosition((current) => ({ ...current, active: false, frozen: false }));
  }

  function rotateImage(degrees: number) {
    setRotation((current) => {
      const nextRotation = normalizeRotation(current + degrees);
      const frameRect = frameRef.current?.getBoundingClientRect();
      if (frameRect) {
        const imageLayout = containedImageLayout(frameRect, imageNaturalSize);
        const nextPan = constrainImagePan(panRef.current, nextRotation, imageLayout, frameRect);
        panRef.current = nextPan;
        setPan(nextPan);
      }
      return nextRotation;
    });
  }

  const frameRect = frameRef.current?.getBoundingClientRect();
  const imageLayout = frameRect ? containedImageLayout(frameRect, imageNaturalSize) : null;
  const imageStyle = {
    height: imageLayout ? `${imageLayout.height}px` : "100%",
    left: imageLayout ? `${imageLayout.left}px` : "0",
    top: imageLayout ? `${imageLayout.top}px` : "0",
    transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg)`,
    width: imageLayout ? `${imageLayout.width}px` : "100%"
  };
  const zoomImageStyle = {
    height: `${zoomPosition.zoomImageHeight}px`,
    left: `${zoomPosition.zoomImageLeft}px`,
    top: `${zoomPosition.zoomImageTop}px`,
    transform: `rotate(${rotation}deg) scale(${ZOOM_SCALE})`,
    transformOrigin: `${zoomPosition.zoomOriginX}px ${zoomPosition.zoomOriginY}px`,
    width: `${zoomPosition.zoomImageWidth}px`
  };

  return (
    <div className="detail-image-zoom">
      <div
        aria-label="Label image"
        className={`detail-image-frame ${zoomPosition.active ? "detail-image-frame--active" : ""} ${
          zoomPosition.frozen ? "detail-image-frame--frozen" : ""
        }`}
        onBlur={restZoom}
        onFocus={centerZoom}
        onPointerDown={startImagePointer}
        onPointerEnter={updateZoomPosition}
        onPointerLeave={restZoom}
        onPointerMove={moveImagePointer}
        onPointerCancel={endImagePointer}
        onPointerUp={endImagePointer}
        onPointerOut={restZoom}
        onPointerOver={updateZoomPosition}
        ref={frameRef}
        role="img"
        tabIndex={0}
      >
        <div className="detail-image-frame__clip">
          <img
            alt={alt}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onLoad={(event) =>
              setImageNaturalSize({
                height: event.currentTarget.naturalHeight || 1,
                width: event.currentTarget.naturalWidth || 1
              })
            }
            ref={imageRef}
            src={src}
            style={imageStyle}
          />
        </div>
        <span
          aria-hidden="true"
          className={`detail-image-frame__lens ${
            zoomPosition.frozen ? "detail-image-frame__lens--locked" : ""
          }`}
          style={{
            height: `${zoomPosition.lensHeight}px`,
            left: `${zoomPosition.lensLeft}px`,
            top: `${zoomPosition.lensTop}px`,
            width: `${zoomPosition.lensWidth}px`
          }}
        />
        {!zoomPosition.frozen && (
          <span
            aria-hidden="true"
            className="detail-image-frame__hint"
            style={{
              left: `${zoomPosition.lensLeft + zoomPosition.lensWidth / 2 + 10}px`,
              top: `${zoomPosition.lensTop - zoomPosition.lensHeight / 2}px`
            }}
          >
            Click to Lock
            <br />
            Drag to move image
          </span>
        )}
      </div>
      <div className="detail-image-controls" aria-label="Rotate label image">
        <button
          aria-label="Rotate image left"
          className="image-rotate-button"
          onClick={() => rotateImage(-5)}
          title="Rotate left"
          type="button"
        >
          <RotateLeftIcon />
        </button>
        <span className="detail-image-controls__hint">click buttons to rotate image</span>
        <button
          aria-label="Rotate image right"
          className="image-rotate-button"
          onClick={() => rotateImage(5)}
          title="Rotate right"
          type="button"
        >
          <RotateRightIcon />
        </button>
      </div>
      <div
        aria-label="Magnified label image"
        className={`detail-zoom-pane ${zoomPosition.active ? "detail-zoom-pane--active" : ""}`}
        ref={zoomPaneRef}
        role="img"
      >
        {!zoomPosition.active && (
          <p className="detail-zoom-pane__empty">Hover Mouse Over Image To Zoom In</p>
        )}
        <div className={`detail-zoom-pane__clip ${zoomPosition.active ? "detail-zoom-pane__clip--active" : ""}`}>
          <img
            alt=""
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            src={src}
            style={zoomImageStyle}
          />
        </div>
      </div>
    </div>
  );
}

function RotateLeftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8.1 8.1A6.5 6.5 0 0 1 19 12.8l-2-.1A4.5 4.5 0 0 0 9.5 9.5L12 12H5V5l3.1 3.1Z" />
    </svg>
  );
}

function RotateRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M15.9 8.1A6.5 6.5 0 0 0 5 12.8l2-.1a4.5 4.5 0 0 1 7.5-3.2L12 12h7V5l-3.1 3.1Z" />
    </svg>
  );
}

function lensSizeForZoomPane(
  imageRect: ImageLayout | null,
  zoomRect: DOMRect | undefined
): { height: number; width: number } {
  if (!imageRect || !zoomRect || imageRect.width <= 0 || imageRect.height <= 0) {
    return { height: 52, width: 104 };
  }

  return {
    height: Math.max(42, Math.min(imageRect.height, zoomRect.height / ZOOM_SCALE)),
    width: Math.max(72, Math.min(imageRect.width, zoomRect.width / ZOOM_SCALE))
  };
}

function imagePointFromClientPoint(
  clientX: number,
  clientY: number,
  imageLayout: ImageLayout | null,
  pan: { x: number; y: number },
  rotation: number
): { x: number; y: number } {
  if (!imageLayout || imageLayout.width <= 0 || imageLayout.height <= 0) {
    return { x: 0, y: 0 };
  }

  const centerX = imageLayout.viewportLeft + imageLayout.left + imageLayout.width / 2 + pan.x;
  const centerY = imageLayout.viewportTop + imageLayout.top + imageLayout.height / 2 + pan.y;
  const radians = (-rotation * Math.PI) / 180;
  const deltaX = clientX - centerX;
  const deltaY = clientY - centerY;
  const localX = deltaX * Math.cos(radians) - deltaY * Math.sin(radians) + imageLayout.width / 2;
  const localY = deltaX * Math.sin(radians) + deltaY * Math.cos(radians) + imageLayout.height / 2;

  return {
    x: Math.min(imageLayout.width, Math.max(0, localX)),
    y: Math.min(imageLayout.height, Math.max(0, localY))
  };
}

function constrainImagePan(
  pan: { x: number; y: number },
  rotation: number,
  imageLayout: ImageLayout,
  frameRect: DOMRect
): { x: number; y: number } {
  const bounds = rotatedBounds(imageLayout.width, imageLayout.height, rotation);
  return {
    x: constrainAxis(pan.x, imageLayout.left + bounds.left, imageLayout.left + bounds.right, frameRect.width),
    y: constrainAxis(pan.y, imageLayout.top + bounds.top, imageLayout.top + bounds.bottom, frameRect.height)
  };
}

function constrainAxis(value: number, lowEdge: number, highEdge: number, frameSize: number): number {
  const rotatedSize = highEdge - lowEdge;
  if (rotatedSize <= frameSize) {
    return frameSize / 2 - (lowEdge + highEdge) / 2;
  }

  const min = frameSize - highEdge;
  const max = -lowEdge;
  return Math.min(max, Math.max(min, value));
}

function rotatedBounds(width: number, height: number, rotation: number) {
  const radians = (rotation * Math.PI) / 180;
  const centerX = width / 2;
  const centerY = height / 2;
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height }
  ].map((corner) => {
    const deltaX = corner.x - centerX;
    const deltaY = corner.y - centerY;
    return {
      x: deltaX * Math.cos(radians) - deltaY * Math.sin(radians) + centerX,
      y: deltaX * Math.sin(radians) + deltaY * Math.cos(radians) + centerY
    };
  });

  return {
    bottom: Math.max(...corners.map((corner) => corner.y)),
    left: Math.min(...corners.map((corner) => corner.x)),
    right: Math.max(...corners.map((corner) => corner.x)),
    top: Math.min(...corners.map((corner) => corner.y))
  };
}

interface ImageLayout {
  height: number;
  left: number;
  top: number;
  viewportLeft: number;
  viewportTop: number;
  width: number;
}

function containedImageLayout(frameRect: DOMRect, naturalSize: { height: number; width: number }): ImageLayout {
  const frameRatio = frameRect.width / frameRect.height;
  const imageRatio = naturalSize.width / naturalSize.height;
  const width = imageRatio > frameRatio ? frameRect.width : frameRect.height * imageRatio;
  const height = imageRatio > frameRatio ? frameRect.width / imageRatio : frameRect.height;

  return {
    height,
    left: (frameRect.width - width) / 2,
    top: (frameRect.height - height) / 2,
    viewportLeft: frameRect.left,
    viewportTop: frameRect.top,
    width
  };
}

function normalizeRotation(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

const ZOOM_ENTER_BUFFER_PX = 10;
const ZOOM_LEAVE_BUFFER_PX = 18;
const ZOOM_SCALE = 4.3;
const IMAGE_DRAG_THRESHOLD_PX = 4;

interface SectionStatsProps {
  items: Array<{
    active: boolean;
    filterKey: string;
    label: string;
    tone: "neutral" | "fail" | "review" | "passed" | "pending";
    value: number;
  }>;
  onToggle: (filterKey: string) => void;
}

function SectionStats({ items, onToggle }: SectionStatsProps) {
  return (
    <div className="section-stats" aria-label="Section summary">
      {items.map((item) => (
        <button
          aria-pressed={item.active}
          className={`section-stat section-stat--${item.tone} ${item.active ? "is-active" : "is-inactive"}`}
          key={item.label}
          onClick={() => onToggle(item.filterKey)}
          type="button"
        >
          <strong>{item.value}</strong> {item.label}
        </button>
      ))}
    </div>
  );
}

interface DataPanelProps {
  onFieldDecision: (
    packageId: string,
    field: CanonicalLabelField,
    decision: FieldReviewDecision
  ) => void;
  record: ApplicationPackageRecord;
}

function DataPanel({ onFieldDecision, record }: DataPanelProps) {
  const [fieldFilters, setFieldFilters] = useState<Record<FieldReviewDecision, boolean>>({
    fail: true,
    review: true,
    pass: true
  });
  const extractedData = record.reviewed_extracted_data ?? emptyExtractedData();
  const fieldResults = new Map(sortedResults(record.comparison_result).map((result) => [result.field, result]));
  const fieldDecisions = resolvedFieldDecisions(record);
  const fieldSummary = summarizeFieldDecisions(fieldDecisions);
  const visibleFields = FIELD_CONFIGS.filter((field) => fieldFilters[fieldDecisions[field.name]]);

  function toggleFieldFilter(filter: FieldReviewDecision | "total") {
    setFieldFilters((current) => {
      if (filter === "total") {
        const allActive = FIELD_DECISIONS.every((decision) => current[decision]);
        return {
          fail: !allActive,
          review: !allActive,
          pass: !allActive
        };
      }

      if (FIELD_DECISIONS.every((decision) => current[decision])) {
        return {
          fail: filter === "fail",
          review: filter === "review",
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
              active: fieldFilters.review,
              filterKey: "review",
              label: "needs review",
              value: fieldSummary.review,
              tone: "review"
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

          return (
            <div
              className={`data-row data-row--${fieldResult?.status.toLowerCase() ?? "pending"} data-row--field-${field.name}`}
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
                <div className="field-decision-buttons" aria-label={`${field.label} review status`}>
                  <FieldDecisionButton
                    decision="fail"
                    fieldLabel={field.label}
                    isActive={selectedDecision === "fail"}
                    onClick={() => onFieldDecision(record.package_id, field.name, "fail")}
                  />
                  <FieldDecisionButton
                    decision="review"
                    fieldLabel={field.label}
                    isActive={selectedDecision === "review"}
                    onClick={() => onFieldDecision(record.package_id, field.name, "review")}
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
                  <span className="data-value-label">Application</span>
                  <p
                    aria-label={`Application Value ${field.label}`}
                    className="application-value-text"
                    id={applicationId}
                  >
                    {record.application_data[field.name]}
                  </p>
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
  const label = decision === "fail" ? "Fail" : decision === "review" ? "Needs review" : "Pass";

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
  if (decision === "review") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 21V4h10l.4 2H20v10h-6l-.4-2H7v7H5Z" />
      </svg>
    );
  }

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

function summarizeApplications(records: ApplicationPackageRecord[]) {
  return records.reduce(
    (summary, record) => {
      summary.total += 1;
      if (record.status === "Fail") {
        summary.fail += 1;
      } else if (record.status === "Needs Review") {
        summary.needsReview += 1;
      } else if (record.status === "Passed") {
        summary.passed += 1;
      }
      return summary;
    },
    { fail: 0, needsReview: 0, passed: 0, total: 0 }
  );
}

function summarizeIncompleteApplications(records: IncompleteApplicationRecord[]) {
  return records.reduce(
    (summary, record) => {
      summary.total += 1;
      if (record.kind === "json_missing_image") {
        summary.json += 1;
      } else {
        summary.images += 1;
      }
      return summary;
    },
    { images: 0, json: 0, total: 0 }
  );
}

function summarizeFieldDecisions(decisions: Record<CanonicalLabelField, FieldReviewDecision>) {
  return Object.values(decisions).reduce(
    (summary, decision) => {
      summary.total += 1;
      summary[decision] += 1;
      return summary;
    },
    { fail: 0, pass: 0, review: 0, total: 0 }
  );
}

function comparisonRuleText(field: CanonicalLabelField): string {
  switch (field) {
    case "brand_name":
      return "PASS when this is clearly the same brand name. Capital letters, spacing, punctuation, or word order can be a little different. Needs review when the brand looks like a different product.";
    case "class_type":
      return "PASS when the label describes the same product type or class. Small spelling or wording differences can be okay. Needs review when the label describes a different kind of alcohol.";
    case "abv":
      return "PASS when the alcohol strength is the same within 0.1 percentage points. Proof is converted to ABV, so 90 proof counts as 45% ABV. Needs review when the number is outside that tolerance or cannot be read.";
    case "net_contents":
      return "PASS when the container size is the same within 1 mL. The tool converts mL, L, and cL, so 750 mL and 0.75 L match. Needs review for different amounts or units the tool cannot convert.";
    case "producer":
      return "PASS when the producer, bottler, or company name and location clearly refer to the same business. Capital letters, punctuation, or small wording differences can be okay. Needs review when the company or location appears different.";
    case "country_of_origin":
      return "PASS when the country means the same place. Common United States wording such as USA, US, and United States of America is treated as United States. Needs review when it names a different country.";
    case "government_warning":
      return "This is strict. PASS only when the warning words and capitalization match exactly, after ignoring extra spaces. Title case, missing punctuation, or changed wording needs review. Limitation: AI can have a hard time confirming that GOVERNMENT WARNING: is bold, so a person should still check bold styling.";
  }
}

const DEMO_DATA_ARCHIVE_FILENAME = "demo-inputs.zip";

function defaultFieldDecision(
  record: ApplicationPackageRecord,
  fieldResult: FieldResult | undefined
): FieldReviewDecision {
  if (!fieldResult) {
    return "review";
  }
  if (fieldResult.status === "PASS") {
    return "pass";
  }
  return record.status === "Fail" ? "fail" : "review";
}

function resolvedFieldDecisions(
  record: ApplicationPackageRecord,
  overrides = record.field_decisions
): Record<CanonicalLabelField, FieldReviewDecision> {
  const fieldResults = new Map(record.comparison_result?.results.map((result) => [result.field, result]) ?? []);
  return FIELD_CONFIGS.reduce(
    (decisions, field) => {
      decisions[field.name] = overrides[field.name] ?? defaultFieldDecision(record, fieldResults.get(field.name));
      return decisions;
    },
    {} as Record<CanonicalLabelField, FieldReviewDecision>
  );
}

function statusFromFieldDecisions(
  record: ApplicationPackageRecord,
  overrides = record.field_decisions
): VisibleStatus {
  const decisions = Object.values(resolvedFieldDecisions(record, overrides));
  if (decisions.some((decision) => decision === "review")) {
    return "Needs Review";
  }
  if (decisions.some((decision) => decision === "fail")) {
    return "Fail";
  }
  return "Passed";
}

function promoteReviewFieldsToFail(
  record: ApplicationPackageRecord
): Partial<Record<CanonicalLabelField, FieldReviewDecision>> {
  const resolved = resolvedFieldDecisions(record);
  return FIELD_CONFIGS.reduce(
    (decisions, field) => {
      decisions[field.name] = resolved[field.name] === "review" ? "fail" : resolved[field.name];
      return decisions;
    },
    {} as Partial<Record<CanonicalLabelField, FieldReviewDecision>>
  );
}

function canMarkApplicationFail(record: ApplicationPackageRecord): boolean {
  const decisions = Object.values(resolvedFieldDecisions(record));
  return decisions.some((decision) => decision === "fail" || decision === "review");
}

function canMarkApplicationPass(record: ApplicationPackageRecord): boolean {
  return Object.values(resolvedFieldDecisions(record)).every((decision) => decision === "pass");
}

function buildReviewOverrideWarning(record: ApplicationPackageRecord, action: ReviewOverrideAction): ReviewOverrideWarning {
  const decisions = resolvedFieldDecisions(record);
  const groupedFields = FIELD_CONFIGS.reduce(
    (groups, field) => {
      groups[decisions[field.name]].push(field.label);
      return groups;
    },
    { fail: [] as string[], review: [] as string[], pass: [] as string[] }
  );

  const groups =
    action === "pass"
      ? [
          { label: "Fail", fields: groupedFields.fail },
          { label: "Needs Review", fields: groupedFields.review }
        ].filter((group) => group.fields.length > 0)
      : [{ label: "Pass", fields: groupedFields.pass }];

  return {
    action,
    confirmLabel: action === "pass" ? "Proceed With Pass" : "Proceed With Fail",
    groups,
    packageId: record.package_id,
    title:
      action === "pass"
        ? "Pass this application anyway?"
        : "Fail this application anyway?"
  };
}
