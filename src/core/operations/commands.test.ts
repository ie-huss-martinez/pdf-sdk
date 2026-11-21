import { applyCommands as applyAll } from "@hussmartinez/sdk-core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { commandFor, mutated, reducer, START, steps } from "../../../test/arbitraries/pdf-plan.js";
import { isPdfError } from "../errors/pdf-error.js";
import type { PdfTextAnnotation } from "../model/annotations.js";
import type { PdfPlan, PdfPlanPage } from "../model/plan.js";
import { PDF_POSITION_GRID } from "../model/portable.js";
import { createPdfReducer, type PdfCommand, type PdfCommandRejection } from "./commands.js";

/** Sources s1, s2 and s, of ten pages each. */
const applyCommand = createPdfReducer((id) => (["s1", "s2", "s"].includes(id) ? 10 : undefined));

const applyCommands = (state: PdfPlan, commands: readonly PdfCommand[]) =>
  applyAll(applyCommand, state, commands);

/** Expects the command to be refused with INVALID_COMMAND and the reason. */
function expectRefused(run: () => unknown, reason: PdfCommandRejection): void {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(isPdfError(thrown, "INVALID_COMMAND"), String(thrown)).toBe(true);
  expect((thrown as { details?: { reason?: string } }).details?.reason).toBe(reason);
}

const page = (key: string, pageIndex = 0, source = "s1"): PdfPlanPage => ({
  key,
  source,
  pageIndex,
  rotation: 0,
  annotations: [],
});

const plan = (...keys: string[]): PdfPlan => ({
  pages: keys.map((key, index) => page(key, index)),
  formValues: {},
});

const keys = (state: PdfPlan) => state.pages.map((entry) => entry.key);

const note = (id: string): PdfTextAnnotation => ({
  id,
  type: "text",
  at: { x: 0.1, y: 0.1 },
  text: id,
  size: 0.02,
  color: "#000000",
});

/** Applies a command, checks its inverse restores the plan exactly, and returns the result. */
function roundTrip(state: PdfPlan, command: PdfCommand): PdfPlan {
  const { state: next, inverse } = applyCommand(state, command);
  expect(applyCommand(next, inverse).state).toEqual(state);
  return next;
}

