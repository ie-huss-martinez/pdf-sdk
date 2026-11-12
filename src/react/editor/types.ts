import type { PdfBytes } from "../../core/model/document.js";
import type { PdfExportOptions, PdfSession } from "../../core/session/session.js";
import type { PdfSessionProviderProps } from "../PdfSessionProvider.js";

/**
 * The parts of `PdfEditor` that take extra classes through `classNames`.
 *
 * @public
 */
export type PdfEditorPart =
  | "root"
  | "header"
  | "toolbar"
  | "body"
  | "sidebar"
  | "start"
  | "status"
  | "alert";

/**
 * What changed in the editor's document, for {@link PdfEditorProps.onChange}.
 *
 * - `open`: a document opened, replacing any other.
 * - `edit`: the document changed: an edit, an insert, an undo or a redo.
 * - `close`: the document closed.
 *
 * @public
 */
export interface PdfEditorChange {
  /** What happened: see {@link PdfEditorChange}. */
  readonly reason: "open" | "edit" | "close";
  /** The document's page count after the change; 0 once it's closed. */
  readonly pageCount: number;
}

/**
 * Props for {@link PdfEditor}. The session props are the provider's: pass a
 * `session` of your own, or let the editor create one from `engine`,
 * `processor`, `assetsUrl`, `filePolicy` and `onEvent`.
 *
 * @public
 */
export interface PdfEditorProps extends Omit<PdfSessionProviderProps, "children"> {
  /**
   * A document to open. The editor opens it on mount, and again whenever a
   * different file or buffer is passed; `null` closes the document. Files
   * the user opens in the editor don't change this prop.
   */
  readonly file?: Blob | PdfBytes | null;
  /** Called after the document opens, changes or closes. */
  readonly onChange?: (change: PdfEditorChange) => void;
  /** Extra classes on the root. */
  readonly className?: string;
  /** Extra classes on each part. */
  readonly classNames?: Readonly<Partial<Record<PdfEditorPart, string>>>;
  /** Drop the visual styles, keeping layout and accessibility. */
  readonly unstyled?: boolean;
}

/**
 * What a ref to {@link PdfEditor} gives the host.
 *
 * @public
 */
export interface PdfEditorHandle {
  /** The editor's session, for commands and state beyond the handle's. */
  readonly session: PdfSession;
  /** Opens a document, replacing the current one once it has opened. */
  open(file: Blob | PdfBytes): Promise<void>;
  /** Builds the document as it is now. The result is a new buffer the caller owns. */
  export(options?: PdfExportOptions): Promise<Uint8Array>;
  /** Undoes the last edit, if there is one. */
  undo(): void;
  /** Redoes the last undone edit, if there is one. */
  redo(): void;
  /** Closes the document. */
  close(): Promise<void>;
}
