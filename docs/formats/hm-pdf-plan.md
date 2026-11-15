# `hm-pdf-plan` and `hm-pdf-command`, version 1

pdf-sdk's portable formats ([sdk-core ADR 0045](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0045-portable-formats-and-conformance-vectors.md)). A port in another language reads and writes them, and proves it applies commands as this SDK does by passing the vectors in [`conformance/`](../../conformance).

| Format | Schema | What it holds |
|---|---|---|
| `hm-pdf-plan` 1 | [`formats/hm-pdf-plan/v1.schema.json`](../../formats/hm-pdf-plan/v1.schema.json) | A page plan ([ADR 0003](../adr/0003-page-plan-document-model.md)), with the sources it uses |
| `hm-pdf-command` 1 | [`formats/hm-pdf-command/v1.schema.json`](../../formats/hm-pdf-command/v1.schema.json) | One user-level edit command |

`readPdfPlanDocument(json)` reads a document, and `toPdfPlanDocument(plan, sources)` writes one. `readPdfCommandDocument(json)` and `toPdfCommandDocument(command)` do the same for a command. The schemas stay in the repository for now; the vectors are for ports and the SDK's own tests, not for hosts.

## `hm-pdf-plan`

```json
{
  "format": "hm-pdf-plan",
  "version": 1,
  "sources": {
    "s1": { "pageCount": 6 },
    "s2": { "pageCount": 4 }
  },
  "pages": [
    {
      "key": "p1",
      "source": "s1",
      "pageIndex": 0,
      "rotation": 0,
      "annotations": [
        {
          "id": "n1",
          "type": "text",
          "at": { "x": 100000, "y": 250000 },
          "text": "Approved",
          "size": 20000,
          "color": "#1a73e8"
        }
      ]
    },
    { "key": "k1", "source": "s2", "pageIndex": 3, "rotation": 270, "annotations": [] }
  ],
  "formValues": { "s1": { "name": "Ada Lovelace", "subscribe": true } }
}
```

- **Pages** are in plan order. Each is a page of a source, by its zero-based index, with a rotation of 0, 90, 180 or 270 degrees added to the page's own `/Rotate`, and the annotations drawn on it, in drawing order. A page's key is stable while the page moves, and unique in the plan.
- **Sources** are keyed by ids that only mean something within the document. Each gives its page count, which the pages that use it must fit. Once documents travel with their files, it also gives an `asset`: the SHA-256 of the bytes, their media type and their size. A document never inlines a PDF's bytes, and never records a file name.
- **Form values** are keyed by source id, then by field name, so fields with one name in two merged documents stay separate. A value is text, or `true` or `false` for a checkbox. A source with no values set is left out.
- **Annotations:** pen and highlighter strokes, with their points, colour and width, and text notes, with their position, text, size and colour. A note's text is drawn as text, never interpreted as markup. Version 1 has no signatures: their image is bytes, which needs an asset, and the design for that comes with the signature tool. A later version adds them, with a migration from this one.

### Numbers: millionths of the page

Positions and sizes are whole millionths of the page, from 0 to 1,000,000 (`PDF_POSITION_GRID`):

- a point's `x` is from the left edge of the page's unrotated media box, and `y` from the top edge, so rotating a page doesn't move its annotations on it;
- a stroke's `width` and a note's `size` are millionths of the page's height, from 1.

In memory, the SDK keeps them as fractions of the page, from 0 to 1, but always on the same grid: its reducer snaps every value to millionths when a command applies (ADR 0003). So a document, the session that wrote it, and a port all hold exactly the same numbers.

**Snapping rounds with JavaScript's `Math.round`,** `Math.round(v × 1,000,000) / 1,000,000`: a half rounds toward positive infinity. A port rounds as `floor(x + 0.5)` does. Values are never negative here, so this matches rounding halves away from zero too, but a port should use the same expression.

Every other number is a whole number: page counts, indexes and rotations.

### Text and ids

Lengths count Unicode code points, as the schemas' `maxLength` counts them, and as every language can (sdk-core ADR 0045, section 8). A character outside the BMP, such as an emoji, is one code point, though JavaScript's `length` counts it as two. The vectors check each limit with such characters.

| What | Code points |
|---|---|
| Page keys, source ids, annotation ids | 1 to 128 (`PDF_MAX_ID_LENGTH`) |
| Form field names | 1 to 1,000 (`PDF_MAX_FIELD_NAME_LENGTH`) |
| Text notes, text field values | up to 10,000 (`PDF_MAX_TEXT_LENGTH`) |

