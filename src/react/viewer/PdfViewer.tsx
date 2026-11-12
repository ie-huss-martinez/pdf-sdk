import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { PdfPageInfo } from "../../core/model/document.js";
import { usePdfDocument, usePdfMessages } from "../hooks.js";
import { PdfViewerPage } from "./PdfViewerPage.js";
import { RenderQueue } from "./render-queue.js";
import type { PdfViewerClassNames } from "./types.js";

/**
 * Props for {@link PdfViewer}.
 *
 * @public
 */
export interface PdfViewerProps {
  /** Extra classes on the root. */
  readonly className?: string;
  /** Extra classes on each part. */
  readonly classNames?: PdfViewerClassNames;
  /** Drop the visual styles, keeping layout and accessibility. */
  readonly unstyled?: boolean;
  /** Page width relative to the viewer's width. Defaults to 1, fitting the width. */
  readonly zoom?: number;
  /** How many page renders run at once. Defaults to 2. */
  readonly concurrency?: number;
}

/** US Letter, until the first page's size is known. */
const LETTER = { width: 612, height: 792 };

const join = (...names: (string | undefined)[]) => names.filter(Boolean).join(" ");

/**
 * Shows the session's pages in a scrolling column (docs/adr/0003): each page
 * keeps its place at the right size, and only pages near the viewport are
 * drawn, a few at a time. Pages that scroll away are cancelled or give their
 * pixels back. The text is selectable, for copying and for screen readers,
 * and links are real links, limited to safe URLs and labelled with where
 * they lead (ADR 0012, ADR 0014).
 *
 * The viewer is a focusable region, so keyboard users scroll it with the
 * arrow, Page Up, Page Down, Home and End keys.
 *
 * @public
 */
export function PdfViewer(props: PdfViewerProps): ReactNode {
  const { className, classNames = {}, unstyled = false, zoom = 1, concurrency = 2 } = props;
  const snapshot = usePdfDocument();
  const messages = usePdfMessages();
  const root = useRef<HTMLElement>(null);
  const pages = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [estimate, setEstimate] = useState(LETTER);
  const [queue] = useState(() => new RenderQueue(concurrency));
  const observers = useRef<IntersectionObserver>(undefined);
  const callbacks = useRef(new Map<Element, (near: boolean) => void>());

  useEffect(() => {
    const element = pages.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // One observer for every page: a page counts as near within one viewport
  // height above or below, so it's drawn before it scrolls into view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) callbacks.current.get(entry.target)?.(entry.isIntersecting);
      },
      { root: root.current, rootMargin: "100% 0px" },
    );
    observers.current = observer;
    for (const element of callbacks.current.keys()) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const observe = useCallback((element: Element, onNear: (near: boolean) => void) => {
    callbacks.current.set(element, onNear);
    observers.current?.observe(element);
    return () => {
      callbacks.current.delete(element);
      observers.current?.unobserve(element);
    };
  }, []);

  const onMeasured = useCallback((info: PdfPageInfo) => {
    setEstimate((current) =>
      current === LETTER ? { width: info.width, height: info.height } : current,
    );
  }, []);

  const { plan } = snapshot;
  const displayWidth = Math.max(0, width * zoom);

  return (
    <section
      ref={root}
      // A scrollable region keyboard users can focus (ADR 0014).
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the region scrolls, so it must take focus
      tabIndex={0}
      aria-label={messages.t("viewer.label")}
      className={join("hm-pdf-viewer", className, classNames.root)}
      {...(unstyled ? { "data-hm-unstyled": "" } : {})}
    >
      <div ref={pages} className={join("hm-pdf-viewer-pages", classNames.pages)}>
        {plan.pages.length === 0 ? (
          <p className={join("hm-pdf-viewer-empty", classNames.empty)}>
            {messages.t("viewer.empty")}
          </p>
        ) : (
          plan.pages.map((page, index) => (
            <PdfViewerPage
              key={page.key}
              page={page}
              number={index + 1}
              count={plan.pages.length}
              displayWidth={displayWidth}
              estimate={estimate}
              observe={observe}
              queue={queue}
              onMeasured={onMeasured}
              classNames={classNames}
            />
          ))
        )}
      </div>
    </section>
  );
}
