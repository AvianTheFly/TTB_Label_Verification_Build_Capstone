import {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useRef,
  useState
} from "react";

import {
  VerificationApiError,
  compareExtractedData,
  verifyBatch,
  verifyLabel
} from "../../api/verification";
import { getHealth } from "../../api/health";
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

interface RequestToken {
  epoch: number;
  version: number;
}

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
  const requestEpochRef = useRef(0);
  const requestVersionsRef = useRef(new Map<string, number>());

  function beginRecordRequest(packageId: string): RequestToken {
    const version = (requestVersionsRef.current.get(packageId) ?? 0) + 1;
    requestVersionsRef.current.set(packageId, version);
    return { epoch: requestEpochRef.current, version };
  }

  function isCurrentRequest(packageId: string, token: RequestToken): boolean {
    return (
      requestEpochRef.current === token.epoch &&
      requestVersionsRef.current.get(packageId) === token.version
    );
  }

  function invalidateRecordRequest(packageId: string) {
    requestVersionsRef.current.set(
      packageId,
      (requestVersionsRef.current.get(packageId) ?? 0) + 1
    );
  }

  function invalidateAllRequests() {
    requestEpochRef.current += 1;
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
    setCheckingMessage("Reading label");
    setCheckError(null);
    const requestToken = beginRecordRequest(packageId);
    try {
      const result = await verifyLabel(record.image_file, record.application_data);
      updateRecordWithResult(packageId, result, requestToken);
    } catch (error) {
      if (!isCurrentRequest(packageId, requestToken)) {
        return;
      }
      const message = errorMessageFor(error);
      setCheckError(message);
      setRecords((current) =>
        isCurrentRequest(packageId, requestToken)
          ? current.map((candidate) =>
              candidate.package_id === packageId
                ? { ...candidate, item_error: message, status: "Needs Review" }
                : candidate
            )
          : current
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

    setIsChecking(true);
    setCheckingMessage("Checking batch capacity");
    setCheckError(null);
    const submittedRecords = currentRecords.slice();
    const batchEpoch = requestEpochRef.current;
    const requestTokens = new Map(
      submittedRecords.map((record) => [
        record.package_id,
        beginRecordRequest(record.package_id)
      ])
    );
    let failedGroupCount = 0;
    try {
      const { max_batch_items: maxBatchItems } = await getHealth();
      if (!Number.isInteger(maxBatchItems) || maxBatchItems < 1) {
        throw new VerificationApiError(
          "The verification service returned an invalid batch limit.",
          "configuration_error"
        );
      }

      const shouldRunBatch =
        submittedRecords.length <= 1 ||
        window.confirm(
          `Verify ${submittedRecords.length} applications now?\n\nLabels are sent in groups of up to ${maxBatchItems} so larger workloads can finish safely.`
        );
      if (!shouldRunBatch) {
        return;
      }

      for (let start = 0; start < submittedRecords.length; start += maxBatchItems) {
        const group = submittedRecords.slice(start, start + maxBatchItems);
        const end = start + group.length;
        setCheckingMessage(`Reading labels ${start + 1}-${end} of ${submittedRecords.length}`);

        try {
          const batchResult = await verifyBatch(
            group.map((record) => ({
              image: record.image_file,
              application_data: record.application_data
            }))
          );
          applyBatchGroupResult(group, batchResult, requestTokens);
        } catch (error) {
          if (requestEpochRef.current === batchEpoch) {
            failedGroupCount += 1;
          }
          markBatchGroupFailed(group, errorMessageFor(error), requestTokens);
        }
      }

      if (failedGroupCount > 0 && requestEpochRef.current === batchEpoch) {
        setCheckError(
          "Some label groups could not be checked. Review the affected applications and try them again."
        );
      }
    } catch (error) {
      if (requestEpochRef.current === batchEpoch) {
        setCheckError(errorMessageFor(error));
      }
    } finally {
      setCheckingMessage(null);
      setIsChecking(false);
    }
  }

  function applyBatchGroupResult(
    group: ApplicationPackageRecord[],
    batchResult: BatchResult,
    requestTokens: Map<string, RequestToken>
  ) {
    const updates = new Map(
      batchResult.items.flatMap((item) => {
        const record = group[item.index];
        return record ? [[record.package_id, item] as const] : [];
      })
    );

    setRecords((current) =>
      current.map((record) => {
        const requestToken = requestTokens.get(record.package_id);
        if (!requestToken || !isCurrentRequest(record.package_id, requestToken)) {
          return record;
        }
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

  function markBatchGroupFailed(
    group: ApplicationPackageRecord[],
    message: string,
    requestTokens: Map<string, RequestToken>
  ) {
    const packageIds = new Set(group.map((record) => record.package_id));
    setRecords((current) =>
      current.map((record) => {
        const requestToken = requestTokens.get(record.package_id);
        return packageIds.has(record.package_id) &&
          requestToken &&
          isCurrentRequest(record.package_id, requestToken)
          ? { ...record, item_error: message, status: "Needs Review" }
          : record;
      })
    );
  }

  function updateRecordWithResult(
    packageId: string,
    result: VerificationResult,
    requestToken: RequestToken
  ) {
    setRecords((current) =>
      isCurrentRequest(packageId, requestToken)
        ? current.map((record) =>
            record.package_id === packageId
              ? applyVerificationResult(record, result)
              : record
          )
        : current
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
    const requestToken = beginRecordRequest(record.package_id);
    try {
      const result = await compareExtractedData(
        record.application_data,
        record.reviewed_extracted_data ?? emptyExtractedData(),
        record.reviewed_extracted_formatting,
        fieldDecisions
      );
      setRecords((current) =>
        isCurrentRequest(record.package_id, requestToken)
          ? current.map((candidate) =>
              candidate.package_id === record.package_id
                ? {
                    ...applyComparisonResult(candidate, result, fieldDecisions)
                  }
                : candidate
            )
          : current
      );
    } catch (error) {
      if (isCurrentRequest(record.package_id, requestToken)) {
        setCheckError(errorMessageFor(error));
      }
    }
  }

  return {
    checkError,
    checkingMessage,
    compareEditedRecord,
    invalidateAllRequests,
    invalidateRecordRequest,
    isChecking,
    setCheckError,
    setFieldDecision,
    verifyBatchApplications,
    verifySingleApplication
  };
}
