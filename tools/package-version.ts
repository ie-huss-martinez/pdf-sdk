import { readFileSync } from "node:fs";

/**
 * The package's version, which the processing worker announces and the
 * page checks, so a self-hosted worker left over from before an upgrade is
 * refused (sdk-core ADR 0038).
 */
export const PACKAGE_VERSION = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

/** The `define` that puts a version into the page's code and the workers'. */
export function versionDefine(version = PACKAGE_VERSION): Record<string, string> {
  return { __PDF_SDK_VERSION__: JSON.stringify(version) };
}
