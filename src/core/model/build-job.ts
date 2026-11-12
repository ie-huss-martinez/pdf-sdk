import type { PdfAnnotation } from "./annotations.js";
import type { PdfBytes, PdfFieldValue } from "./document.js";
import type { PdfRotation } from "./geometry.js";

/**
 * One source document of a {@link PdfBuildJob}.
 *
 * @public
 */
export interface PdfBuildSource {
  /** An identifier, unique within the job, that pages and form values refer to. */
  readonly id: string;
  readonly bytes: PdfBytes;
  /** Form values to fill into this source before its pages are assembled. */
  readonly formValues?: Readonly<Record<string, PdfFieldValue>>;
}

/**
 * One page of the output: a page of a source, with a rotation added to the
 * page's own, and the annotations to draw on it.
 *
 * @public
 */
export interface PdfBuildPage {
  /** The {@link PdfBuildSource.id} the page comes from. */
  readonly source: string;
  /** The page's zero-based index in its source. */
  readonly pageIndex: number;
  /** Rotation added to the page's own `/Rotate`. Defaults to 0. */
  readonly rotation?: PdfRotation;
  /** Annotations to flatten into the page's content. */
  readonly annotations?: readonly PdfAnnotation[];
}

/**
 * Lossy image recompression, on top of lossless compression.
 *
 * @public
 */
export interface PdfImageCompression {
  /** JPEG quality, from 0 to 1. */
  readonly quality: number;
  /** The longest image edge to keep, in pixels. Larger images are scaled down. */
  readonly maxDimension: number;
}

/**
 * How to compress the output. Compression is lossless unless `images` is set.
 *
 * @public
 */
export interface PdfCompression {
  readonly images?: PdfImageCompression;
}

/**
 * How to encrypt the output. Encryption is always AES-256.
 *
 * @public
 */
export interface PdfEncryption {
  /** The password needed to open the document. */
  readonly userPassword: string;
  /** The password that grants full access. Defaults to the user password. */
  readonly ownerPassword?: string;
}

/**
 * Everything needed to build an output document from the page plan, in one
 * call to the processor (ADR 0003): the sources, the pages in order, and the
 * export options. Plain data, so it crosses the worker boundary as it is.
 *
 * The processor runs the steps in this order, skipping those with nothing to
 * do: fill each source's form values, assemble the pages with their
 * rotations, flatten the annotations, compress, encrypt.
 *
 * @public
 */
export interface PdfBuildJob {
  readonly sources: readonly PdfBuildSource[];
  readonly pages: readonly PdfBuildPage[];
  readonly compress?: PdfCompression;
  readonly encrypt?: PdfEncryption;
}

/**
 * The steps of a build, reported as progress.
 *
 * @public
 */
export type PdfBuildStep = "fill" | "assemble" | "flatten" | "compress" | "encrypt";

/**
 * Progress of a build: the step running now, and the fraction of the whole
 * build that's done, from 0 to 1.
 *
 * @public
 */
export interface PdfBuildProgress {
  readonly step: PdfBuildStep;
  readonly fraction: number;
}
