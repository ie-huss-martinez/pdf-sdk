import { PdfError } from "../errors/pdf-error.js";
import type { PdfAnnotation, PdfColor } from "../model/annotations.js";
import type { PdfFieldValue } from "../model/document.js";
import type { PdfRotation } from "../model/geometry.js";
import type { PdfPlan, PdfPlanPage } from "../model/plan.js";
import {
  longerThan,
  PDF_MAX_FIELD_NAME_LENGTH,
  PDF_MAX_TEXT_LENGTH,
  PDF_POSITION_GRID,
} from "../model/portable.js";
import {
  checkAnnotation,
  checkId,
  fields,
  Invalid,
  invalid,
  isRecord,
  type PdfAddAnnotationCommand,
  type PdfCommand,
  type PdfRestorePagesCommand,
} from "../operations/commands.js";

/**
 * The name of the plan's portable format (sdk-core ADR 0045).
 *
 * @public
 */
export const PDF_PLAN_FORMAT = "hm-pdf-plan";

/**
 * The version of {@link PDF_PLAN_FORMAT} this release writes, and the latest
 * it reads.
 *
 * @public
 */
export const PDF_PLAN_VERSION = 1;

/**
 * A content-addressed reference to binary data, such as a source's file
 * (sdk-core ADR 0045). Documents never inline bytes.
 *
 * @public
 */
export interface PdfAssetReference {
  /** `sha256:` and the lowercase hex SHA-256 of the bytes. */
  readonly asset: string;
  /** The bytes' media type, such as `application/pdf`, in lowercase. */
  readonly mediaType: string;
  /** The size of the bytes. */
  readonly size: number;
}

/**
 * A source, as a plan document records it: its page count, which the pages
 * that use it must fit, and, once documents travel with their files, its
 * content.
 *
 * @public
 */
export interface PdfPlanDocumentSource {
  readonly pageCount: number;
  readonly asset?: PdfAssetReference;
}

/**
 * A point in a plan document: whole millionths of the page, from 0 to
 * {@link PDF_POSITION_GRID}.
 *
 * @public
 */
export interface PdfDocumentPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * A pen or highlighter stroke in a plan document. Its points and width are
 * whole millionths of the page.
 *
 * @public
 */
export interface PdfStrokeAnnotationDocument {
  readonly id: string;
  readonly type: "pen" | "highlight";
  readonly points: readonly PdfDocumentPoint[];
  readonly color: PdfColor;
  readonly width: number;
}

/**
 * A text note in a plan document. Its position and size are whole
 * millionths of the page.
 *
 * @public
 */
export interface PdfTextAnnotationDocument {
  readonly id: string;
  readonly type: "text";
  readonly at: PdfDocumentPoint;
  readonly text: string;
  readonly size: number;
  readonly color: PdfColor;
}

/**
 * An annotation in a plan document. Version 1 has no signatures: their image
 * needs an asset, whose design comes with the signature tool (docs/adr/0003).
 *
 * @public
 */
export type PdfAnnotationDocument = PdfStrokeAnnotationDocument | PdfTextAnnotationDocument;

/**
 * A page in a plan document.
 *
 * @public
 */
export interface PdfPlanDocumentPage {
  readonly key: string;
  readonly source: string;
  readonly pageIndex: number;
  readonly rotation: PdfRotation;
  readonly annotations: readonly PdfAnnotationDocument[];
}

/**
 * The plan as portable JSON: `hm-pdf-plan` version 1, which
 * `formats/hm-pdf-plan/v1.schema.json` describes
 * (docs/formats/hm-pdf-plan.md). Positions and sizes are whole millionths of
 * the page, and pages name their sources by ids the document lists.
 *
 * @public
 */
export interface PdfPlanDocument {
  readonly format: typeof PDF_PLAN_FORMAT;
  readonly version: typeof PDF_PLAN_VERSION;
  readonly sources: Readonly<Record<string, PdfPlanDocumentSource>>;
  readonly pages: readonly PdfPlanDocumentPage[];
  readonly formValues: Readonly<Record<string, Readonly<Record<string, PdfFieldValue>>>>;
}

