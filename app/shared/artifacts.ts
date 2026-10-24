export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export function fileSize(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export function checkFile(name: string, size: number, contentType: string) {
  if (!name.trim() || name.length > 180 || /[\x00-\x1f/\\]/.test(name))
    throw new Error(
      "Use a filename of up to 180 characters without path separators.",
    );
  if (!Number.isInteger(size) || size < 1 || size > MAX_FILE_BYTES)
    throw new Error("Choose a file between 1 byte and 20 MB.");
  if (contentType.length > 150 || /[\r\n]/.test(contentType))
    throw new Error("Invalid file type.");
}
