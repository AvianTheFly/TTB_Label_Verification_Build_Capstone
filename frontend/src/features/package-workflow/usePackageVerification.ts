import {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useState
} from "react";

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
import {
  ApplicationPackageRecord,
  emptyExtractedData
} from "./packageWorkflowUtils";
import { validationMessageFor } from "./packageValidation";
import {
  applyComparisonResult,
  applyVerificationResult
} from "./recordMutations";

const MAX_BATCH_ITEMS = 25;

function errorMessageFor(error: unknown): string {
  if (error instanceof VerificationApiError) {
    return error.message;
  }

  return "The verification service could not check these applications. Please try again.";
}

interface UsePackageVerificationParams {
  recordsRef: MutableRefObject<ApplicationPackageRecord[]>;
  setRecords: Dispatch<SetStateAction<ApplicationPackageRecord[]>>;
}

export function usePackageVerification({
  recordsRef,
  setRecords
}: UsePackageVerificationParams) {
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

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
        record.reviewed_extracted_formatting,
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

  return {
    checkError,
    compareEditedRecord,
    isChecking,
    setCheckError,
    setFieldDecision,
    verifyBatchApplications,
    verifySingleApplication
  };
}
