import { useEffect, useMemo, useState } from "react";

import { formatFileSize } from "../../labelFields";
import { createPreviewUrl, revokePreviewUrl } from "../filePreviews";
import { isSupportedImageFile } from "../packageWorkflowUtils";

interface PreviewImage {
  file: File;
  url: string;
}

interface UploadPreviewDialogProps {
  files: File[];
  onAccept: (files: File[]) => void;
  onCancel: () => void;
  onRemoveFile: (filename: string) => void;
}

export function UploadPreviewDialog({
  files,
  onAccept,
  onCancel,
  onRemoveFile
}: UploadPreviewDialogProps) {
  const imageFiles = useMemo(() => files.filter(isSupportedImageFile), [files]);
  const [selectedFilename, setSelectedFilename] = useState(imageFiles[0]?.name ?? "");
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);

  useEffect(() => {
    const nextPreviewImages = imageFiles.map((file) => ({
      file,
      url: createPreviewUrl(file)
    }));
    setPreviewImages(nextPreviewImages);

    return () => {
      for (const preview of nextPreviewImages) {
        revokePreviewUrl(preview.url);
      }
    };
  }, [imageFiles]);

  useEffect(() => {
    if (!imageFiles.some((file) => file.name === selectedFilename)) {
      setSelectedFilename(imageFiles[0]?.name ?? "");
    }
  }, [imageFiles, selectedFilename]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const previewByFilename = new Map(previewImages.map((preview) => [preview.file.name, preview]));
  const selectedPreview = previewByFilename.get(selectedFilename) ?? previewImages[0];

  return (
    <div className="upload-preview-overlay" role="dialog" aria-modal="true" aria-labelledby="upload-preview-title">
      <section className="upload-preview-panel">
        <header className="upload-preview-header">
          <div>
            <h2 id="upload-preview-title">Review Images</h2>
            <p>
              {imageFiles.length} {imageFiles.length === 1 ? "image" : "images"} selected
            </p>
          </div>
          <button className="detail-close-button" onClick={onCancel} type="button" aria-label="Cancel image upload">
            X
          </button>
        </header>

        <div className="upload-preview-body">
          <div className="upload-preview-grid" aria-label="Selected image previews">
            {imageFiles.map((file) => {
              const preview = previewByFilename.get(file.name);
              return (
                <article className="upload-preview-tile" key={file.name}>
                  <button
                    className="upload-preview-tile__image"
                    onClick={() => setSelectedFilename(file.name)}
                    type="button"
                    aria-label={`Open larger preview for ${file.name}`}
                  >
                    {preview?.url ? <img alt="" src={preview.url} /> : <span aria-hidden="true" />}
                  </button>
                  <button
                    className="upload-preview-remove"
                    onClick={() => onRemoveFile(file.name)}
                    type="button"
                    aria-label={`Remove ${file.name}`}
                  >
                    X
                  </button>
                  <div className="upload-preview-tile__meta">
                    <strong>{file.name}</strong>
                    <span>{formatFileSize(file.size)}</span>
                  </div>
                </article>
              );
            })}
          </div>

          <figure className="upload-preview-large">
            {selectedPreview?.url ? (
              <img alt={`Large preview of ${selectedPreview.file.name}`} src={selectedPreview.url} />
            ) : (
              <div className="upload-preview-large__empty">No images selected</div>
            )}
            <figcaption>{selectedPreview?.file.name ?? "No image selected"}</figcaption>
          </figure>
        </div>

        <footer className="upload-preview-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={imageFiles.length === 0}
            onClick={() => onAccept(files)}
            type="button"
          >
            Use Images
          </button>
        </footer>
      </section>
    </div>
  );
}
