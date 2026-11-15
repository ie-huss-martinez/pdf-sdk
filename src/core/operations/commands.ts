import type { Applied, Reducer } from "@hussmartinez/sdk-core";
import { PdfError } from "../errors/pdf-error.js";
import type {
  PdfAnnotation,
  PdfColor,
  PdfStrokeAnnotation,
  PdfTextAnnotation,
} from "../model/annotations.js";
import type { PdfFieldValue } from "../model/document.js";
import { addRotation, type PdfPoint } from "../model/geometry.js";
import type { PdfPlan, PdfPlanPage } from "../model/plan.js";
import {
  longerThan,
  PDF_MAX_FIELD_NAME_LENGTH,
  PDF_MAX_ID_LENGTH,
  PDF_MAX_STROKE_POINTS,
  PDF_MAX_TEXT_LENGTH,
  toGrid,
} from "../model/portable.js";

/**
 * Rotates pages by an angle, added to their current rotation.
 *
 * @public
 */
export interface PdfRotatePagesCommand {
  readonly type: "pdf.rotatePages";
  /** The keys of the pages to rotate. */
  readonly pages: readonly string[];
  /**
   * Degrees, clockwise, in multiples of 90 from -360 to 360. Negative turns
   * anticlockwise.
   */
  readonly angle: number;
}

/**
 * Removes pages from the plan. Their sources stay, so undo can bring them back.
 *
 * @public
 */
export interface PdfDeletePagesCommand {
  readonly type: "pdf.deletePages";
  readonly pages: readonly string[];
}

/**
 * Puts deleted pages back at their positions. It's what undoing a delete
 * runs, and it can be used directly.
 *
 * @public
 */
export interface PdfRestorePagesCommand {
  readonly type: "pdf.restorePages";
  /** Each page, and the index it takes in the resulting plan, in increasing order. */
  readonly entries: readonly { readonly index: number; readonly page: PdfPlanPage }[];
}

/**
 * Moves pages, keeping their relative order, so that the first of them ends
 * up at position `to` of the resulting plan.
 *
 * @public
 */
export interface PdfMovePagesCommand {
  readonly type: "pdf.movePages";
  readonly pages: readonly string[];
  /** The zero-based position of the first moved page in the resulting plan. */
  readonly to: number;
}

/**
 * Puts every page in a new order, given as every key exactly once. It's what
 * undoing a move runs.
 *
 * @public
 */
export interface PdfReorderPagesCommand {
  readonly type: "pdf.reorderPages";
  readonly order: readonly string[];
}

/**
 * Inserts pages of a registered source document. The session registers the
 * source and fills in `keys`, so redo inserts the same pages.
 *
 * @public
 */
export interface PdfInsertPagesCommand {
  readonly type: "pdf.insertPages";
  /** The source's ID. */
  readonly source: string;
  /** Zero-based indexes of the source's pages to insert, in order. */
  readonly pageIndexes: readonly number[];
  /** The zero-based position of the first inserted page in the resulting plan. */
  readonly at: number;
  /** The keys of the new pages, one per index. */
  readonly keys: readonly string[];
}

/**
 * Sets a form field's value in one source, or clears the session's value with
 * `null`, so the document's own value applies again.
 *
 * @public
 */
export interface PdfSetFieldValueCommand {
  readonly type: "pdf.setFieldValue";
  readonly source: string;
  readonly field: string;
  readonly value: PdfFieldValue | null;
}

/**
 * Adds an annotation to a page.
 *
 * @public
 */
export interface PdfAddAnnotationCommand {
  readonly type: "pdf.addAnnotation";
  /** The page's key. */
  readonly page: string;
  readonly annotation: PdfAnnotation;
  /** Its position among the page's annotations. Defaults to the end. */
  readonly index?: number;
}

/**
 * Removes an annotation from a page.
 *
 * @public
 */
export interface PdfRemoveAnnotationCommand {
  readonly type: "pdf.removeAnnotation";
  readonly page: string;
  /** The annotation's ID. */
  readonly id: string;
}

/**
 * An edit to the page plan (docs/adr/0003). Commands are plain,
 * structured-cloneable data, never carry bytes, and each has an exact
 * inverse, which is how undo works (ADR 0010).
 *
 * @public
 */