describe("applyCommand", () => {
  it("rotates pages relative to their rotation", () => {
    const next = roundTrip(plan("a", "b"), { type: "pdf.rotatePages", pages: ["b"], angle: -90 });
    expect(next.pages.map((entry) => entry.rotation)).toEqual([0, 270]);
  });

  it("deletes pages, and restores them where they were, with their annotations", () => {
    const start = applyCommand(plan("a", "b", "c", "d"), {
      type: "pdf.addAnnotation",
      page: "c",
      annotation: note("n1"),
    }).state;
    const next = roundTrip(start, { type: "pdf.deletePages", pages: ["c", "b"] });
    expect(keys(next)).toEqual(["a", "d"]);
  });

  it("refuses to delete every page", () => {
    expectRefused(
      () => applyCommand(plan("a", "b"), { type: "pdf.deletePages", pages: ["a", "b"] }),
      "last-page",
    );
  });

  it("moves pages as a block, in plan order, to a position in the result", () => {
    const start = plan("a", "b", "c", "d", "e");
    expect(keys(roundTrip(start, { type: "pdf.movePages", pages: ["d", "b"], to: 0 }))).toEqual([
      "b",
      "d",
      "a",
      "c",
      "e",
    ]);
    expect(keys(roundTrip(start, { type: "pdf.movePages", pages: ["a"], to: 4 }))).toEqual([
      "b",
      "c",
      "d",
      "e",
      "a",
    ]);
  });

  it("reorders every page, and only with every key once", () => {
    const start = plan("a", "b", "c");
    expect(keys(roundTrip(start, { type: "pdf.reorderPages", order: ["c", "a", "b"] }))).toEqual([
      "c",
      "a",
      "b",
    ]);
    for (const order of [
      ["a", "b"],
      ["a", "a", "b"],
      ["a", "b", "x"],
    ]) {
      expectRefused(
        () => applyCommand(start, { type: "pdf.reorderPages", order }),
        "invalid-order",
      );
    }
  });

  it("inserts pages of a source with the given keys, and deletes them to undo", () => {
    const next = roundTrip(plan("a", "b"), {
      type: "pdf.insertPages",
      source: "s2",
      pageIndexes: [2, 0],
      at: 1,
      keys: ["x", "y"],
    });
    expect(next.pages.map(({ key, source, pageIndex }) => [key, source, pageIndex])).toEqual([
      ["a", "s1", 0],
      ["x", "s2", 2],
      ["y", "s2", 0],
      ["b", "s1", 1],
    ]);
  });

  it("sets and clears form values per source", () => {
    const set = roundTrip(plan("a"), {
      type: "pdf.setFieldValue",
      source: "s1",
      field: "name",
      value: "Ada",
    });
    expect(set.formValues).toEqual({ s1: { name: "Ada" } });
    const changed = roundTrip(set, {
      type: "pdf.setFieldValue",
      source: "s1",
      field: "name",
      value: "Grace",
    });
    expect(changed.formValues).toEqual({ s1: { name: "Grace" } });
    const cleared = roundTrip(changed, {
      type: "pdf.setFieldValue",
      source: "s1",
      field: "name",
      value: null,
    });
    expect(cleared.formValues).toEqual({});
  });

  it("adds and removes annotations, keeping their order on undo", () => {
    let state = plan("a");
    for (const id of ["n1", "n2", "n3"]) {
      state = roundTrip(state, { type: "pdf.addAnnotation", page: "a", annotation: note(id) });
    }
    const removed = roundTrip(state, { type: "pdf.removeAnnotation", page: "a", id: "n2" });
    expect(removed.pages[0]?.annotations.map((annotation) => annotation.id)).toEqual(["n1", "n3"]);
  });

  it.each<[string, PdfCommand, PdfCommandRejection]>([
    ["an unknown page", { type: "pdf.rotatePages", pages: ["x"], angle: 90 }, "unknown-page"],
    ["a repeated page", { type: "pdf.deletePages", pages: ["a", "a"] }, "duplicate-page"],
    ["no pages", { type: "pdf.movePages", pages: [], to: 0 }, "malformed-command"],
    [
      "an existing key",
      { type: "pdf.insertPages", source: "s", pageIndexes: [0], at: 0, keys: ["a"] },
      "duplicate-key",
    ],
    [
      "an unknown annotation",
      { type: "pdf.removeAnnotation", page: "a", id: "x" },
      "unknown-annotation",
    ],
    [
      "a duplicate annotation",
      { type: "pdf.addAnnotation", page: "a", annotation: note("n0") },
      "duplicate-annotation",
    ],
    [
      "a rotation that isn't a multiple of 90",
      { type: "pdf.rotatePages", pages: ["a"], angle: 45 },
      "invalid-rotation",
    ],
    ["a move past the end", { type: "pdf.movePages", pages: ["a"], to: 2 }, "invalid-position"],
    [
      "an insert past the end",
      { type: "pdf.insertPages", source: "s", pageIndexes: [0], at: 3, keys: ["x"] },
      "invalid-position",
    ],
  ])("refuses %s, by its reason", (_, command, reason) => {
    const start = applyCommand(plan("a", "b"), {
      type: "pdf.addAnnotation",
      page: "a",
      annotation: note("n0"),
    }).state;
    expectRefused(() => applyCommand(start, command), reason);
  });

  it("never changes the plan it's given", () => {
    const start = plan("a", "b");
    const frozen = structuredClone(start);
    applyCommand(start, { type: "pdf.movePages", pages: ["b"], to: 0 });
    applyCommand(start, { type: "pdf.rotatePages", pages: ["a"], angle: 90 });
    expect(start).toEqual(frozen);
  });
});

