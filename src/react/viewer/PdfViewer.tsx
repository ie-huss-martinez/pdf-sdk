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

  // Scroll anchoring, the same in every engine (WebKit has none of its own):
  // the page at the top of the viewer stays where it is on screen while
  // sizes above it change, as placeholders take their real size and the
  // first page measured replaces the estimate. A navigation sets the anchor
  // to its page, so it lands on that page however late sizes arrive.
  const anchor = useRef<{ key: string; offset: number }>(undefined);
  // The scroll position the viewer set itself, so its own scrolls don't
  // move the anchor; only the user's do.
  const own = useRef<number>(undefined);

  const findPage = useCallback(
    (key: string) =>
      root.current?.querySelector<HTMLElement>(`[data-hm-page-key="${CSS.escape(key)}"]`) ??
      undefined,
    [],
  );

  const scrollOwn = useCallback((element: HTMLElement, top: number) => {
    element.scrollTop = top;
    own.current = element.scrollTop;
  }, []);

  useEffect(() => {
    const element = pages.current;
    if (!element) return;
    // Runs after layout and before paint, so a restored position never shows
    // the shifted one first.
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
      const viewer = root.current;
      const held = anchor.current;
      if (!viewer || !held) return;
      const page = findPage(held.key);
      if (!page) {
        anchor.current = undefined;
        return;
      }
      const top = page.offsetTop - held.offset;
      if (Math.abs(viewer.scrollTop - top) >= 1) scrollOwn(viewer, top);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [findPage, scrollOwn]);

  // The current page follows scrolling: the last page whose top has passed a
  // third of the way down the viewer. The anchor follows the user's
  // scrolling: the last page whose top is at or above the viewer's top.
  // Measured once per animation frame.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const { scrollTop } = element;
      const line = scrollTop + element.clientHeight / 3;
      const user = own.current === undefined || Math.abs(scrollTop - own.current) >= 1;
      let current: HTMLElement | undefined;
      let top: HTMLElement | undefined;
      for (const page of element.querySelectorAll<HTMLElement>("[data-hm-page-key]")) {
        if (page.offsetTop > line) break;
        current = page;
        if (page.offsetTop <= scrollTop || !top) top = page;
      }
      if (user) {
        own.current = undefined;
        anchor.current = top && {
          key: top.dataset["hmPageKey"] as string,
          offset: top.offsetTop - scrollTop,
        };
      }
      const key = current?.dataset["hmPageKey"];
      if (key) session.setCurrentPage(key);
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
  // suits reduced motion, and anchors it there. Only a new request scrolls:
  // every snapshot has a new navigation object, but the same sequence number.
  const sequence = snapshot.navigation?.sequence;
  const target = snapshot.navigation?.page;
  useEffect(() => {
    const element = root.current;
    if (!element || sequence === undefined || target === undefined) return;
    const page = findPage(target);
    if (!page) return;
    const inset = Number.parseFloat(getComputedStyle(pages.current as Element).paddingTop) || 0;
    anchor.current = { key: target, offset: inset };
    scrollOwn(element, page.offsetTop - inset);
  }, [sequence, target, findPage, scrollOwn]);

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
