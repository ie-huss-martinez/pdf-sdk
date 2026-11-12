import { type RefObject, useCallback, useEffect, useRef } from "react";

/**
 * One `IntersectionObserver` for every page of a scrolling container: a
 * page counts as near within one container height above or below it, so it
 * can be drawn before it scrolls into view. Returns the function pages
 * register with.
 */
export function useNearObserver(
  root: RefObject<Element | null>,
): (element: Element, onNear: (near: boolean) => void) => () => void {
  const observer = useRef<IntersectionObserver>(undefined);
  const callbacks = useRef(new Map<Element, (near: boolean) => void>());

  useEffect(() => {
    const created = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) callbacks.current.get(entry.target)?.(entry.isIntersecting);
      },
      { root: root.current, rootMargin: "100% 0px" },
    );
    observer.current = created;
    for (const element of callbacks.current.keys()) created.observe(element);
    return () => created.disconnect();
  }, [root]);

  return useCallback((element: Element, onNear: (near: boolean) => void) => {
    callbacks.current.set(element, onNear);
    observer.current?.observe(element);
    return () => {
      callbacks.current.delete(element);
      observer.current?.unobserve(element);
    };
  }, []);
}
