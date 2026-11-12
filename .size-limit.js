/**
 * Size budgets per entry point (ADR 0015): the brotli size of each built
 * entry, with the shared chunks it loads. They measure the unminified files in
 * dist, an upper bound: applications ship less, because their bundler
 * minifies and drops what they don't import.
 *
 * These are starting ceilings for what each entry should hold. Worker,
 * WebAssembly and PDF engine code loads lazily, with import(), in its own
 * chunks in dist/lazy, which have budgets of their own below. The feature
 * pull requests revisit these against real sizes.
 */
export default [
  {
    name: "Server-safe core (.), with the shared code it loads",
    path: ["dist/index.js", "dist/shared/*.js"],
    brotli: true,
    limit: "15 kB",
  },
  {
    name: "React entry (./react), with the shared code it loads",
    path: ["dist/react.js", "dist/shared/*.js"],
    brotli: true,
    limit: "40 kB",
  },
  {
    name: "Element entry (./element), with the shared code it loads",
    path: ["dist/element.js", "dist/shared/*.js"],
    brotli: true,
    limit: "40 kB",
  },
  {
    name: "Stylesheet (./styles.css)",
    path: "dist/styles.css",
    brotli: true,
    limit: "10 kB",
  },
  {
    // pdf.js's display layer, loaded on the first open (docs/adr/0001).
    // pdf.js 6.5.438 measures 124 kB; the budget leaves room for patch
    // releases, not for a second engine.
    name: "pdf.js display layer (lazy)",
    path: "dist/lazy/runtime-*.js",
    brotli: true,
    limit: "135 kB",
  },
  {
    // pdf.js's worker, inlined as a string (docs/adr/0002). It measures
    // 336 kB with pdf.js 6.5.438. Self-hosting applications never load it.
    name: "pdf.js worker, inlined (lazy)",
    path: "dist/lazy/inline-worker-*.js",
    brotli: true,
    limit: "360 kB",
  },
];
