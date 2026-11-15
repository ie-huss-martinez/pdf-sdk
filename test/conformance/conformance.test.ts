import { readFileSync } from "node:fs";
import {
  type ConformanceCase,
  describeConformance,
  readConformance,
} from "@hussmartinez/sdk-config/testing/conformance";
import { Ajv2020 } from "ajv/dist/2020.js";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { toPdfCommandDocument, toPdfPlanDocument } from "../../src/index.js";
import { commandFor, mutated, SOURCES, steps } from "../arbitraries/pdf-plan.js";
import { commandCases, nestedMutation, planCases } from "./generate.js";
import { applyToDocument, readAndWrite } from "./run.js";

/**
 * The conformance vectors (sdk-core ADR 0045): the same files a port in
 * another language runs, checked here against the TypeScript SDK, plus the
 * rule that the runtime validators accept only what the schemas accept.
 */

const COMMANDS = new URL("../../conformance/hm-pdf-commands.json", import.meta.url);
const PLANS = new URL("../../conformance/hm-pdf-plan.json", import.meta.url);

const text = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

// Generating thousands of cases takes a few seconds, more while the rest of
// verify runs in parallel.
const SLOW = { timeout: 60_000 };

it("keeps the checked-in cases up to date with their generator", SLOW, async () => {
  // `pnpm conformance:update` rewrites them.
  await expect(text(planCases())).toMatchFileSnapshot("../../conformance/hm-pdf-plan.json");
  await expect(text(commandCases())).toMatchFileSnapshot("../../conformance/hm-pdf-commands.json");
});

describeConformance(PLANS, readAndWrite);
describeConformance(COMMANDS, applyToDocument);

const ajv = new Ajv2020({ allErrors: true, strict: true });
const schema = (path: string) =>
  JSON.parse(readFileSync(new URL(`../../formats/${path}`, import.meta.url), "utf8")) as object;
ajv.addSchema(schema("hm-pdf-plan/v1.schema.json"));
const planValid = ajv.getSchema(
  "https://github.com/ie-huss-martinez/pdf-sdk/blob/main/formats/hm-pdf-plan/v1.schema.json",
) as (value: unknown) => boolean;
const commandValid = ajv.compile(schema("hm-pdf-command/v1.schema.json"));

/**
 * Refusals the schemas express themselves. The others depend on the plan
 * or on the whole document, which a schema can't see: pages and keys it
 * names, its sources and their page counts, and annotation ids on a page.
 * So the schema accepts those documents and commands.
 */
const STRUCTURAL = new Set([
  "malformed-command",
  "malformed-document",
  "unknown-command",
  "unknown-format",
  "unknown-format-version",
  "invalid-rotation",
  "outside-page",
  "invalid-size",
  "too-many-points",
  "invalid-color",
  "unsupported-annotation",
  "field-name-too-long",
  "text-too-long",
]);

const refusal = ({ expected }: ConformanceCase) =>
  (expected as { error?: { reason: string } }).error?.reason;

const sources = Object.fromEntries(
  Object.entries(SOURCES).map(([id, pageCount]) => [id, { pageCount }]),
);

describe("the format schemas agree with the readers", () => {
  it("accept every document a reader accepts, and refuse every structural refusal", () => {
    for (const testCase of readConformance(PLANS).cases) {
      const reason = refusal(testCase);
      const structural = reason !== undefined && STRUCTURAL.has(reason);
      expect(planValid(testCase.input), testCase.name).toBe(!structural);
    }
  });

  it("accept every command the reducer applies, and refuse every structural refusal", () => {
    for (const testCase of readConformance(COMMANDS).cases) {
      const { plan, command } = testCase.input as { plan: unknown; command: unknown };
      expect(planValid(plan), testCase.name).toBe(true);
      const reason = refusal(testCase);
      const structural = reason !== undefined && STRUCTURAL.has(reason);
      expect(commandValid(command), testCase.name).toBe(!structural);
    }
  });

  it("never let the reducer apply a command the schema refuses", SLOW, () => {
    const cases = steps(3).chain(({ plan }) =>
      commandFor(plan).chain((command) => {
        const json = toPdfCommandDocument(command);
        return fc.tuple(
          fc.constant(plan),
          fc.oneof(mutated(fc.constant(json)), nestedMutation(json)),
        );
      }),
    );
    fc.assert(
      fc.property(cases, ([plan, command]) => {
        let applied = true;
        try {
          applyToDocument({ plan: toPdfPlanDocument(plan, sources), command });
        } catch {
          applied = false;
        }
        if (applied) expect(commandValid(command)).toBe(true);
      }),
      { numRuns: 2_000 },
    );
  });

  it("never let the reader accept a document the schema refuses", SLOW, () => {
    const document = steps(6).map(({ plan }) => toPdfPlanDocument(plan, sources));
    const nested = document.chain((value) =>
      fc.constantFrom("sources", "pages", "formValues" as const).chain((part) =>
        mutated(fc.constant(value[part] as object)).map((changed) => ({
          ...value,
          [part]: Array.isArray(value[part]) ? Object.values(changed) : changed,
        })),
      ),
    );
    const inPage = document.chain((value) =>
      mutated(fc.constant(value.pages[0] as object)).map((changed) => ({
        ...value,
        pages: [changed, ...value.pages.slice(1)],
      })),
    );
    fc.assert(
      fc.property(fc.oneof(mutated(document), nested, inPage), (value) => {
        let accepted = true;
        try {
          readAndWrite(value);
        } catch {
          accepted = false;
        }
        if (accepted) expect(planValid(value)).toBe(true);
      }),
      { numRuns: 2_000 },
    );
  });
});
