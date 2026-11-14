import { createMessages, type MessageOverrides } from "@hussmartinez/sdk-core";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPdfJsEngine } from "../adapters/pdfjs/pdfjs-engine.js";
import { createPdfProcessor } from "../adapters/qpdf/qpdf-processor.js";
import type { PdfFilePolicyOverrides } from "../core/errors/pdf-limits.js";
import type { PdfEngine } from "../core/ports/pdf-engine.js";
import type { PdfProcessor } from "../core/ports/pdf-processor.js";
import type { PdfSession, PdfSessionEvent } from "../core/session/session.js";
import { createPdfSession } from "../core/session/session.js";
import type { PdfMessageCatalogue } from "../messages/en.js";
import { pdfMessages } from "../messages/en.js";
import { PdfContext } from "./context.js";
import { checkAssetsUrl, lazyEngine, lazyProcessor } from "./lazy-ports.js";

/**
 * Props for {@link PdfSessionProvider}.
 *
 * @public
 */
export interface PdfSessionProviderProps {
  /**
   * A session you created and own. Without it, the provider creates one,
   * with the options below, and closes it when it unmounts. The options are
   * read once, when the provider first renders.
   */
  readonly session?: PdfSession;
  /** The engine for a session the provider creates. Defaults to pdf.js. */
  readonly engine?: PdfEngine;
  /** The processor for a session the provider creates. Defaults to qpdf. */
  readonly processor?: PdfProcessor;
  /**
   * Where your application serves the package's `dist/assets/`, for the
   * default engine and processor (docs/adr/0007). By default, they're inlined.
   */
  readonly assetsUrl?: string | URL;
  /** File limits for a session the provider creates (docs/adr/0004). */
  readonly filePolicy?: PdfFilePolicyOverrides;
  /** Anonymous usage events from a session the provider creates. */
  readonly onEvent?: (event: PdfSessionEvent) => void;
  /** Text overrides, typed against the English catalogue (ADR 0019). */
  readonly messages?: MessageOverrides<PdfMessageCatalogue>;
  /** The locale for numbers, sizes and plurals. Defaults to `"en"`. */
  readonly locale?: string;
  /** The components that use the session, such as `PdfViewer`. */
  readonly children?: ReactNode;
}

interface Owned {
  readonly session: PdfSession;
  dispose(): void;
}

/**
 * Creates what the provider owns. Nothing touches the DOM until a document
 * opens, so this is safe during server rendering (ADR 0007).
 */
function own(props: PdfSessionSource): Owned {
  const assets = props.assetsUrl === undefined ? {} : { assetsUrl: props.assetsUrl };
  // A host's relative assetsUrl, such as "/pdf-sdk/", has no page to resolve
  // against during server rendering. So the default engine and processor are
  // created on first use, which is only ever in the browser, and only what
  // can be checked without a page is checked now.
  checkAssetsUrl(props.assetsUrl);
  const engine = props.engine ?? lazyEngine(() => createPdfJsEngine(assets));
  const processor = props.processor ?? lazyProcessor(() => createPdfProcessor(assets));
  const session = createPdfSession({
    engine,
    processor,
    ...(props.filePolicy ? { filePolicy: props.filePolicy } : {}),
    ...(props.onEvent ? { onEvent: props.onEvent } : {}),
  });
  return {
    session,
    dispose() {
      void session.close();
      // Only what the provider created itself is destroyed.
      if (!props.engine) void engine.destroy();
      if (!props.processor) void processor.destroy();
    },
  };
}

/** What {@link useProvidedSession} reads: the provider's session props. */
export type PdfSessionSource = Omit<PdfSessionProviderProps, "messages" | "locale" | "children">;

/**
 * The session a provider gives its components: the one passed in, or one it
 * creates from the options and releases when it unmounts. Shared by
 * `PdfSessionProvider` and `PdfEditor`, which builds its own messages.
 */
export function useProvidedSession(props: PdfSessionSource): PdfSession {
  const given = props.session;
  const [owned] = useState(() => (given ? undefined : own(props)));

  useEffect(() => {
    if (!owned) return;
    // React's development mode unmounts and mounts again at once, so the
    // disposal waits a tick, and a remount cancels it.
    const pending = (owned as Owned & { pending?: ReturnType<typeof setTimeout> }).pending;
    if (pending !== undefined) clearTimeout(pending);
    return () => {
      (owned as Owned & { pending?: ReturnType<typeof setTimeout> }).pending = setTimeout(
        () => owned.dispose(),
        0,
      );
    };
  }, [owned]);

  return given ?? (owned as Owned).session;
}

/**
 * Makes a PDF session and the SDK's text available to the components and
 * hooks below it, such as `PdfViewer` and `usePdfDocument` (ADR 0008).
 *
 * @example
 * ```tsx
 * <PdfSessionProvider locale="de" messages={{ "viewer.empty": "Kein Dokument geöffnet." }}>
 *   <PdfViewer />
 * </PdfSessionProvider>
 * ```
 *
 * @public
 */
export function PdfSessionProvider(props: PdfSessionProviderProps): ReactNode {
  const { messages: overrides, locale = "en", children } = props;
  const session = useProvidedSession(props);
  const messages = useMemo(
    () =>
      createMessages(pdfMessages, {
        locale,
        // Overrides are typed for hosts that write them as literals; at
        // runtime createMessages validates them and ignores what doesn't fit.
        // sdk-core 0.4.1 accepts them without this cast; it goes once ui
        // depends on sdk-core 0.4, so an application keeps one copy.
        ...(overrides ? { overrides: overrides as never } : {}),
      }),
    [locale, overrides],
  );
  const value = useMemo(() => ({ session, messages }), [session, messages]);
  return <PdfContext.Provider value={value}>{children}</PdfContext.Provider>;
}
