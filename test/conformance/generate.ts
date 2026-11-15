import type {
  ConformanceCase,
  ConformanceFile,
} from "@hussmartinez/sdk-config/testing/conformance";
import fc from "fast-check";
import { toPdfCommandDocument, toPdfPlanDocument } from "../../src/index.js";
import { commandFor, mutated, SOURCES, steps } from "../arbitraries/pdf-plan.js";
import { applyToDocument, readAndWrite } from "./run.js";

/**
 * Writes the conformance cases (sdk-core ADR 0045): hand-written cases for
 * every outcome a port must reproduce, and cases generated from the
 * reducer's property-test generators with a fixed seed. The files in
 * conformance/ are this module's output, checked in; `pnpm conformance:update`
 * rewrites them, and the tests fail when they're out of date.
 */

/** The seed of the generated cases. Changing it, or fast-check's version, rewrites them. */
const SEED = 45;
/** How many generated commands that apply, and of each refusal, the file keeps. */
const GENERATED_APPLIED = 60;
const GENERATED_PER_REFUSAL = 2;
/** How many generated documents the plan file keeps. */
const GENERATED_PLANS = 20;

/** The generators' sources, as a document lists them. */
const sources = Object.fromEntries(
  Object.entries(SOURCES).map(([id, pageCount]) => [id, { pageCount }]),
);

/** The value as JSON carries it: what a port reads from the file. */
const asJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const page = (key: string, source: string, pageIndex: number, changes = {}) => ({
  key,
  source,
  pageIndex,
  rotation: 0,
  annotations: [] as unknown[],
  ...changes,
});
const note = (id: string, changes = {}) => ({
  id,
  type: "text",
  at: { x: 100_000, y: 250_000 },
  text: "Approved",
  size: 20_000,
  color: "#1a73e8",
  ...changes,
});
const stroke = (id: string, changes = {}) => ({
  id,
  type: "pen",
  points: [
    { x: 0, y: 0 },
    { x: 500_000, y: 333_333 },
    { x: 1_000_000, y: 1_000_000 },
  ],
  color: "#000000",
  width: 2_000,
  ...changes,
});

/** A plan with every part set: two sources, a turn, a moved page, annotations and form values. */
const BASE = {
  format: "hm-pdf-plan",
  version: 1,
  sources,
  pages: [
    page("p1", "s1", 0, { annotations: [note("n1"), stroke("n2", { type: "highlight" })] }),
    page("p3", "s1", 2, { rotation: 90 }),
    page("p2", "s1", 1),
    page("k1", "s2", 3, { rotation: 270, annotations: [stroke("n1")] }),
  ],
  formValues: { s1: { name: "Ada Lovelace", subscribe: true }, s2: { "Field 1": "" } },
};

/**
 * A plan whose source ids, page keys, field names and annotation ids are the
 * names of `Object.prototype`'s properties, built from JSON text, so
 * `__proto__` is an own field as any JSON parser makes it. Readers that keep
 * them in plain objects, in any language, must still treat them as data.
 * Each source has its own page count, so a page index shows which one a
 * reader looked up.
 */
const PROTOTYPE_NAMED = JSON.parse(
  JSON.stringify({
    ...BASE,
    sources: { PROTO: { pageCount: 1 }, constructor: { pageCount: 2 }, toString: { pageCount: 3 } },
    pages: [
      page("PROTO", "PROTO", 0, { annotations: [note("PROTO")] }),
      page("constructor", "constructor", 1),
      page("toString", "toString", 2),
    ],
    formValues: { PROTO: { PROTO: "a", constructor: "b", toString: true } },
  }).replaceAll('"PROTO"', '"__proto__"'),
) as typeof BASE;

type Outcome = { readonly ok: true } | { readonly code: string; readonly reason: string };

/**
 * A case whose expected result is what the runner gives. For a hand-written
 * case, `outcome` is what the case is meant to show, and a runner that
 * disagrees fails here, before any file is written.
 */
