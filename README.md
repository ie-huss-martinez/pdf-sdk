# pdf-sdk

A client-side PDF SDK: view, edit, merge, compress and protect PDFs entirely in the browser. Files never leave the device. It offers a headless core, a React editor (`PdfEditor`) and a `<hm-pdf-editor>` custom element.

This repository will publish **`@hussmartinez/pdf-sdk`**, which replaces the private `@phalabsteam/pdf`. It follows the family standards in [`sdk-core`'s `STANDARDS.md`](https://github.com/ie-huss-martinez/sdk-core/blob/main/STANDARDS.md), and in particular the decisions on [hostile input and no network](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0012-hostile-input-and-no-network.md), [workers and assets](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0011-worker-messaging-and-assets.md) and [ports and adapters](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0008-ports-adapters-and-session.md).

> Status: being bootstrapped. No packages are published yet.

## Assets and Content Security Policy

PDF.js needs a worker, and some documents need extra data: CMaps for CJK text whose fonts aren't embedded, standard fonts, and decoders for JBIG2 and JPX images, which are common in scanned documents. The SDK never fetches any of them from the network. Choose one of two modes ([ADR 0002](docs/adr/0002-workers-and-assets.md), [ADR 0006](docs/adr/0006-icc-colour-and-self-hosted-assets.md)):

| | Inline (default) | Self-hosted |
|---|---|---|
| Setup | Nothing | Serve `node_modules/@hussmartinez/pdf-sdk/dist/assets/pdfjs/` from your origin, and pass its URL: `createPdfJsEngine({ assetsUrl: "/pdf-sdk/pdfjs/" })` |
| Where files come from | Your bundle: each data file is its own lazy chunk, loaded only by documents that need it | Your origin, under `assetsUrl` |
| CMYK and ICC-based colour | Approximate | Accurate, with pdf.js's colour management |
| Content Security Policy | `worker-src blob:` and `script-src 'wasm-unsafe-eval'` | `worker-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'` and `connect-src 'self'` |

**Which to choose:**
- **Inline** for the simplest setup. Most documents use RGB or grey and look the same in both modes.
- **Self-hosted** if your Content Security Policy doesn't allow `blob:` workers, or if print colour must be accurate, for example for proofs and CMYK artwork.

In self-hosted mode, copy the directory as it is when you upgrade the package. pdf.js requires the worker to be the same version as the code that uses it.

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

When a change alters the public API on purpose, update the reports with `pnpm api:update` and commit them.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request. Coding agents also start with [`AGENTS.md`](AGENTS.md). Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately, as described in the [security policy](SECURITY.md).

## License

[Apache-2.0](LICENSE)
