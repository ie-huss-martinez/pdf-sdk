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

`PdfEditor` fills the height of its container, and its viewer and thumbnails scroll within it, so give it a bounded height: a fixed height, or a grid row such as `minmax(0, 1fr)`. The same goes for `PdfViewer` and `PdfThumbnails` used on their own. **Styles:** import `@hussmartinez/ui/styles.css` before `@hussmartinez/pdf-sdk/styles.css`, once, in your application. ui's stylesheet defines the design tokens that give the editor its designed look, light and dark themes and theming; the SDK's stylesheet doesn't bundle it. Without it the editor keeps its layout and stays usable, but loses its colours, spacing and shadows. Every value is also a `--hm-pdf-*` property you can set on any ancestor.

`file` opens a document, and a different one replaces it; `null` closes it. Users can also open one with the editor's button or by dropping it on the editor. `onChange` reports each `open`, `edit` and `close`, and the ref's `PdfEditorHandle` exports, undoes, redoes and closes.

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

**In self-hosted mode, copy the whole directory again whenever you upgrade the package.** pdf.js requires its worker to be the same version as the code that uses it, and the processing worker refuses a `qpdf.wasm` from another version, with `WORKER_START_FAILED`.

## Development

The repository root is the published package, laid out as in the family's [standard layout](https://github.com/ie-huss-martinez/sdk-core/blob/main/STANDARDS.md#repository-layout): the source is in [`src`](src), and the examples and end-to-end tests will join the pnpm workspace as `examples/` and `e2e/`.

You need Node 24 (see [`.node-version`](.node-version)) and pnpm. The exact pnpm version is pinned in `package.json`, and pnpm switches to it automatically.

```sh
pnpm install       # also installs the git hooks
pnpm verify        # everything CI runs
pnpm verify:fast   # the subset the pre-push hook runs
```

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
| Size budgets | `check:size` | size-limit, brotli size of each entry point |
| API reports | `check:api` | api-extractor, one report per entry point in [`api`](api) |
| Package checks | `check:package` | publint and Are the Types Wrong? |

The configuration extends the shared presets in [`@hussmartinez/sdk-config`](https://www.npmjs.com/package/@hussmartinez/sdk-config). The git hooks ([ADR 0016](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0016-git-hooks-and-merge-guards.md)) run automatically: a secret scan and lint of staged files on commit, a Conventional Commits check of the message, and `pnpm verify:fast` on push.

When a change alters the public API on purpose, update the reports with `pnpm api:update` and commit them. api-extractor rolls up one entry point per run, so the React and element entries' declarations carry copies of the core types their APIs use, such as `PdfSession`. Their reports don't flag those as forgotten exports (`ae-forgotten-export` is off in `api-extractor.react.json` and `api-extractor.element.json`), because the core entry exports every one of them.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request. Coding agents also start with [`AGENTS.md`](AGENTS.md). Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately, as described in the [security policy](SECURITY.md).

## License

[Apache-2.0](LICENSE)
