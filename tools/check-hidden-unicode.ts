import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Characters that are invisible in an editor or a diff, or that reorder the
 * text around them, so a reviewer can't see what a line really holds: the
 * bidirectional formatting characters behind "Trojan Source", and zero-width
 * characters. Source writes them as escapes, such as `\u202E`.
 */
export const HIDDEN = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/u;

/** Paths that may hold such characters on purpose. Fixtures are test data. */
const ALLOWED = [/^test\/fixtures\//u];

/** Files that aren't text. */
const BINARY = /\.(?:png|jpe?g|gif|webp|ico|pdf|wasm|woff2?|zip)$/iu;

/** A hidden character found in a file. */
export interface HiddenCharacter {
  readonly line: number;
  readonly column: number;
  /** As `U+202E`. */
  readonly codePoint: string;
}

/** Finds every hidden character in a text, with 1-based lines and columns. */
export function findHiddenCharacters(text: string): HiddenCharacter[] {
  const found: HiddenCharacter[] = [];
  text.split("\n").forEach((line, index) => {
    let column = 0;
    for (const character of line) {
      column += 1;
      if (HIDDEN.test(character)) {
        const hex = (character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0");
        found.push({ line: index + 1, column, codePoint: `U+${hex}` });
      }
    }
  });
  return found;
}

/** Checks every file git tracks, and returns one message per character found. */
export function checkRepository(root: string): string[] {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(
      (path) => path !== "" && !BINARY.test(path) && !ALLOWED.some((rule) => rule.test(path)),
    );
  return files.flatMap((path) =>
    findHiddenCharacters(readFileSync(`${root}/${path}`, "utf8")).map(
      ({ line, column, codePoint }) =>
        `${path}:${line}:${column}: hidden character ${codePoint}; write it as an escape, such as \\u202E`,
    ),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkRepository(fileURLToPath(new URL("..", import.meta.url)));
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  process.exitCode = problems.length > 0 ? 1 : 0;
}
