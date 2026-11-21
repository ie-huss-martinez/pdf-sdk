import { MAX_FILE_NAME_LENGTH } from "@hussmartinez/sdk-core";
import { describe, expect, it } from "vitest";
import { DEFAULT_DOWNLOAD_NAME, downloadFileName } from "./download-name.js";

describe("downloadFileName (docs/adr/0009)", () => {
  it.each([
    ["report.pdf", "report.pdf"],
    ["Report.PDF", "Report.PDF"],
    ["Q3 summary", "Q3 summary.pdf"],
    ["scan.jpeg", "scan.jpeg.pdf"],
    ["../../secret/notes", "notes.pdf"],
    ["C:\\docs\\plan.pdf", "plan.pdf"],
    ["in\u202Evoice", "invoice.pdf"],
    ['a<b>:"c"|?*', "abc.pdf"],
    // An unpaired surrogate isn't well-formed Unicode: sdk-core's cleanFileName drops it.
    ["re\uD800port", "report.pdf"],
  ])("names %j as %j", (name, expected) => {
    expect(downloadFileName(name)).toBe(expected);
  });

  it.each([[undefined], [""], ["   "], ["..."], ["/"], ["\uDC00"], [42], [null]])(
    "falls back to document.pdf for %j",
    (name) => {
      expect(downloadFileName(name)).toBe(DEFAULT_DOWNLOAD_NAME);
    },
  );

  it("keeps a long name within the limit, extension included", () => {
    const name = downloadFileName("a".repeat(MAX_FILE_NAME_LENGTH));
    expect(Array.from(name)).toHaveLength(MAX_FILE_NAME_LENGTH);
    expect(name.endsWith(".pdf")).toBe(true);
    expect(downloadFileName(`${"😀".repeat(MAX_FILE_NAME_LENGTH)}`)).toBe(
      `${"😀".repeat(MAX_FILE_NAME_LENGTH - 4)}.pdf`,
    );
  });
});
