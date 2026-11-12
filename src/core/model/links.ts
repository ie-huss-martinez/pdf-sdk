const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * The URL, normalised, if it's an absolute `http`, `https` or `mailto` URL
 * (ADR 0012), and otherwise undefined. Every engine adapter filters links
 * with it, and the viewer checks again before rendering one.
 *
 * @public
 */
export function safeLinkUrl(url: string): string | undefined {
  if (typeof url !== "string" || url.length > 2048) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.href : undefined;
}
