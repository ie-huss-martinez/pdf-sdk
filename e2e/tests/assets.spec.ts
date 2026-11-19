import { PDFDocument } from "@cantoo/pdf-lib";
import { expect, test } from "@playwright/test";
import { jpxPdf, pagesPdf, reportPdf } from "../../test/fixtures/pdfs.js";
import { expectAnnounced, expectJpxColours, openPdf, watch } from "./helpers.js";

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

    test("download an edited document with the toolbar, within the README's policy", async ({
      page,
    }) => {
      const problems = watch(page, origin);
      await page.goto(`${origin}${mode.path}`);
      // No spaces in the name: WebKit saves "a b.pdf" as "a_b.pdf", its own
      // choice. The editor's exact name is checked in the browser tests.
      await openPdf(page, await reportPdf(), "quarterly-report.pdf");
      // An edit, so the processing worker builds the download (docs/adr/0009).
      await page.getByRole("button", { name: "Rotate right" }).click();
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download" }).click();
      const saved = await download;
      expect(saved.suggestedFilename()).toBe("quarterly-report.pdf");
      const stream = await saved.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      expect(Buffer.concat(chunks).subarray(0, 5).toString("latin1")).toBe("%PDF-");
      await expectAnnounced(page, "Saved quarterly-report.pdf.");

      expect(await page.evaluate(() => window.pdfSdk.violations)).toEqual([]);
      expect(problems.errors).toEqual([]);
      expect(problems.foreignRequests).toEqual([]);
    });

    test("merge a second PDF with the insert tool, and download the result", async ({ page }) => {
      const problems = watch(page, origin);
      await page.goto(`${origin}${mode.path}`);
      await openPdf(page, await reportPdf(), "report.pdf");
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Insert pages" }).click();
      await (await chooser).setFiles({
        name: "appendix.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(await pagesPdf([{ width: 300, height: 400 }])),
      });
      await expect(page.getByRole("listbox", { name: "Pages" }).getByRole("option")).toHaveCount(3);
      await expectAnnounced(page, "Inserted 1 page after page 1.");

      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download" }).click();
      const stream = await (await download).createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      const merged = await PDFDocument.load(Buffer.concat(chunks));
      // The appendix's page sits between the report's two.
      expect(merged.getPages().map((each) => Math.round(each.getWidth()))).toEqual([612, 300, 842]);

      expect(await page.evaluate(() => window.pdfSdk.violations)).toEqual([]);
      expect(problems.errors).toEqual([]);
      expect(problems.foreignRequests).toEqual([]);
    });
  });
}
