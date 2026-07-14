import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  VerificationApiError,
  compareExtractedData,
  extractLabelText,
  verifyBatch
} from "../../api/verification";
import type {
  CanonicalLabelField,
  FieldReviewDecision,
  VerificationResult
} from "../../types/api";
import { DEMO_DATA_ARCHIVE_FILENAME, VISIBLE_STATUSES } from "./constants";
import { FIELD_CONFIGS } from "../labelFields";
import { ApplicationDetailDialog } from "./components/ApplicationDetailDialog";
import { ApplicationsSection } from "./components/ApplicationsSection";
import { SearchPanel } from "./components/SearchPanel";
import { UploadDropSurface } from "./components/UploadDropSurface";
import { WorkflowHeader } from "./components/WorkflowHeader";
import { createPreviewUrl, mergeFilesByName, revokePreviewUrl } from "./filePreviews";
import {
  ApplicationPackageRecord,
  PackageValidationError,
  VisibleStatus,
  emptyExtractedData,
  extractedDataFromResult,
  parseApplicationPackages,
  statusSortRank,
  statusFromResult
} from "./packageWorkflowUtils";
import {
  allStatusFilters,
  matchesApplicationSearch
} from "./searchFilters";
import {
  recordKey,
  resolvedFieldDecisions,
  statusFromFieldDecisions,
  summarizeApplications
} from "./recordStatus";
import type { AdvancedSearchFilters } from "./types";

const NUMERIC_APPLICATION_FIELDS: Array<{
  example: string;
  label: string;
  name: "abv" | "net_contents";
}> = [
  { name: "abv", label: "Alcohol Content", example: "45%" },
  { name: "net_contents", label: "Net Contents", example: "750 mL" }
];
const HAS_NUMBER_RE = /\d+(?:\.\d+)?/;

function errorMessageFor(error: unknown): string {
  if (error instanceof VerificationApiError) {
    return error.message;
  }

  return "The verification service could not check these applications. Please try again.";
}

function validationMessageFor(record: ApplicationPackageRecord): string | null {
  const missingFields = FIELD_CONFIGS.filter(
    (field) => !record.application_data[field.name].trim()
  );
  if (missingFields.length > 0) {
    return `Enter ${missingFields.map((field) => field.label).join(", ")} before verifying.`;
  }

  const invalidNumericFields = NUMERIC_APPLICATION_FIELDS.filter(
    (field) => !HAS_NUMBER_RE.test(record.application_data[field.name])
  );
  if (invalidNumericFields.length > 0) {
    return `Enter ${invalidNumericFields
      .map((field) => `${field.label} with a number, such as ${field.example}`)
      .join("; ")} before verifying.`;
  }

  return null;
}

