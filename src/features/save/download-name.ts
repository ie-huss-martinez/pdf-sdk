import { cleanFileName, MAX_NAME_LENGTH } from "../../core/session/source-name.js";

/** The download's name when there's no usable one (docs/adr/0009). */
export const DEFAULT_DOWNLOAD_NAME = "document.pdf";

const EXTENSION = ".pdf";

/**
 * A safe name for the saved document, from the source's name or a host's
 * `downloadName`, which are both cleaned as file names (docs/adr/0009). It
 * ends in `.pdf`, in any case, stays within the name limit, and falls back
 * to {@link DEFAULT_DOWNLOAD_NAME}.
 */
export function downloadFileName(name: unknown): string {
  const clean = cleanFileName(name);
  if (clean === undefined) return DEFAULT_DOWNLOAD_NAME;
  if (clean.toLowerCase().endsWith(EXTENSION)) return clean;
  const base = Array.from(clean)
    .slice(0, MAX_NAME_LENGTH - EXTENSION.length)
    .join("")
    .trimEnd();
  return base === "" ? DEFAULT_DOWNLOAD_NAME : `${base}${EXTENSION}`;
}

/**
 * Saves bytes through the browser, as a download named `name`: a `blob:`
 * URL on a detached `<a download>`. It makes no request, and needs no
 * Content Security Policy beyond the README's (docs/adr/0009).
 */
export function saveFile(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  link.click();
  // Some browsers read the URL after the click returns, so it's revoked
  // later rather than at once.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER);
}

/** How long a download's URL stays valid, in milliseconds. */
export const REVOKE_AFTER = 40_000;
