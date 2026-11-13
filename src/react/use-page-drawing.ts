import { type RefObject, useEffect, useRef, useState } from "react";
import type { PdfPageInfo } from "../core/model/document.js";
import type { PdfSession } from "../core/session/session.js";
import type { RenderQueue } from "./viewer/render-queue.js";

/** What {@link usePageDrawing} needs. */
export interface PageDrawingOptions {
  readonly session: PdfSession;
  readonly pageKey: string;
  /** The plan's rotation of the page, so a change re-reads its size. */
  readonly rotation: number;
  /** Whether the page is near the viewport, and should be drawn. */
  readonly near: boolean;
  /** The page's CSS width on screen. */
  readonly displayWidth: number;
  readonly queue: RenderQueue;
  /** Called with the page's size and rotation once they're read. */
  readonly onMeasured?: (info: PdfPageInfo) => void;
}

/**
 * Shows a finished drawing: the visible canvas takes the buffer's size and
 * pixels in one task, so the browser never paints it cleared.
 */
function present(buffer: HTMLCanvasElement, target: HTMLCanvasElement): void {
  target.width = buffer.width;
  target.height = buffer.height;
  target.style.width = buffer.style.width;
  target.style.height = buffer.style.height;
  target.getContext("2d")?.drawImage(buffer, 0, 0);
}

/** A page's drawing state. */
export interface PageDrawing {
  readonly canvas: RefObject<HTMLCanvasElement | null>;
  readonly info: PdfPageInfo | undefined;
  readonly drawn: boolean;
  readonly failure: unknown;
}

/**
 * Draws one plan page into a canvas while it's near the viewport (docs/adr/0003):
 * reads its size when it first comes near and when its rotation changes,
 * queues the drawing with the component's other pages, redraws when its
 * size changes, cancels when it leaves, and gives the canvas's pixels back.
 * Shared by the viewer and the thumbnails.
 */
export function usePageDrawing(options: PageDrawingOptions): PageDrawing {
  const { session, pageKey, rotation, near, displayWidth, queue, onMeasured } = options;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState<PdfPageInfo>();
  const [drawn, setDrawn] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const measured = useRef(onMeasured);
  measured.current = onMeasured;

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new rotation must re-read the page
  useEffect(() => {
    if (!near) return;
    const controller = new AbortController();
    session.getPage(pageKey, { signal: controller.signal }).then(
      (read) => {
        setInfo(read);
        measured.current?.(read);
      },
      (reason: unknown) => {
        if (!controller.signal.aborted) setFailure(reason);
      },
    );
    return () => controller.abort();
  }, [near, session, pageKey, rotation]);

  useEffect(() => {
    const target = canvas.current;
    if (!near || !info || !target || displayWidth <= 0) return;
    const turned = info.rotation === 90 || info.rotation === 270;
    const scale = displayWidth / (turned ? info.height : info.width);
    const render = queue.schedule(async (signal) => {
      // Drawn off screen, then copied in at once: an engine sizes its canvas
      // when it starts, which clears it, so drawing on screen would show a
      // blank page until the redraw finishes, as when the width settles.
      const buffer = document.createElement("canvas");
      try {
        await session.renderPage(pageKey, buffer, {
          scale,
          pixelRatio: globalThis.devicePixelRatio || 1,
          signal,
        });
        if (!signal.aborted) {
          present(buffer, target);
          setDrawn(true);
          setFailure(undefined);
        }
      } catch (reason) {
        if (!signal.aborted) setFailure(reason);
      } finally {
        // Its pixels are copied or not needed; give them back now.
        buffer.width = 0;
        buffer.height = 0;
      }
    });
    return () => render.cancel();
  }, [near, info, displayWidth, session, pageKey, queue]);

  // A page that scrolls away gives its pixels back.
  useEffect(() => {
    if (near) return;
    const target = canvas.current;
    if (target) {
      target.width = 0;
      target.height = 0;
    }
    setDrawn(false);
  }, [near]);

  return { canvas, info, drawn, failure };
}
