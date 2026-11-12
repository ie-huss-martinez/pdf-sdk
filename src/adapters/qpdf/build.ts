import { PDFDocument } from "@cantoo/pdf-lib";
import type { MergeSource, PdfToolkit } from "pdfstudio";
import { throwIfAborted } from "../../core/errors/abort.js";
import { isPdfError, PdfError } from "../../core/errors/pdf-error.js";
import type { PdfBuildJob, PdfBuildProgress, PdfBuildStep } from "../../core/model/build-job.js";
import { assertPageIndex, copyBytes } from "../../core/model/bytes.js";
import type { PdfFieldValue } from "../../core/model/document.js";
import { addRotation, type PdfRotation } from "../../core/model/geometry.js";

/** What a build needs from its host: qpdf, cancellation and progress. */
export interface BuildContext {
  readonly toolkit: () => Promise<PdfToolkit>;
  readonly signal?: AbortSignal;
  readonly progress?: (progress: PdfBuildProgress) => void;
}

/** pdfstudio's errors carry qpdf's stderr, and a class name for a bad password. */
function fromQpdfError(
  reason: unknown,
  code: "INVALID_PDF" | "PROCESSING_FAILED",
  message: string,
) {
  if (isPdfError(reason)) return reason;
  if (reason instanceof Error && reason.name === "PdfPasswordError") {
    return new PdfError("PASSWORD_REQUIRED", "A source is encrypted.", { cause: reason });
  }
  return new PdfError(code, message, { cause: reason });
}

/** Checks the job's references before any work, so a mistake costs nothing. */
function validate(job: PdfBuildJob): void {
  const ids = new Set<string>();
  for (const source of job.sources) {
    if (ids.has(source.id)) throw new TypeError(`The source ${source.id} appears twice.`);
    ids.add(source.id);
  }
  if (job.pages.length === 0) throw new TypeError("A build needs at least one page.");
  for (const page of job.pages) {
    if (!ids.has(page.source)) {
      throw new TypeError(`A page refers to ${page.source}, which isn't one of the sources.`);
    }
    addRotation(0, page.rotation ?? 0);
  }
}

/** Fills text fields and checkboxes, and redraws their appearances. */
async function fillForm(
  bytes: Uint8Array,
  values: Readonly<Record<string, PdfFieldValue>>,
): Promise<Uint8Array> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const form = document.getForm();
  for (const field of form.getFields()) {
    const name = field.getName();
    if (!Object.hasOwn(values, name)) continue;
    const value = values[name];
    if (typeof value === "boolean" && "check" in field) {
      const checkbox = field as unknown as { check(): void; uncheck(): void };
      if (value) checkbox.check();
      else checkbox.uncheck();
    } else if (typeof value === "string" && "setText" in field) {
      (field as unknown as { setText(text: string): void }).setText(value);
    }
  }
  form.updateFieldAppearances();
  return document.save({ addDefaultPage: false });
}

/**
 * Builds a document from a {@link PdfBuildJob} (docs/adr/0003): normalise and
 * fill each source with qpdf and pdf-lib, assemble the pages with their
 * rotations, compress, and encrypt, skipping every step with nothing to do.
 * pdf-lib only ever reads qpdf's output (docs/adr/0001).
 */
