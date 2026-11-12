import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * The browser test image (ADR 0025) and the job that runs in it. CI's verify
 * job reads the image from ci/Dockerfile through ci-image.yml, so the image
 * has one copy, which Dependabot updates. The release workflow's verify job
 * joins these checks when release.yml is added (ADR 0023).
 */
const read = (path: string): Promise<string> =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

interface Step {
  name?: string;
  uses?: string;
  run?: string;
}

interface Job {
  name?: string;
  uses?: string;
  needs?: string | string[];
  if?: string;
  permissions?: Record<string, string>;
  container?: { image?: string; options?: string };
  steps?: Step[];
}

async function job(workflow: string, name: string): Promise<Job> {
  const found = (
    parse(await read(`.github/workflows/${workflow}`)) as { jobs?: Record<string, Job> }
  ).jobs?.[name];
  if (!found) {
    throw new Error(`${workflow} has no ${name} job`);
  }
  return found;
}

/** The image ci/Dockerfile pins. */
async function pinnedImage(): Promise<string> {
  const image = /^FROM (\S+)$/m.exec(await read("ci/Dockerfile"))?.[1];
  if (!image) {
    throw new Error("ci/Dockerfile has no FROM line");
  }
  return image;
}

// A GitHub Actions expression, not a JavaScript placeholder. The fallback is
// pinned to an all-zero digest, which can't be pulled.
const FROM_THE_IMAGE_JOB = `\${{ needs.image.outputs.ref || 'the-image-job-failed@sha256:${"0".repeat(64)}' }}`;

describe("the browser test image", () => {
  it("is Microsoft's Playwright image, pinned by tag and digest", async () => {
    expect(await pinnedImage()).toMatch(
      /^mcr\.microsoft\.com\/playwright:v\d+\.\d+\.\d+-noble@sha256:[0-9a-f]{64}$/,
    );
  });

  it("has the Playwright version the lockfile installs", async () => {
    const tag = /playwright:v(\d+\.\d+\.\d+)-/.exec(await pinnedImage())?.[1];
    const require = createRequire(new URL("../package.json", import.meta.url));
    const installed = (require("playwright/package.json") as { version: string }).version;
    expect(tag, "update ci/Dockerfile's tag and digest together with playwright").toBe(installed);
  });

  it.each(["verify.yml", "ci-image.yml"])("has no copy in %s", async (workflow) => {
    expect(
      await read(`.github/workflows/${workflow}`),
      "the image belongs in ci/Dockerfile only",
    ).not.toContain("mcr.microsoft.com/playwright:v");
  });

  it("is where verify.yml's verify job takes its image from, and a failed image job fails it", async () => {
    const image = await job("verify.yml", "image");
    expect(image.uses).toBe("./.github/workflows/ci-image.yml");
    expect(image.permissions).toEqual({ contents: "read" });

    const verify = await job("verify.yml", "verify");
    expect(verify.container).toEqual({
      image: FROM_THE_IMAGE_JOB,
      options: "--user 1001 --ipc=host --init",
    });
    expect([verify.needs].flat()).toContain("image");
    // Without !cancelled(), a failed image job would skip verify, and a
    // skipped required check counts as passing.
    expect(verify.if).toMatch(/^\$\{\{ !cancelled\(\)/);
  });

  it("is read from ci/Dockerfile with read-only permissions", async () => {
    const workflow = parse(await read(".github/workflows/ci-image.yml")) as {
      on: Record<string, unknown>;
      permissions: Record<string, string>;
    };
    expect(Object.keys(workflow.on)).toEqual(["workflow_call"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
  });
});

describe("ci-image.yml's check of ci/Dockerfile", () => {
  /** Runs the "Read the image" step's script against a Dockerfile, as the workflow does. */
  async function readImage(dockerfile: string): Promise<{ status: number | null; output: string }> {
    const { steps = [] } = await job("ci-image.yml", "read");
    const script = steps.find((step) => step.name === "Read the image")?.run;
    if (!script) {
      throw new Error('ci-image.yml has no "Read the image" step');
    }
    const directory = await mkdtemp(join(tmpdir(), "hm-pdf-ci-image-"));
    try {
      await mkdir(join(directory, "ci"));
      await writeFile(join(directory, "ci", "Dockerfile"), dockerfile);
      const output = join(directory, "output");
      await writeFile(output, "");
      const run = spawnSync("bash", ["-e", "-c", script], {
        cwd: directory,
        env: { ...process.env, GITHUB_OUTPUT: output },
        encoding: "utf8",
      });
      return { status: run.status, output: await readFile(output, "utf8") };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  const digest = "a".repeat(64);
  const valid = `mcr.microsoft.com/playwright:v1.65.0-noble@sha256:${digest}`;

  it("outputs the repository's image", async () => {
    await expect(readImage(await read("ci/Dockerfile"))).resolves.toEqual({
      status: 0,
      output: `ref=${await pinnedImage()}\n`,
    });
  });

  it("accepts exactly one pinned Playwright FROM line", async () => {
    await expect(readImage(`# comment\nFROM ${valid}\nRUN true\n`)).resolves.toEqual({
      status: 0,
      output: `ref=${valid}\n`,
    });
  });

  it.each([
    ["no FROM line", "RUN true\n"],
    ["two FROM lines", `FROM ${valid}\nFROM node\n`],
    ["a tag without a digest", "FROM mcr.microsoft.com/playwright:v1.65.0-noble\n"],
    ["a digest without a tag", `FROM mcr.microsoft.com/playwright@sha256:${digest}\n`],
    ["another registry", `FROM evil.example/playwright:v1.65.0-noble@sha256:${digest}\n`],
    ["another base", `FROM mcr.microsoft.com/playwright:v1.65.0-jammy@sha256:${digest}\n`],
    ["a short digest", "FROM mcr.microsoft.com/playwright:v1.65.0-noble@sha256:abc\n"],
    ["trailing text", `FROM ${valid} AS base\n`],
  ])("rejects %s", async (_name, dockerfile) => {
    await expect(readImage(dockerfile)).resolves.toEqual({ status: 1, output: "" });
  });
});
