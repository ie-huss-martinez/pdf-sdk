---
"@hussmartinez/pdf-sdk": minor
---

Plans and edit commands have a portable JSON format, `hm-pdf-plan` and `hm-pdf-command` version 1 (sdk-core ADR 0045), so a project can be saved and opened again, here or by a port of the SDK in another language.

- `toPdfPlanDocument(plan, sources)` writes a plan, with each source's page count, and `readPdfPlanDocument(json)` reads one back as `{ plan, sources }`. Documents hold positions and sizes as whole millionths of the page, and no PDF bytes or file names.
- `toPdfCommandDocument(command)` and `readPdfCommandDocument(json)` do the same for a command.
- A document of another format, or a later version, is refused with the new code `UNSUPPORTED_FORMAT`, and any other invalid document with the new code `INVALID_DOCUMENT`. Both have a `details.reason` from `PdfDocumentRejection`, and text in `pdfMessages`.
- `pdf.rotatePages` now takes an `angle` from -360 to 360. A larger one is refused with `INVALID_COMMAND` and `invalid-rotation`, as the format's schema refuses it.

`docs/formats/hm-pdf-plan.md` describes the formats. Their JSON Schemas are in `formats/`, and the conformance vectors in `conformance/`.
