# Architecture decision records

Decisions specific to `@hussmartinez/pdf-sdk`. Decisions for the whole SDK family live in [`sdk-core`'s `docs/adr`](https://github.com/ie-huss-martinez/sdk-core/tree/main/docs/adr); the records here build on them and never contradict them. To change a family decision, write a record in `sdk-core`.

Each record captures one significant decision: the context that forced it, what we chose, the alternatives we rejected and the consequences we accept. Records are numbered and immutable. To change a decision, write a new record that supersedes the old one and link the two.

Use [`template.md`](template.md) for new records. Name files `NNNN-short-title.md`, taking the next free number.

| # | Decision | Status |
|---|---|---|
| [0001](0001-pdf-engines.md) | PDF engines: pdf.js to view, qpdf to transform, pdf-lib to write | Accepted |
| [0002](0002-workers-and-assets.md) | Two workers, and PDF assets without the network | Accepted; ICC colour and self-hosted data files superseded by [0006](0006-icc-colour-and-self-hosted-assets.md) |
| [0003](0003-page-plan-document-model.md) | The page plan: edits change a model, and bytes are built on export | Accepted |
| [0004](0004-pdf-limits.md) | PDF limits and session memory | Accepted |
| [0005](0005-element-in-the-light-dom.md) | The element renders in the light DOM, and the standalone script stays in its layers | Accepted |
| [0006](0006-icc-colour-and-self-hosted-assets.md) | ICC colour needs self-hosted assets; inline mode uses approximate colour | Accepted |