Strokes have 1 to 10,000 points (`PDF_MAX_STROKE_POINTS`). Colours are `#rrggbb` in lowercase.

Ids, keys and field names are data. `__proto__`, `constructor` and `toString` are ordinary names, and the vectors use each of them.

### Beyond the schema

A reader checks what depends on the whole document: every page's source is one the document lists, and has the page's index; page keys are unique; each page's annotation ids are unique on it; and form values name sources the document lists. A document has at least one page.

**Strict:** an unknown field anywhere is refused, never dropped. So a later version's document can't be misread as this one.

**Not in the format:** the session's undo history, its selection and current page, and the editor's state.

## `hm-pdf-command`

The edits a user makes, as [ADR 0003](../adr/0003-page-plan-document-model.md) describes them: `pdf.rotatePages`, `pdf.deletePages`, `pdf.movePages`, `pdf.reorderPages`, `pdf.insertPages`, `pdf.setFieldValue`, `pdf.addAnnotation` and `pdf.removeAnnotation`.

- A rotation's `angle` is a multiple of 90 from −360 to 360.
- `pdf.insertPages` names a source the session holds, and gives one new key for each page it inserts. The session registers a file as a source before it inserts it, so commands never carry bytes.
- `pdf.setFieldValue` clears a field with `null`, so the document's own value applies again.
- `pdf.addAnnotation`'s annotation has its positions and sizes in millionths, as in a plan document. It's the only command whose portable form differs from the command in memory.

Commands' inverses are internal, and aren't part of the format. One of them, `pdf.restorePages`, puts deleted pages back with everything on them; the format refuses it. The reducer refuses unknown fields here too.

## Rejections

A refusal is compared by its code and `details.reason`, never its message:

| Code | Reasons |
|---|---|
| `UNSUPPORTED_FORMAT` | `unknown-format`, `unknown-format-version` |
| `INVALID_DOCUMENT` | `malformed-document`, `unknown-source`, `page-out-of-range`, `duplicate-key`, `duplicate-annotation`, and as for commands: `invalid-rotation`, `outside-page`, `invalid-size`, `too-many-points`, `invalid-color`, `unsupported-annotation`, `field-name-too-long`, `text-too-long` |
| `INVALID_COMMAND` | `PdfCommandRejection`'s tokens: `malformed-command`, `unknown-command`, `unknown-page`, `duplicate-page`, `last-page`, `invalid-position`, `invalid-rotation`, `invalid-order`, `invalid-keys`, `duplicate-key`, `unknown-source`, `page-out-of-range`, `field-name-too-long`, `text-too-long`, `unknown-annotation`, `duplicate-annotation`, `unsupported-annotation`, `outside-page`, `invalid-size`, `too-many-points`, `invalid-color` |

A reader and the reducer check everything a schema can before anything that depends on the plan. So a refusal the schema expresses, such as `invalid-color`, means the schema refuses the input too, and one it can't, such as `unknown-page`, means the schema accepts it.

## The vectors

| File | Subject | A case's input | Its expected result |
|---|---|---|---|
| [`conformance/hm-pdf-plan.json`](../../conformance/hm-pdf-plan.json) | `hm-pdf-plan` | A document | The document as a reader writes it back, or the rejection |
| [`conformance/hm-pdf-commands.json`](../../conformance/hm-pdf-commands.json) | `hm-pdf-commands` | `{ plan, command }` | The resulting document, or the rejection. The command's inverse must also restore the plan |

Hand-written cases cover every outcome, including source ids, page keys, field names and annotation ids named `__proto__`, `constructor` and `toString` (ADR 0045, section 8), and each length limit with characters outside the BMP. Generated ones come from the reducer's property-test generators, with a fixed seed: 60 commands that apply, and two of each refusal from commands with a field replaced or added, and 20 documents. `pnpm conformance:update` rewrites the files, and the tests fail when the checked-in files differ from what the generator writes.

The TypeScript tests also check that the schemas agree with the readers. Every document and command the vectors accept passes its schema, and every structural refusal fails it. Over thousands of mutated inputs, the reducer and the reader never accept anything their schema refuses.

## Changing the formats

A breaking change is a new version, with its schema beside this one and a migration from version 1 (ADR 0045, section 1). A reader refuses a later version with `UNSUPPORTED_FORMAT` and `unknown-format-version`. Adding signatures is such a change.