describe("applyCommand with sdk-core's applyCommands", () => {
  it("applies a group as one step, and undoes it with the inverses in reverse order", () => {
    const start = plan("a", "b", "c");
    const { state: next, inverses } = applyCommands(start, [
      { type: "pdf.movePages", pages: ["c"], to: 0 },
      { type: "pdf.rotatePages", pages: ["c"], angle: 90 },
      { type: "pdf.deletePages", pages: ["a"] },
    ]);
    expect(keys(next)).toEqual(["c", "b"]);
    expect(applyCommands(next, inverses).state).toEqual(start);
  });

  it("changes nothing when any command in the group is invalid", () => {
    const start = plan("a", "b");
    expect(() =>
      applyCommands(start, [
        { type: "pdf.rotatePages", pages: ["a"], angle: 90 },
        { type: "pdf.deletePages", pages: ["x"] },
      ]),
    ).toThrow(expect.objectContaining({ code: "INVALID_COMMAND" }));
    expect(start.pages[0]?.rotation).toBe(0);
  });

  it("restores the plan exactly after any sequence of valid commands", () => {
    // A seeded generator, so a failure always reproduces.
    let seed = 42;
    const random = (limit: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % limit;
    };
    let counter = 0;
    const nextId = (prefix: string) => {
      counter += 1;
      return `${prefix}${counter}`;
    };
    for (let run = 0; run < 200; run += 1) {
      const start = plan("a", "b", "c", "d");
      let state = start;
      const steps: PdfCommand[][] = [];
      for (let step = 0; step < 25; step += 1) {
        const pages = state.pages.map((entry) => entry.key);
        const some = pages.filter(() => random(2) === 0).slice(0, 3);
        const chosen = some.length > 0 ? some : [pages[random(pages.length)] as string];
        const candidates: PdfCommand[] = [
          { type: "pdf.rotatePages", pages: chosen, angle: [90, 180, -90][random(3)] as number },
          { type: "pdf.movePages", pages: chosen, to: random(pages.length - chosen.length + 1) },
          {
            type: "pdf.insertPages",
            source: "s2",
            pageIndexes: [random(5)],
            at: random(pages.length + 1),
            keys: [nextId("k")],
          },
          {
            type: "pdf.addAnnotation",
            page: chosen[0] as string,
            annotation: note(nextId("n")),
          },
        ];
        if (chosen.length < pages.length)
          candidates.push({ type: "pdf.deletePages", pages: chosen });
        const command = candidates[random(candidates.length)] as PdfCommand;
        const { state: after, inverses } = applyCommands(state, [command]);
        steps.push(inverses);
        state = after;
      }
      for (const inverses of steps.reverse()) state = applyCommands(state, inverses).state;
      expect(state).toEqual(start);
    }
  });
});

/** Builds a value from JSON text, so `__proto__` is an own field, as any JSON parser makes it. */
const fromJson = <T>(value: unknown, replace: Record<string, string>): T => {
  let text = JSON.stringify(value);
  for (const [from, to] of Object.entries(replace)) text = text.replaceAll(`"${from}"`, `"${to}"`);
  return JSON.parse(text) as T;
};

