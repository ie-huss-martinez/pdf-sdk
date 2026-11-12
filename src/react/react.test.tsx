import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PdfEditor } from "./editor/PdfEditor.js";
import { usePdfDocument, usePdfSession } from "./hooks.js";
import { PdfSessionProvider } from "./PdfSessionProvider.js";
import { PdfViewer } from "./viewer/PdfViewer.js";

function Orphan() {
  usePdfSession();
  return null;
}

function OrphanDocument() {
  usePdfDocument();
  return null;
}

describe("the React layer on a server (ADR 0007)", () => {
  it("renders the provider with its default engine and processor, and the viewer", () => {
    expect(globalThis).not.toHaveProperty("window");
    const html = renderToString(
      <PdfSessionProvider>
        <PdfViewer />
      </PdfSessionProvider>,
    );
    expect(html).toContain('aria-label="Document"');
    expect(html).toContain("No document is open.");
  });

  it("renders the editor's start state, with its default engine and processor", () => {
    const html = renderToString(<PdfEditor />);
    expect(html).toContain('aria-label="PDF editor"');
    expect(html).toContain('data-hm-status="empty"');
    expect(html).toContain("Choose a PDF");
  });

  it("uses the locale and message overrides", () => {
    const html = renderToString(
      <PdfSessionProvider locale="de" messages={{ "viewer.empty": "Kein Dokument geöffnet." }}>
        <PdfViewer />
      </PdfSessionProvider>,
    );
    expect(html).toContain("Kein Dokument geöffnet.");
  });

  it("says plainly when a hook is used outside a provider", () => {
    expect(() => renderToString(<Orphan />)).toThrow(
      /usePdfSession must be used inside a PdfSessionProvider/,
    );
    expect(() => renderToString(<OrphanDocument />)).toThrow(/usePdfDocument/);
  });
});
