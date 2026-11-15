---
"@hussmartinez/pdf-sdk": minor
---

Edit commands are now checked strictly, and refused with a stable code and reason (sdk-core ADR 0045).

**Breaking:** `session.execute`, `undo` and `redo` throw `PdfError` with the new code `INVALID_COMMAND` for a command that doesn't fit the plan, instead of `TypeError` or `RangeError`. `details.reason` says why, as one of the `PdfCommandRejection` tokens, such as `unknown-page`, `last-page`, `invalid-position` or `invalid-color`. The session still changes nothing when a command is refused. To migrate, replace `instanceof TypeError` or `RangeError` checks with `isPdfError(error, "INVALID_COMMAND")`, and branch on `error.details.reason` instead of the message. `pdfMessages` has text for the new code.

Commands are also stricter:

- A field a command's type doesn't have, or a field of the wrong type, is refused as `malformed-command`.
- Annotation positions, stroke widths and text sizes are snapped to millionths of the page (`PDF_POSITION_GRID`), so the session only stores values on that grid. Positions outside 0 to 1 are refused.
- Colours must be `#rrggbb` in lowercase.
- Lengths are counted in Unicode code points: ids and page keys have 1 to `PDF_MAX_ID_LENGTH` (128), field names up to `PDF_MAX_FIELD_NAME_LENGTH` (1,000), and text notes and text field values up to `PDF_MAX_TEXT_LENGTH` (10,000). Strokes have up to `PDF_MAX_STROKE_POINTS` (10,000) points.
- `pdf.insertPages` and `pdf.setFieldValue` refuse a source the session doesn't hold, and `pdf.insertPages` refuses a page index the source doesn't have.
- Signature annotations (`type: "signature"`) are refused with `unsupported-annotation` until the editor's signature tool lands. If you add them yourself today, keep them outside the session until then.

A form field named `__proto__` is now stored like any other field. Before, setting it changed the values object's prototype instead.
