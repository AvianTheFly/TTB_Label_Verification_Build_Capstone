import { useCallback, useEffect, useRef, useState } from "react";

import type { CanonicalLabelField } from "../../types/api";
import {
  SAMPLE_LABELS_ARCHIVE_PATH,
  SAMPLE_LABELS_DOWNLOAD_FILENAME
} from "./constants";
import { revokePreviewUrl } from "./filePreviews";
import { ApplicationPackageRecord } from "./packageWorkflowUtils";
import {
  updateApplicationField,
  updateApplicationFormatting,
  updateExtractedFormatting,
  updateExtractedField
} from "./recordMutations";
import { usePackageFilters } from "./usePackageFilters";
import { usePackageUploads } from "./usePackageUploads";
import { usePackageVerification } from "./usePackageVerification";

export function usePackageWorkflow() {
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const recordsRef = useRef<ApplicationPackageRecord[]>([]);
  const [records, setRecords] = useState<ApplicationPackageRecord[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  const selectedRecord = records.find((record) => record.package_id === selectedPackageId) ?? null;
  const filters = usePackageFilters(records);
  const verification = usePackageVerification({
    recordsRef,
    setRecords
  });
  const uploads = usePackageUploads({
    invalidateRequests: verification.invalidateAllRequests,
    recordsRef,
    setCheckError: verification.setCheckError,
    setRecords,
    setSelectedPackageId
  });

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

  function updateApplicationData(
    packageId: string,
    field: CanonicalLabelField,
    value: string
  ) {
    verification.invalidateRecordRequest(packageId);
    setRecords((current) =>
      current.map((record) =>
        record.package_id === packageId
          ? updateApplicationField(record, field, value)
          : record
      )
    );
  }

  function updateApplicationBoldFormatting(packageId: string, isBold: boolean) {
    verification.invalidateRecordRequest(packageId);
    setRecords((current) =>
      current.map((record) =>
        record.package_id === packageId
          ? updateApplicationFormatting(record, {
              ...record.application_formatting,
              government_warning_lead_in_bold: isBold
            })
          : record
      )
    );
  }

  function updateExtractedData(
    packageId: string,
    field: CanonicalLabelField,
    value: string
  ) {
    verification.invalidateRecordRequest(packageId);
    setRecords((current) =>
      current.map((record) =>
        record.package_id === packageId
          ? updateExtractedField(record, field, value)
          : record
      )
    );
  }

  function updateExtractedBoldFormatting(packageId: string, isBold: boolean) {
    verification.invalidateRecordRequest(packageId);
    setRecords((current) =>
      current.map((record) =>
        record.package_id === packageId
          ? updateExtractedFormatting(record, {
              ...(record.reviewed_extracted_formatting ?? {
                government_warning_lead_in_bold: null
              }),
              government_warning_lead_in_bold: isBold
            })
          : record
      )
    );
  }

  function downloadSampleLabels() {
    const link = document.createElement("a");
    link.href = `${import.meta.env.BASE_URL}${SAMPLE_LABELS_ARCHIVE_PATH}`;
    link.download = SAMPLE_LABELS_DOWNLOAD_FILENAME;
    link.click();
  }

  const closeDetail = useCallback(() => setSelectedPackageId(null), []);

  return {
    advancedFilters: filters.advancedFilters,
    applicationSummary: filters.applicationSummary,
    checkError: verification.checkError,
    checkingMessage: verification.checkingMessage,
    detailHeadingRef,
    fileInputRef: uploads.fileInputRef,
    filteredRecords: filters.filteredRecords,
    handleDragEnter: uploads.handleDragEnter,
    handleDragLeave: uploads.handleDragLeave,
    handleDragOver: uploads.handleDragOver,
    handleDrop: uploads.handleDrop,
    handleFileInputChange: uploads.handleFileInputChange,
    isAdvancedSearchOpen: filters.isAdvancedSearchOpen,
    isChecking: verification.isChecking,
    isDragging: uploads.isDragging,
    records,
    searchTerm: filters.searchTerm,
    selectedRecord,
    sortedRecords: filters.sortedRecords,
    statusFilters: filters.statusFilters,
    validationErrors: uploads.validationErrors,
    closeDetail,
    compareEditedRecord: verification.compareEditedRecord,
    downloadSampleLabels,
    openDetail: setSelectedPackageId,
    setFieldDecision: verification.setFieldDecision,
    setSearchTerm: filters.setSearchTerm,
    toggleAdvancedSearch: filters.toggleAdvancedSearch,
    toggleStatusFilter: filters.toggleStatusFilter,
    updateAdvancedFilter: filters.updateAdvancedFilter,
    updateApplicationData,
    updateApplicationBoldFormatting,
    updateExtractedData,
    updateExtractedBoldFormatting,
    verifyBatchApplications: verification.verifyBatchApplications,
    verifySingleApplication: verification.verifySingleApplication
  };
}
