import uiStylesUrl from "@hussmartinez/ui/styles.css?url";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import stylesUrl from "../src/styles.css?url";

// Tells React these tests wrap updates in act(), as a test environment does.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: Array<() => void | Promise<void>> = [];

/** How long each of {@link waitFor}'s act() slices waits, in milliseconds. */
const SLICE = 20;

/**
 * `vi.waitFor`, but with the waiting between attempts done inside `act()`.
 * Engines, workers and observers update the components while a test waits,
 * so those updates happen in an act scope and React doesn't warn about them.
 * Each slice is short, because React applies what was queued in a scope only
 * when it ends, and the next step, such as an effect that starts a drawing,
 * needs it. Attempts follow each other with no pause outside `act()`.
 */
export function waitFor<T>(
  callback: () => T | Promise<T>,
  { timeout }: { readonly timeout?: number } = {},
): Promise<T> {
  return vi.waitFor(
    async () => {
      await act(() => new Promise((resolve) => setTimeout(resolve, SLICE)));
      return callback();
    },
    { interval: 0, ...(timeout === undefined ? {} : { timeout }) },
  );
}

/** Undoes everything mount() and loadStyles() did. Call it in afterEach. */
export async function cleanUp(): Promise<void> {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
}

/** What {@link loadStyles} loads. */
export interface StyleOptions {
  /**
   * Load `@hussmartinez/ui/styles.css` first, as hosts must (sdk-core ADR
   * 0036). Defaults to true; false checks what still holds without it.
   */
  readonly ui?: boolean;
}

async function loadStylesheet(href: string): Promise<void> {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  await new Promise((resolve) => {
    link.addEventListener("load", resolve, { once: true });
    document.head.append(link);
  });
  cleanups.push(() => link.remove());
}

/** Loads ui's styles.css, unless `ui` is false, then the package's. */
export async function loadStyles({ ui = true }: StyleOptions = {}): Promise<void> {
  if (ui) await loadStylesheet(uiStylesUrl);
  await loadStylesheet(stylesUrl);
}

/** Mounts a tree in a box of the given CSS, with the styles a host loads. */
export async function mount(
  tree: ReactNode,
  css = "width: 800px; height: 600px; display: grid; grid-template-rows: minmax(0, 1fr);",
  styles: StyleOptions = {},
) {
  await loadStyles(styles);
  const container = document.createElement("div");
  container.style.cssText = css;
  document.body.append(container);
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(container);
    root.render(tree);
  });
  cleanups.push(() => {
    act(() => root?.unmount());
    container.remove();
  });
  return container;
}
