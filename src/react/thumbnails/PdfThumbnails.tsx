import {
  Component,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { PdfPageInfo } from "../../core/model/document.js";
import type { PdfPlanPage } from "../../core/model/plan.js";
import type { PdfSession } from "../../core/session/session.js";
import { usePdfDocument, usePdfMessages, usePdfSession } from "../hooks.js";
import { useNear, useNearObserver } from "../use-near-observer.js";
import { usePageDrawing } from "../use-page-drawing.js";
import { pageGeometry } from "../viewer/geometry.js";
import { RenderQueue } from "../viewer/render-queue.js";

/**
 * The parts of `PdfThumbnails` that take extra classes through `classNames`.
 *
 * @public
 */
export type PdfThumbnailsPart = "root" | "thumbnail" | "frame" | "canvas" | "number";

/**
 * Props for {@link PdfThumbnails}.
 *
 * @public
 */
export interface PdfThumbnailsProps {
  /** Extra classes on the root. */
  readonly className?: string;
  /** Extra classes on each part. */
  readonly classNames?: Readonly<Partial<Record<PdfThumbnailsPart, string>>>;
  /** Drop the visual styles, keeping layout and accessibility. */
  readonly unstyled?: boolean;
  /** How many thumbnails are drawn at once. Defaults to 2. */
  readonly concurrency?: number;
  /**
   * Runs when the user presses Delete or Backspace in the list, such as the
   * editor's delete tool. Without it, those keys do nothing here.
   */
  readonly onDelete?: () => void;
  /**
   * Runs when the user presses Alt+↑ or Alt+↓ (Option on macOS) in the list,
   * such as the editor's move tools. Without it, those keys do nothing here.
   */
  readonly onMove?: (direction: "earlier" | "later") => void;
}

const LETTER = { width: 612, height: 792 };

/** The key of the thumbnail in `root` that has focus, if one has. */
function focusedThumbnail(root: HTMLElement | null): string | undefined {
  if (!root) return undefined;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return undefined;
  return active.dataset["hmPageKey"];
}

interface FocusKeeperProps {
  readonly root: RefObject<HTMLDivElement | null>;
  readonly keys: readonly string[];
  /** Where focus goes if the focused thumbnail left the plan. */
  readonly fallback: string | undefined;
}

/**
 * Keeps focus in the list when the thumbnail that has it is moved, which
 * takes focus from it in some browsers, or leaves the plan: deleted, or
 * undone (docs/adr/0008). Focus goes back to it, or to the current page's
 * thumbnail, never to the page's body.
 *
 * A class, for `getSnapshotBeforeUpdate`: React calls it for the whole tree
 * before a commit changes the DOM, so it reads which thumbnail had focus
 * without reading the DOM or writing a ref during render. It covers every
 * way a thumbnail can move or go: keys, the toolbar, undo and the host's
 * own calls. If focus was elsewhere, such as on the host's page, nothing
 * was recorded and nothing is taken back. It renders nothing.
 */
class FocusKeeper extends Component<FocusKeeperProps> {
  override getSnapshotBeforeUpdate(): string | null {
    return focusedThumbnail(this.props.root.current) ?? null;
  }

  override componentDidUpdate(
    _props: FocusKeeperProps,
    _state: unknown,
    focused: string | null,
  ): void {
    const element = this.props.root.current;
    if (!focused || !element) return;
    const now = document.activeElement;
    if (now !== null && now !== document.body) return;
    const target = this.props.keys.includes(focused) ? focused : this.props.fallback;
    if (!target) return;
    element.querySelector<HTMLElement>(`[data-hm-page-key="${CSS.escape(target)}"]`)?.focus();
  }

  override render(): null {
    return null;
  }
}
const join = (...names: (string | undefined)[]) => names.filter(Boolean).join(" ");

interface ThumbnailProps {
  readonly page: PdfPlanPage;
  readonly index: number;
  readonly count: number;
  readonly id: string;
  readonly selected: boolean;
  readonly current: boolean;
  readonly active: boolean;
  readonly displayWidth: number;
  readonly estimate: { readonly width: number; readonly height: number };
  readonly observe: (element: Element, onNear: (near: boolean) => void) => () => void;
  readonly queue: RenderQueue;
  readonly session: PdfSession;
  readonly onMeasured: (info: PdfPageInfo) => void;
  readonly onPointer: (index: number, event: MouseEvent) => void;
  readonly classNames: Readonly<Partial<Record<PdfThumbnailsPart, string>>>;
}

function Thumbnail(props: ThumbnailProps): ReactNode {
  const { page, index, count, id, selected, current, active, displayWidth, classNames } = props;
  const messages = usePdfMessages();
  const element = useRef<HTMLDivElement>(null);
  const near = useNear(props.observe, element, displayWidth > 0);
  const { canvas, info, drawn } = usePageDrawing({
    session: props.session,
    pageKey: page.key,
    rotation: page.rotation,
    near,
    displayWidth,
    queue: props.queue,
    onMeasured: props.onMeasured,
  });
  const geometry = pageGeometry(info ?? { ...props.estimate }, info?.rotation ?? 0, displayWidth);

  return (
    // The listbox handles the keyboard for every option (ADR 0014), as the
    // WAI-ARIA listbox pattern does with roving focus.
    // biome-ignore lint/a11y/useKeyWithClickEvents: the parent listbox handles keys for its options
    <div
      ref={element}
      id={id}
      role="option"
      aria-selected={selected}
      aria-current={current ? "true" : undefined}
      aria-label={messages.t("thumbnails.page", { page: index + 1, count })}
      aria-busy={near && !drawn}
      tabIndex={active ? 0 : -1}
      className={join("hm-pdf-thumbnail", classNames.thumbnail)}
      data-hm-page-key={page.key}
      onClick={(event) => props.onPointer(index, event)}
    >
      <div
        className={join("hm-pdf-thumbnail-frame", classNames.frame)}
        style={{ width: `${geometry.width}px`, height: `${geometry.height}px` }}
      >
        {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: the canvas is pixels only and never focusable */}
        <canvas
          ref={canvas}
          aria-hidden="true"
          className={join("hm-pdf-thumbnail-canvas", classNames.canvas)}
        />
      </div>
      <span aria-hidden="true" className={join("hm-pdf-thumbnail-number", classNames.number)}>
        {messages.t("thumbnails.number", { page: index + 1 })}
      </span>
    </div>
  );
}

/**
 * A column of page thumbnails to see the whole document and choose pages
 * (ADR 0014): a listbox with several pages selectable, where the selection
 * follows focus and the chosen page is brought into view in `PdfViewer`.
 * Like the viewer, it only draws the thumbnails near its viewport.
 *
 * Keyboard: the arrow keys, Home and End move to a page, select it and show
 * it; with Shift they extend the selection; with Ctrl or ⌘ they move without
 * selecting, and Space then adds or removes the page. Ctrl or ⌘ + A selects
 * every page, and Escape keeps only the focused one. Delete and Backspace,
 * and Alt or Option with ↑ and ↓, run `onDelete` and `onMove` when given.
 * With a pointer: click,
 * Ctrl or ⌘ + click, and Shift + click.
 *
 * @public
 */
export function PdfThumbnails(props: PdfThumbnailsProps): ReactNode {
  const { className, classNames = {}, unstyled = false, concurrency = 2, onDelete, onMove } = props;
  const session = usePdfSession();
  const snapshot = usePdfDocument();
  const messages = usePdfMessages();
  const root = useRef<HTMLDivElement>(null);
  const prefix = useId();
  const observe = useNearObserver(root);
  const [queue] = useState(() => new RenderQueue(concurrency));
  const [width, setWidth] = useState(0);
  const [estimate, setEstimate] = useState(LETTER);
  const [activeKey, setActiveKey] = useState<string>();
  const anchor = useRef<string | undefined>(undefined);
  const { plan, selection, currentPage } = snapshot;
  const keys = plan.pages.map((page) => page.key);
  const active = activeKey && keys.includes(activeKey) ? activeKey : (currentPage ?? keys[0]);
  const activeIndex = active ? keys.indexOf(active) : -1;

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Follows the viewer: the current page's thumbnail scrolls into view,
  // unless the user is working in this list.
  useEffect(() => {
    const element = root.current;
    if (!element || !currentPage || element.contains(document.activeElement)) return;
    element
      .querySelector<HTMLElement>(`[data-hm-page-key="${CSS.escape(currentPage)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [currentPage]);

  const onMeasured = useCallback((info: PdfPageInfo) => {
    setEstimate((current) =>
      current === LETTER ? { width: info.width, height: info.height } : current,
    );
  }, []);

  const focus = (index: number) => {
    const key = keys[index];
    if (!key) return;
    setActiveKey(key);
    root.current?.querySelector<HTMLElement>(`[data-hm-page-key="${CSS.escape(key)}"]`)?.focus();
  };

  /** Selects from the anchor to `index`, or `index` alone, and shows the page. */
  const choose = (index: number, mode: "only" | "range" | "toggle" | "focus") => {
    const key = keys[index];
    if (!key) return;
    focus(index);
    if (mode === "focus") return;
    if (mode === "toggle") {
      session.select(
        selection.includes(key) ? selection.filter((k) => k !== key) : [...selection, key],
      );
      anchor.current = key;
      return;
    }
    if (mode === "range" && anchor.current && keys.includes(anchor.current)) {
      const from = keys.indexOf(anchor.current);
      const [start, end] = from < index ? [from, index] : [index, from];
      session.select(keys.slice(start, end + 1));
    } else {
      session.select([key]);
      anchor.current = key;
    }
    session.goToPage(key);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (keys.length === 0) return;
    const modifier = event.ctrlKey || event.metaKey;
    // Alt or Option with ↑ or ↓ moves pages, and never moves focus.
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      if (onMove && !modifier && !event.shiftKey) {
        event.preventDefault();
        onMove(event.key === "ArrowUp" ? "earlier" : "later");
      }
      return;
    }
    const move = (index: number) => {
      event.preventDefault();
      const target = Math.max(0, Math.min(keys.length - 1, index));
      choose(target, event.shiftKey ? "range" : modifier ? "focus" : "only");
    };
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        move(activeIndex + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        move(activeIndex - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(keys.length - 1);
        break;
      case " ":
        event.preventDefault();
        if (activeIndex >= 0) choose(activeIndex, "toggle");
        break;
      case "Escape":
        if (active) session.select([active]);
        break;
      case "Delete":
      case "Backspace":
        if (onDelete && !event.altKey && !modifier && !event.shiftKey) {
          event.preventDefault();
          onDelete();
        }
        break;
      case "a":
      case "A":
        if (modifier) {
          event.preventDefault();
          session.select(keys);
        }
        break;
    }
  };

  const onPointer = (index: number, event: MouseEvent) => {
    choose(index, event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "only");
  };

  return (
    <div
      ref={root}
      role="listbox"
      aria-label={messages.t("thumbnails.label")}
      aria-multiselectable="true"
      aria-orientation="vertical"
      tabIndex={keys.length === 0 ? 0 : -1}
      onKeyDown={onKeyDown}
      className={join("hm-pdf-thumbnails", className, classNames.root)}
      {...(unstyled ? { "data-hm-unstyled": "" } : {})}
    >
      {plan.pages.map((page, index) => (
        <Thumbnail
          key={page.key}
          page={page}
          index={index}
          count={keys.length}
          id={`${prefix}-${page.key}`}
          selected={selection.includes(page.key)}
          current={page.key === currentPage}
          active={page.key === active}
          displayWidth={width}
          estimate={estimate}
          observe={observe}
          queue={queue}
          session={session}
          onMeasured={onMeasured}
          onPointer={onPointer}
          classNames={classNames}
        />
      ))}
      <FocusKeeper root={root} keys={keys} fallback={active} />
    </div>
  );
}
