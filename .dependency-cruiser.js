import preset from "@hussmartinez/sdk-config/dependency-cruiser";

/**
 * The PDF engines are bundled into the package from exactly pinned
 * devDependencies, rather than installed by applications (docs/adr/0001).
 * Only the adapters and workers that wrap them may import them; everywhere
 * else in src/, the preset's rule against devDependencies applies as is.
 */
const BUNDLED_ENGINES = ["pdfjs-dist"];
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

export default { ...preset, forbidden };