export async function runBuild(job: PdfBuildJob, context: BuildContext): Promise<Uint8Array> {
  const { signal } = context;
  throwIfAborted(signal);
  validate(job);
  if (job.pages.some((page) => page.annotations?.length)) {
    // Flattening arrives with the annotation tools.
    throw new PdfError("PROCESSING_FAILED", "Flattening annotations isn't supported yet.");
  }
  if (job.compress?.images) {
    // Image recompression arrives with the compression tool.
    throw new PdfError("PROCESSING_FAILED", "Recompressing images isn't supported yet.");
  }

  const steps: PdfBuildStep[] = ["fill", "assemble"];
  if (job.compress) steps.push("compress");
  if (job.encrypt) steps.push("encrypt");
  const done = (step: PdfBuildStep) =>
    context.progress?.({ step, fraction: (steps.indexOf(step) + 1) / steps.length });

  const pdf = await context.toolkit();
  throwIfAborted(signal);

  // 1. Normalise each source that's used, then fill its form values.
  const used = new Set(job.pages.map((page) => page.source));
  const sources = new Map<string, { bytes: Uint8Array; pageCount: number }>();
  for (const source of job.sources) {
    if (!used.has(source.id)) continue;
    let bytes: Uint8Array;
    let pageCount: number;
    try {
      bytes = await pdf.repair(copyBytes(source.bytes));
      pageCount = await pdf.pageCount(bytes);
    } catch (reason) {
      throw fromQpdfError(reason, "INVALID_PDF", `The source ${source.id} isn't a readable PDF.`);
    }
    throwIfAborted(signal);
    if (source.formValues && Object.keys(source.formValues).length > 0) {
      try {
        bytes = await fillForm(bytes, source.formValues);
      } catch (reason) {
        throw fromQpdfError(
          reason,
          "PROCESSING_FAILED",
          `The form in ${source.id} couldn't be filled.`,
        );
      }
      throwIfAborted(signal);
    }
    sources.set(source.id, { bytes, pageCount });
  }
  for (const page of job.pages) {
    assertPageIndex(page.pageIndex, sources.get(page.source)?.pageCount ?? 0);
  }
  done("fill");

  // 2. Assemble the pages in order, then add their rotations, one qpdf pass
  // per angle. One source in its own order, unrotated, needs neither.
  const [first] = sources.values();
  const identity =
    sources.size === 1 &&
    job.pages.length === first?.pageCount &&
    job.pages.every((page, index) => page.pageIndex === index);
  let output: Uint8Array;
  try {
    output = identity
      ? (first as { bytes: Uint8Array }).bytes
      : await pdf.merge(
          job.pages.map(
            (page): MergeSource => ({
              data: (sources.get(page.source) as { bytes: Uint8Array }).bytes,
              pages: String(page.pageIndex + 1),
            }),
          ),
        );
    throwIfAborted(signal);
    const byAngle = new Map<Exclude<PdfRotation, 0>, number[]>();
    job.pages.forEach((page, index) => {
      const rotation = page.rotation ?? 0;
      if (rotation !== 0) byAngle.set(rotation, [...(byAngle.get(rotation) ?? []), index + 1]);
    });
    for (const [angle, pages] of byAngle) {
      output = await pdf.rotate(output, { angle, pages: pages.join(",") });
      throwIfAborted(signal);
    }
  } catch (reason) {
    throw fromQpdfError(reason, "PROCESSING_FAILED", "The pages couldn't be assembled.");
  }
  done("assemble");

  // 3. Compress losslessly: object streams, and recompressed streams.
  if (job.compress) {
    try {
      output = await pdf.compress(output);
    } catch (reason) {
      throw fromQpdfError(reason, "PROCESSING_FAILED", "The document couldn't be compressed.");
    }
    throwIfAborted(signal);
    done("compress");
  }

  // 4. Encrypt with AES-256.
  if (job.encrypt) {
    const { userPassword, ownerPassword } = job.encrypt;
    try {
      output = await pdf.lock(output, {
        userPassword,
        ...(ownerPassword ? { ownerPassword } : {}),
        keyLength: 256,
      });
    } catch (reason) {
      throw fromQpdfError(reason, "PROCESSING_FAILED", "The document couldn't be encrypted.");
    }
    done("encrypt");
  }

  // The caller owns the result, in a buffer of its own, which the worker
  // transfers rather than copies. Copy only a view into a larger buffer.
  const whole = output.byteOffset === 0 && output.byteLength === output.buffer.byteLength;
  return whole && output.buffer instanceof ArrayBuffer ? output : copyBytes(output);
}
