# 0003. The page plan: edits change a model, and bytes are built on export

- **Status:** Accepted
- **Date:** 2026-11-12
- **Amended:** 2026-11-15, for sdk-core ADR 0045: the reducer refuses invalid commands with `INVALID_COMMAND` and a stable reason, positions and sizes are kept on a grid of millionths of the page, lengths count Unicode code points, and signature annotations are left out until their image can be stored as an asset (see [Strict commands and the grid](#strict-commands-and-the-grid)); and the plan and the user-level commands have a portable JSON format, `hm-pdf-plan` and `hm-pdf-command` version 1 ([the format record](../formats/hm-pdf-plan.md))

## Context

The private PDF editor this SDK grew from runs qpdf and reopens the document after every rotate, delete, move or merge. Each edit takes seconds on a large file, replaces the whole document on screen, and can't be undone. The family requires every edit to be a serialisable command with undo and redo, within a memory budget ([ADR 0010](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0010-edits-as-commands.md)), run by a framework-agnostic session ([ADR 0008](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0008-ports-adapters-and-session.md)).

Keeping a snapshot of the bytes for every step would put two or three copies of a 100 MB file in memory after a few edits. Replaying commands from the original on every undo would rerun qpdf each time, which is slow for the same reason.

Most PDF edits that users make are about pages: their order, rotation, presence, and which document they come from. Annotations and form values sit on top of pages. None of them needs new bytes until the user exports.

## Decision

### The model

The session's document is a **page plan** over immutable sources, plus overlays:

- **Sources:** each opened or inserted file, copied once into the session and never modified. A source has an ID, its bytes, its page count and its size.
- **The plan:** an ordered list of pages. Each page has a stable key, the source and page index it comes from, and an added rotation of 0, 90, 180 or 270 degrees, applied on top of the page's own `/Rotate`.
- **Overlays:**
  - **annotations** (pen, highlight, text, signature) are keyed by page key, so they move with their page. Their coordinates are fractions of the page's unrotated media box, so rotating a page doesn't distort them;
  - **form values** are keyed by source and field name, so fields with the same name in two merged documents stay separate.

Rendering reads the plan directly. The engine opens each source once, and the viewer renders a page from its source and index, adding the plan's rotation to the viewport. Thumbnails and the text layer are keyed by page key, so a page that moves keeps them.

### Commands

Commands are plain, structured-cloneable data:

| Command | Changes |
|---|---|
| `pdf.rotatePages { pages, angle }` | Adds a rotation to the given page keys |
| `pdf.deletePages { pages }` | Removes the given page keys |
| `pdf.movePages { pages, to }` | Moves the given page keys to a position |
| `pdf.insertPages { source, pages?, at }` | Inserts pages from a registered source |
| `pdf.setFieldValue { source, field, value }` | Sets a text or checkbox value |
| `pdf.addAnnotation { page, annotation }` and `pdf.removeAnnotation { page, id }` | Adds or removes an overlay annotation |

- **Sources are registered, not carried in commands.** `session.insert(file, { at })` checks the file against the file policy, copies it into the session as a source, and then executes `pdf.insertPages` with the source's ID. Commands never carry bytes.
- **Undo uses inverse commands.** Each command records its inverse when it runs, such as the positions that `pdf.movePages` took its pages from. Plan and overlay edits need no snapshots, so the history costs almost nothing beyond the sources it still refers to ([ADR 0004](0004-pdf-limits.md)).
- **Grouping:** a drag that moves several pages, or a pen stroke made of many points, is one undoable step.
- **Events:** each command emits an anonymous event with its type and outcome, for the host's `onEvent`. Events never carry file names, contents, field values or annotation text.

### Strict commands and the grid

Added on 2026-11-15, so that a port of the SDK in another language, or a saved document, reproduces a session exactly ([sdk-core ADR 0045](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0045-portable-formats-and-conformance-vectors.md)).

- **The reducer is `sdk-core`'s `Reducer<PdfPlan, PdfCommand>`,** created with each source's page count, so it can check the pages a command names. The session applies steps with `applyCommands` ([sdk-core ADR 0029](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0029-session-store-and-history.md)).
- **Invalid commands throw `PdfError` with `INVALID_COMMAND`,** and a stable `details.reason` such as `unknown-page`, `last-page` or `invalid-color`, listed by `PdfCommandRejection`. They change nothing. Before, they threw `TypeError` or `RangeError` with only a message.
- **Commands are strict:** a field a command's type doesn't have, or one of the wrong type, fails as `malformed-command`. The reducer never drops or corrects a field.
- **Positions and sizes are on a grid of millionths of the page** (`PDF_POSITION_GRID`): annotation positions, stroke widths and text sizes. The model's types stay fractions from 0 to 1, but the reducer snaps every value to the grid when it applies a command, so the plan only ever holds whole millionths. Snapping, rather than refusing values off the grid, lets the editor pass a pointer's position as it is. It uses `Math.round(v × 1,000,000) / 1,000,000`, which rounds a half up, toward positive infinity. A port must round the same way, as `floor(x + 0.5)` does, not away from zero. A size that snaps to 0 is refused as `invalid-size`, and a position outside 0 to 1 as `outside-page`.
- **Lengths count Unicode code points,** as JSON Schema and every language count them, not UTF-16 units: ids and page keys have 1 to 128, form field names 1 to 1,000, and text notes and text field values up to 10,000. Strokes have 1 to 10,000 points. Colours are `#rrggbb` in lowercase.
- **Keys are data:** form values keyed by a source or field named `__proto__`, `constructor` or `toString` are ordinary entries.
- **The plan and the user-level commands have a portable JSON format,** `hm-pdf-plan` and `hm-pdf-command` version 1, with JSON Schemas in `formats/` and conformance vectors in `conformance/`. Documents hold positions and sizes as whole millionths, the same grid, so a document reads back exactly as the session that wrote it held it. [The format record](../formats/hm-pdf-plan.md) describes them.
- **Signature annotations are refused** with `unsupported-annotation`. Their image is bytes, which a portable document stores as a content-addressed asset (sdk-core ADR 0045, section 2), and how assets travel with a document isn't decided yet. Nothing in the editor creates signatures today. The signature tool will bring them back, with the asset design, in a later version of the format.

### Exporting

`session.export(options)` builds the bytes in the processing worker ([ADR 0002](0002-workers-and-assets.md)), skipping every step that has nothing to do:

1. **Normalise and fill each source:** qpdf rewrites each source the plan uses, repairing it. Then pdf-lib fills that source's form values on qpdf's output ([ADR 0001](0001-pdf-engines.md)).
2. **Assemble:** one qpdf job takes the pages in plan order from the normalised sources, with their rotations.
3. **Flatten annotations:** pdf-lib draws the overlay annotations onto the assembled pages, which are again qpdf output.
4. **Compress:** losslessly with qpdf, and optionally with image recompression.
5. **Encrypt:** with qpdf, AES-256.

When the plan is one source, unchanged, with no overlays and no options, `export` returns a copy of the source's bytes without starting the worker.

This refines the order agreed in the architecture review (assemble, then fill, then flatten): form filling moves before assembly, per source. Merged documents can have fields with the same name, and qpdf renames them when it assembles pages: merging two documents that each have a field `name` produces `name` and `name+1` (checked with `pdfstudio` 0.4.0). Values keyed by source can only be applied reliably before that renaming.

### What the model doesn't cover

Compression and encryption are export options, not commands: they produce a file, not a new state to edit. A future edit that the plan can't express, such as redaction or editing text, adds a `pdf.materialize` step. It replaces the sources with one new source built by the export pipeline, and its history entry is a snapshot that counts against the memory budget.

## Alternatives considered

- **New bytes for every edit, as in the original editor:** simple, but slow, every edit reopens the document, and undo needs a snapshot per step.
- **Snapshots of the bytes for undo:** correct, but a few edits to a large file exhaust the memory budget.
- **Event sourcing, replaying every command from the original:** precise, but every undo reruns the heavy operations ([ADR 0010](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0010-edits-as-commands.md) rejects it for that reason).
- **Filling forms after assembling, as first proposed:** needs field names after qpdf's renaming, which ties the model to qpdf's renaming rules.

## Consequences

- Rotating, deleting, moving and merging are instant and undoable, and the editor never reloads the document to show an edit.
- Exporting is the only slow step. It shows progress, can be cancelled, and runs once per download rather than once per edit.
- Rendering must apply the plan's rotation itself, and every engine adapter must render a source's page with an added rotation. The engine's contract tests check it.
- The sources stay in memory while the plan or the history refers to them. [ADR 0004](0004-pdf-limits.md) accounts for them.
- Hosts that want bytes on every change call `export()` from `onChange` themselves, and pay for it explicitly.
