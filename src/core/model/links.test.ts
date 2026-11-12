import { describe, expect, it } from "vitest";
import { safeLinkUrl } from "./links.js";

describe("safeLinkUrl", () => {
  it.each([
    ["https://example.com/a?b=c#d", "https://example.com/a?b=c#d"],
    ["HTTP://EXAMPLE.ORG", "http://example.org/"],
    ["mailto:team@example.com", "mailto:team@example.com"],
  ])("keeps %s", (url, expected) => {
    expect(safeLinkUrl(url)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com/file",
    "tel:+15551234567",
    "blob:https://example.com/id",
    "relative/path.html",
    "//example.com/protocol-relative",
    "",
    `https://example.com/${"a".repeat(2100)}`,
  ])("refuses %s", (url) => {
    expect(safeLinkUrl(url)).toBeUndefined();
  });
});
