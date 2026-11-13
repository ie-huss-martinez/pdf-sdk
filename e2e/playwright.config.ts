import { defineConfig, devices } from "@playwright/test";

const ci = Boolean(process.env["CI"]);

/**
 * End-to-end tests against production builds of the examples (ADR 0039 in
 * sdk-core): the Next.js App Router application renders the editor on the
 * server and hydrates it, and the Vite pages run both asset modes under the
 * README's Content Security Policies. Chromium locally, all three engines
 * in CI, as for the other browser tests.
 */
export default defineConfig({
  testDir: "tests",
  forbidOnly: ci,
  retries: 0,
  reporter: ci ? "line" : "list",
  use: { trace: "retain-on-failure" },
  projects: (
    [
      ["chromium", "Desktop Chrome"],
      ["firefox", "Desktop Firefox"],
      ["webkit", "Desktop Safari"],
    ] as const
  )
    .filter(([name]) => ci || name === "chromium")
    .map(([name, device]) => ({ name, use: { ...devices[device] } })),
  // Started with Node directly, so the suite also runs where pnpm isn't
  // installed, such as a pinned browser image.
  webServer: [
    {
      command: "node node_modules/next/dist/bin/next start --port 4321",
      cwd: "../examples/next",
      env: { NEXT_TELEMETRY_DISABLED: "1" },
      url: "http://localhost:4321",
      reuseExistingServer: !ci,
      timeout: 60_000,
    },
    {
      command: "node node_modules/vite/bin/vite.js preview --port 4320 --strictPort",
      cwd: "../examples/vite",
      url: "http://localhost:4320",
      reuseExistingServer: !ci,
      timeout: 60_000,
    },
  ],
});
