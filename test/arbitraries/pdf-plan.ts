import { applyCommands } from "@hussmartinez/sdk-core";
import fc from "fast-check";
import type { PdfAnnotation } from "../../src/core/model/annotations.js";
import type { PdfPlan } from "../../src/core/model/plan.js";
import { createPdfReducer, type PdfCommand } from "../../src/core/operations/commands.js";

/**
 * The plan reducer's property-test generators (sdk-core ADR 0045): valid
 * commands for a given plan, plans reached by applying them, and mutated
 * values. The conformance vectors' generator reuses them.
 */

/** Every source the generated plans use, and its page count. */
export const SOURCES: Readonly<Record<string, number>> = { s1: 6, s2: 4 };
export const reducer = createPdfReducer((id) =>
  Object.hasOwn(SOURCES, id) ? SOURCES[id] : undefined,
);

/** A new plan: every page of source s1, in order. */
export const START: PdfPlan = {
  pages: Array.from({ length: SOURCES["s1"] as number }, (_, pageIndex) => ({
    key: `p${pageIndex + 1}`,
    source: "s1",
    pageIndex,
    rotation: 0,
    annotations: [],
  })),
  formValues: {},
};

/** Any fraction from 0 to 1, including values off the grid. */
const fraction = fc.double({ min: 0, max: 1, noNaN: true });
/** A size the grid keeps above 0. */
const size = fc.double({ min: 0.000_001, max: 1, noNaN: true });
const color = fc
  .integer({ min: 0, max: 0xff_ff_ff })
  .map((value) => `#${value.toString(16).padStart(6, "0")}` as const);

/** Ids, including ones named after Object.prototype's properties. */
const id = fc.oneof(
  fc.constantFrom("__proto__", "constructor", "toString"),
  fc.string({ minLength: 1, maxLength: 8 }),
);

const annotation: fc.Arbitrary<PdfAnnotation> = fc.oneof(
  fc.record({
    id,
    type: fc.constantFrom("pen" as const, "highlight" as const),
    points: fc.array(fc.record({ x: fraction, y: fraction }), { minLength: 1, maxLength: 5 }),
    color,
    width: size,
  }),
  fc.record({
    id,
    type: fc.constant("text" as const),
    at: fc.record({ x: fraction, y: fraction }),
    text: fc.string({ maxLength: 20 }),
    size,
    color,
  }),
);

/** The first `count` keys `k1`, `k2`, … that the plan doesn't have, so generation is deterministic. */
function freshKeys(plan: PdfPlan, count: number): string[] {
  const taken = new Set(plan.pages.map((page) => page.key));
  const keys: string[] = [];
  for (let n = 1; keys.length < count; n += 1) {
    if (!taken.has(`k${n}`)) keys.push(`k${n}`);
  }
  return keys;
}

/** Any valid command for the plan. */
export function commandFor(plan: PdfPlan): fc.Arbitrary<PdfCommand> {
  const keys = plan.pages.map((page) => page.key);
  const some = fc.subarray(keys, { minLength: 1 });
  const fewer = fc.subarray(keys, { minLength: 1, maxLength: Math.max(1, keys.length - 1) });
  const onPage = fc.constantFrom(...plan.pages);
  const commands: fc.Arbitrary<PdfCommand>[] = [
    fc.record({
      type: fc.constant("pdf.rotatePages" as const),
      pages: some,
      angle: fc.constantFrom(-270, -180, -90, 0, 90, 180, 270, 360),
    }),
    some.chain((pages) =>
      fc.record({
        type: fc.constant("pdf.movePages" as const),
        pages: fc.constant(pages),
        to: fc.nat(keys.length - pages.length),
      }),
    ),
    fc.shuffledSubarray(keys, { minLength: keys.length, maxLength: keys.length }).map((order) => ({
      type: "pdf.reorderPages" as const,
      order,
    })),
    fc
      .record({
        source: fc.constantFrom("s1", "s2"),
        count: fc.integer({ min: 1, max: 3 }),
        at: fc.nat(keys.length),
      })
      .chain(({ source, count, at }) =>
        fc.record({
          type: fc.constant("pdf.insertPages" as const),
          source: fc.constant(source),
          pageIndexes: fc.array(fc.nat((SOURCES[source] as number) - 1), {
            minLength: count,
            maxLength: count,
          }),
          at: fc.constant(at),
          keys: fc.constant(freshKeys(plan, count)),
        }),
      ),
    fc.record({
      type: fc.constant("pdf.setFieldValue" as const),
      source: fc.constantFrom("s1", "s2"),
      field: id,
      value: fc.oneof(fc.string({ maxLength: 20 }), fc.boolean(), fc.constant(null)),
    }),
    onPage.chain((page) =>
      annotation
        .filter((added) => !page.annotations.some((existing) => existing.id === added.id))
        .map((added) => ({
          type: "pdf.addAnnotation" as const,
          page: page.key,
          annotation: added,
        })),
    ),
  ];
  if (keys.length > 1) {
    commands.push(fewer.map((pages) => ({ type: "pdf.deletePages" as const, pages })));
  }
  const annotated = plan.pages.filter((page) => page.annotations.length > 0);
  if (annotated.length > 0) {
    commands.push(
      fc.constantFrom(...annotated).chain((page) =>
        fc.constantFrom(...page.annotations).map((existing) => ({
          type: "pdf.removeAnnotation" as const,
          page: page.key,
          id: existing.id,
        })),
      ),
    );
  }
  return fc.oneof(...commands);
}

/** A sequence of valid commands from {@link START}, each for the plan before it. */
export const steps = (maxLength: number): fc.Arbitrary<{ plan: PdfPlan; commands: PdfCommand[] }> =>
  fc.integer({ min: 0, max: maxLength }).chain((length) => {
    let built = fc.constant({ plan: START, commands: [] as PdfCommand[] });
    for (let index = 0; index < length; index += 1) {
      built = built.chain(({ plan, commands }) =>
        commandFor(plan).map((command) => ({
          plan: applyCommands(reducer, plan, [command]).state,
          commands: [...commands, command],
        })),
      );
    }
    return built;
  });

/**
 * A value with one field replaced by any JSON value, or one added, as an own
 * property even when it's named `__proto__`, as JSON.parse makes it.
 * Assigning `copy.__proto__ = …` would set the prototype instead, and test
 * nothing (sdk-core ADR 0045, section 8).
 */
export const mutated = <T extends object>(value: fc.Arbitrary<T>) =>
  fc
    .tuple(value, fc.nat(), fc.string(), fc.jsonValue({ maxDepth: 2 }), fc.boolean())
    .map(([original, index, name, replacement, add]) => {
      const copy: Record<string, unknown> = JSON.parse(JSON.stringify(original));
      const fields = Object.keys(copy);
      const field = add || fields.length === 0 ? name : (fields[index % fields.length] as string);
      Object.defineProperty(copy, field, {
        value: replacement,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      return copy;
    });
