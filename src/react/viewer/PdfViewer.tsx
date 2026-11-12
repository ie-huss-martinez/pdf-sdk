import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { PdfPageInfo } from "../../core/model/document.js";
import { usePdfDocument, usePdfMessages, usePdfSession } from "../hooks.js";
import { useNearObserver } from "../use-near-observer.js";
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
  const observe = useNearObserver(root);
  const session = usePdfSession();

  useEffect(() => {
    const element = pages.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The current page follows scrolling: the last page whose top has passed a
  // third of the way down the viewer. Measured once per animation frame.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = element.scrollTop + element.clientHeight / 3;
      let current: string | undefined;
      for (const page of element.querySelectorAll<HTMLElement>("[data-hm-page-key]")) {
        if (page.offsetTop > line) break;
        current = page.dataset["hmPageKey"];
      }
      if (current) session.setCurrentPage(current);
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(measure);
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [session]);

  // A navigation request scrolls its page to the top, at once, which also
  // suits reduced motion. Only a new request scrolls: every snapshot has a
  // new navigation object, but the same sequence number.
  const sequence = snapshot.navigation?.sequence;
  const target = snapshot.navigation?.page;
  useEffect(() => {
    const element = root.current;
    if (!element || sequence === undefined || target === undefined) return;
    const page = element.querySelector<HTMLElement>(`[data-hm-page-key="${CSS.escape(target)}"]`);
    if (!page) return;
    const inset = Number.parseFloat(getComputedStyle(pages.current as Element).paddingTop) || 0;
    element.scrollTo({ top: page.offsetTop - inset, behavior: "auto" });
  }, [sequence, target]);

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
