import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Copies the package's `dist/assets/` to `/pdf-sdk/` in the build, as a
 * host self-hosting the SDK's workers and data does (the README's "Assets
 * and Content Security Policy").
 */
function selfHostPdfSdk(): Plugin {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve("@hussmartinez/pdf-sdk/package.json"));
  let outDir = "dist";
  return {
    name: "self-host-pdf-sdk",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      cpSync(join(root, "dist/assets"), join(outDir, "pdf-sdk"), { recursive: true });
    },
  };
}

// Otherwise a plain Vite setup: the package must work in one (ADR 0007 in sdk-core).
export default defineConfig({
  plugins: [selfHostPdfSdk()],
  build: {
    target: "es2022",
    rollupOptions: { input: { index: "index.html", "self-hosted": "self-hosted.html" } },
  },
});