describe("strict commands (sdk-core ADR 0045)", () => {
  const start = plan("a", "b");
  const refuse = (command: unknown, reason: PdfCommandRejection, state = start) =>
    expectRefused(() => applyCommand(state, command as PdfCommand), reason);

  it("refuses a value that isn't a command, an unknown type, and an unknown field", () => {
    refuse(null, "malformed-command");
    refuse([{ type: "pdf.deletePages", pages: ["a"] }], "malformed-command");
    refuse({ type: "pdf.crop", pages: ["a"] }, "unknown-command");
    refuse({ type: "toString" }, "unknown-command");
    refuse({ type: "pdf.rotatePages", pages: ["a"], angle: 90, mode: "all" }, "malformed-command");
    refuse({ type: "pdf.rotatePages", pages: ["a"] }, "malformed-command");
    refuse({ type: "pdf.movePages", pages: ["a"], to: 0.5 }, "malformed-command");
    refuse({ type: "pdf.movePages", pages: ["a"], to: "1" }, "malformed-command");
  });

  it("refuses an unknown field named __proto__, as JSON.parse makes it", () => {
    refuse(
      fromJson({ type: "pdf.deletePages", pages: ["a"], PROTO: {} }, { PROTO: "__proto__" }),
      "malformed-command",
    );
  });

  it("refuses signatures, which the portable format can't carry yet", () => {
    refuse(
      {
        type: "pdf.addAnnotation",
        page: "a",
        annotation: {
          id: "s",
          type: "signature",
          at: { x: 0, y: 0 },
          width: 0.2,
          height: 0.1,
          png: new Uint8Array(),
        },
      },
      "unsupported-annotation",
    );
  });

  it("refuses colours other than #rrggbb in lowercase", () => {
    for (const color of ["#FF0000", "#f00", "red", "#ff00001"]) {
      refuse({ ...add("a", { ...note("n"), color }) }, "invalid-color");
    }
  });

  it("snaps positions and sizes to millionths of the page, rounding halves up", () => {
    const next = applyCommand(
      start,
      add("a", { ...note("n"), at: { x: 0.123_456_7, y: 0.000_000_5 }, size: 0.020_000_4 }),
    ).state;
    expect(next.pages[0]?.annotations[0]).toMatchObject({
      at: { x: 0.123_457, y: 0.000_001 },
      size: 0.02,
    });
    const stroke = applyCommand(
      start,
      add("a", {
        id: "s",
        type: "pen",
        points: [{ x: 1 / 3, y: 2 / 3 }],
        color: "#000000",
        width: 0.004_999_9,
      }),
    ).state.pages[0]?.annotations[0];
    expect(stroke).toMatchObject({ points: [{ x: 0.333_333, y: 0.666_667 }], width: 0.005 });
  });

  it("refuses positions off the page, and sizes the grid makes 0", () => {
    refuse(add("a", { ...note("n"), at: { x: 1.000_1, y: 0 } }), "outside-page");
    refuse(add("a", { ...note("n"), at: { x: -0.1, y: 0 } }), "outside-page");
    refuse(add("a", { ...note("n"), size: 0.000_000_4 }), "invalid-size");
    refuse(add("a", { ...note("n"), size: 1.5 }), "invalid-size");
    refuse(
      add("a", { id: "s", type: "pen", points: [], color: "#000000", width: 0.01 }),
      "too-many-points",
    );
  });

  it("refuses an insert from an unknown source, of a page it doesn't have, or with too few keys", () => {
    const insert = (changes: Record<string, unknown>) => ({
      type: "pdf.insertPages",
      source: "s2",
      pageIndexes: [0],
      at: 0,
      keys: ["x"],
      ...changes,
    });
    refuse(insert({ source: "s9" }), "unknown-source");
    refuse(insert({ source: "hasOwnProperty" }), "unknown-source");
    refuse(insert({ pageIndexes: [10] }), "page-out-of-range");
    refuse(insert({ pageIndexes: [0, 1] }), "invalid-keys");
    refuse(insert({ pageIndexes: [-1] }), "malformed-command");
  });

  it("keeps form fields named __proto__, constructor and toString as ordinary fields", () => {
    let state = start;
    for (const field of ["__proto__", "constructor", "toString"]) {
      state = roundTrip(state, { type: "pdf.setFieldValue", source: "s1", field, value: field });
    }
    const values = state.formValues["s1"] as Record<string, unknown>;
    expect(Object.getPrototypeOf(values)).toBe(Object.prototype);
    expect(Object.keys(values)).toEqual(["__proto__", "constructor", "toString"]);
    expect(Object.hasOwn(values, "__proto__")).toBe(true);
    const cleared = roundTrip(state, {
      type: "pdf.setFieldValue",
      source: "s1",
      field: "__proto__",
      value: null,
    });
    expect(Object.keys(cleared.formValues["s1"] as object)).toEqual(["constructor", "toString"]);
  });

  it("counts lengths in code points, so characters outside the BMP count once", () => {
    const emoji = "📄";
    // 10,000 code points, 20,000 UTF-16 units.
    applyCommand(start, add("a", { ...note("n"), text: emoji.repeat(10_000) }));
    refuse(add("a", { ...note("n"), text: emoji.repeat(10_001) }), "text-too-long");
    const field = (name: string, value: unknown = "") =>
      ({ type: "pdf.setFieldValue", source: "s1", field: name, value }) as PdfCommand;
    applyCommand(start, field(emoji.repeat(1_000)));
    refuse(field(emoji.repeat(1_001)), "field-name-too-long");
    applyCommand(start, field("name", emoji.repeat(10_000)));
    refuse(field("name", emoji.repeat(10_001)), "text-too-long");
    refuse(field(""), "malformed-command");
    applyCommand(start, add("a", note(emoji.repeat(128))));
    refuse(add("a", note(emoji.repeat(129))), "malformed-command");
  });

  it("checks pages that a restore brings back", () => {
    const restore = (page: unknown, index = 0) => ({
      type: "pdf.restorePages",
      entries: [{ index, page }],
    });
    refuse(restore({ ...page("x"), rotation: 45 }), "invalid-rotation");
    refuse(restore({ ...page("x"), source: "s9" }), "unknown-source");
    refuse(restore({ ...page("x"), extra: true }), "malformed-command");
    refuse(restore(page("x"), 5), "invalid-position");
    refuse(restore(page("a")), "duplicate-key");
  });
});

