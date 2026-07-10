export function createPreviewUrl(file: File): string {
  if (typeof URL.createObjectURL === "function") {
    return URL.createObjectURL(file);
  }

  return "";
}

export function revokePreviewUrl(url: string) {
  if (url && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
}

export function mergeFilesByName(currentFiles: File[], incomingFiles: File[]): File[] {
  const filesByName = new Map(currentFiles.map((file) => [file.name, file]));
  for (const file of incomingFiles) {
    filesByName.set(file.name, file);
  }

  return Array.from(filesByName.values());
}

