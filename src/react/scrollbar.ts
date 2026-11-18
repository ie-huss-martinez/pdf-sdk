/**
 * How wide a vertical scrollbar of `container` is, in pixels, measured with a
 * hidden probe inside it, so the page's scrollbar styles and the container's
 * `scrollbar-width` apply. 0 with overlay scrollbars, which take no space.
 */
export function scrollbarThickness(container: HTMLElement): number {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position: absolute; top: 0; left: 0; width: 100px; height: 100px; overflow: scroll; visibility: hidden; pointer-events: none;";
  probe.style.setProperty(
    "scrollbar-width",
    getComputedStyle(container).getPropertyValue("scrollbar-width") || "auto",
  );
  container.append(probe);
  const thickness = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return thickness;
}

/**
 * The width to lay content out at inside `container`, a scroll container
 * whose content is `measured` pixels wide right now: as if its scrollbar
 * were always shown. Pages sized to a container's width get shorter when a
 * scrollbar that takes space appears; if that makes them fit, it goes, they
 * grow, and it comes back, every frame. Sizing them as if it were always
 * there keeps their width, whether it shows or not.
 */
export function steadyWidth(container: HTMLElement, measured: number, thickness: number): number {
  const style = getComputedStyle(container);
  const borders =
    Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);
  const shown = container.offsetWidth - container.clientWidth - borders;
  return Math.max(0, measured - Math.max(0, thickness - shown));
}
