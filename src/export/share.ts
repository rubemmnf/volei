/** Hands the PNG to the OS share sheet, falling back to a download. */
export async function shareImage(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      // The user dismissing the share sheet is not a failure worth reporting.
      if (error instanceof Error && error.name === "AbortError") return;
    }
  }

  downloadImage(blob, filename);
}

export function downloadImage(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