/**
 * `pdf.addAnnotation` as `hm-pdf-command` writes it, with the annotation's
 * positions and sizes in whole millionths of the page.
 *
 * @public
 */
export interface PdfAddAnnotationCommandDocument {
  readonly type: "pdf.addAnnotation";
  readonly page: string;
  readonly annotation: PdfAnnotationDocument;
  readonly index?: number;
}

/**
 * A user-level command as portable JSON: `hm-pdf-command` version 1, which
 * `formats/hm-pdf-command/v1.schema.json` describes. Every command but
 * `pdf.restorePages`, an inverse that carries whole pages; only
 * `pdf.addAnnotation` differs from the command in memory.
 *
 * @public
 */
export type PdfCommandDocument =
  | Exclude<PdfCommand, PdfRestorePagesCommand | PdfAddAnnotationCommand>
  | PdfAddAnnotationCommandDocument;

/**
 * Why a plan document was refused, as a stable token: `details.reason` on
 * the error (sdk-core ADR 0045).
 *
 * - With `UNSUPPORTED_FORMAT`: `unknown-format`, a document of another
 *   format, and `unknown-format-version`, a later version than this release
 *   reads.
 * - With `INVALID_DOCUMENT`: `malformed-document`, a document that isn't
 *   shaped as the schema says; `unknown-source`, a page or form values for a
 *   source the document doesn't list; `page-out-of-range`, a page index its
 *   source doesn't have; `duplicate-key`, two pages with one key;
 *   `duplicate-annotation`, two annotations with one id on a page; and, as
 *   for commands, `invalid-rotation`, `outside-page`, `invalid-size`,
 *   `too-many-points`, `invalid-color`, `unsupported-annotation`,
 *   `field-name-too-long` and `text-too-long`.
 *
 * @public
 */
export type PdfDocumentRejection =
  | "unknown-format"
  | "unknown-format-version"
  | "malformed-document"
  | "unknown-source"
  | "page-out-of-range"
  | "duplicate-key"
  | "duplicate-annotation"
  | "invalid-rotation"
  | "outside-page"
  | "invalid-size"
  | "too-many-points"
  | "invalid-color"
  | "unsupported-annotation"
  | "field-name-too-long"
  | "text-too-long";

const DOCUMENT_FIELDS = ["format", "version", "sources", "pages", "formValues"];
const PAGE_FIELDS = ["key", "source", "pageIndex", "rotation", "annotations"];
const ASSET_FIELDS = ["asset", "mediaType", "size"];
/** The patterns the schema uses too, so both accept the same documents. */
const ASSET_ID = /^sha256:[0-9a-f]{64}$/;
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const ROTATIONS: readonly number[] = [0, 90, 180, 270];

function malformed(message: string): never {
  return invalid("malformed-command", message);
}

const isCount = (value: unknown, min: number): value is number =>
  Number.isSafeInteger(value) && (value as number) >= min;

/** Millionths to a fraction. The reducer's checks then see the fraction. */
function fromGrid(value: unknown, what: string): number {
  if (!Number.isSafeInteger(value)) malformed(`${what} is whole millionths of the page`);
  return (value as number) / PDF_POSITION_GRID;
}

const toGridUnits = (fraction: number) => Math.round(fraction * PDF_POSITION_GRID);

function pointFromDocument(value: unknown, what: string): unknown {
  if (!isRecord<Record<string, unknown>>(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([name, entry]) => [
      name,
      name === "x" || name === "y" ? fromGrid(entry, `${what}.${name}`) : entry,
    ]),
  );
}

/**
 * An annotation's JSON form in memory: its millionths become fractions, and
 * everything else is left for {@link checkAnnotation}, which refuses what
 * doesn't fit.
 */
function annotationFromDocument(value: unknown): unknown {
  if (!isRecord<Record<string, unknown>>(value)) return value;
  const { type } = value;
  if (type !== "pen" && type !== "highlight" && type !== "text") return value;
  return Object.fromEntries(
    Object.entries(value).map(([name, entry]) => {
      if (name === "width" || name === "size") return [name, fromGrid(entry, name)];
      if (name === "at") return [name, pointFromDocument(entry, "at")];
      if (name === "points" && Array.isArray(entry)) {
        return [name, entry.map((point) => pointFromDocument(point, "a point"))];
      }
      return [name, entry];
    }),
  );
}

