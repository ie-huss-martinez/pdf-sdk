import type { Tool } from "@hussmartinez/sdk-core";
import type { PdfSession, PdfSessionSnapshot } from "../core/session/session.js";

/**
 * What a tool reads to decide whether it's available, enabled or active.
 *
 * @public
 */
export interface PdfToolState {
  /** The session's current snapshot. */
  readonly snapshot: PdfSessionSnapshot;
  /** Whether the editor is saving the document. Absent outside the editor. */
  readonly saving?: boolean;
}

/**
 * What a tool runs against.
 *
 * @public
 */
export interface PdfToolContext {
  /** The session the tool edits. */
  readonly session: PdfSession;
  /** Asks the user for a PDF and opens it, as the open tool does. */
  readonly chooseFile: () => void;
  /**
   * Builds the document and saves it, as the download tool does
   * (docs/adr/0009). Absent outside the editor.
   */
  readonly save?: () => void;
}

/**
 * One of the editor's tools (sdk-core ADR 0009 and ADR 0030): headless, so
 * the React editor and the custom element share it.
 *
 * @public
 */
export type PdfTool = Tool<PdfToolState, PdfToolContext, undefined>;

/** Whether a document is open. */
export const hasDocument = ({ snapshot }: PdfToolState): boolean => snapshot.status === "ready";
