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
  BatchResult,
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
  const [checkingMessage, setCheckingMessage] = useState<string | null>(null);

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
    setCheckingMessage("Reading label");
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
      setCheckingMessage(null);
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

    const shouldRunBatch =
      currentRecords.length <= 1 ||
      window.confirm(
        `Verify ${currentRecords.length} applications now?\n\nLabels are sent in groups of up to ${MAX_BATCH_ITEMS} so larger workloads can finish safely.`
      );
    if (!shouldRunBatch) {
      return;
    }

    setIsChecking(true);
    setCheckError(null);
    const submittedRecords = currentRecords.slice();
    let failedGroupCount = 0;
    try {
      for (let start = 0; start < submittedRecords.length; start += MAX_BATCH_ITEMS) {
        const group = submittedRecords.slice(start, start + MAX_BATCH_ITEMS);
        const end = start + group.length;
        setCheckingMessage(`Reading labels ${start + 1}-${end} of ${submittedRecords.length}`);

        try {
          const batchResult = await verifyBatch(
            group.map((record) => ({
              image: record.image_file,
              application_data: record.application_data
            }))
          );
          applyBatchGroupResult(group, batchResult);
        } catch (error) {
          failedGroupCount += 1;
          markBatchGroupFailed(group, errorMessageFor(error));
        }
      }

      if (failedGroupCount > 0) {
        setCheckError(
          "Some label groups could not be checked. Review the affected applications and try them again."
        );
      }
    } catch (error) {
      setCheckError(errorMessageFor(error));
    } finally {
      setCheckingMessage(null);
      setIsChecking(false);
    }
  }

  function applyBatchGroupResult(
    group: ApplicationPackageRecord[],
    batchResult: BatchResult
  ) {
    const updates = new Map(
      batchResult.items.flatMap((item) => {
        const record = group[item.index];
        return record ? [[record.package_id, item] as const] : [];
      })
    );

    setRecords((current) =>
      current.map((record) => {
        const item = updates.get(record.package_id);
        if (item?.result) {
          return applyVerificationResult(record, item.result);
        }
        if (item?.error) {
          return {
            ...record,
            item_error: item.error.message || "This application could not be checked.",
            status: "Needs Review"
          };
        }
        return record;
      })
    );
  }

  function markBatchGroupFailed(group: ApplicationPackageRecord[], message: string) {
    const packageIds = new Set(group.map((record) => record.package_id));
    setRecords((current) =>
      current.map((record) =>
        packageIds.has(record.package_id)
          ? { ...record, item_error: message, status: "Needs Review" }
          : record
      )
    );
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
    checkingMessage,
    compareEditedRecord,
    isChecking,
    setCheckError,
    setFieldDecision,
    verifyBatchApplications,
    verifySingleApplication
  };
}
