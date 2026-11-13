import { sdkCoreMessages } from "@hussmartinez/sdk-core";
import { uiMessages } from "@hussmartinez/ui";
import { describe, expect, it } from "vitest";
import { pdfMessages } from "../messages/en.js";
import { pdfEditorMessages } from "./editor-messages.js";

const keys = (catalogue: object) => new Set(Object.keys(catalogue));
const own = [...keys(pdfMessages)].filter((key) => !keys(sdkCoreMessages).has(key));

describe("the editor's message catalogue (sdk-core ADR 0046)", () => {
  it("has no key of the SDK's own that sdk-core or ui also defines", () => {
    // A shared key would mean one text silently replaces the other.
    expect(own.filter((key) => keys(sdkCoreMessages).has(key))).toEqual([]);
    expect(own.filter((key) => keys(uiMessages).has(key))).toEqual([]);
  });

  it("shares only sdk-core's keys with ui's catalogue, with the same text", () => {
    const shared = [...keys(pdfMessages)].filter((key) => keys(uiMessages).has(key));
    for (const key of shared) {
      expect(keys(sdkCoreMessages).has(key), key).toBe(true);
      expect(uiMessages[key as keyof typeof uiMessages], key).toEqual(
        pdfMessages[key as keyof typeof pdfMessages],
      );
    }
  });

  it("holds every text of both catalogues", () => {
    expect(keys(pdfEditorMessages)).toEqual(new Set([...keys(pdfMessages), ...keys(uiMessages)]));
  });
});
