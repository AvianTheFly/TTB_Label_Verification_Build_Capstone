import type { ChangeEvent, DragEvent, ReactNode, RefObject } from "react";

import type { PackageValidationError } from "../packageWorkflowUtils";

interface UploadDropSurfaceProps {
  checkError: string | null;
  children: ReactNode;
  fileInputRef: RefObject<HTMLInputElement>;
  isDragging: boolean;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  validationErrors: PackageValidationError[];
}

export function UploadDropSurface({
  checkError,
  children,
  fileInputRef,
  isDragging,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onFileInputChange,
  validationErrors
}: UploadDropSurfaceProps) {
  return (
    <div
      className={`package-drop-surface ${isDragging ? "package-drop-surface--active" : ""}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        aria-label="Application package upload"
        className={`package-dropzone ${isDragging ? "package-dropzone--active" : ""}`}
        data-testid="package-upload-area"
      >
        <div>
          <h2>Drop Label Images</h2>
          <p>JPG, PNG, or WEBP label images</p>
        </div>
        <button className="secondary-button" onClick={() => fileInputRef.current?.click()} type="button">
          Choose Files
        </button>
        <input
          accept="image/*"
          className="file-input"
          multiple
          onChange={onFileInputChange}
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

      {children}
    </div>
  );
}