export type PdfCommand =
  | PdfRotatePagesCommand
  | PdfDeletePagesCommand
  | PdfRestorePagesCommand
  | PdfMovePagesCommand
  | PdfReorderPagesCommand
  | PdfInsertPagesCommand
  | PdfSetFieldValueCommand
  | PdfAddAnnotationCommand
  | PdfRemoveAnnotationCommand;

/**
 * Why a command was refused, as a stable token: `details.reason` on the
 * `INVALID_COMMAND` error (sdk-core ADR 0045).
 *
 * - `malformed-command`: not shaped as a command of its type, such as a
 *   missing field, a field of the wrong type, an unknown field, an empty
 *   list of pages, or an id that's empty or over `PDF_MAX_ID_LENGTH` code
 *   points.
 * - `unknown-command`: a `type` the session doesn't know.
 * - `unknown-page`: a page key the plan doesn't have.
 * - `duplicate-page`: a page named twice in one command.
 * - `last-page`: deleting every page; a document keeps at least one.
 * - `invalid-position`: a position outside the plan, or outside a page's
 *   annotations.
 * - `invalid-rotation`: an angle that isn't a multiple of 90 degrees from
 *   -360 to 360, or a page rotation other than 0, 90, 180 or 270.
 * - `invalid-order`: a new order that doesn't list every page exactly once.
 * - `invalid-keys`: an insert without one key per page.
 * - `duplicate-key`: a new page key the plan already has, or one given twice.
 * - `unknown-source`: a source the session doesn't hold.
 * - `page-out-of-range`: a page index its source doesn't have.
 * - `field-name-too-long`: a form field's name over
 *   `PDF_MAX_FIELD_NAME_LENGTH` code points.
 * - `text-too-long`: a text note, or a field's text value, over
 *   `PDF_MAX_TEXT_LENGTH` code points.
 * - `unknown-annotation`: an annotation id the page doesn't have.
 * - `duplicate-annotation`: an annotation id the page already has.
 * - `unsupported-annotation`: an annotation type the session doesn't edit,
 *   such as `signature`, whose image the portable format can't carry yet.
 * - `outside-page`: a position outside the page, 0 to 1 on each axis.
 * - `invalid-size`: a stroke width or text size that isn't more than 0 and
 *   at most 1, after snapping to `PDF_POSITION_GRID`.
 * - `too-many-points`: a stroke with no points, or over
 *   `PDF_MAX_STROKE_POINTS`.
 * - `invalid-color`: a colour that isn't `#rrggbb` in lowercase.
 *
 * @public
 */
export type PdfCommandRejection =
  | "malformed-command"
  | "unknown-command"
  | "unknown-page"
  | "duplicate-page"
  | "last-page"
  | "invalid-position"
  | "invalid-rotation"
  | "invalid-order"
  | "invalid-keys"
  | "duplicate-key"
  | "unknown-source"
  | "page-out-of-range"
  | "field-name-too-long"
  | "text-too-long"
  | "unknown-annotation"
  | "duplicate-annotation"
  | "unsupported-annotation"
  | "outside-page"
  | "invalid-size"
  | "too-many-points"
  | "invalid-color";

/**
 * A refusal while checking a command, which the reducer turns into a
 * `PdfError`, and a document reader into its own code.
 *
 * @internal
 */
export class Invalid extends Error {
  readonly reason: PdfCommandRejection;
  constructor(reason: PdfCommandRejection, message: string) {
    super(message);
    this.reason = reason;
  }
}

export function invalid(reason: PdfCommandRejection, message: string): never {
  throw new Invalid(reason, message);
}

function malformed(message: string): never {
  return invalid("malformed-command", message);
}

/** Whether a value is a plain object: not `null`, and not a list. @internal */
export const isRecord = <T>(value: unknown): value is T =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Refuses a field the object's type doesn't have, rather than dropping it,
 * and requires the others, except the optional ones.
 *
 * @internal
 */
export function fields(
  value: object,
  required: readonly string[],
  what: string,
  optional: readonly string[] = [],
): void {
  for (const name of Object.keys(value)) {
    if (!required.includes(name) && !optional.includes(name)) {
      malformed(`${what} has no field "${name}"`);
    }
  }
  for (const name of required) {
    if (!Object.hasOwn(value, name)) malformed(`${what} needs "${name}"`);
  }
}

const isIndex = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

