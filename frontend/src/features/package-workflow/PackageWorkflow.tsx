import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  VerificationApiError,
  compareExtractedData,
  verifyBatch,
  verifyLabel
} from "../../api/verification";
import type {
  CanonicalLabelField,
  FieldReviewDecision,
  VerificationResult
} from "../../types/api";
import { DEMO_DATA_ARCHIVE_FILENAME, VISIBLE_STATUSES } from "./constants";
import { ApplicationDetailDialog } from "./components/ApplicationDetailDialog";
import { ApplicationsSection } from "./components/ApplicationsSection";
import { IncompleteApplicationsSection } from "./components/IncompleteApplicationsSection";
import { SearchPanel } from "./components/SearchPanel";
import { UploadDropSurface } from "./components/UploadDropSurface";
import { WorkflowHeader } from "./components/WorkflowHeader";
import { ReviewOverrideDialog, SubmitWarningDialog } from "./components/WorkflowDialogs";
import { createPreviewUrl, mergeFilesByName, revokePreviewUrl } from "./filePreviews";
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
import {
  allIncompleteFilters,
  allStatusFilters,
  incompleteFilterKey,
  matchesApplicationSearch,
  matchesIncompleteSearch
} from "./searchFilters";
import {
  buildReviewOverrideWarning,
  canMarkApplicationFail,
  canMarkApplicationPass,
  promoteReviewFieldsToFail,
  recordKey,
  statusFromFieldDecisions,
  summarizeApplications,
  summarizeIncompleteApplications
} from "./recordStatus";
import type {
  AdvancedSearchFilters,
  IncompleteFilter,
  ReviewOverrideWarning
} from "./types";

function errorMessageFor(error: unknown): string {
  if (error instanceof VerificationApiError) {
    return error.message;
  }

  return "The verification service could not check these applications. Please try again.";
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

  async function checkApplications(recordsToCheck: ApplicationPackageRecord[]) {
    const validRecords = recordsToCheck.filter((record) => record.validation_errors.length === 0);
    if (validRecords.length === 0) {
      return;
    }

    setIsChecking(true);
    setCheckError(null);

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
        <WorkflowHeader
          incompleteCount={incompleteRecords.length}
          isChecking={isChecking}
          onDownloadDemoData={downloadDemoData}
          onSubmitClick={() => setIsSubmitWarningOpen(true)}
          recordCount={records.length}
        />

        <UploadDropSurface
          checkError={checkError}
          fileInputRef={fileInputRef}
          isDragging={isDragging}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onFileInputChange={handleFileInputChange}
          validationErrors={validationErrors}
        >
          <SearchPanel
            advancedFilters={advancedFilters}
            isAdvancedSearchOpen={isAdvancedSearchOpen}
            onAdvancedFilterChange={updateAdvancedFilter}
            onSearchTermChange={setSearchTerm}
            onToggleAdvancedSearch={() => setIsAdvancedSearchOpen((isOpen) => !isOpen)}
            searchTerm={searchTerm}
          />

          <ApplicationsSection
            allRecordCount={records.length}
            filteredRecords={filteredRecords}
            onOpenDetail={openDetail}
            onToggleStatusFilter={toggleStatusFilter}
            sortedRecords={sortedRecords}
            statusFilters={statusFilters}
            summary={applicationSummary}
          />

          <IncompleteApplicationsSection
            allRecordCount={incompleteRecords.length}
            filteredRecords={filteredIncompleteRecords}
            filters={incompleteFilters}
            onToggleFilter={toggleIncompleteFilter}
            summary={incompleteSummary}
          />
        </UploadDropSurface>

        {selectedRecord && (
          <ApplicationDetailDialog
            detailHeadingRef={detailHeadingRef}
            onClose={closeDetail}
            onFailClick={handleFailClick}
            onFieldDecision={setFieldDecision}
            onPassClick={handlePassClick}
            onSetRecordStatus={setRecordStatus}
            record={selectedRecord}
            selectedCanFail={selectedCanFail}
            selectedCanPass={selectedCanPass}
          />
        )}

        {reviewOverrideWarning && (
          <ReviewOverrideDialog
            onCancel={() => setReviewOverrideWarning(null)}
            onConfirm={confirmReviewOverride}
            warning={reviewOverrideWarning}
          />
        )}

        {isSubmitWarningOpen && (
          <SubmitWarningDialog
            onCancel={() => setIsSubmitWarningOpen(false)}
            onProceedWithDownload={() => void proceedWithDownload()}
            onProceedWithoutDownload={proceedWithoutDownload}
          />
        )}

      </section>
    </main>
  );
}
