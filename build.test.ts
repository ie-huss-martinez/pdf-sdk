import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { keptCode } from "@hussmartinez/sdk-config/size";
import { build as esbuild } from "esbuild";
import { build, type Rolldown } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

/** An entry's code with every chunk it imports statically, as an application loads it. */
function loaded(entry: string): Rolldown.OutputChunk[] {
  const seen = new Map<string, Rolldown.OutputChunk>();
  const visit = (fileName: string) => {
    // Externals, such as react, are listed as imports but aren't files here.
    if (seen.has(fileName) || !files.some((file) => file.fileName === fileName)) return;
    const found = chunk(fileName);
    seen.set(fileName, found);
    for (const imported of found.imports) visit(imported);
  };
  visit(entry);
  return [...seen.values()];
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
    expect(
      loaded("index.js")
        .map((file) => file.code)
        .join("\n"),
    ).toContain('from "@hussmartinez/sdk-core"');
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
      expect.arrayContaining(["lazy/render-worker.js", "lazy/processing-worker.js"]),
    );
    for (const file of javascript) {
      expect(file.code, file.fileName).not.toMatch(CODE_GENERATION);
    }
  });

  it("load only with import(), never with the entries", () => {
    for (const entry of ["index.js", "react.js", "element.js"]) {
      for (const file of loaded(entry)) {
        for (const imported of file.imports) expect(imported, entry).not.toMatch(/^lazy\//);
      }
    }
    // The inlined workers and data load through package.json's imports, which
    // the host's bundler resolves (sdk-core ADR 0060).
    expect(loaded("index.js").flatMap((file) => file.dynamicImports)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^lazy\/runtime-/),
        "#hm-pdf-render-worker",
        "#hm-pdf-processing-worker",
        "#hm-pdf-inline-data",
      ]),
    );
  });

  it("ship no worker source maps", () => {
    expect(files.filter((file) => /\.worker-[\w-]+\.js\.map$/.test(file.fileName))).toEqual([]);
    const worker = chunk("lazy/render-worker.js");
    expect(worker.code).not.toMatch(/sourceMappingURL=pdfjs/);
  });
});

/**
 * Writes this build into `dir` as an installed package would hold it: its
 * JavaScript under dist/, and a package.json with its exports and imports,
 * so imports such as `#hm-pdf-render-worker` resolve as they do for a host.
 */
async function writePackage(dir: string): Promise<void> {
  for (const file of files) {
    if (file.type !== "chunk") continue;
    await mkdir(dirname(join(dir, "dist", file.fileName)), { recursive: true });
    await writeFile(join(dir, "dist", file.fileName), file.code);
  }
  const manifest = JSON.parse(await readFile(new URL("package.json", import.meta.url), "utf8"));
  const { name, type, exports, imports } = manifest;
  await writeFile(join(dir, "package.json"), JSON.stringify({ name, type, exports, imports }));
}