export function PackageWorkflow() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const recordsRef = useRef<ApplicationPackageRecord[]>([]);
  const uploadedFilesRef = useRef<File[]>([]);
  const dragDepthRef = useRef(0);
  const [records, setRecords] = useState<ApplicationPackageRecord[]>([]);
  const [validationErrors, setValidationErrors] = useState<PackageValidationError[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
  const [statusFilters, setStatusFilters] = useState<Record<VisibleStatus, boolean>>({
    "Pending Check": true,
    Approved: true,
    "Needs Review": true
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
  const filteredRecords = useMemo(
    () => searchMatchedRecords.filter((record) => statusFilters[record.status]),
    [searchMatchedRecords, statusFilters]
  );
  const applicationSummary = summarizeApplications(searchMatchedRecords);
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
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(
    () => () => {
      for (const record of recordsRef.current) {
        revokePreviewUrl(record.image_preview_url);
      }
    },
    []
  );

  async function applyUploadedFiles(files: File[]) {
    uploadedFilesRef.current = files;

    const parsed = await parseApplicationPackages(files);
    const currentRecords = recordsRef.current;
    const currentByKey = new Map(currentRecords.map((record) => [recordKey(record), record]));
    const recordsToExtract: ApplicationPackageRecord[] = [];
    const nextRecords = parsed.records.map((record) => {
      const existing = currentByKey.get(recordKey(record));
      if (existing) {
        const imageChanged = existing.image_file !== record.image_file;
        const nextRecord = {
          ...existing,
          image_file: record.image_file,
          image_filename: record.image_filename,
          image_preview_url: imageChanged
            ? createPreviewUrl(record.image_file)
            : existing.image_preview_url,
          original_extracted_data: imageChanged ? null : existing.original_extracted_data,
          reviewed_extracted_data: imageChanged ? null : existing.reviewed_extracted_data,
          comparison_result: imageChanged ? null : existing.comparison_result,
          field_decisions: imageChanged ? {} : existing.field_decisions,
          status: imageChanged ? "Pending Check" : existing.status,
          item_error: imageChanged ? null : existing.item_error
        };
        if (imageChanged) {
          recordsToExtract.push(nextRecord);
        }
        return nextRecord;
      }

      const nextRecord = {
        ...record,
        image_preview_url: createPreviewUrl(record.image_file)
      };
      recordsToExtract.push(nextRecord);
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
    void extractUploadedRecords(recordsToExtract);
  }

  function addUploadedFiles(fileList: FileList | File[]) {
    const incomingFiles = Array.from(fileList);
    const files = mergeFilesByName(uploadedFilesRef.current, incomingFiles);
    setCheckError(null);
    void applyUploadedFiles(files);
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      addUploadedFiles(event.target.files);
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
    addUploadedFiles(event.dataTransfer.files);
  }

  async function extractUploadedRecords(recordsToExtract: ApplicationPackageRecord[]) {
    if (recordsToExtract.length === 0) {
      return;
    }
    setIsChecking(true);
    setCheckError(null);

    try {
      for (const record of recordsToExtract) {
        try {
          const extractedData = await extractLabelText(record.image_file);
          setRecords((current) =>
            current.map((candidate) =>
              candidate.package_id === record.package_id
                ? {
                    ...candidate,
                    original_extracted_data: extractedData,
                    reviewed_extracted_data: extractedData,
                    item_error: null
                  }
                : candidate
            )
          );
        } catch (error) {
          const message = errorMessageFor(error);
          setCheckError("Some labels could not be read. Open the application card for details.");
          setRecords((current) =>
            current.map((candidate) =>
              candidate.package_id === record.package_id
                ? { ...candidate, item_error: message, status: "Needs Review" }
                : candidate
            )
          );
        }
      }
    } finally {
      setIsChecking(false);
    }
  }

  async function verifyBatchApplications() {
    const currentRecords = recordsRef.current;
    if (currentRecords.length === 0) {
      setCheckError("Choose label images before verifying the batch.");
      return;
    }

    const validationMessages = new Map<string, string>();
    for (const record of currentRecords) {
      const message = validationMessageFor(record);
      if (message) {
        validationMessages.set(record.package_id, message);
      }
    }

    if (validationMessages.size > 0) {
      setRecords((current) =>
        current.map((record) =>
          validationMessages.has(record.package_id)
            ? { ...record, item_error: validationMessages.get(record.package_id) ?? null }
            : record
        )
      );
      setCheckError("Enter the missing label details before verifying the batch.");
      return;
    }

    setIsChecking(true);
    setCheckError(null);

    try {
      const submittedRecords = currentRecords.slice();
      const batchResult = await verifyBatch(
        submittedRecords.map((record) => ({
          image: record.image_file,
          application_data: record.application_data
        }))
      );

      for (const item of batchResult.items) {
        const record = submittedRecords[item.index];
        if (!record) {
          continue;
        }
        if (item.result) {
          updateRecordWithResult(record.package_id, item.result);
        } else if (item.error) {
          setRecords((current) =>
            current.map((candidate) =>
              candidate.package_id === record.package_id
                ? {
                    ...candidate,
                    item_error: item.error?.message ?? "This application could not be checked.",
                    status: "Needs Review"
                  }
                : candidate
            )
          );
        }
      }
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

  function updateApplicationData(
    packageId: string,
    field: CanonicalLabelField,
    value: string
  ) {
    setRecords((current) =>
      current.map((record) =>
        record.package_id === packageId
          ? {
              ...record,
              application_data: {
                ...record.application_data,
                [field]: value
              },
              comparison_result: null,
              field_decisions: {},
              status: "Pending Check",
              item_error: null
            }
          : record
      )
    );
  }

  function updateExtractedData(
    packageId: string,
    field: CanonicalLabelField,
    value: string
  ) {
    const reviewedValue = value.trim() ? value : null;
    setRecords((current) =>
      current.map((record) => {
        if (record.package_id !== packageId) {
          return record;
        }

        const reviewedExtractedData = {
          ...(record.reviewed_extracted_data ?? emptyExtractedData()),
          [field]: reviewedValue
        };

        return {
          ...record,
          reviewed_extracted_data: reviewedExtractedData,
          comparison_result: record.comparison_result
            ? {
                ...record.comparison_result,
                results: record.comparison_result.results.map((fieldResult) =>
                  fieldResult.field === field
                    ? {
                        ...fieldResult,
                        found: reviewedValue
                      }
                    : fieldResult
                )
              }
            : record.comparison_result
        };
      })
    );
  }

  function openDetail(packageId: string) {
    setSelectedPackageId(packageId);
  }

  function closeDetail() {
    setSelectedPackageId(null);
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
          Approved: !allActive,
          "Needs Review": !allActive
        };
      }

      if (VISIBLE_STATUSES.every((candidate) => current[candidate])) {
        return {
          "Pending Check": status === "Pending Check",
          Approved: status === "Approved",
          "Needs Review": status === "Needs Review"
        };
      }

      return {
        ...current,
        [status]: !current[status]
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
          isChecking={isChecking}
          onVerifyBatch={verifyBatchApplications}
          canVerifyBatch={records.length > 0}
          onDownloadDemoData={downloadDemoData}
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
          <ApplicationsSection
            allRecordCount={records.length}
            filteredRecords={filteredRecords}
            onOpenDetail={openDetail}
            onToggleStatusFilter={toggleStatusFilter}
            searchPanel={(
              <SearchPanel
                advancedFilters={advancedFilters}
                isAdvancedSearchOpen={isAdvancedSearchOpen}
                onAdvancedFilterChange={updateAdvancedFilter}
                onSearchTermChange={setSearchTerm}
                onToggleAdvancedSearch={() => setIsAdvancedSearchOpen((isOpen) => !isOpen)}
                searchTerm={searchTerm}
              />
            )}
            sortedRecords={sortedRecords}
            statusFilters={statusFilters}
            summary={applicationSummary}
          />
        </UploadDropSurface>

        {selectedRecord && (
          <ApplicationDetailDialog
            detailHeadingRef={detailHeadingRef}
            onClose={closeDetail}
            onApplicationDataChange={updateApplicationData}
            onExtractedDataChange={updateExtractedData}
            onFieldDecision={setFieldDecision}
            record={selectedRecord}
          />
        )}

      </section>
    </main>
  );
}
