import { expect, test } from "@playwright/test";
import { jpxPdf } from "../../test/fixtures/pdfs.js";
import { expectJpxColours, openPdf, watch } from "./helpers.js";

const origin = "http://localhost:4320";

declare global {
  interface Window {
    pdfSdk: {
      editor: {
        session: {
          getSnapshot(): { plan: { pages: readonly { key: string }[] } };
          execute(command: unknown): void;
        };
        export(): Promise<Uint8Array>;
      } | null;
      violations: string[];
    };
  }
}

/**
 * Both asset modes in a built Vite application, each under the Content
 * Security Policy the README gives for it (docs/adr/0002, docs/adr/0006 and
 * docs/adr/0007): a real JPEG 2000 image decodes with OpenJPEG, an edited
 * document exports through the processing worker, nothing breaks the policy
 * and nothing is requested from another origin.
 */
const modes = [
  { name: "inlined assets", path: "/" },
  { name: "self-hosted assets", path: "/self-hosted.html" },
] as const;

for (const mode of modes) {
  test.describe(mode.name, () => {
    test("decode a JPEG 2000 image and export an edit, within the README's policy", async ({
      page,
    }) => {
      const problems = watch(page, origin);
      await page.goto(`${origin}${mode.path}`);
      await openPdf(page, jpxPdf(), "scan.pdf");
      await expectJpxColours(page);

      // An edit makes export run the processing worker, with qpdf.
      const exported = await page.evaluate(async () => {
        const editor = window.pdfSdk.editor;
        if (!editor) throw new Error("No editor");
        const [first] = editor.session.getSnapshot().plan.pages;
        editor.session.execute({ type: "pdf.rotatePages", pages: [first?.key], angle: 90 });
        const bytes = await editor.export();
        return new TextDecoder().decode(bytes.slice(0, 5));
      });
      expect(exported).toBe("%PDF-");

      expect(await page.evaluate(() => window.pdfSdk.violations)).toEqual([]);
      expect(problems.errors).toEqual([]);
      expect(problems.foreignRequests).toEqual([]);
      if (mode.path === "/self-hosted.html") {
        // The workers and the decoder came from the self-hosted directory.
        expect(problems.ownPaths).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/^\/pdf-sdk\/pdfjs\/build\/pdf\.worker\.min\.mjs$/),
            expect.stringMatching(/^\/pdf-sdk\/pdfjs\/wasm\/openjpeg\.wasm$/),
            "/pdf-sdk/processing/processing.worker.js",
            "/pdf-sdk/processing/qpdf.wasm",
          ]),
        );
      } else {
        // Inline mode fetches nothing from the self-hosted directory.
        expect(problems.ownPaths.filter((path) => path.startsWith("/pdf-sdk/"))).toEqual([]);
      }
    });
  });
}
