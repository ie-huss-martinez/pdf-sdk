# pdf-sdk

A client-side PDF SDK: view, edit, merge, compress and protect PDFs entirely in the browser. Files never leave the device. It offers a headless core, a React editor (`PdfEditor`) and a `<hm-pdf-editor>` custom element.

This repository will publish **`@hussmartinez/pdf-sdk`**, which replaces the private `@phalabsteam/pdf`. It follows the family standards in [`sdk-core`'s `STANDARDS.md`](https://github.com/ie-huss-martinez/sdk-core/blob/main/STANDARDS.md), and in particular the decisions on [hostile input and no network](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0012-hostile-input-and-no-network.md), [workers and assets](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0011-worker-messaging-and-assets.md) and [ports and adapters](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0008-ports-adapters-and-session.md).

> Status: being bootstrapped. No packages are published yet.

## The React editor

```tsx
import { PdfEditor, type PdfEditorHandle } from "@hussmartinez/pdf-sdk/react";
import "@hussmartinez/ui/styles.css";
import "@hussmartinez/pdf-sdk/styles.css";

const editor = useRef<PdfEditorHandle>(null);

<div style={{ height: "100dvh" }}>
  <PdfEditor ref={editor} file={file} onChange={({ reason }) => setDirty(reason === "edit")} />
</div>;

const bytes = await editor.current?.export();
```

**Styles: ui's stylesheet is required.** Import `@hussmartinez/ui/styles.css` once in your application, before `@hussmartinez/pdf-sdk/styles.css`, as above. The editor's toolbar is built from [`@hussmartinez/ui`](https://www.npmjs.com/package/@hussmartinez/ui)'s components, and their focus rings and minimum target sizes are in ui's stylesheet, along with the design tokens, themes and density ([sdk-core ADR 0036](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0036-ui-as-a-dependency-of-the-sdks.md)). The SDK's stylesheet never includes it, so a page with several SDKs loads it once. Every value is also a `--hm-pdf-*` property you can set on any ancestor.

**One copy of ui.** The SDK depends on `@hussmartinez/ui` `^0.5.0`. If your application uses ui itself, depend on the same minor version, and check that `npm ls @hussmartinez/ui` lists one version: a second copy doesn't share providers with the first, so text falls back to English and announcements are lost.

**A bounded height.** `PdfEditor` fills the height of its container, and its viewer and thumbnails scroll within it, so give it a bounded height: a fixed height, or a grid row such as `minmax(0, 1fr)`. The same goes for `PdfViewer` and `PdfThumbnails` used on their own.

**Text.** `messages` overrides any text the editor shows, by key, including ui's, such as `"spinner.label"`. The editor builds one set of text from them and your `locale`, for its own components and for ui's ([sdk-core ADR 0046](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0046-ui-text-through-the-sdk.md)). `pdfEditorMessages` is the English catalogue, and `MessageOverrides<PdfEditorMessageCatalogue>` types your overrides.

`file` opens a document, and a different one replaces it; `null` closes it. Users can also open one with the editor's button or by dropping it on the editor. `onChange` reports each `open`, `edit` and `close`, and the ref's `PdfEditorHandle` exports, undoes, redoes and closes.

### Tools, the toolbar and shortcuts

The editor's tools are in `pdfTools`:

| Tool | Shortcut | What it does |
|---|---|---|
| `pdf.open` | none: `Ctrl+O` is the browser's own | Opens a PDF, replacing the current one |
| `pdf.undo` | `Ctrl+Z`, or `⌘Z` on Apple platforms | Undoes the last edit |
| `pdf.redo` | `Ctrl+Shift+Z` or `Ctrl+Y`, or `⇧⌘Z` | Redoes the last undone edit |
| `pdf.rotate-left` | `[` | Turns the selected pages, or the current one, a quarter turn anticlockwise |
| `pdf.rotate-right` | `]` | Turns them a quarter turn clockwise |

Choose which tools are present with `tools`, and arrange the toolbar with `toolbar`, as groups of tool ids; `toolbar={[]}` hides it and keeps the shortcuts. An unknown id throws when the editor renders, so a typo never leaves a tool silently missing. `icons` replaces any icon by name with your own component.

```tsx
<PdfEditor
  tools={["pdf.undo", "pdf.redo", "pdf.rotate-left", "pdf.rotate-right"]}
  toolbar={[["pdf.undo", "pdf.redo"], ["pdf.rotate-left", "pdf.rotate-right"]]}
/>
```

Shortcuts work only while focus is inside the editor, never on the rest of your page, and never while typing in a field. The toolbar is one tab stop, with arrow keys between its buttons; each button names its shortcut in `aria-keyshortcuts`. Undoing, redoing and rotating are announced to screen readers.

## Assets and Content Security Policy

The SDK runs two workers: pdf.js's, which renders, and one with qpdf and pdf-lib, which builds documents. Some documents also need extra data: CMaps for CJK text whose fonts aren't embedded, standard fonts, and decoders for JBIG2 and JPX images, which are common in scanned documents. The SDK never fetches any of them from another origin. Choose one of two modes ([ADR 0002](docs/adr/0002-workers-and-assets.md), [ADR 0006](docs/adr/0006-icc-colour-and-self-hosted-assets.md), [ADR 0007](docs/adr/0007-one-assets-directory.md)):

| | Inline (default) | Self-hosted |
|---|---|---|
| Setup | Nothing | Serve `node_modules/@hussmartinez/pdf-sdk/dist/assets/` from your origin, and pass its URL to both: `createPdfJsEngine({ assetsUrl: "/pdf-sdk/" })` and `createPdfProcessor({ assetsUrl: "/pdf-sdk/" })` |
| Where files come from | Your bundle: the workers are inlined, and each data file is its own lazy chunk, loaded only by documents that need it | Your origin, under `assetsUrl`: `pdfjs/` and `processing/` |
| CMYK and ICC-based colour | Approximate | Accurate, with pdf.js's colour management |
| Content Security Policy | `worker-src blob:` and `script-src 'wasm-unsafe-eval'` | `worker-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'` and `connect-src 'self'` |

**Which to choose:**
- **Inline** for the simplest setup. Most documents use RGB or grey and look the same in both modes.
- **Self-hosted** if your Content Security Policy doesn't allow `blob:` workers, or if print colour must be accurate, for example for proofs and CMYK artwork.

**In self-hosted mode, copy the whole directory again whenever you upgrade the package.** A worker left over from another version is refused with `WORKER_START_FAILED`, whose `details` name the file and both versions, `{ asset, expected, actual }`: the processing worker checks the package's version, pdf.js checks its own, and the processing worker also refuses a `qpdf.wasm` from another version.

`assetsUrl` can be absolute or relative to the page, such as `/pdf-sdk/`. `PdfEditor` and `PdfSessionProvider` render on a server with a relative one: they create their engine and processor only when they're first used, in the browser. A URL with a query or a fragment is refused, because the files resolved from it would lose them: the components throw `TypeError` as they render, and `createPdfJsEngine` and `createPdfProcessor`, called directly, throw it when you call them, as they do for a relative URL where there's no page to resolve it against.

## Development

The repository root is the published package, laid out as in the family's [standard layout](https://github.com/ie-huss-martinez/sdk-core/blob/main/STANDARDS.md#repository-layout): the source is in [`src`](src), and the pnpm workspace adds the examples in [`examples`](examples) and the end-to-end tests in [`e2e`](e2e) ([sdk-core ADR 0039](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0039-test-applications-in-each-repository.md)).

You need Node 24 (see [`.node-version`](.node-version)) and pnpm. The exact pnpm version is pinned in `package.json`, and pnpm switches to it automatically.

```sh
pnpm install       # also installs the git hooks
pnpm verify        # everything CI runs
pnpm verify:fast   # the subset the pre-push hook runs
```

The examples use the built package as an application would: [`examples/next`](examples/next) renders the editor in a Next.js App Router Server Component, and [`examples/vite`](examples/vite) has one page per asset mode, each under the Content Security Policy this README gives for it. The plain HTML example joins them with the standalone script.

Browser tests need Playwright's browsers once: `pnpm exec playwright install chromium`, plus `firefox webkit` to run all three engines with `CI=1` or `pnpm test:browser:all`.

`pnpm verify` runs, in order:

| Step | Script | Tool |
|---|---|---|
| Format and lint | `lint` | Biome |
| CSS rules | `lint:css` | stylelint, with the `hm-` namespace and token rules |
| Types | `typecheck` | TypeScript |
| Dependency rules | `lint:deps` | dependency-cruiser, through `hm-lint-deps` |
| Build | `build` | Vite, then api-extractor for the type declarations |
| Unit tests | `test` | Vitest |
| Browser tests | `test:browser` | Vitest in Chromium, and in Firefox and WebKit too in CI |
| Examples | `build:examples` | Production builds of the Next.js and Vite examples, against the built package |
| End-to-end tests | `test:e2e` | Playwright against the examples: server rendering and hydration, axe, no foreign requests, and both asset modes under the Content Security Policies above |
| Size budgets | `check:size` | size-limit, brotli size of each entry point |
| API reports | `check:api` | api-extractor, one report per entry point in [`api`](api), and `hm-check-api-reports` across them |
| Package checks | `check:package` | publint and Are the Types Wrong? |

The configuration extends the shared presets in [`@hussmartinez/sdk-config`](https://www.npmjs.com/package/@hussmartinez/sdk-config). The git hooks ([ADR 0016](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0016-git-hooks-and-merge-guards.md)) run automatically: a secret scan and lint of staged files on commit, a Conventional Commits check of the message, and `pnpm verify:fast` on push.

When a change alters the public API on purpose, update the reports with `pnpm api:update` and commit them. api-extractor rolls up one entry point per run, so the React and element entries' declarations carry copies of the core types their APIs use, such as `PdfSession`. Their reports list those copies, and `hm-check-api-reports` from [`@hussmartinez/sdk-config`](https://www.npmjs.com/package/@hussmartinez/sdk-config) then checks that the core entry exports every one of them, and that none is a class with private members, whose copy TypeScript would treat as a different type. All three configurations extend sdk-config's api-extractor preset.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request. Coding agents also start with [`AGENTS.md`](AGENTS.md). Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately, as described in the [security policy](SECURITY.md).

## License

[Apache-2.0](LICENSE)
