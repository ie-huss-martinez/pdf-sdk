import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkRepository, findHiddenCharacters, HIDDEN } from "../tools/check-hidden-unicode.js";

describe("the hidden Unicode check", () => {
  it("finds each bidirectional formatting and zero-width character, with its place", () => {
    for (const codePoint of [
      0x061c, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
      0x2060, 0x2064, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff,
    ]) {
      const text = `first line\nconst a = "x${String.fromCodePoint(codePoint)}y";`;
      const hex = codePoint.toString(16).toUpperCase().padStart(4, "0");
      expect(findHiddenCharacters(text)).toEqual([{ line: 2, column: 13, codePoint: `U+${hex}` }]);
    }
  });

  it("counts columns in code points, and accepts escapes and visible Unicode", () => {
    expect(findHiddenCharacters(`"😀${String.fromCodePoint(0x202e)}"`)).toEqual([
      { line: 1, column: 3, codePoint: "U+202E" },
    ]);
    expect(
      findHiddenCharacters('const bidi = /[\\u202A-\\u202E]/u; // "résumé", 文書, 😀'),
    ).toEqual([]);
    expect(HIDDEN.test(" ")).toBe(false);
  });

  it("passes on this repository", () => {
    expect(() =>
      execFileSync(process.execPath, ["tools/check-hidden-unicode.ts"], { stdio: "pipe" }),
    ).not.toThrow();
  });

  it("reports a tracked file with a hidden character, but not fixtures or untracked files", () => {
    const root = mkdtempSync(join(tmpdir(), "hm-hidden-"));
    try {
      const hidden = String.fromCodePoint(0x202e);
      mkdirSync(join(root, "src"));
      mkdirSync(join(root, "test/fixtures"), { recursive: true });
      writeFileSync(join(root, "src/name.ts"), `export const name = "in${hidden}voice";\n`);
      writeFileSync(join(root, "test/fixtures/names.ts"), `export const name = "${hidden}";\n`);
      writeFileSync(join(root, "src/clean.ts"), "export const clean = 1;\n");
      execFileSync("git", ["init", "-q"], { cwd: root });
      execFileSync("git", ["add", "src/name.ts", "src/clean.ts", "test/fixtures/names.ts"], {
        cwd: root,
      });
      writeFileSync(join(root, "untracked.ts"), hidden);
      expect(checkRepository(root)).toEqual([
        "src/name.ts:1:24: hidden character U+202E; write it as an escape, such as \\u202E",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