function annotationToDocument(annotation: PdfAnnotation): PdfAnnotationDocument {
  const point = ({ x, y }: { x: number; y: number }) => ({ x: toGridUnits(x), y: toGridUnits(y) });
  switch (annotation.type) {
    case "pen":
    case "highlight":
      return {
        id: annotation.id,
        type: annotation.type,
        points: annotation.points.map(point),
        color: annotation.color,
        width: toGridUnits(annotation.width),
      };
    case "text":
      return {
        id: annotation.id,
        type: "text",
        at: point(annotation.at),
        text: annotation.text,
        size: toGridUnits(annotation.size),
        color: annotation.color,
      };
    default:
      throw new TypeError("hm-pdf-plan version 1 can't hold signature annotations.");
  }
}

function readAsset(value: unknown): PdfAssetReference {
  if (!isRecord<PdfAssetReference>(value)) malformed("an asset is an object");
  fields(value, ASSET_FIELDS, "an asset");
  const { asset, mediaType, size } = value;
  if (typeof asset !== "string" || !ASSET_ID.test(asset)) malformed("an asset id is sha256:<hex>");
  if (typeof mediaType !== "string" || mediaType.length > 255 || !MEDIA_TYPE.test(mediaType)) {
    malformed("a media type is type/subtype, in lowercase");
  }
  if (!isCount(size, 0)) malformed("an asset's size is a whole number of bytes");
  return { asset, mediaType, size };
}

function readSources(value: unknown): Record<string, PdfPlanDocumentSource> {
  if (!isRecord<Record<string, unknown>>(value)) malformed("sources is an object");
  // Object.fromEntries keeps ids such as __proto__ as own, ordinary keys.
  return Object.fromEntries(
    Object.entries(value).map(([id, source]) => {
      checkId(id, "a source id");
      if (!isRecord<PdfPlanDocumentSource>(source)) malformed("a source is an object");
      fields(source, ["pageCount"], "a source", ["asset"]);
      if (!isCount(source.pageCount, 1)) malformed("a source's page count is at least 1");
      const entry: PdfPlanDocumentSource =
        source.asset === undefined
          ? { pageCount: source.pageCount }
          : { pageCount: source.pageCount, asset: readAsset(source.asset) };
      return [id, entry];
    }),
  );
}

/** A page's shape, before what depends on the rest of the document. */
function readPage(value: unknown): PdfPlanPage {
  if (!isRecord<PdfPlanDocumentPage>(value)) malformed("a page is an object");
  fields(value, PAGE_FIELDS, "a page");
  const key = checkId(value.key, "a page key");
  const source = checkId(value.source, "a source id");
  if (!isCount(value.pageIndex, 0)) malformed("a page index is a whole number from 0");
  if (typeof value.rotation !== "number") malformed("a page's rotation is a number");
  if (!ROTATIONS.includes(value.rotation)) {
    invalid("invalid-rotation", "a page's rotation is 0, 90, 180 or 270");
  }
  if (!Array.isArray(value.annotations)) malformed("a page's annotations are a list");
  const annotations = value.annotations.map((annotation) =>
    checkAnnotation(annotationFromDocument(annotation)),
  );
  return { key, source, pageIndex: value.pageIndex, rotation: value.rotation, annotations };
}

function readFieldValue(value: unknown): PdfFieldValue {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") malformed("a field's value is text or a boolean");
  if (longerThan(value, PDF_MAX_TEXT_LENGTH)) {
    invalid("text-too-long", `a field's value has more than ${PDF_MAX_TEXT_LENGTH} code points`);
  }
  return value;
}