function make(
  name: string,
  input: unknown,
  run: (input: never) => unknown,
  outcome?: Outcome,
): ConformanceCase {
  const json = asJson(input);
  let expected: unknown;
  try {
    expected = asJson(run(json as never));
  } catch (error) {
    const { code, details } = error as { code?: string; details?: { reason?: string } };
    if (typeof code !== "string" || typeof details?.reason !== "string") throw error;
    expected = { error: { code, reason: details.reason } };
  }
  if (outcome) {
    const got = (expected as { error?: Outcome }).error ?? { ok: true };
    if (JSON.stringify(got) !== JSON.stringify(outcome)) {
      throw new Error(
        `Case "${name}" gave ${JSON.stringify(got)}, not ${JSON.stringify(outcome)}.`,
      );
    }
  }
  return { name, input: json, expected };
}

const applied: Outcome = { ok: true };
const refused = (reason: string, code = "INVALID_COMMAND"): Outcome => ({ code, reason });

const EMOJI = "📄";

/** `hm-pdf-commands`: a user-level command applied to a plan document. */
export function commandCases(): ConformanceFile {
  const on = (command: unknown) => ({ plan: BASE, command });
  const onNamed = (command: unknown) => ({ plan: PROTOTYPE_NAMED, command });
  const rotate = (pages: unknown, angle: unknown) => ({ type: "pdf.rotatePages", pages, angle });
  const move = (pages: unknown, to: unknown) => ({ type: "pdf.movePages", pages, to });
  const insert = (changes: Record<string, unknown> = {}) => ({
    type: "pdf.insertPages",
    source: "s2",
    pageIndexes: [0, 2],
    at: 1,
    keys: ["k2", "k3"],
    ...changes,
  });
  const field = (name: unknown, value: unknown, source: unknown = "s1") => ({
    type: "pdf.setFieldValue",
    source,
    field: name,
    value,
  });
  const add = (annotation: unknown, pageKey: unknown = "p2", index?: unknown) => ({
    type: "pdf.addAnnotation",
    page: pageKey,
    annotation,
    ...(index === undefined ? {} : { index }),
  });
  const remove = (pageKey: unknown, id: unknown) => ({
    type: "pdf.removeAnnotation",
    page: pageKey,
    id,
  });
  // `__proto__` as an own key of a command, as JSON.parse makes it.
  const protoField = JSON.parse(
    '{"type": "pdf.deletePages", "pages": ["p2"], "__proto__": {}}',
  ) as unknown;

  const handWritten: [string, unknown, Outcome][] = [
    ["rotates pages, adding to their rotation", on(rotate(["p3", "k1"], 90)), applied],
    ["rotates anticlockwise", on(rotate(["p1"], -90)), applied],
    ["rotates by 0, changing nothing", on(rotate(["p1"], 0)), applied],
    ["rotates a full turn", on(rotate(["p1"], 360)), applied],
    [
      "deletes pages with their annotations",
      on({ type: "pdf.deletePages", pages: ["k1", "p1"] }),
      applied,
    ],
    ["moves pages as a block, in plan order", on(move(["k1", "p3"], 0)), applied],
    ["moves a page to the end", on(move(["p1"], 3)), applied],
    [
      "reorders every page",
      on({ type: "pdf.reorderPages", order: ["k1", "p2", "p3", "p1"] }),
      applied,
    ],
    ["inserts pages of a source", on(insert()), applied],
    [
      "inserts a source's last page at the end",
      on(insert({ pageIndexes: [3], at: 4, keys: ["k2"] })),
      applied,
    ],
    ["sets a text field", on(field("name", "Grace Hopper")), applied],
    ["sets a checkbox", on(field("subscribe", false)), applied],
    ["sets a field in another source", on(field("Field 2", "x", "s2")), applied],
    ["clears a field", on(field("name", null)), applied],
    [
      "clears a source's last field, which removes the source's values",
      on(field("Field 1", null, "s2")),
      applied,
    ],
    ["clears a field that isn't set, changing nothing", on(field("missing", null)), applied],
    ["adds a text note", on(add(note("n3"))), applied],
    [
      "adds a stroke at a position among a page's annotations",
      on(add(stroke("n3"), "p1", 1)),
      applied,
    ],
    ["adds an annotation id another page already uses", on(add(note("n1"))), applied],
    [
      "adds a note at the page's far corner",
      on(add(note("n3", { at: { x: 1_000_000, y: 1_000_000 } }))),
      applied,
    ],
    ["removes an annotation", on(remove("p1", "n1")), applied],
    [
      "keeps 10,000 code points outside the BMP in a note, which are 20,000 UTF-16 units",
      on(add(note("n3", { text: EMOJI.repeat(10_000) }))),
      applied,
    ],
    [
      "refuses 10,001 code points in a note",
      on(add(note("n3", { text: EMOJI.repeat(10_001) }))),
      refused("text-too-long"),
    ],
    ["keeps a field name of 1,000 code points", on(field(EMOJI.repeat(1_000), "")), applied],
    [
      "refuses a field name of 1,001 code points",
      on(field(EMOJI.repeat(1_001), "")),
      refused("field-name-too-long"),
    ],
    ["keeps a field value of 10,000 code points", on(field("name", EMOJI.repeat(10_000))), applied],
    [
      "refuses a field value of 10,001 code points",
      on(field("name", EMOJI.repeat(10_001))),
      refused("text-too-long"),
    ],
    ["keeps an annotation id of 128 code points", on(add(note(EMOJI.repeat(128)))), applied],
    [
      "refuses an annotation id of 129 code points",
      on(add(note(EMOJI.repeat(129)))),
      refused("malformed-command"),
    ],
    ["refuses an empty field name", on(field("", "")), refused("malformed-command")],
    [
      "inserts from the source keyed __proto__, by its own page count",
      onNamed(insert({ source: "__proto__", pageIndexes: [0], keys: ["x"] })),
      applied,
    ],
    [
      "refuses a page past the source keyed __proto__'s page count",
      onNamed(insert({ source: "__proto__", pageIndexes: [1], keys: ["x"] })),
      refused("page-out-of-range"),
    ],
    [
      "refuses a source only Object.prototype has",
      onNamed(insert({ source: "hasOwnProperty", pageIndexes: [0], keys: ["x"] })),
      refused("unknown-source"),
    ],
    [
      "deletes the page keyed __proto__",
      onNamed({ type: "pdf.deletePages", pages: ["__proto__"] }),
      applied,
    ],
    [
      "refuses a page key only Object.prototype has",
      onNamed(rotate(["hasOwnProperty"], 90)),
      refused("unknown-page"),
    ],
    [
      "sets the field named constructor of the source keyed __proto__",
      onNamed(field("constructor", "c", "__proto__")),
      applied,
    ],
    ["sets a field named __proto__", on(field("__proto__", "value")), applied],
    [
      "removes the annotation with id __proto__",
      onNamed(remove("__proto__", "__proto__")),
      applied,
    ],
    ["refuses a command that isn't an object", on(null), refused("malformed-command")],
    ["refuses a list", on([rotate(["p1"], 90)]), refused("malformed-command")],
    [
      "refuses an unknown command",
      on({ type: "pdf.crop", pages: ["p1"] }),
      refused("unknown-command"),
    ],
    [
      "refuses a command type only Object.prototype has",
      on({ type: "toString" }),
      refused("unknown-command"),
    ],
    [
      "refuses pdf.restorePages, an inverse that isn't part of the format",
      on({ type: "pdf.restorePages", entries: [{ index: 0, page: page("x", "s1", 0) }] }),
      refused("unknown-command"),
    ],
    [
      "refuses an unknown field",
      on({ ...rotate(["p1"], 90), mode: "all" }),
      refused("malformed-command"),
    ],
    ["refuses an unknown field named __proto__", on(protoField), refused("malformed-command")],
    [
      "refuses a missing field",
      on({ type: "pdf.rotatePages", pages: ["p1"] }),
      refused("malformed-command"),
    ],
    ["refuses no pages", on(rotate([], 90)), refused("malformed-command")],
    ["refuses an unknown page", on(rotate(["p9"], 90)), refused("unknown-page")],
    ["refuses a page named twice", on(rotate(["p1", "p1"], 90)), refused("duplicate-page")],
    ["refuses an angle of 45 degrees", on(rotate(["p1"], 45)), refused("invalid-rotation")],
    ["refuses an angle over a full turn", on(rotate(["p1"], 450)), refused("invalid-rotation")],
    ["refuses an angle as text", on(rotate(["p1"], "90")), refused("malformed-command")],
    [
      "refuses deleting every page",
      on({ type: "pdf.deletePages", pages: ["p1", "p2", "p3", "k1"] }),
      refused("last-page"),
    ],
    ["refuses a move past the end", on(move(["p1"], 4)), refused("invalid-position")],
    ["refuses a fractional position", on(move(["p1"], 0.5)), refused("malformed-command")],
    [
      "refuses an order without every page",
      on({ type: "pdf.reorderPages", order: ["p1", "p2", "p3"] }),
      refused("invalid-order"),
    ],
    [
      "refuses an order with an unknown page",
      on({ type: "pdf.reorderPages", order: ["p1", "p2", "p3", "x"] }),
      refused("invalid-order"),
    ],
    [
      "refuses an insert from an unknown source",
      on(insert({ source: "s9" })),
      refused("unknown-source"),
    ],
    [
      "refuses an insert of a page the source doesn't have",
      on(insert({ pageIndexes: [4], keys: ["k2"] })),
      refused("page-out-of-range"),
    ],
    [
      "refuses an insert without one key per page",
      on(insert({ keys: ["k2"] })),
      refused("invalid-keys"),
    ],
    [
      "refuses an insert with a key the plan has",
      on(insert({ keys: ["k2", "p1"] })),
      refused("duplicate-key"),
    ],
    [
      "refuses an insert with a key twice",
      on(insert({ keys: ["k2", "k2"] })),
      refused("duplicate-key"),
    ],
    ["refuses an insert past the end", on(insert({ at: 5 })), refused("invalid-position")],
    [
      "refuses a field in an unknown source",
      on(field("name", "x", "s9")),
      refused("unknown-source"),
    ],
    ["refuses a field value that's a number", on(field("name", 1)), refused("malformed-command")],
    [
      "refuses an annotation on an unknown page",
      on(add(note("n3"), "p9")),
      refused("unknown-page"),
    ],
    [
      "refuses an annotation id the page has",
      on(add(note("n1"), "p1")),
      refused("duplicate-annotation"),
    ],
    [
      "refuses an annotation past the page's last",
      on(add(note("n3"), "p1", 3)),
      refused("invalid-position"),
    ],
    [
      "refuses removing an unknown annotation",
      on(remove("p1", "n9")),
      refused("unknown-annotation"),
    ],
    [
      "refuses a signature, which version 1 can't hold",
      on(add({ id: "s", type: "signature", at: { x: 0, y: 0 }, width: 200_000, height: 100_000 })),
      refused("unsupported-annotation"),
    ],
    [
      "refuses an unknown annotation type",
      on(add({ ...note("n3"), type: "stamp" })),
      refused("malformed-command"),
    ],
    [
      "refuses a position off the page",
      on(add(note("n3", { at: { x: 1_000_001, y: 0 } }))),
      refused("outside-page"),
    ],
    [
      "refuses a position that isn't whole millionths",
      on(add(note("n3", { at: { x: 0.5, y: 0 } }))),
      refused("malformed-command"),
    ],
    ["refuses a text size of 0", on(add(note("n3", { size: 0 }))), refused("invalid-size")],
    [
      "refuses a stroke wider than the page",
      on(add(stroke("n3", { width: 1_000_001 }))),
      refused("invalid-size"),
    ],
    [
      "refuses a stroke with no points",
      on(add(stroke("n3", { points: [] }))),
      refused("too-many-points"),
    ],
    [
      "refuses a colour in capitals",
      on(add(note("n3", { color: "#1A73E8" }))),
      refused("invalid-color"),
    ],
    ["refuses a short colour", on(add(note("n3", { color: "#fff" }))), refused("invalid-color")],
    ["refuses a colour by name", on(add(note("n3", { color: "red" }))), refused("invalid-color")],
    [
      "refuses an unknown annotation field",
      on(add(note("n3", { bold: true }))),
      refused("malformed-command"),
    ],
  ];

  // A balanced sample: commands that apply, and a few of each refusal, so
  // the file stays small enough to review.
  const generated: ConformanceCase[] = [];
  const refusals = new Map<string, number>();
  let applies = 0;
  const samples = fc.sample(
    steps(4).chain(({ plan }) =>
      fc.tuple(
        fc.constant(plan),
        commandFor(plan).chain((command) => {
          const json = toPdfCommandDocument(command);
          return fc.oneof(
            fc.constant(json as unknown),
            mutated(fc.constant(json)),
            nestedMutation(json),
          );
        }),
      ),
    ),
    { seed: SEED, numRuns: 4_000 },
  );
  for (const [plan, command] of samples) {
    const made = make("", { plan: toPdfPlanDocument(plan, sources), command }, applyToDocument);
    const reason = (made.expected as { error?: { reason: string } }).error?.reason;
    if (
      reason === undefined
        ? applies >= GENERATED_APPLIED
        : (refusals.get(reason) ?? 0) >= GENERATED_PER_REFUSAL
    ) {
      continue;
    }
    if (reason === undefined) applies += 1;
    else refusals.set(reason, (refusals.get(reason) ?? 0) + 1);
    const type = (command as { type?: unknown } | null)?.type;
    const named =
      typeof type === "string" && type.startsWith("pdf.") ? type : "a malformed command";
    const outcome = reason === undefined ? "applied" : `refused, ${reason}`;
    generated.push({ ...made, name: `generated ${generated.length + 1}: ${named}, ${outcome}` });
  }

  return {
    format: "hm-conformance",
    version: 1,
    subject: "hm-pdf-commands",
    description:
      "pdf-sdk's edit commands (docs/formats/hm-pdf-plan.md). input.plan is an hm-pdf-plan document and input.command an hm-pdf-command; expected is the resulting document, or the rejection. Applying the command's inverse must restore the plan, but the inverse itself is internal. Positions and sizes are whole millionths of the page. Generated cases come from the reducer's property-test generators, with a fixed seed.",
    cases: [
      ...handWritten.map(([name, input, outcome]) => make(name, input, applyToDocument, outcome)),
      ...generated,
    ],
  };
}

