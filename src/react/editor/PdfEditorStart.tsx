import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  type RefObject,
  useId,
  useRef,
  useState,
} from "react";
import type { PdfError } from "../../core/errors/pdf-error.js";
import { usePdfMessages } from "../hooks.js";

interface StartProps {
  readonly error: PdfError | undefined;
  readonly onFile: (file: File) => void;
  readonly button: RefObject<HTMLButtonElement | null>;
  readonly className: string;
  readonly alertClassName: string;
}

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

/**
 * What the editor shows with no document open: a button that opens the
 * system's file picker, a drop zone around it, and the reason the last open
 * failed, if it did. The button is the keyboard and screen reader path; the
 * drop zone is a shortcut for pointer users, so it isn't focusable itself.
 */
export function PdfEditorStart(props: StartProps): ReactNode {
  const { error, onFile, button, className, alertClassName } = props;
  const messages = usePdfMessages();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const titleId = useId();
  const hintId = useId();

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = event.target.files ?? [];
    // Cleared so choosing the same file again still opens it.
    event.target.value = "";
    if (file) onFile(file);
  };

  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const onDragLeave = (event: DragEvent) => {
    // Leaving for a child isn't leaving the zone.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragging(false);
  };

  const onDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    setDragging(false);
    const [file] = event.dataTransfer.files;
    if (file) onFile(file);
  };

  return (
    // The zone is a pointer shortcut only: the button opens the same picker.
    // biome-ignore lint/a11y/noStaticElementInteractions: drop targets have no keyboard role; the button is the accessible path
    <div
      className={className}
      data-hm-dragging={dragging ? "" : undefined}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <p id={titleId} className="hm-pdf-editor-start-title">
        {messages.t(error ? "editor.start.retryTitle" : "editor.start.title")}
      </p>
      {error ? (
        <p role="alert" className={alertClassName}>
          {messages.error(error)}
        </p>
      ) : null}
      <button
        ref={button}
        type="button"
        className="hm-pdf-editor-button"
        aria-describedby={hintId}
        onClick={() => input.current?.click()}
      >
        {messages.t(error ? "editor.start.retry" : "editor.start.choose")}
      </button>
      <p id={hintId} className="hm-pdf-editor-start-hint">
        {messages.t("editor.start.hint")}
      </p>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        // The button above is the control; this input only opens the picker.
        tabIndex={-1}
        aria-hidden="true"
        hidden
        onChange={choose}
      />
    </div>
  );
}
