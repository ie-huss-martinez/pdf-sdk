import { describe, expect, it } from "vitest";
import { linkDestination, safeLinkUrl } from "./links.js";

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

  it.each([
    "https://bank.example@evil.example/",
    "https://bank.example:pin@evil.example/login",
    "http://user@example.com/",
    "https://:secret@example.com/",
    "mailto://user:pass@example.com",
  ])("refuses %s, which carries credentials", (url) => {
    expect(safeLinkUrl(url)).toBeUndefined();
  });
});

describe("linkDestination", () => {
  it.each([
    ["https://www.example.com/a/b?c=d", "example.com"],
    ["https://docs.example.org:8443/x", "docs.example.org"],
    ["http://xn--bcher-kva.example/", "xn--bcher-kva.example"],
    ["mailto:team@example.com?subject=Hi", "team@example.com"],
  ])("shows %s as %s", (url, expected) => {
    expect(linkDestination(url)).toBe(expected);
  });

  it("has nothing to show for a refused URL", () => {
    expect(linkDestination("javascript:alert(1)")).toBeUndefined();
    expect(linkDestination("https://bank.example@evil.example/")).toBeUndefined();
  });
});
