import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build, type Rolldown } from "vite";
import { afterAll, describe, expect, it } from "vitest";
import { PDFJS_DATA } from "./tools/pdfjs-data-plugin.js";
import { QPDF_WASM_SHA256 } from "./tools/qpdf-wasm-plugin.js";
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
      expect.arrayContaining([
        expect.stringMatching(/^lazy\/render-worker-/),
        expect.stringMatching(/^lazy\/processing-worker-/),
      ]),
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
        expect.stringMatching(/^lazy\/render-worker-/),
        expect.stringMatching(/^lazy\/processing-worker-/),
      ]),
    );
  });

  it("ship no worker source maps", () => {
    expect(files.filter((file) => /\.worker-[\w-]+\.js\.map$/.test(file.fileName))).toEqual([]);
    const worker = chunk(
      files.find((file) => /^lazy\/render-worker-[\w-]+\.js$/.test(file.fileName))?.fileName ?? "",
    );
    expect(worker.code).not.toMatch(/sourceMappingURL=pdfjs/);
  });
});

describe("the pdf.js assets (docs/adr/0002, docs/adr/0006)", () => {
  const pdfJs = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
  const shipped = files
    .filter((file) => file.fileName.startsWith("assets/pdfjs/"))
    .map((file) => file.fileName.slice("assets/pdfjs/".length));

  it("ship a self-hosted copy in pdf.js's own layout", () => {
    expect(shipped).toEqual(
      expect.arrayContaining([
        "build/pdf.worker.min.mjs",
        "cmaps/UniJIS-UCS2-H.bcmap",
        "cmaps/LICENSE",
        "standard_fonts/FoxitSerif.pfb",
        "standard_fonts/LICENSE_FOXIT",
        "wasm/jbig2.wasm",
        "wasm/openjpeg.wasm",
        "wasm/qcms_bg.wasm",
        "iccs/CGATS001Compat-v2-micro.icc",
      ]),
    );
    expect(
      shipped.filter((name) => name.startsWith("cmaps/") && name.endsWith(".bcmap")),
    ).toHaveLength(
      readdirSync(join(pdfJs, "cmaps")).filter((name) => name.endsWith(".bcmap")).length,
    );
  });

  it("ship the worker exactly as pdf.js built it", async () => {
    const worker = files.find((file) => file.fileName === "assets/pdfjs/build/pdf.worker.min.mjs");
    const expected = await readFile(join(pdfJs, "build/pdf.worker.min.mjs"));
    expect(worker?.type === "asset" && Buffer.from(worker.source).equals(expected)).toBe(true);
  });

  it("leave out GPL fonts, JavaScript decoder fallbacks and the scripting sandbox", () => {
    for (const name of shipped) {
      expect(name).not.toMatch(/Liberation|nowasm_fallback|quickjs|sandbox/);
    }
  });

  it("inline each data file in its own lazy chunk, never loaded by an entry", () => {
    const expected = Object.values(PDFJS_DATA).flatMap(({ directory, files: pattern }) =>
      readdirSync(join(pdfJs, directory)).filter((name) => pattern.test(name)),
    );
    const data = files.filter(
      (file) =>
        file.type === "chunk" && /^lazy\/.+\.(?:bcmap|pfb|wasm)-[\w-]+\.js$/.test(file.fileName),
    );
    expect(data.map((file) => file.fileName.replace(/^lazy\/|-[\w-]+\.js$/g, "")).sort()).toEqual(
      expected.sort(),
    );
    for (const entry of ["index.js", "react.js", "element.js"]) {
      for (const imported of chunk(entry).imports) {
        expect(imported, entry).not.toMatch(/^lazy\//);
      }
    }
  });
});

describe("the processing worker (docs/adr/0001, docs/adr/0002)", () => {
  const workers = files.filter(
    (file): file is Rolldown.OutputChunk =>
      file.type === "chunk" && /^lazy\/(?:render|processing)-worker-/.test(file.fileName),
  );
  const processing = workers.find((file) => file.code.includes("hm-pdf-no-network:/qpdf.wasm"));

  it("inlines qpdf.wasm once, and only the reviewed binary", () => {
    expect(processing, "the processing worker chunk").toBeDefined();
    const blobs = [...(processing?.code ?? "").matchAll(/[A-Za-z0-9+/=]{1000000,}/g)];
    expect(blobs).toHaveLength(1);
    const bytes = Buffer.from(blobs[0]?.[0] ?? "", "base64");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(QPDF_WASM_SHA256);
  });

  it("leaves no other way to load qpdf.wasm in any chunk", () => {
    for (const file of files.filter((file) => file.type === "chunk")) {
      expect(file.code, file.fileName).not.toContain("data:application/wasm");
      expect(file.code, file.fileName).not.toMatch(/new URL\(\\?["']\.?\/?(?:wasm\/)?qpdf\.wasm/);
    }
    // The only file is the self-hosted copy, which the worker checks.
    expect(
      files.filter((file) => file.fileName.endsWith("qpdf.wasm")).map((file) => file.fileName),
    ).toEqual(["assets/processing/qpdf.wasm"]);
  });

  it("ships a self-hosted copy that fetches qpdf.wasm and checks it (docs/adr/0007)", () => {
    const worker = files.find((file) => file.fileName === "assets/processing/processing.worker.js");
    const wasm = files.find((file) => file.fileName === "assets/processing/qpdf.wasm");
    expect(worker?.type).toBe("asset");
    expect(wasm?.type).toBe("asset");
    const code = String(worker?.type === "asset" ? worker.source : "");
    expect(code).toContain(QPDF_WASM_SHA256);
    expect(code).not.toMatch(/[A-Za-z0-9+/=]{100000,}/);
    expect(code).not.toMatch(CODE_GENERATION);
    expect(code.split("\n").length).toBeLessThan(100);
    const bytes = wasm?.type === "asset" ? Buffer.from(wasm.source) : Buffer.alloc(0);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(QPDF_WASM_SHA256);
  });

  it("is minified, like every inlined worker, because applications can't minify it", () => {
    for (const worker of workers) {
      // Unminified Rolldown output indents with tabs; a minified worker has
      // only the few lines of the blob wrapper around one long line.
      expect(worker.code.split("\n").length, worker.fileName).toBeLessThan(100);
    }
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