/** A command with one field of an object or list inside it replaced or added. */
export function nestedMutation(command: object): fc.Arbitrary<unknown> {
  const [field, value] =
    Object.entries(command).find(([, entry]) => typeof entry === "object" && entry !== null) ?? [];
  if (field === undefined) return fc.constant(command);
  return mutated(fc.constant(value as object)).map((inner) => {
    const copy: Record<string, unknown> = JSON.parse(JSON.stringify(command));
    copy[field] = Array.isArray(value) ? Object.values(inner) : inner;
    return copy;
  });
}

/** `hm-pdf-plan`: a document read, checked and written back. */
export function planCases(): ConformanceFile {
  const document = (changes: Record<string, unknown>) => ({ ...BASE, ...changes });
  const withPage = (index: number, changes: Record<string, unknown>) =>
    document({
      pages: BASE.pages.map((entry, at) => (at === index ? { ...entry, ...changes } : entry)),
    });
  const invalidDocument = (reason: string) => refused(reason, "INVALID_DOCUMENT");
  const asset = (changes: Record<string, unknown> = {}) => ({
    asset: `sha256:${"0a".repeat(32)}`,
    mediaType: "application/pdf",
    size: 48_213,
    ...changes,
  });
  const handWritten: [string, unknown, Outcome][] = [
    ["reads a document unchanged", BASE, applied],
    [
      "reads a new plan: every page of one source, in order",
      document({
        sources: { s1: { pageCount: 3 } },
        pages: [page("p1", "s1", 0), page("p2", "s1", 1), page("p3", "s1", 2)],
        formValues: {},
      }),
      applied,
    ],
    [
      "reads a source with its asset",
      document({ sources: { ...sources, s1: { pageCount: 6, asset: asset() } } }),
      applied,
    ],
    [
      "reads a source no page uses",
      document({ sources: { ...sources, s3: { pageCount: 1 } } }),
      applied,
    ],
    [
      "reads ids, keys and field names named __proto__, constructor and toString",
      PROTOTYPE_NAMED,
      applied,
    ],
    [
      "refuses a page past the page count of the source keyed __proto__",
      { ...PROTOTYPE_NAMED, pages: [{ ...PROTOTYPE_NAMED.pages[0], pageIndex: 1 }] },
      invalidDocument("page-out-of-range"),
    ],
    [
      "refuses a page whose source only Object.prototype has",
      { ...PROTOTYPE_NAMED, pages: [{ ...PROTOTYPE_NAMED.pages[0], source: "hasOwnProperty" }] },
      invalidDocument("unknown-source"),
    ],
    [
      "refuses another format",
      document({ format: "hm-image-plan" }),
      refused("unknown-format", "UNSUPPORTED_FORMAT"),
    ],
    [
      "refuses a later version",
      document({ version: 2 }),
      refused("unknown-format-version", "UNSUPPORTED_FORMAT"),
    ],
    ["refuses a list", [BASE], invalidDocument("malformed-document")],
    [
      "refuses a version that isn't a number",
      document({ version: "1" }),
      invalidDocument("malformed-document"),
    ],
    ["refuses an unknown field", document({ history: [] }), invalidDocument("malformed-document")],
    [
      "refuses a missing field",
      { ...BASE, formValues: undefined },
      invalidDocument("malformed-document"),
    ],
    [
      "refuses a plan with no pages",
      document({ pages: [] }),
      invalidDocument("malformed-document"),
    ],
    [
      "refuses a source of no pages",
      document({ sources: { ...sources, s1: { pageCount: 0 } } }),
      invalidDocument("malformed-document"),
    ],
    [
      "refuses an asset that isn't a SHA-256",
      document({
        sources: { ...sources, s1: { pageCount: 6, asset: asset({ asset: "md5:00" }) } },
      }),
      invalidDocument("malformed-document"),
    ],
    [
      "refuses a media type in capitals",
      document({
        sources: {
          ...sources,
          s1: { pageCount: 6, asset: asset({ mediaType: "Application/PDF" }) },
        },
      }),
      invalidDocument("malformed-document"),
    ],
    [
      "refuses a page whose source isn't listed",
      withPage(1, { source: "s9" }),
      invalidDocument("unknown-source"),
    ],
    [
      "refuses a page past its source's page count",
      withPage(1, { pageIndex: 6 }),
      invalidDocument("page-out-of-range"),
    ],
    [
      "refuses two pages with one key",
      withPage(1, { key: "p1" }),
      invalidDocument("duplicate-key"),
    ],
    [
      "refuses a rotation of 45 degrees",
      withPage(1, { rotation: 45 }),
      invalidDocument("invalid-rotation"),
    ],
    [
      "refuses an unknown page field",
      withPage(1, { label: "iii" }),
      invalidDocument("malformed-document"),
    ],
    [
      "refuses two annotations with one id on a page",
      withPage(1, { annotations: [note("n1"), stroke("n1")] }),
      invalidDocument("duplicate-annotation"),
    ],
    [
      "refuses a signature, which version 1 can't hold",
      withPage(1, {
        annotations: [{ id: "s", type: "signature", at: { x: 0, y: 0 }, width: 1, height: 1 }],
      }),
      invalidDocument("unsupported-annotation"),
    ],
    [
      "refuses a position off the page",
      withPage(1, { annotations: [note("n", { at: { x: 0, y: 1_000_001 } })] }),
      invalidDocument("outside-page"),
    ],
    [
      "refuses a fractional position",
      withPage(1, { annotations: [note("n", { at: { x: 0.25, y: 0 } })] }),
      invalidDocument("malformed-document"),
    ],
    [
      "refuses a stroke width of 0",
      withPage(1, { annotations: [stroke("n", { width: 0 })] }),
      invalidDocument("invalid-size"),
    ],
    [
      "refuses a colour in capitals",
      withPage(1, { annotations: [note("n", { color: "#FFFFFF" })] }),
      invalidDocument("invalid-color"),
    ],
    [
      "refuses a stroke with no points",
      withPage(1, { annotations: [stroke("n", { points: [] })] }),
      invalidDocument("too-many-points"),
    ],
    [
      "reads a note of 10,000 code points outside the BMP",
      withPage(1, { annotations: [note("n", { text: EMOJI.repeat(10_000) })] }),
      applied,
    ],
    [
      "refuses a note of 10,001 code points",
      withPage(1, { annotations: [note("n", { text: EMOJI.repeat(10_001) })] }),
      invalidDocument("text-too-long"),
    ],
    [
      "refuses a page key of 129 code points",
      withPage(1, { key: EMOJI.repeat(129) }),
      invalidDocument("malformed-document"),
    ],
    ["reads a page key of 128 code points", withPage(1, { key: EMOJI.repeat(128) }), applied],
    [
      "refuses form values for an unlisted source",
      document({ formValues: { s9: { name: "x" } } }),
      invalidDocument("unknown-source"),
    ],
    [
      "refuses a source's empty form values",
      document({ formValues: { s1: {} } }),
      invalidDocument("malformed-document"),
    ],
    [
      "refuses a field value that's a number",
      document({ formValues: { s1: { age: 36 } } }),
      invalidDocument("malformed-document"),
    ],
    [
      "refuses a field name of 1,001 code points",
      document({ formValues: { s1: { [EMOJI.repeat(1_001)]: "" } } }),
      invalidDocument("field-name-too-long"),
    ],
    [
      "refuses a field value of 10,001 code points",
      document({ formValues: { s1: { name: EMOJI.repeat(10_001) } } }),
      invalidDocument("text-too-long"),
    ],
  ];
  const generated = fc
    .sample(steps(8), { seed: SEED, numRuns: GENERATED_PLANS })
    .map(({ plan }, index) =>
      make(`generated ${index + 1}`, toPdfPlanDocument(plan, sources), readAndWrite, applied),
    );
  return {
    format: "hm-conformance",
    version: 1,
    subject: "hm-pdf-plan",
    description:
      "pdf-sdk's plan document (docs/formats/hm-pdf-plan.md). input is an hm-pdf-plan document; expected is the document as a reader writes it back, or the rejection. Positions and sizes are whole millionths of the page. Generated cases come from the reducer's property-test generators, with a fixed seed.",
    cases: [
      ...handWritten.map(([name, input, outcome]) => make(name, input, readAndWrite, outcome)),
      ...generated,
    ],
  };
}
