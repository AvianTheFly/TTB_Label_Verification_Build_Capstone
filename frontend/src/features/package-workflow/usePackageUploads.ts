import {
  ChangeEvent,
  Dispatch,
  DragEvent,
  MutableRefObject,
  SetStateAction,
  useRef,
  useState
} from "react";

import { mergeFilesByName, revokePreviewUrl } from "./filePreviews";
import {
  ApplicationPackageRecord,
  PackageValidationError,
  parseApplicationPackages
} from "./packageWorkflowUtils";
import {
  mergeParsedRecords,
  previewUrlsToRevoke
} from "./recordMutations";

interface UsePackageUploadsParams {
  invalidateRequests: () => void;
  recordsRef: MutableRefObject<ApplicationPackageRecord[]>;
  setCheckError: Dispatch<SetStateAction<string | null>>;
  setRecords: Dispatch<SetStateAction<ApplicationPackageRecord[]>>;
  setSelectedPackageId: Dispatch<SetStateAction<string | null>>;
}

export function usePackageUploads({
  invalidateRequests,
  recordsRef,
  setCheckError,
  setRecords,
  setSelectedPackageId
}: UsePackageUploadsParams) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedFilesRef = useRef<File[]>([]);
  const dragDepthRef = useRef(0);
  const [validationErrors, setValidationErrors] = useState<PackageValidationError[]>([]);
  const [isDragging, setIsDragging] = useState(false);

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
    invalidateRequests();
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

  return {
    fileInputRef,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileInputChange,
    isDragging,
    validationErrors
  };
}
