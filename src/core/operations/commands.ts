import type { PdfAnnotation } from "../model/annotations.js";
import type { PdfFieldValue } from "../model/document.js";
import { addRotation } from "../model/geometry.js";
import type { PdfPlan, PdfPlanPage } from "../model/plan.js";

/**
 * Rotates pages by an angle, added to their current rotation.
 *
 * @public
 */
export interface PdfRotatePagesCommand {
  readonly type: "pdf.rotatePages";
  /** The keys of the pages to rotate. */
  readonly pages: readonly string[];
  /** Degrees, clockwise, in multiples of 90. Negative turns anticlockwise. */
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
 * A command's result: the new plan, and the command that undoes it.
 *
 * @internal
 */
export interface Applied {
  readonly plan: PdfPlan;
  readonly inverse: PdfCommand;
}

/** The positions of the given keys, in plan order, failing on unknown or repeated keys. */
function positions(plan: PdfPlan, keys: readonly string[]): number[] {
  if (keys.length === 0) throw new TypeError("A command needs at least one page.");
  const wanted = new Set(keys);
  if (wanted.size !== keys.length) throw new TypeError("A page appears twice in the command.");
  const found = plan.pages.flatMap((page, index) => (wanted.has(page.key) ? [index] : []));
  if (found.length !== wanted.size) {
    const known = new Set(plan.pages.map((page) => page.key));
    const missing = keys.filter((key) => !known.has(key));
    throw new TypeError(`The plan has no page ${missing.join(", ")}.`);
  }
  return found;
}

function withPages(plan: PdfPlan, pages: readonly PdfPlanPage[]): PdfPlan {
  return { pages, formValues: plan.formValues };
}

function updatePage(
  plan: PdfPlan,
  key: string,
  update: (page: PdfPlanPage) => PdfPlanPage,
): PdfPlan {
  const [index] = positions(plan, [key]);
  const pages = [...plan.pages];
  pages[index as number] = update(plan.pages[index as number] as PdfPlanPage);
  return withPages(plan, pages);
}

/**
 * Applies a command to a plan, without changing it, and returns the new
 * plan with the command's inverse. Invalid commands, such as ones naming a
 * page the plan doesn't have, throw `TypeError` or `RangeError` and change
 * nothing.
 *
 * @internal
 */
export function applyCommand(plan: PdfPlan, command: PdfCommand): Applied {
  switch (command.type) {
    case "pdf.rotatePages": {
      const at = new Set(positions(plan, command.pages));
      addRotation(0, command.angle);
      const pages = plan.pages.map((page, index) =>
        at.has(index) ? { ...page, rotation: addRotation(page.rotation, command.angle) } : page,
      );
      return {
        plan: withPages(plan, pages),
        inverse: { type: "pdf.rotatePages", pages: command.pages, angle: -command.angle },
      };
    }

    case "pdf.deletePages": {
      const at = positions(plan, command.pages);
      if (at.length === plan.pages.length) {
        throw new RangeError("A document needs at least one page.");
      }
      const removed = new Set(at);
      return {
        plan: withPages(
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
      const known = new Set(plan.pages.map((page) => page.key));
      const pages = [...plan.pages];
      let previous = -1;
      for (const { index, page } of command.entries) {
        if (known.has(page.key)) throw new TypeError(`The plan already has page ${page.key}.`);
        if (!Number.isInteger(index) || index <= previous || index > pages.length) {
          throw new RangeError(`Page ${page.key} can't be restored at position ${index}.`);
        }
        pages.splice(index, 0, page);
        known.add(page.key);
        previous = index;
      }
      if (command.entries.length === 0) throw new TypeError("A command needs at least one page.");
      return {
        plan: withPages(plan, pages),
        inverse: { type: "pdf.deletePages", pages: command.entries.map(({ page }) => page.key) },
      };
    }

    case "pdf.movePages": {
      const moved = new Set(positions(plan, command.pages));
      const block = plan.pages.filter((_, index) => moved.has(index));
      const rest = plan.pages.filter((_, index) => !moved.has(index));
      if (!Number.isInteger(command.to) || command.to < 0 || command.to > rest.length) {
        throw new RangeError(`Pages can't be moved to position ${command.to}.`);
      }
      const pages = [...rest.slice(0, command.to), ...block, ...rest.slice(command.to)];
      return {
        plan: withPages(plan, pages),
        inverse: { type: "pdf.reorderPages", order: plan.pages.map((page) => page.key) },
      };
    }

    case "pdf.reorderPages": {
      const byKey = new Map(plan.pages.map((page) => [page.key, page]));
      if (
        command.order.length !== plan.pages.length ||
        new Set(command.order).size !== command.order.length ||
        command.order.some((key) => !byKey.has(key))
      ) {
        throw new TypeError("A new order must list every page of the plan exactly once.");
      }
      return {
        plan: withPages(
          plan,
          command.order.map((key) => byKey.get(key) as PdfPlanPage),
        ),
        inverse: { type: "pdf.reorderPages", order: plan.pages.map((page) => page.key) },
      };
    }

    case "pdf.insertPages": {
      const { pageIndexes, keys, at } = command;
      if (pageIndexes.length === 0 || keys.length !== pageIndexes.length) {
        throw new TypeError("An insert needs one key for each of at least one page.");
      }
      if (!Number.isInteger(at) || at < 0 || at > plan.pages.length) {
        throw new RangeError(`Pages can't be inserted at position ${at}.`);
      }
      const known = new Set(plan.pages.map((page) => page.key));
      if (new Set(keys).size !== keys.length || keys.some((key) => known.has(key))) {
        throw new TypeError("Inserted pages need keys the plan doesn't have.");
      }
      const inserted = pageIndexes.map(
        (pageIndex, index): PdfPlanPage => ({
          key: keys[index] as string,
          source: command.source,
          pageIndex,
          rotation: 0,
          annotations: [],
        }),
      );
      return {
        plan: withPages(plan, [...plan.pages.slice(0, at), ...inserted, ...plan.pages.slice(at)]),
        inverse: { type: "pdf.deletePages", pages: keys },
      };
    }

    case "pdf.setFieldValue": {
      const { source, field, value } = command;
      const current = plan.formValues[source] ?? {};
      const previous = Object.hasOwn(current, field) ? (current[field] as PdfFieldValue) : null;
      const next: Record<string, PdfFieldValue> = { ...current };
      if (value === null) delete next[field];
      else next[field] = value;
      const formValues: Record<string, Readonly<Record<string, PdfFieldValue>>> = {
        ...plan.formValues,
        [source]: next,
      };
      if (Object.keys(next).length === 0) delete formValues[source];
      return {
        plan: { pages: plan.pages, formValues },
        inverse: { type: "pdf.setFieldValue", source, field, value: previous },
      };
    }

    case "pdf.addAnnotation": {
      const { annotation } = command;
      const next = updatePage(plan, command.page, (page) => {
        if (page.annotations.some((existing) => existing.id === annotation.id)) {
          throw new TypeError(`Page ${page.key} already has annotation ${annotation.id}.`);
        }
        const index = command.index ?? page.annotations.length;
        if (!Number.isInteger(index) || index < 0 || index > page.annotations.length) {
          throw new RangeError(`The annotation can't go at position ${index}.`);
        }
        const annotations = [...page.annotations];
        annotations.splice(index, 0, annotation);
        return { ...page, annotations };
      });
      return {
        plan: next,
        inverse: { type: "pdf.removeAnnotation", page: command.page, id: annotation.id },
      };
    }

    case "pdf.removeAnnotation": {
      let removed: { annotation: PdfAnnotation; index: number } | undefined;
      const next = updatePage(plan, command.page, (page) => {
        const index = page.annotations.findIndex((annotation) => annotation.id === command.id);
        if (index < 0) throw new TypeError(`Page ${page.key} has no annotation ${command.id}.`);
        removed = { annotation: page.annotations[index] as PdfAnnotation, index };
        return { ...page, annotations: page.annotations.filter((_, at) => at !== index) };
      });
      const { annotation, index } = removed as { annotation: PdfAnnotation; index: number };
      return {
        plan: next,
        inverse: { type: "pdf.addAnnotation", page: command.page, annotation, index },
      };
    }

    default: {
      const unknown: never = command;
      throw new TypeError(`Unknown command ${(unknown as { type?: unknown }).type}.`);
    }
  }
}

/**
 * Applies several commands as one step, all or nothing, and returns the
 * inverse of the whole step: the inverses in reverse order.
 *
 * @internal
 */
export function applyCommands(
  plan: PdfPlan,
  commands: readonly PdfCommand[],
): { plan: PdfPlan; inverses: PdfCommand[] } {
  let current = plan;
  const inverses: PdfCommand[] = [];
  for (const command of commands) {
    const applied = applyCommand(current, command);
    current = applied.plan;
    inverses.unshift(applied.inverse);
  }
  return { plan: current, inverses };
}