function readFormValues(value: unknown): PdfPlan["formValues"] {
  if (!isRecord<Record<string, unknown>>(value)) malformed("formValues is an object");
  return Object.fromEntries(
    Object.entries(value).map(([source, values]) => {
      checkId(source, "a source id");
      if (!isRecord<Record<string, unknown>>(values) || Object.keys(values).length === 0) {
        malformed("a source's form values are an object with at least one field");
      }
      return [
        source,
        Object.fromEntries(
          Object.entries(values).map(([field, entry]) => {
            if (field === "") malformed("a field's name is text");
            if (longerThan(field, PDF_MAX_FIELD_NAME_LENGTH)) {
              invalid(
                "field-name-too-long",
                `a field's name has at most ${PDF_MAX_FIELD_NAME_LENGTH} code points`,
              );
            }
            return [field, readFieldValue(entry)];
          }),
        ),
      ];
    }),
  );
}

function read(value: unknown): {
  plan: PdfPlan;
  sources: Record<string, PdfPlanDocumentSource>;
} {
  if (!isRecord<PdfPlanDocument>(value)) malformed("a document is an object");
  const { format, version } = value;
  if (typeof format !== "string") malformed("format is text");
  if (format !== PDF_PLAN_FORMAT) {
    throw new PdfError("UNSUPPORTED_FORMAT", `This isn't an ${PDF_PLAN_FORMAT} document.`, {
      details: { format: PDF_PLAN_FORMAT, reason: "unknown-format" },
    });
  }
  if (Number.isSafeInteger(version) && (version as number) > PDF_PLAN_VERSION) {
    throw new PdfError(
      "UNSUPPORTED_FORMAT",
      `This ${PDF_PLAN_FORMAT} document is a later version than this release reads.`,
      { details: { format: PDF_PLAN_FORMAT, reason: "unknown-format-version" } },
    );
  }
  if (version !== PDF_PLAN_VERSION) malformed("version is 1");
  fields(value, DOCUMENT_FIELDS, "a document");

  // First everything a schema checks, then what depends on the whole
  // document, so a refusal's reason says whether the schema refuses it too.
  const sources = readSources(value.sources);
  if (!Array.isArray(value.pages) || value.pages.length === 0) {
    malformed("pages is a list of at least one page");
  }
  const pages = value.pages.map(readPage);
  const formValues = readFormValues(value.formValues);

  const keys = new Set<string>();
  for (const page of pages) {
    if (keys.has(page.key)) invalid("duplicate-key", `two pages have the key ${page.key}`);
    keys.add(page.key);
    const source = Object.hasOwn(sources, page.source) ? sources[page.source] : undefined;
    if (source === undefined) {
      invalid("unknown-source", `the document doesn't list source ${page.source}`);
    }
    if (page.pageIndex >= source.pageCount) {
      invalid("page-out-of-range", `source ${page.source} has no page index ${page.pageIndex}`);
    }
    const ids = new Set(page.annotations.map(({ id }) => id));
    if (ids.size !== page.annotations.length) {
      invalid("duplicate-annotation", `page ${page.key} has two annotations with one id`);
    }
  }
  for (const source of Object.keys(formValues)) {
    if (!Object.hasOwn(sources, source)) {
      invalid("unknown-source", `the document doesn't list source ${source}`);
    }
  }
  return { plan: { pages, formValues }, sources };
}

/**
 * Reads a plan document, such as one parsed from JSON, checking it as
 * {@link PdfPlanDocument}'s schema does and more: every page's source must
 * be one the document lists, with the page's index, and page keys and each
 * page's annotation ids must be unique. Unknown fields are refused, never
 * dropped.
 *
 * @param value - The parsed JSON.
 * @returns The plan, with positions as fractions of the page, and its
 *   sources by id.
 * @throws `PdfError` with `UNSUPPORTED_FORMAT` for another format or a later
 *   version, and `INVALID_DOCUMENT` for anything else that's wrong, with a
 *   {@link PdfDocumentRejection} as `details.reason`.
 * @public
 */
export function readPdfPlanDocument(value: unknown): {
  readonly plan: PdfPlan;
  readonly sources: Readonly<Record<string, PdfPlanDocumentSource>>;
} {
  try {
    return read(value);
  } catch (error) {
    if (!(error instanceof Invalid)) throw error;
    const reason = error.reason === "malformed-command" ? "malformed-document" : error.reason;
    throw new PdfError(
      "INVALID_DOCUMENT",
      `Invalid ${PDF_PLAN_FORMAT} document: ${error.message}.`,
      {
        details: { format: PDF_PLAN_FORMAT, reason },
      },
    );
  }
}