describe("tree shaking (sdk-core ADR 0056)", () => {
  /**
   * What an application that imports `names` from the React entry keeps of
   * it, bundled by esbuild as sdk-config's import budgets are. Vite's own
   * bundler drops more, but a host's toolchain may not, so the check uses
   * esbuild.
   */
  async function kept(names: string) {
    const dir = await mkdtemp(join(tmpdir(), "hm-pdf-sdk-shake-"));
    try {
      await writePackage(dir);
      return await keptCode(join(dir, "dist/react.js"), names);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("leaves every tool out of an application that imports only the catalogue", async () => {
    // A call in a tool's definition, such as isEnabled: canMove("earlier"),
    // kept every tool in such a bundle: a bundler can't drop a pure call
    // whose arguments might have effects.
    const { calls } = await kept("{ pdfEditorMessages }");
    expect(calls.map(({ call }) => call)).not.toContain("defineTool");
  });
});

describe("the hm-self-hosted condition (sdk-core ADR 0060)", () => {
  /**
   * Bundles an application that passes assetsUrl against this build, laid
   * out as an installed package, with esbuild and `conditions`. Returns the
   * code of every output file.
   */
  async function bundle(conditions: string[]): Promise<string[]> {
    const dir = await mkdtemp(join(tmpdir(), "hm-pdf-sdk-condition-"));
    try {
      await writePackage(join(dir, "node_modules/@hussmartinez/pdf-sdk"));
      await writeFile(
        join(dir, "app.js"),
        [
          'import { createPdfJsEngine, createPdfProcessor } from "@hussmartinez/pdf-sdk";',
          'export const engine = createPdfJsEngine({ assetsUrl: "/pdf-sdk/" });',
          'export const processor = createPdfProcessor({ assetsUrl: "/pdf-sdk/" });',
        ].join("\n"),
      );
      const result = await esbuild({
        absWorkingDir: dir,
        entryPoints: ["app.js"],
        bundle: true,
        format: "esm",
        splitting: true,
        outdir: "out",
        write: false,
        logLevel: "silent",
        conditions,
        external: externalPackages,
      });
      return result.outputFiles.map((output) => output.text);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** An inlined worker: Vite turns it into a blob that revokes its own URL. */
  const inlinedWorker = (code: string) => code.includes("URL.revokeObjectURL(import.meta.url);");
  /** A WebAssembly module as base64: "\0asm" encodes as "AGFzbQ". */
  const inlinedWasm = (code: string) => code.includes("AGFzbQ");

  it("leaves every inlined worker and WebAssembly module out of a build that sets it", async () => {
    const outputs = await bundle(["hm-self-hosted"]);
    expect(outputs.filter(inlinedWorker)).toEqual([]);
    expect(outputs.filter(inlinedWasm)).toEqual([]);
    expect(outputs.join("\n")).toContain("left the PDF SDK's inlined workers out");
  });

  it("keeps them in a build that doesn't, as before", async () => {
    const outputs = await bundle([]);
    expect(outputs.filter(inlinedWorker)).toHaveLength(2);
    expect(outputs.some(inlinedWasm)).toBe(true);
    expect(outputs.join("\n")).not.toContain("left the PDF SDK's inlined workers out");
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

/**
 * The runs of base64 characters at least `minimum` long, found in one pass.
 * A regular expression such as `/[A-Za-z0-9+/=]{1000000,}/` backtracks: it
 * rescans each shorter run from every position in it, which takes seconds
 * on a worker of several megabytes.
 */
function base64Runs(code: string, minimum: number): string[] {
  const runs: string[] = [];
  let start = -1;
  for (let index = 0; index <= code.length; index += 1) {
    const char = code.charCodeAt(index);
    const base64 =
      (char >= 0x30 && char <= 0x39) ||
      (char >= 0x41 && char <= 0x5a) ||
      (char >= 0x61 && char <= 0x7a) ||
      char === 0x2b ||
      char === 0x2f ||
      char === 0x3d;
    if (base64) {
      if (start < 0) start = index;
    } else if (start >= 0) {
      if (index - start >= minimum) runs.push(code.slice(start, index));
      start = -1;
    }
  }
  return runs;
}

describe("the processing worker (docs/adr/0001, docs/adr/0002)", () => {
  const workers = files.filter(
    (file): file is Rolldown.OutputChunk =>
      file.type === "chunk" && /^lazy\/(?:render|processing)-worker\.js$/.test(file.fileName),
  );
  const processing = workers.find((file) => file.code.includes("hm-pdf-no-network:/qpdf.wasm"));

  it("inlines qpdf.wasm once, and only the reviewed binary", () => {
    expect(processing, "the processing worker chunk").toBeDefined();
    const blobs = base64Runs(processing?.code ?? "", 1_000_000);
    expect(blobs).toHaveLength(1);
    const bytes = Buffer.from(blobs[0] ?? "", "base64");
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
    expect(base64Runs(code, 100_000)).toEqual([]);
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
async function temporaryBuild(): Promise<string> {
  const parent = join(process.cwd(), "temp");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "build-test-"));
  await build({
    configFile: new URL("vite.config.ts", import.meta.url).pathname,
    logLevel: "silent",
    build: { outDir: directory, emptyOutDir: true },
  });
  return directory;
}

/**
 * A whole build takes seconds, and longer on a busy machine, so it runs
 * once, before the tests, with a timeout of its own. Inside a test it would
 * count against the test's five seconds, which only cover the import.
 */
const BUILD_TIMEOUT = 120_000;

describe("importing on a server", () => {
  let directory = "";
  beforeAll(async () => {
    directory = await temporaryBuild();
  }, BUILD_TIMEOUT);
  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  // The unit project runs in Node, without a DOM, as a server would.
  it.each(["index.js", "element.js"])(
    "imports %s without touching browser APIs (ADR 0004, ADR 0007)",
    async (entry) => {
      expect(globalThis).not.toHaveProperty("window");
      expect(globalThis).not.toHaveProperty("customElements");
      const url = pathToFileURL(join(directory, entry)).href;
      await expect(import(url)).resolves.toBeTypeOf("object");
    },
  );
});

describe("the format schemas (sdk-core ADR 0045)", () => {
  it("ship with the package, each by its path under ./formats/, and the vectors don't", async () => {
    const manifest = JSON.parse(await readFile(new URL("package.json", import.meta.url), "utf8"));
    expect(manifest.files).toContain("formats");
    expect(manifest.files).not.toContain("conformance");
    expect(manifest.exports["./formats/*"]).toBe("./formats/*");
    // The package resolves itself by name, as a host's import would.
    const require = createRequire(import.meta.url);
    const formats = readdirSync(new URL("formats", import.meta.url));
    expect(formats.sort()).toEqual(["hm-pdf-command", "hm-pdf-plan"]);
    for (const format of formats) {
      const path = require.resolve(`@hussmartinez/pdf-sdk/formats/${format}/v1.schema.json`);
      const schema = JSON.parse(await readFile(path, "utf8"));
      expect(schema.$id).toBe(
        `https://github.com/ie-huss-martinez/pdf-sdk/blob/main/formats/${format}/v1.schema.json`,
      );
    }
  });
});
