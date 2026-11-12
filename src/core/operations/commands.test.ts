import { describe, expect, it } from "vitest";
import type { PdfTextAnnotation } from "../model/annotations.js";
import type { PdfPlan, PdfPlanPage } from "../model/plan.js";
import { applyCommand, applyCommands, type PdfCommand } from "./commands.js";

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
  const { plan: next, inverse } = applyCommand(state, command);
  expect(applyCommand(next, inverse).plan).toEqual(state);
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
    }).plan;
    const next = roundTrip(start, { type: "pdf.deletePages", pages: ["c", "b"] });
    expect(keys(next)).toEqual(["a", "d"]);
  });

  it("refuses to delete every page", () => {
    expect(() =>
      applyCommand(plan("a", "b"), { type: "pdf.deletePages", pages: ["a", "b"] }),
    ).toThrow(RangeError);
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
      expect(() => applyCommand(start, { type: "pdf.reorderPages", order })).toThrow(TypeError);
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

  it.each<[string, PdfCommand]>([
    ["an unknown page", { type: "pdf.rotatePages", pages: ["x"], angle: 90 }],
    ["a repeated page", { type: "pdf.deletePages", pages: ["a", "a"] }],
    ["no pages", { type: "pdf.movePages", pages: [], to: 0 }],
    [
      "an existing key",
      { type: "pdf.insertPages", source: "s", pageIndexes: [0], at: 0, keys: ["a"] },
    ],
    ["an unknown annotation", { type: "pdf.removeAnnotation", page: "a", id: "x" }],
    ["a duplicate annotation", { type: "pdf.addAnnotation", page: "a", annotation: note("n0") }],
  ])("rejects %s with a TypeError", (_, command) => {
    const start = applyCommand(plan("a", "b"), {
      type: "pdf.addAnnotation",
      page: "a",
      annotation: note("n0"),
    }).plan;
    expect(() => applyCommand(start, command)).toThrow(TypeError);
  });

  it.each<[string, PdfCommand]>([
    [
      "a rotation that isn't a multiple of 90",
      { type: "pdf.rotatePages", pages: ["a"], angle: 45 },
    ],
    ["a move past the end", { type: "pdf.movePages", pages: ["a"], to: 2 }],
    [
      "an insert past the end",
      { type: "pdf.insertPages", source: "s", pageIndexes: [0], at: 3, keys: ["x"] },
    ],
  ])("rejects %s with a RangeError", (_, command) => {
    expect(() => applyCommand(plan("a", "b"), command)).toThrow(RangeError);
  });

  it("never changes the plan it's given", () => {
    const start = plan("a", "b");
    const frozen = structuredClone(start);
    applyCommand(start, { type: "pdf.movePages", pages: ["b"], to: 0 });
    applyCommand(start, { type: "pdf.rotatePages", pages: ["a"], angle: 90 });
    expect(start).toEqual(frozen);
  });
});

describe("applyCommands", () => {
  it("applies a group as one step, and undoes it with the inverses in reverse order", () => {
    const start = plan("a", "b", "c");
    const { plan: next, inverses } = applyCommands(start, [
      { type: "pdf.movePages", pages: ["c"], to: 0 },
      { type: "pdf.rotatePages", pages: ["c"], angle: 90 },
      { type: "pdf.deletePages", pages: ["a"] },
    ]);
    expect(keys(next)).toEqual(["c", "b"]);
    expect(applyCommands(next, inverses).plan).toEqual(start);
  });

  it("changes nothing when any command in the group is invalid", () => {
    const start = plan("a", "b");
    expect(() =>
      applyCommands(start, [
        { type: "pdf.rotatePages", pages: ["a"], angle: 90 },
        { type: "pdf.deletePages", pages: ["x"] },
      ]),
    ).toThrow(TypeError);
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
        const { plan: after, inverses } = applyCommands(state, [command]);
        steps.push(inverses);
        state = after;
      }
      for (const inverses of steps.reverse()) state = applyCommands(state, inverses).plan;
      expect(state).toEqual(start);
    }
  });
});
