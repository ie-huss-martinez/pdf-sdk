import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PdfLink, PdfPageInfo, PdfTextContent } from "../../core/model/document.js";
import { linkDestination, safeLinkUrl } from "../../core/model/links.js";
import type { PdfPlanPage } from "../../core/model/plan.js";
import { usePdfMessages, usePdfSession } from "../hooks.js";
import { usePageDrawing } from "../use-page-drawing.js";
import { pageGeometry } from "./geometry.js";
import type { RenderQueue } from "./render-queue.js";
import type { PdfViewerClassNames } from "./types.js";

export interface PageProps {
  readonly page: PdfPlanPage;
  readonly number: number;
  readonly count: number;
  /** The page's CSS width on screen. */
  readonly displayWidth: number;
  /** A page size to lay out with until this page's own is known. */
  readonly estimate: { readonly width: number; readonly height: number };
  readonly observe: (element: Element, onNear: (near: boolean) => void) => () => void;
  readonly queue: RenderQueue;
  readonly onMeasured: (info: PdfPageInfo) => void;
  readonly classNames: PdfViewerClassNames;
}

const join = (...names: (string | undefined)[]) => names.filter(Boolean).join(" ");

/** One page: a placeholder of the right size, drawn only while near the viewport. */
export function PdfViewerPage(props: PageProps): ReactNode {
  const { page, number, count, displayWidth, estimate, observe, queue, onMeasured, classNames } =
    props;
  const session = usePdfSession();
  const messages = usePdfMessages();
  const element = useRef<HTMLDivElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [text, setText] = useState<PdfTextContent>();
  const [links, setLinks] = useState<readonly PdfLink[]>([]);
  const { canvas, info, drawn, failure } = usePageDrawing({
    session,
    pageKey: page.key,
    rotation: page.rotation,
    near,
    displayWidth,
    queue,
    onMeasured,
  });

  useEffect(() => (element.current ? observe(element.current, setNear) : undefined), [observe]);

  // The text and links, which don't depend on the zoom, read once.
  useEffect(() => {
    if (!near || text) return;
    const controller = new AbortController();
    const signal = controller.signal;
    Promise.all([
      session.getTextContent(page.key, { signal }),
      session.getLinks(page.key, { signal }),
    ]).then(
      ([content, found]) => {
        setText(content);
        setLinks(found);
      },
      () => {},
    );
    return () => controller.abort();
  }, [near, session, page.key, text]);

  const size = info ?? { ...estimate, rotation: 0 };
  const geometry = pageGeometry(size, info?.rotation ?? 0, displayWidth);

  // Each run of text is stretched to the width the document gives it, so
  // selections line up with the drawn glyphs.
  useLayoutEffect(() => {
    const layer = textLayer.current;
    if (!layer || !text) return;
    for (const span of layer.querySelectorAll<HTMLElement>("[data-hm-width]")) {
      span.style.transform = "";
      const natural = span.getBoundingClientRect().width;
      const wanted = Number(span.dataset["hmWidth"]) * geometry.pageWidth;
      if (natural > 0 && wanted > 0) span.style.transform = `scaleX(${wanted / natural})`;
    }
  }, [text, geometry.pageWidth]);

  const overlay = {
    width: `${geometry.pageWidth}px`,
    height: `${geometry.pageHeight}px`,
    transform: geometry.transform,
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a page is a labelled group, not a form fieldset
    <div
      ref={element}
      role="group"
      aria-label={messages.t("viewer.page", { page: number, count })}
      aria-busy={near && !drawn && !failure}
      className={join("hm-pdf-page", classNames.page)}
      data-hm-page-key={page.key}
      style={{ width: `${geometry.width}px`, height: `${geometry.height}px` }}
    >
      {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: the canvas is pixels only and never focusable; the text layer carries the words */}
      <canvas
        ref={canvas}
        aria-hidden="true"
        className={join("hm-pdf-page-canvas", classNames.canvas)}
      />
      {failure !== undefined ? (
        <p role="alert" className={join("hm-pdf-page-error", classNames.error)}>
          {messages.error(failure)}
        </p>
      ) : null}
      {near && text ? (
        <div
          ref={textLayer}
          className={join("hm-pdf-text-layer", classNames.textLayer)}
          style={overlay}
        >
          {text.items.map((item, index) => (
            <span
              // The items of a page never change order.
              // biome-ignore lint/suspicious/noArrayIndexKey: the index is the item's identity
              key={index}
              data-hm-width={item.rect.width}
              style={{
                left: `${item.rect.x * 100}%`,
                top: `${item.rect.y * 100}%`,
                fontSize: `${item.rect.height * geometry.pageHeight}px`,
                lineHeight: 1,
              }}
            >
              {item.text}
              {item.endOfLine ? "\n" : ""}
            </span>
          ))}
        </div>
      ) : null}
      {near && links.length > 0 ? (
        <div className={join("hm-pdf-link-layer", classNames.linkLayer)} style={overlay}>
          {links.map((link, index) => {
            // Checked again here, whatever the engine is (ADR 0012).
            const href = safeLinkUrl(link.url);
            const destination = href && linkDestination(href);
            if (!href || !destination) return null;
            const email = href.startsWith("mailto:");
            const label = email
              ? messages.t("viewer.emailLink", { destination })
              : messages.t("viewer.webLink", { destination });
            return (
              <a
                // biome-ignore lint/suspicious/noArrayIndexKey: links of a page never change order
                key={index}
                className={join("hm-pdf-link", classNames.link)}
                href={href}
                target={email ? undefined : "_blank"}
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                title={label}
                style={{
                  left: `${link.rect.x * 100}%`,
                  top: `${link.rect.y * 100}%`,
                  width: `${link.rect.width * 100}%`,
                  height: `${link.rect.height * 100}%`,
                }}
              >
                {/* The name says where the link really goes, whatever the page shows. */}
                <span className="hm-pdf-link-label">{label}</span>
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
