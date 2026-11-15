import { describe, expect, it } from "vitest";
import type { PdfPlan } from "../model/plan.js";
import { toPdfCommandDocument, toPdfPlanDocument } from "./plan-document.js";

/**
 * What the conformance vectors can't show: the writers' refusals, which only
 * a caller in memory can reach. The vectors in conformance/ cover reading,
 * writing back and applying commands (sdk-core ADR 0045).
 */
describe("the plan document writers", () => {
  const plan: PdfPlan = {
    pages: [{ key: "p1", source: "s1", pageIndex: 0, rotation: 0, annotations: [] }],
    formValues: { s2: { name: "Ada" } },
  };

  it("refuse a plan whose sources aren't all given", () => {
    expect(() => toPdfPlanDocument(plan, { s1: { pageCount: 1 } })).toThrow(TypeError);
    expect(() =>
      toPdfPlanDocument(plan, { s1: { pageCount: 1 }, s2: { pageCount: 1 } }),
    ).not.toThrow();
  });

  it("write positions and sizes as whole millionths", () => {
    const written = toPdfCommandDocument({
      type: "pdf.addAnnotation",
      page: "p1",
      annotation: {
        id: "n",
        type: "text",
        at: { x: 0.123_457, y: 1 },
        text: "",
        size: 0.02,
        color: "#000000",
      },
    });
    expect(written).toEqual({
      type: "pdf.addAnnotation",
      page: "p1",
      annotation: {
        id: "n",
        type: "text",
        at: { x: 123_457, y: 1_000_000 },
        text: "",
        size: 20_000,
        color: "#000000",
      },
    });
  });

  it("refuse pdf.restorePages and signatures, which version 1 doesn't hold", () => {
    expect(() =>
      toPdfCommandDocument({
        type: "pdf.restorePages",
        entries: [{ index: 0, page: plan.pages[0] as PdfPlan["pages"][number] }],
      }),
    ).toThrow(TypeError);
    expect(() =>
      toPdfCommandDocument({
        type: "pdf.addAnnotation",
        page: "p1",
        annotation: {
          id: "s",
          type: "signature",
          at: { x: 0, y: 0 },
          width: 0.1,
          height: 0.1,
          png: new Uint8Array(),
        },
      }),
    ).toThrow(TypeError);
  });
});