/**
 * Writes a plan as a {@link PdfPlanDocument}, plain JSON-ready data, with
 * positions and sizes in whole millionths of the page.
 *
 * @param plan - The plan, such as a session snapshot's.
 * @param sources - The sources by id, with at least every one the plan's
 *   pages and form values use. They're written as given.
 * @throws `TypeError` if a source the plan uses is missing from `sources`,
 *   or the plan has a signature annotation, which version 1 can't hold.
 * @public
 */
export function toPdfPlanDocument(
  plan: PdfPlan,
  sources: Readonly<Record<string, PdfPlanDocumentSource>>,
): PdfPlanDocument {
  for (const source of [
    ...plan.pages.map((page) => page.source),
    ...Object.keys(plan.formValues),
  ]) {
    if (!Object.hasOwn(sources, source)) {
      throw new TypeError(`The sources don't include ${source}, which the plan uses.`);
    }
  }
  return {
    format: PDF_PLAN_FORMAT,
    version: PDF_PLAN_VERSION,
    sources: Object.fromEntries(
      Object.entries(sources).map(([id, { pageCount, asset }]) => [
        id,
        asset === undefined ? { pageCount } : { pageCount, asset: { ...asset } },
      ]),
    ),
    pages: plan.pages.map((page) => ({
      key: page.key,
      source: page.source,
      pageIndex: page.pageIndex,
      rotation: page.rotation,
      annotations: page.annotations.map(annotationToDocument),
    })),
    formValues: Object.fromEntries(
      Object.entries(plan.formValues).map(([source, values]) => [
        source,
        Object.fromEntries(Object.entries(values)),
      ]),
    ),
  };
}

/**
 * Reads a command in its portable form, `hm-pdf-command` version 1, such as
 * one parsed from JSON, into the command the session executes: an
 * annotation's millionths become fractions of the page. The session's
 * reducer checks everything else when the command runs.
 *
 * @param value - The parsed JSON.
 * @throws `PdfError` with `INVALID_COMMAND` and `malformed-command` for a
 *   position or size that isn't whole millionths, and `unknown-command` for
 *   `pdf.restorePages`, which isn't part of the format.
 * @public
 */
export function readPdfCommandDocument(value: unknown): PdfCommand {
  try {
    if (!isRecord<Record<string, unknown>>(value)) return value as PdfCommand;
    if (value["type"] === "pdf.restorePages") {
      invalid("unknown-command", "pdf.restorePages isn't a command of the portable format");
    }
    if (value["type"] !== "pdf.addAnnotation") return value as unknown as PdfCommand;
    return Object.fromEntries(
      Object.entries(value).map(([name, entry]) => [
        name,
        name === "annotation" ? annotationFromDocument(entry) : entry,
      ]),
    ) as unknown as PdfCommand;
  } catch (error) {
    if (!(error instanceof Invalid)) throw error;
    throw new PdfError("INVALID_COMMAND", `Invalid command: ${error.message}.`, {
      details: { reason: error.reason },
    });
  }
}

/**
 * Writes a command in its portable form, `hm-pdf-command` version 1, with an
 * annotation's positions and sizes in whole millionths of the page.
 *
 * @param command - A command the session applied, so its values are on the
 *   grid.
 * @throws `TypeError` for `pdf.restorePages`, which isn't part of the
 *   format, and for a signature annotation, which version 1 can't hold.
 * @public
 */
export function toPdfCommandDocument(command: PdfCommand): PdfCommandDocument {
  if (command.type === "pdf.restorePages") {
    throw new TypeError("pdf.restorePages isn't a command of the portable format.");
  }
  if (command.type !== "pdf.addAnnotation") return structuredClone(command);
  return {
    type: "pdf.addAnnotation",
    page: command.page,
    annotation: annotationToDocument(command.annotation),
    ...(command.index === undefined ? {} : { index: command.index }),
  };
}