/** An addAnnotation command for the page. */
function add(key: string, annotation: unknown) {
  return { type: "pdf.addAnnotation", page: key, annotation } as PdfCommand;
}

describe("the reducer's properties (sdk-core ADR 0045)", () => {
  const onGrid = (value: number) =>
    Math.round(value * PDF_POSITION_GRID) / PDF_POSITION_GRID === value;

  it("undoes any sequence of valid commands exactly, and keeps every position on the grid", () => {
    fc.assert(
      fc.property(steps(8), ({ commands }) => {
        const { state, inverses } = applyAll(reducer, START, commands);
        expect(applyAll(reducer, state, inverses).state).toEqual(START);
        for (const { annotations } of state.pages) {
          for (const annotation of annotations) {
            const numbers =
              annotation.type === "text"
                ? [annotation.at.x, annotation.at.y, annotation.size]
                : annotation.type === "signature"
                  ? []
                  : [...annotation.points.flatMap(({ x, y }) => [x, y]), annotation.width];
            expect(numbers.every(onGrid), JSON.stringify(annotation)).toBe(true);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it("stores what it's given back unchanged: applying the stored values again changes nothing", () => {
    fc.assert(
      fc.property(steps(6), ({ plan: state }) => {
        for (const page of state.pages) {
          for (const annotation of page.annotations) {
            const removed = reducer(state, {
              type: "pdf.removeAnnotation",
              page: page.key,
              id: annotation.id,
            });
            expect(reducer(removed.state, removed.inverse).state).toEqual(state);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("refuses any mutated command with INVALID_COMMAND, or applies it, and never changes its input", () => {
    const mutatedCommand = steps(3).chain(({ plan: state }) =>
      fc.tuple(
        fc.constant(state),
        fc.oneof(
          mutated(commandFor(state)),
          commandFor(state).chain((valid) => {
            const [field, value] = Object.entries(valid).find(
              ([, entry]) => typeof entry === "object" && entry !== null,
            ) ?? [undefined, undefined];
            if (field === undefined) return fc.constant(valid as unknown);
            return mutated(fc.constant(value as object)).map((inner) => ({
              ...valid,
              [field]: inner,
            }));
          }),
        ),
      ),
    );
    fc.assert(
      fc.property(mutatedCommand, ([state, command]) => {
        const before = structuredClone(state);
        try {
          reducer(state, command as PdfCommand);
        } catch (error) {
          expect(isPdfError(error, "INVALID_COMMAND"), String(error)).toBe(true);
        }
        expect(state).toEqual(before);
      }),
      { numRuns: 2_000 },
    );
  });
});
