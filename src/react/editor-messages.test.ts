import { createMessages, sdkCoreMessages } from "@hussmartinez/sdk-core";
import { uiMessages } from "@hussmartinez/ui";
import { describe, expect, it } from "vitest";
import { pdfEditorText } from "../messages/editor-en.js";
import { pdfMessages } from "../messages/en.js";
import { pdfEditorMessages } from "./editor-messages.js";

const keys = (catalogue: object) => new Set(Object.keys(catalogue));
/** The SDK's own keys: its errors and warnings, and its interface text. */
const own = [
  ...[...keys(pdfMessages)].filter((key) => !keys(sdkCoreMessages).has(key)),
  ...keys(pdfEditorText),
];

describe("the components' message catalogue (sdk-core ADR 0046, docs/adr/0010)", () => {
  it("has no key of the SDK's own that sdk-core or ui also defines", () => {
    // A shared key would mean one text silently replaces the other.
    expect(own.filter((key) => keys(sdkCoreMessages).has(key))).toEqual([]);
    expect(own.filter((key) => keys(uiMessages).has(key))).toEqual([]);
    expect(own).toHaveLength(new Set(own).size);
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

  it("keeps errors and warnings in the server-safe catalogue, and interface text out of it", () => {
    for (const key of keys(pdfEditorText)) {
      expect(key.startsWith("errors.") || key.startsWith("warnings."), key).toBe(false);
    }
  });

  it("holds every text of the three catalogues, and is valid", () => {
    expect(keys(pdfEditorMessages)).toEqual(
      new Set([...keys(pdfMessages), ...keys(uiMessages), ...keys(pdfEditorText)]),
    );
    expect(() => createMessages(pdfEditorMessages)).not.toThrow();
  });
});
