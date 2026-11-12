// The render worker (ADR 0002): pdf.js's own worker, which answers pdf.js's
// protocol as soon as it loads. The build inlines this file as a blob, and
// the package also ships it for self-hosting.
import "pdfjs-dist/build/pdf.worker.min.mjs";
