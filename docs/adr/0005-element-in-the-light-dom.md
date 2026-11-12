# 0005. The element renders in the light DOM, and the standalone script stays in its layers

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

[ADR 0004](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0004-entry-points-and-module-format.md) gives every SDK two non-React surfaces:

- **`./element`:** `define<Kind>EditorElement()` and the element class, which register nothing on import, for sites built with any framework and a bundler;
- **`./standalone`:** a self-contained script that registers `<hm-<kind>-editor>`, for plain HTML pages.

An element can render into a shadow root or into the light DOM. The choice decides how the SDK is styled and themed, and whether it can affect the host page:

- **Shadow DOM** isolates styles in both directions. Then hosts can only style through custom properties and `::part()`, and the editor's `.hm-pdf-*` classes and `classNames` stop being hooks. The styles must also be injected into each shadow root, because the family's JavaScript never imports CSS.
- **Light DOM** works exactly like the React editor: the application imports `styles.css`, the `hm.*` cascade layers order it, and host CSS can override any part ([ADR 0003](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0003-hm-namespace.md), [ADR 0005](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0005-plain-css-with-cascade-layers.md)).

A standalone script is different: the host page didn't choose to import a stylesheet. It must bring its own, and that stylesheet must not change anything on the page outside the editor.

## Decision

### `./element`

- **Explicit registration:** `definePdfEditorElement(tagName = "hm-pdf-editor")` registers the element and returns its class. Calling it again with the same name does nothing, and a name already registered by another class throws. Importing the entry registers nothing, and its class definition is guarded, so importing it on a server does nothing ([ADR 0007](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0007-server-rendering-and-nextjs.md)).
- **Light DOM:** the element renders the same React editor into itself, inside a `.hm-pdf-editor` root, and uses the same `styles.css` that the application imports once. Theming, `classNames`, `unstyled` and token overrides work identically for React and the element. Native `<dialog>` elements and focus behave as they do in the rest of the page.
- **Its interface mirrors `PdfEditor`:**
  - **attributes,** for plain strings: `theme`, `locale` and `tools`;
  - **properties,** for everything else: `file`, `filePolicy`, `assets`, `messages`, `engine` and `processor`;
  - **methods,** the same as the React ref handle: `open()`, `export()`, `undo()`, `redo()` and `close()`;
  - **events:** `hm-pdf-editor-change`, `hm-pdf-editor-event` and `hm-pdf-editor-error`. They bubble, and their `detail` carries no file names or contents.
- **Teardown:** disconnecting the element unmounts the editor and destroys its session and workers.

### `./standalone`

- **It registers `<hm-pdf-editor>` when it loads,** which is its purpose. It's built from the same element, with React, `@hussmartinez/ui` and the styles bundled in. If the name is already registered, it does nothing. It defines no globals.
- **Its styles are adopted, and confined.** The script adds one constructed stylesheet to `document.adoptedStyleSheets`, containing `@hussmartinez/ui`'s styles and the SDK's. It can only affect the editor:
  - every rule is inside an `hm.*` cascade layer, so any unlayered host CSS beats it;
  - every selector matches only inside an `.hm-*` root, or on an element carrying a `data-hm-*` attribute, such as `data-hm-theme`, which only the host or the editor adds. stylelint's `hm/selector-scope` rule enforces this at build time;
  - rules on `:root` declare only `--hm-*` custom properties, which are inert unless something reads them.
- **A browser test enforces it.** It loads the standalone script into a page of ordinary host elements, and checks:
  - the computed styles of `html`, `body`, headings, paragraphs, links, buttons, inputs and a host `<dialog>` are identical before and after;
  - every rule in the adopted stylesheet is inside an `hm.*` layer, every selector in it matches only inside an `.hm-*` root or on a `data-hm-*` element, and its `:root` rules declare only `--hm-*` properties.

### Host CSS reaching in

In the light DOM, a host's unlayered element rules, such as `button { padding: 2rem }`, also apply to the editor's buttons. That's the family's deliberate trade-off: unlayered host CSS beats every `hm` layer, so hosts can override anything. Hosts with aggressive global CSS can contain it with their own scoping. A shadow-DOM mode for the standalone script would need a superseding record.

## Alternatives considered

- **Shadow DOM for the element:** complete isolation, but hosts lose the `.hm-pdf-*` hooks and `classNames`. The React editor and the element would then behave differently, and the styles would have to be injected from JavaScript into every instance.
- **Shadow DOM for the standalone script only:** it protects plain pages from bleed-in. But it gives the standalone script a different styling model from the element it wraps, and the light-DOM confinement above already protects the host page, which is the property that matters.
- **A `<style>` element or a `<link>` for the standalone styles:** a `<style>` element is blocked by a strict `style-src`, and a `<link>` is a network request. Constructed stylesheets are neither.
- **Registering the element when `./element` is imported:** surprising, unsafe on servers, and impossible to rename.

## Consequences

- One styling and theming model covers React, the element and the standalone script.
- The standalone script can't restyle the host page, and a test proves it on every run.
- A host's global element rules can reach into the editor. Hosts fix that with their own CSS. A future shadow-DOM option would need its own record.
