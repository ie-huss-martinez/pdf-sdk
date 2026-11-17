# 0010. Interface text stays out of the server-safe entry

- **Status:** Accepted
- **Date:** 2026-11-17
- **Refines, for this SDK:** [sdk-core ADR 0019](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0019-message-catalogues.md) (message catalogues) and [sdk-core ADR 0046](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0046-ui-text-through-the-sdk.md) (ui's text through the SDK)

## Context

`.` is the server-safe, headless entry ([sdk-core ADR 0004](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0004-entry-points-and-module-format.md)). It exports `pdfMessages`, which held every string the SDK has:
- 12 for errors and warnings, which the headless session produces and hosts show;
- 32 for the interface: the editor, its toolbar and tools, the viewer and the thumbnails. Nothing in `.` shows them.

Every interface string was therefore shipped to every host of `.`, servers included, and counted against its size budget ([sdk-core ADR 0015](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0015-verification-and-releases.md)):
- In 0.3.0 the entry measured 14.96 kB brotli, against a 15 kB budget.
- The first page tool of 0.4.0 took it 151 B over. Each later tool adds more strings.

Both other SDKs with editors have the same shape today:
- image-sdk's `imageMessages`, from `.`, includes its editor's text, and ui's text too.
- video-sdk's `videoMessages`, from `.`, includes its editor's text.

sdk-core's ADR 0046 shows one catalogue per SDK, and doesn't say which entry exports it.

## Decision

- **`pdfMessages`, from `.`, holds only text that the headless entry produces:** sdk-core's messages, `errors.<CODE>` for every `PdfErrorCode`, and `warnings.<LIMIT>` for every limit. A unit test fails if any other key is added to it.
- **Interface text lives in `src/messages/editor-en.ts`,** which only the React entry imports. Every visible string still comes from `src/messages`.
- **`pdfEditorMessages`, from `./react`, is the components' catalogue:** `pdfMessages`, ui's `uiMessages` and the interface text.
  - `PdfEditor` and `PdfSessionProvider` build their `Messages` from it.
  - `usePdfMessages()` returns it.
  - Hosts type overrides of any key with `MessageOverrides<PdfEditorMessageCatalogue>`.
- **The custom element uses `pdfEditorMessages` too,** when it ships. It renders the same React editor, and `./element` will take the same `messages` overrides.
- **This is a deliberate step ahead of the family.** It's proposed to sdk-core as a family rule, so that image-sdk and video-sdk can follow, and this record is to be superseded by that rule if it's accepted.

## Alternatives considered

- **Raising the budget of `.`:** it would let interface text keep growing in an entry that never shows it. The budget was right; the contents weren't.
- **Waiting for a family rule first:** cleaner for the family, but it would hold 0.4.0's page tools behind that decision. The change here is small, and the family can adopt it as it is.
- **A third entry for the catalogue alone:** another entry point for hosts to learn and for the API reports to cover, when `./react` is already where the interface lives.

## Consequences

- `.` dropped from 14.96 kB to 14.6 kB brotli, leaving 0.4 kB of headroom that interface text no longer uses up.
- **Breaking, before 1.0:** a host that typed overrides of interface keys with `MessageOverrides<PdfMessageCatalogue>` types them with `PdfEditorMessageCatalogue` instead. The keys and their text don't change, and the `messages` props work as before.
- `PdfSessionProvider` now accepts overrides of ui's keys too, which its own components don't show. Its `Messages` is the same as the editor's.
