import { PdfEditor, type PdfEditorHandle } from "@hussmartinez/pdf-sdk/react";
import "@hussmartinez/ui/styles.css";
import "@hussmartinez/pdf-sdk/styles.css";
import { createRoot } from "react-dom/client";

declare global {
  interface Window {
    /** For the end-to-end tests: the editor's handle, and any CSP violations. */
    pdfSdk: { editor: PdfEditorHandle | null; violations: string[] };
  }
}

window.pdfSdk = { editor: null, violations: [] };
document.addEventListener("securitypolicyviolation", (event) => {
  window.pdfSdk.violations.push(`${event.effectiveDirective} ${event.blockedURI}`);
});

// The self-hosted page serves the package's dist/assets/ under /pdf-sdk/.
const selfHosted = document.body.dataset["assets"] === "self-hosted";
const assetsUrl = selfHosted ? new URL("/pdf-sdk/", location.href).href : undefined;

// For the screenshot tests: ?save=fail stands for a host whose own saving
// fails, so the editor's save failure can be seen (docs/adr/0009).
const failSave = new URLSearchParams(location.search).get("save") === "fail";
const refuseToSave = async () => {
  throw new Error("This test host refuses to save.");
};

// The host's layout: the editor fills the viewport below the heading. React
// sets these through the DOM, which style-src 'self' allows.
const root = document.getElementById("root") as HTMLElement;
for (const element of [document.documentElement, document.body, root]) {
  element.style.height = "100%";
  element.style.margin = "0";
}

createRoot(root).render(
  <main style={{ height: "100%", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
    <h1 style={{ margin: 0, padding: "0.5rem 1rem", fontSize: "1.25rem" }}>
      {selfHosted ? "Self-hosted assets" : "Inlined assets"}
    </h1>
    <PdfEditor
      {...(assetsUrl ? { assetsUrl } : {})}
      {...(failSave ? { onExport: refuseToSave } : {})}
      ref={(editor) => {
        window.pdfSdk.editor = editor;
      }}
    />
  </main>,
);
