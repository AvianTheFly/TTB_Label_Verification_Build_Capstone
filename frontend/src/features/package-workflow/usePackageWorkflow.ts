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
import { mergeFilesByName, revokePreviewUrl } from "./filePreviews";
import {
  ApplicationPackageRecord,
  PackageValidationError,
  VisibleStatus,
  emptyExtractedData,
  parseApplicationPackages,
  statusSortRank
} from "./packageWorkflowUtils";
import { validationMessageFor } from "./packageValidation";
import {
  applyComparisonResult,
  applyVerificationResult,
  mergeParsedRecords,
  previewUrlsToRevoke,
  updateApplicationField,
  updateExtractedField
} from "./recordMutations";
import {
  summarizeApplications
} from "./recordStatus";
import {
  allStatusFilters,
  matchesApplicationSearch
} from "./searchFilters";
import type { AdvancedSearchFilters } from "./types";

const MAX_BATCH_ITEMS = 25;

function errorMessageFor(error: unknown): string {
  if (error instanceof VerificationApiError) {
    return error.message;
  }

  return "The verification service could not check these applications. Please try again.";
}

export function usePackageWorkflow() {
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
    const nextRecords = mergeParsedRecords(currentRecords, parsed.records);

    for (const previewUrl of previewUrlsToRevoke(currentRecords, nextRecords)) {
      revokePreviewUrl(previewUrl);
    }

    setRecords(nextRecords);
    setValidationErrors(parsed.errors);
    setSelectedPackageId((current) =>
      current && nextRecords.some((record) => record.package_id === current) ? current : null
    );
    setCheckError(null);
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

  function updateApplicationData(
    packageId: string,
    field: CanonicalLabelField,
    value: string
  ) {
    setRecords((current) =>
      current.map((record) =>
        record.package_id === packageId
          ? updateApplicationField(record, field, value)
          : record
      )
    );
  }

  function updateExtractedData(
    packageId: string,
    field: CanonicalLabelField,
    value: string
  ) {
    setRecords((current) =>
      current.map((record) =>
        record.package_id === packageId
          ? updateExtractedField(record, field, value)
          : record
      )
    );
  }

  async function verifySingleApplication(packageId: string) {
    const record = recordsRef.current.find((candidate) => candidate.package_id === packageId);
    if (!record) {
      return;
    }

    const validationMessage = validationMessageFor(record);
    if (validationMessage) {
      setRecords((current) =>
        current.map((candidate) =>
          candidate.package_id === packageId
            ? { ...candidate, item_error: validationMessage, status: "Pending Check" }
            : candidate
        )
      );
      return;
    }

    setIsChecking(true);
    setCheckError(null);
    try {
      const result = await verifyLabel(record.image_file, record.application_data);
      updateRecordWithResult(packageId, result);
    } catch (error) {
      const message = errorMessageFor(error);
      setCheckError(message);
      setRecords((current) =>
        current.map((candidate) =>
          candidate.package_id === packageId
            ? { ...candidate, item_error: message, status: "Needs Review" }
            : candidate
        )
      );
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

    if (currentRecords.length > MAX_BATCH_ITEMS) {
      setCheckError(`Verify Batch can run ${MAX_BATCH_ITEMS} applications at a time.`);
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

    const shouldRunBatch =
      currentRecords.length <= 1 ||
      window.confirm(
        `Verify ${currentRecords.length} applications now?\n\nBatch verification sends each complete application and label image to /verify/batch. The current limit is ${MAX_BATCH_ITEMS} applications per batch.`
      );
    if (!shouldRunBatch) {
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
    setRecords((current) =>
      current.map((record) =>
        record.package_id === packageId
          ? applyVerificationResult(record, result)
          : record
      )
    );
  }

  async function compareEditedRecord(packageId: string) {
    const record = recordsRef.current.find((candidate) => candidate.package_id === packageId);
    if (record) {
      await compareRecordWhenReady(record);
    }
  }

  async function compareRecordWhenReady(record: ApplicationPackageRecord) {
    if (!record.reviewed_extracted_data) {
      return;
    }

    const validationMessage = validationMessageFor(record);
    if (validationMessage) {
      setRecords((current) =>
        current.map((candidate) =>
          candidate.package_id === record.package_id
            ? {
                ...candidate,
                comparison_result: null,
                field_decisions: {},
                status: "Pending Check",
                item_error: validationMessage
              }
            : candidate
        )
      );
      return;
    }

    await applyBackendFieldDecisions(record, record.field_decisions);
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
                ...applyComparisonResult(candidate, result, fieldDecisions)
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

  return {
    advancedFilters,
    applicationSummary,
    checkError,
    detailHeadingRef,
    fileInputRef,
    filteredRecords,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileInputChange,
    isAdvancedSearchOpen,
    isChecking,
    isDragging,
    records,
    searchTerm,
    selectedRecord,
    sortedRecords,
    statusFilters,
    validationErrors,
    closeDetail: () => setSelectedPackageId(null),
    compareEditedRecord,
    downloadDemoData,
    openDetail: setSelectedPackageId,
    setFieldDecision,
    setSearchTerm,
    toggleAdvancedSearch: () => setIsAdvancedSearchOpen((isOpen) => !isOpen),
    toggleStatusFilter,
    updateAdvancedFilter,
    updateApplicationData,
    updateExtractedData,
    verifyBatchApplications,
    verifySingleApplication
  };
}