/** A page key, source id or annotation id: 1 to `PDF_MAX_ID_LENGTH` code points. @internal */
export function checkId(value: unknown, what: string): string {
  if (typeof value !== "string" || value === "" || longerThan(value, PDF_MAX_ID_LENGTH)) {
    malformed(`${what} is text of 1 to ${PDF_MAX_ID_LENGTH} code points`);
  }
  return value;
}

function checkKeys(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || value.length === 0) malformed(`${what} is a list of page keys`);
  return value.map((key) => checkId(key, "a page key"));
}

/** A number from 0 to 1, a position on the page, snapped to the grid. */
function checkFraction(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) malformed(`${what} is a number`);
  if (value < 0 || value > 1) invalid("outside-page", `${what} is from 0 to 1`);
  return toGrid(value);
}

/** A size, more than 0 and at most 1, snapped to the grid. */
function checkSize(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) malformed(`${what} is a number`);
  const size = toGrid(value);
  if (!(size > 0 && size <= 1)) invalid("invalid-size", `${what} is more than 0 and at most 1`);
  return size;
}

function checkPoint(value: unknown, what: string): PdfPoint {
  if (!isRecord<PdfPoint>(value)) malformed(`${what} is an object`);
  fields(value, ["x", "y"], what);
  return { x: checkFraction(value.x, `${what}.x`), y: checkFraction(value.y, `${what}.y`) };
}

const COLOR = /^#[0-9a-f]{6}$/;

function checkColor(value: unknown): PdfColor {
  if (typeof value !== "string") malformed("a colour is text");
  if (!COLOR.test(value)) invalid("invalid-color", "a colour is #rrggbb, in lowercase");
  return value as PdfColor;
}

function checkText(value: unknown, what: string): string {
  if (typeof value !== "string") malformed(`${what} is text`);
  if (longerThan(value, PDF_MAX_TEXT_LENGTH)) {
    invalid("text-too-long", `${what} has more than ${PDF_MAX_TEXT_LENGTH} code points`);
  }
  return value;
}

/**
 * An annotation, checked and copied, with its positions and sizes snapped
 * to the grid. Signatures are refused: the portable format can't carry
 * their image yet (docs/adr/0003).
 *
 * @internal
 */
export function checkAnnotation(value: unknown): PdfAnnotation {
  if (!isRecord<{ type: unknown }>(value)) malformed("an annotation is an object");
  const { type } = value;
  if (type === "signature") {
    invalid("unsupported-annotation", "signature annotations can't be edited yet");
  }
  if (type === "pen" || type === "highlight") {
    const stroke = value as PdfStrokeAnnotation;
    fields(stroke, ["id", "type", "points", "color", "width"], "a stroke");
    if (!Array.isArray(stroke.points)) malformed("a stroke's points are a list");
    if (stroke.points.length === 0 || stroke.points.length > PDF_MAX_STROKE_POINTS) {
      invalid("too-many-points", `a stroke has 1 to ${PDF_MAX_STROKE_POINTS} points`);
    }
    return {
      id: checkId(stroke.id, "an annotation id"),
      type,
      points: stroke.points.map((point) => checkPoint(point, "a point")),
      color: checkColor(stroke.color),
      width: checkSize(stroke.width, "a stroke's width"),
    };
  }
  if (type === "text") {
    const note = value as PdfTextAnnotation;
    fields(note, ["id", "type", "at", "text", "size", "color"], "a text note");
    return {
      id: checkId(note.id, "an annotation id"),
      type,
      at: checkPoint(note.at, "a text note's position"),
      text: checkText(note.text, "a text note"),
      size: checkSize(note.size, "a text size"),
      color: checkColor(note.color),
    };
  }
  return malformed("an annotation is a pen, highlight or text annotation");
}

/** Looks up how many pages a source has, or `undefined` for one the session doesn't hold. */
export type PdfSourcePageCount = (source: string) => number | undefined;

function checkPageOf(source: string, pageIndex: number, pageCount: PdfSourcePageCount): void {
  const count = pageCount(source);
  if (count === undefined) invalid("unknown-source", `the session has no source ${source}`);
  if (pageIndex >= count) {
    invalid("page-out-of-range", `source ${source} has no page index ${pageIndex}`);
  }
}

const ROTATIONS: readonly number[] = [0, 90, 180, 270];
/** The angles a rotation command takes: a whole list, so a schema's `enum` can match it exactly. */
const ANGLES: readonly number[] = [-360, -270, -180, -90, 0, 90, 180, 270, 360];

