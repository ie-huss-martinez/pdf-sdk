import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build, type Rolldown } from "vite";
import { afterAll, describe, expect, it } from "vitest";
import { externalPackages } from "./vite.config.js";

/**
 * Builds the package in memory with its real Vite config, so these checks see
 * exactly what dist/ would contain without writing to it.
 */
async function buildInMemory(): Promise<Array<Rolldown.OutputChunk | Rolldown.OutputAsset>> {
  const result = await build({
    configFile: new URL("vite.config.ts", import.meta.url).pathname,
    logLevel: "silent",
    build: { write: false },
  });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.flatMap((output) => ("output" in output ? output.output : []));
}

const files = await buildInMemory();

function chunk(fileName: string): Rolldown.OutputChunk {
  const found = files.find((file) => file.fileName === fileName);
  if (found?.type !== "chunk") {
    throw new Error(`${fileName} wasn't built as a JavaScript chunk`);
  }
  return found;
}

describe("the built package", () => {
  it('starts the React entry with "use client" (ADR 0007)', () => {
    expect(chunk("react.js").code).toMatch(/^"use client";\n/);
  });

  it('keeps "use client" out of the core and element entries (ADR 0004)', () => {
    expect(chunk("index.js").code).not.toContain("use client");
    expect(chunk("element.js").code).not.toContain("use client");
  });

  it("emits the stylesheet as its own file", () => {
    const styles = files.find((file) => file.fileName === "styles.css");
    expect(styles?.type).toBe("asset");
  });

  it("imports sdk-core and React instead of bundling them", () => {
    expect(externalPackages).toEqual(
      expect.arrayContaining(["@hussmartinez/sdk-core", "react", "react-dom"]),
    );
    expect(chunk("index.js").code).toContain('from "@hussmartinez/sdk-core"');
    for (const file of files) {
      if (file.type === "chunk") {
        // Bundled React or sdk-core would bring their own copies of these, and
        // a page with several SDKs would load sdk-core more than once.
        expect(file.code, file.fileName).not.toContain("react.transitional.element");
        expect(file.code, file.fileName).not.toContain("class SdkError");
      }
    }
  });

  it("uses the production JSX runtime and leaks no local paths", () => {
    const code = files.flatMap((file) => (file.type === "chunk" ? [file.code] : [])).join("\n");
    expect(code).not.toContain("jsx-dev-runtime");
    expect(code).not.toContain(process.cwd());
  });

  it("never imports CSS from JavaScript (ADR 0004)", () => {
    const javascript = files.filter((file) => file.type === "chunk");
    expect(javascript.length).toBeGreaterThan(0);
    for (const file of javascript) {
      expect(file.imports.filter((name) => name.endsWith(".css"))).toEqual([]);
      expect(file.code).not.toMatch(/import\s*["'][^"']+\.css["']/);
    }
  });
});

/**
 * Code generation from strings: `eval(…)`, `new Function(…)` and
 * `Function(…)`, as whole words, so `evaluate(` or `new FunctionBasedShading(`
 * don't match.
 */
const CODE_GENERATION = /(?<![\w$.])eval\s*\(|(?<![\w$.])(?:new\s+)?Function\s*\(/;

describe("the bundled PDF engines (docs/adr/0001)", () => {
  it("recognises code generation, and nothing that merely looks like it", () => {
    for (const code of ['eval("1")', 'new Function("a", "return a")', "x = Function ('y')"]) {
      expect(code).toMatch(CODE_GENERATION);
    }
    for (const code of [
      "evaluate(x)",
      "new FunctionBasedShading(x)",
      "a.eval(x)",
      "isFunction(x)",
    ]) {
      expect(code).not.toMatch(CODE_GENERATION);
    }
  });

  it("generate no code from strings, in any chunk, including the inlined worker", () => {
    const javascript = files.filter((file) => file.type === "chunk");
    expect(javascript.map((file) => file.fileName)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^lazy\/inline-worker-/)]),
    );
    for (const file of javascript) {
      expect(file.code, file.fileName).not.toMatch(CODE_GENERATION);
    }
  });

  it("load only with import(), never with the entries", () => {
    for (const entry of ["index.js", "react.js", "element.js"]) {
      for (const imported of chunk(entry).imports) {
        expect(imported, entry).not.toMatch(/^lazy\//);
      }
    }
    expect(chunk("index.js").dynamicImports).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^lazy\/runtime-/),
        expect.stringMatching(/^lazy\/inline-worker-/),
      ]),
    );
  });

  it("ship no worker source maps", () => {
    expect(files.filter((file) => /\.worker-[\w-]+\.js\.map$/.test(file.fileName))).toEqual([]);
    const worker = chunk(
      files.find((file) => /^lazy\/inline-worker-[\w-]+\.js$/.test(file.fileName))?.fileName ?? "",
    );
    expect(worker.code).not.toMatch(/sourceMappingURL=pdfjs/);
  });
});

/**
 * Builds the package to a temporary folder inside the repository, so the
 * built files resolve their external imports from its node_modules, as they
 * would in an application.
 */
const temporaryBuild = (async () => {
  const parent = join(process.cwd(), "temp");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "build-test-"));
  await build({
    configFile: new URL("vite.config.ts", import.meta.url).pathname,
    logLevel: "silent",
    build: { outDir: directory, emptyOutDir: true },
  });
  return directory;
})();

afterAll(async () => {
  await rm(await temporaryBuild, { recursive: true, force: true });
});

describe("importing on a server", () => {
  // The unit project runs in Node, without a DOM, as a server would.
  it.each(["index.js", "element.js"])(
    "imports %s without touching browser APIs (ADR 0004, ADR 0007)",
    async (entry) => {
      expect(globalThis).not.toHaveProperty("window");
      expect(globalThis).not.toHaveProperty("customElements");
      const url = pathToFileURL(join(await temporaryBuild, entry)).href;
      await expect(import(url)).resolves.toBeTypeOf("object");
    },
  );
});
