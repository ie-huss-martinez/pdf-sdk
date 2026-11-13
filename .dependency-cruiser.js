import preset from "@hussmartinez/sdk-config/dependency-cruiser";

/**
 * The PDF engines are bundled into the package from exactly pinned
 * devDependencies, rather than installed by applications (docs/adr/0001).
 * Only the adapters and workers that wrap them may import them; everywhere
 * else in src/, the preset's rule against devDependencies applies as is.
 */
const BUNDLED_ENGINES = ["pdfjs-dist", "pdfstudio", "@cantoo/pdf-lib"];
const ENGINE_LAYERS = "(?:^|/)src/(?:adapters|workers)/";
const engines = `(?:^|/)node_modules/(?:${BUNDLED_ENGINES.join("|")})/`;

const forbidden = preset.forbidden.flatMap((rule) => {
  if (rule.name !== "not-to-dev-dep") return [rule];
  return [
    { ...rule, from: { ...rule.from, pathNot: [rule.from.pathNot, ENGINE_LAYERS].flat() } },
    {
      ...rule,
      name: "not-to-dev-dep-except-bundled-engines",
      comment:
        "Adapters and workers may import only the bundled engines from devDependencies (docs/adr/0001).",
      from: { ...rule.from, path: ENGINE_LAYERS },
      to: { ...rule.to, pathNot: [rule.to.pathNot, engines].flat().filter(Boolean) },
    },
  ];
});

/**
 * pdf.js's data files and qpdf's WebAssembly are virtual modules that Vite
 * plugins generate (tools/), so dependency-cruiser can't resolve them.
 */
const VIRTUAL_MODULES = "^virtual:hm-(?:pdfjs-data|qpdf-wasm|qpdf-wasm-sha256)$";
/**
 * A package's stylesheet as a URL, through Vite's `?url` suffix, such as the
 * browser tests' `@hussmartinez/ui/styles.css?url`: dependency-cruiser can't
 * resolve a query through a package's exports, but Vite does, and fails the
 * test run if the file is missing. Only stylesheets, and only as URLs.
 */
const STYLESHEET_URLS = "^@hussmartinez/[a-z-]+/styles\\.css\\?url$";
const resolvable = forbidden.map((rule) =>
  rule.name === "not-to-unresolvable"
    ? {
        ...rule,
        to: {
          ...rule.to,
          pathNot: [rule.to.pathNot, VIRTUAL_MODULES, STYLESHEET_URLS].flat().filter(Boolean),
        },
      }
    : rule,
);

export default { ...preset, forbidden: resolvable };
