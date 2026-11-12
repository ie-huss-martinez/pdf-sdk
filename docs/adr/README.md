# Architecture decision records

Decisions specific to `@hussmartinez/pdf-sdk`. Decisions for the whole SDK family live in [`sdk-core`'s `docs/adr`](https://github.com/ie-huss-martinez/sdk-core/tree/main/docs/adr); the records here build on them and never contradict them. To change a family decision, write a record in `sdk-core`.

Each record captures one significant decision: the context that forced it, what we chose, the alternatives we rejected and the consequences we accept. Records are numbered and immutable. To change a decision, write a new record that supersedes the old one and link the two.

Use [`template.md`](template.md) for new records. Name files `NNNN-short-title.md`, taking the next free number.

| # | Decision | Status |
|---|---|---|
| [0001](0001-pdf-engines.md) | PDF engines: pdf.js to view, qpdf to transform, pdf-lib to write | Accepted |
| [0002](0002-workers-and-assets.md) | Two workers, and PDF assets without the network | Accepted |
