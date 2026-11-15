import { conforms } from "@hussmartinez/sdk-config/testing/conformance";
import { createPdfReducer } from "../../src/core/operations/commands.js";
import {
  type PdfPlanDocument,
  readPdfCommandDocument,
  readPdfPlanDocument,
  toPdfPlanDocument,
} from "../../src/index.js";

/**
 * How the TypeScript SDK runs each conformance subject: what a port in
 * another language implements too (sdk-core ADR 0045). There's one runner
 * per subject, shared by the generator that writes the cases and the tests
 * that check them.
 */

/** `hm-pdf-plan`: a document read and written back, as a reader normalises it. */
export function readAndWrite(document: unknown): PdfPlanDocument {
  const { plan, sources } = readPdfPlanDocument(document);
  return toPdfPlanDocument(plan, sources);
}

/**
 * `hm-pdf-commands`: a command applied to a plan document, giving the new
 * document. Its inverse must restore the plan exactly, though the inverse's
 * own shape is internal and isn't compared.
 */
export function applyToDocument(input: { plan: unknown; command: unknown }): PdfPlanDocument {
  const { plan, sources } = readPdfPlanDocument(input.plan);
  const reduce = createPdfReducer((id) =>
    Object.hasOwn(sources, id) ? sources[id]?.pageCount : undefined,
  );
  const { state, inverse } = reduce(plan, readPdfCommandDocument(input.command));
  const undone = reduce(state, inverse).state;
  if (!conforms(toPdfPlanDocument(undone, sources), toPdfPlanDocument(plan, sources))) {
    throw new Error("The command's inverse didn't restore the plan.");
  }
  return toPdfPlanDocument(state, sources);
}
