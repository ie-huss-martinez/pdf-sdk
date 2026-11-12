import type { PdfFieldValue, PdfRect, PdfRotation } from "../../src/index.js";

/**
 * A stand-in for PDF bytes in unit tests: JSON after a marker, so the fakes
 * and the contract suites can be tested without a real engine. Real adapters
 * run the same suites with real PDFs.
 */
export interface FakePdf {
  readonly pages: readonly FakePage[];
  readonly fields?: readonly FakeField[];
  /** The password the document is encrypted with, if any. */
  readonly password?: string;
}

export interface FakePage {
  readonly width: number;
  readonly height: number;
  readonly rotation?: PdfRotation;
  readonly text?: string;
  /** How many annotations have been flattened into the page. */
  readonly drawn?: number;
}

export interface FakeField {
  readonly name: string;
  readonly type: "text" | "checkbox";
  readonly page: number;
  readonly rect: PdfRect;
  readonly value: PdfFieldValue;
}

const MARKER = "%FAKEPDF\n";

export function encodeFakePdf(pdf: FakePdf): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(MARKER + JSON.stringify(pdf));
}

/** Parses fake PDF bytes, or returns undefined for anything else. */
export function decodeFakePdf(bytes: Uint8Array): FakePdf | undefined {
  const text = new TextDecoder().decode(bytes);
  if (!text.startsWith(MARKER)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text.slice(MARKER.length)) as FakePdf;
    return Array.isArray(parsed.pages) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