/** A whole plan page, as `pdf.restorePages` carries it. @internal */
export function checkPage(value: unknown, pageCount: PdfSourcePageCount): PdfPlanPage {
  if (!isRecord<PdfPlanPage>(value)) malformed("a page is an object");
  fields(value, ["key", "source", "pageIndex", "rotation", "annotations"], "a page");
  const key = checkId(value.key, "a page key");
  const source = checkId(value.source, "a source id");
  if (!isIndex(value.pageIndex)) malformed("a page index is a whole number from 0");
  if (!ROTATIONS.includes(value.rotation)) {
    invalid("invalid-rotation", "a page's rotation is 0, 90, 180 or 270");
  }
  if (!Array.isArray(value.annotations)) malformed("a page's annotations are a list");
  checkPageOf(source, value.pageIndex, pageCount);
  const annotations = value.annotations.map(checkAnnotation);
  if (new Set(annotations.map(({ id }) => id)).size !== annotations.length) {
    invalid("duplicate-annotation", `page ${key} has two annotations with one id`);
  }
  return { key, source, pageIndex: value.pageIndex, rotation: value.rotation, annotations };
}

/** The positions of the given keys, in plan order, failing on unknown or repeated keys. */
function positions(plan: PdfPlan, keys: readonly string[]): number[] {
  const wanted = new Set(keys);
  if (wanted.size !== keys.length) invalid("duplicate-page", "a page appears twice");
  const found = plan.pages.flatMap((page, index) => (wanted.has(page.key) ? [index] : []));
  if (found.length !== wanted.size) {
    const known = new Set(plan.pages.map((page) => page.key));
    const missing = keys.filter((key) => !known.has(key));
    invalid("unknown-page", `the plan has no page ${missing.join(", ")}`);
  }
  return found;
}

function withPages(plan: PdfPlan, pages: readonly PdfPlanPage[]): PdfPlan {
  return { pages, formValues: plan.formValues };
}

/**
 * A record with one key set or removed. Keys are data: `__proto__` is an
 * ordinary own key, never the prototype (sdk-core ADR 0045, section 8).
 */
function withKey<V>(
  record: Readonly<Record<string, V>>,
  key: string,
  value: V | undefined,
): Record<string, V> {
  const entries = Object.entries(record).filter(([name]) => name !== key);
  if (value !== undefined) entries.push([key, value]);
  return Object.fromEntries(entries) as Record<string, V>;
}

/** Each command's fields: required, and optional. */
const COMMAND_FIELDS: Readonly<
  Record<PdfCommand["type"], readonly [readonly string[], readonly string[]]>
> = {
  "pdf.rotatePages": [["type", "pages", "angle"], []],
  "pdf.deletePages": [["type", "pages"], []],
  "pdf.restorePages": [["type", "entries"], []],
  "pdf.movePages": [["type", "pages", "to"], []],
  "pdf.reorderPages": [["type", "order"], []],
  "pdf.insertPages": [["type", "source", "pageIndexes", "at", "keys"], []],
  "pdf.setFieldValue": [["type", "source", "field", "value"], []],
  "pdf.addAnnotation": [["type", "page", "annotation"], ["index"]],
  "pdf.removeAnnotation": [["type", "page", "id"], []],
};

function apply(
  plan: PdfPlan,
  input: unknown,
  pageCount: PdfSourcePageCount,
): Applied<PdfPlan, PdfCommand> {
  if (!isRecord<{ type: unknown }>(input)) malformed("a command is an object");
  const { type } = input;
  if (typeof type !== "string") malformed("a command's type is text");
  if (!Object.hasOwn(COMMAND_FIELDS, type)) invalid("unknown-command", `"${type}" isn't a command`);
  const command = input as PdfCommand;
  const [required, optional] = COMMAND_FIELDS[command.type];
  fields(command, required, command.type, optional);

  switch (command.type) {
    case "pdf.rotatePages": {
      const pages = checkKeys(command.pages, "pages");
      const { angle } = command;
      if (typeof angle !== "number") malformed("an angle is a number");
      if (!ANGLES.includes(angle)) {
        invalid("invalid-rotation", "an angle is a multiple of 90 degrees, from -360 to 360");
      }
      const at = new Set(positions(plan, pages));
      return {
        state: withPages(
          plan,
          plan.pages.map((page, index) =>
            at.has(index) ? { ...page, rotation: addRotation(page.rotation, angle) } : page,
          ),
        ),
        // `0 - angle`, not `-angle`: an angle of 0 must not undo as -0.
        inverse: { type: "pdf.rotatePages", pages, angle: 0 - angle },
      };
    }

    case "pdf.deletePages": {
      const at = positions(plan, checkKeys(command.pages, "pages"));
      if (at.length === plan.pages.length) invalid("last-page", "a document keeps one page");
      const removed = new Set(at);
      return {
        state: withPages(
          plan,
          plan.pages.filter((_, index) => !removed.has(index)),
        ),
        inverse: {
          type: "pdf.restorePages",
          entries: at.map((index) => ({ index, page: plan.pages[index] as PdfPlanPage })),
        },
      };
    }

    case "pdf.restorePages": {
      if (!Array.isArray(command.entries) || command.entries.length === 0) {
        malformed("entries is a list of pages and their positions");
      }
      const known = new Set(plan.pages.map((page) => page.key));
      const pages = [...plan.pages];
      let previous = -1;
      for (const entry of command.entries as unknown[]) {
        if (!isRecord<{ index: unknown; page: unknown }>(entry)) malformed("an entry is an object");
        fields(entry, ["index", "page"], "an entry");
        const page = checkPage(entry.page, pageCount);
        const { index } = entry;
        if (!isIndex(index)) malformed("an entry's index is a whole number from 0");
        if (known.has(page.key)) invalid("duplicate-key", `the plan already has page ${page.key}`);
        if (index <= previous || index > pages.length) {
          invalid("invalid-position", `page ${page.key} can't be restored at ${index}`);
        }
        pages.splice(index, 0, page);
        known.add(page.key);
        previous = index;
      }
      return {
        state: withPages(plan, pages),
        inverse: {
          type: "pdf.deletePages",
          pages: command.entries.map(({ page }) => page.key),
        },
      };
    }

    case "pdf.movePages": {
      const keys = checkKeys(command.pages, "pages");
      if (!isIndex(command.to)) malformed("to is a whole number from 0");
      const moved = new Set(positions(plan, keys));
      const block = plan.pages.filter((_, index) => moved.has(index));
      const rest = plan.pages.filter((_, index) => !moved.has(index));
      if (command.to > rest.length) {
        invalid("invalid-position", `pages can't be moved to ${command.to}`);
      }
      return {
        state: withPages(plan, [...rest.slice(0, command.to), ...block, ...rest.slice(command.to)]),
        inverse: { type: "pdf.reorderPages", order: plan.pages.map((page) => page.key) },
      };
    }

    case "pdf.reorderPages": {
      const order = checkKeys(command.order, "order");
      const byKey = new Map(plan.pages.map((page) => [page.key, page]));
      if (
        order.length !== plan.pages.length ||
        new Set(order).size !== order.length ||
        order.some((key) => !byKey.has(key))
      ) {
        invalid("invalid-order", "a new order lists every page of the plan exactly once");
      }
      return {
        state: withPages(
          plan,
          order.map((key) => byKey.get(key) as PdfPlanPage),
        ),
        inverse: { type: "pdf.reorderPages", order: plan.pages.map((page) => page.key) },
      };
    }

    case "pdf.insertPages": {
      const source = checkId(command.source, "a source id");
      const { pageIndexes, at } = command;
      if (!Array.isArray(pageIndexes) || pageIndexes.length === 0 || !pageIndexes.every(isIndex)) {
        malformed("pageIndexes is a list of whole numbers from 0");
      }
      const keys = checkKeys(command.keys, "keys");
      if (!isIndex(at)) malformed("at is a whole number from 0");
      if (keys.length !== pageIndexes.length)
        invalid("invalid-keys", "an insert needs one key per page");
      const known = new Set(plan.pages.map((page) => page.key));
      if (new Set(keys).size !== keys.length || keys.some((key) => known.has(key))) {
        invalid("duplicate-key", "inserted pages need new keys, each once");
      }
      if (at > plan.pages.length) invalid("invalid-position", `pages can't be inserted at ${at}`);
      for (const pageIndex of pageIndexes) checkPageOf(source, pageIndex, pageCount);
      const inserted = pageIndexes.map(
        (pageIndex, index): PdfPlanPage => ({
          key: keys[index] as string,
          source,
          pageIndex,
          rotation: 0,
          annotations: [],
        }),
      );
      return {
        state: withPages(plan, [...plan.pages.slice(0, at), ...inserted, ...plan.pages.slice(at)]),
        inverse: { type: "pdf.deletePages", pages: keys },
      };
    }

    case "pdf.setFieldValue": {
      const source = checkId(command.source, "a source id");
      const { field, value } = command;
      if (typeof field !== "string" || field === "") malformed("a field's name is text");
      if (longerThan(field, PDF_MAX_FIELD_NAME_LENGTH)) {
        invalid(
          "field-name-too-long",
          `a field's name has at most ${PDF_MAX_FIELD_NAME_LENGTH} code points`,
        );
      }
      if (value !== null && typeof value !== "boolean") checkText(value, "a field's value");
      if (pageCount(source) === undefined) {
        invalid("unknown-source", `the session has no source ${source}`);
      }
      const current = Object.hasOwn(plan.formValues, source)
        ? (plan.formValues[source] as Readonly<Record<string, PdfFieldValue>>)
        : {};
      const previous = Object.hasOwn(current, field) ? (current[field] as PdfFieldValue) : null;
      const next = withKey(current, field, value ?? undefined);
      const formValues = withKey(
        plan.formValues,
        source,
        Object.keys(next).length === 0 ? undefined : next,
      );
      return {
        state: { pages: plan.pages, formValues },
        inverse: { type: "pdf.setFieldValue", source, field, value: previous },
      };
    }

    case "pdf.addAnnotation": {
      const key = checkId(command.page, "a page key");
      const annotation = checkAnnotation(command.annotation);
      if (command.index !== undefined && !isIndex(command.index)) {
        malformed("an annotation's index is a whole number from 0");
      }
      const [at] = positions(plan, [key]) as [number];
      const page = plan.pages[at] as PdfPlanPage;
      if (page.annotations.some((existing) => existing.id === annotation.id)) {
        invalid("duplicate-annotation", `page ${key} already has annotation ${annotation.id}`);
      }
      const index = command.index ?? page.annotations.length;
      if (index > page.annotations.length) {
        invalid("invalid-position", `the annotation can't go at ${index}`);
      }
      const annotations = [...page.annotations];
      annotations.splice(index, 0, annotation);
      const pages = [...plan.pages];
      pages[at] = { ...page, annotations };
      return {
        state: withPages(plan, pages),
        inverse: { type: "pdf.removeAnnotation", page: key, id: annotation.id },
      };
    }

    case "pdf.removeAnnotation": {
      const key = checkId(command.page, "a page key");
      const id = checkId(command.id, "an annotation id");
      const [at] = positions(plan, [key]) as [number];
      const page = plan.pages[at] as PdfPlanPage;
      const index = page.annotations.findIndex((annotation) => annotation.id === id);
      if (index < 0) invalid("unknown-annotation", `page ${key} has no annotation ${id}`);
      const pages = [...plan.pages];
      pages[at] = { ...page, annotations: page.annotations.filter((_, place) => place !== index) };
      return {
        state: withPages(plan, pages),
        inverse: {
          type: "pdf.addAnnotation",
          page: key,
          annotation: page.annotations[index] as PdfAnnotation,
          index,
        },
      };
    }
  }
}

/**
 * Creates the session's reducer: a pure function that applies one command
 * to a plan, without changing it, and returns the new plan with the
 * command's inverse (docs/adr/0003, ADR 0029 in sdk-core). It needs each
 * source's page count, to check the pages a command names.
 *
 * Commands are strict, as the portable format is (sdk-core ADR 0045): an
 * invalid command, including one with a field its type doesn't have,
 * throws `PdfError` with `INVALID_COMMAND` and a {@link PdfCommandRejection}
 * as `details.reason`, and changes nothing. Positions and sizes are snapped
 * to millionths of the page (`PDF_POSITION_GRID`), so the plan only ever
 * holds values on the grid.
 *
 * @internal
 */
export function createPdfReducer(pageCount: PdfSourcePageCount): Reducer<PdfPlan, PdfCommand> {
  return (plan, command) => {
    try {
      return apply(plan, command, pageCount);
    } catch (error) {
      if (!(error instanceof Invalid)) throw error;
      throw new PdfError("INVALID_COMMAND", `Invalid command: ${error.message}.`, {
        details: { reason: error.reason },
      });
    }
  };
}
