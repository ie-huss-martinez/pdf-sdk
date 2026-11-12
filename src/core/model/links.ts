const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * The URL, normalised, if it's an absolute `http`, `https` or `mailto` URL
 * without credentials (ADR 0012), and otherwise undefined. Every engine
 * adapter filters links with it, and the viewer checks again before
 * rendering one.
 *
 * URLs with a user name or password are refused: in
 * `https://bank.example@evil.example/`, the part a reader notices is a user
 * name, and the link goes to `evil.example`, a common phishing shape.
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
  if (!SAFE_PROTOCOLS.has(parsed.protocol)) return undefined;
  if (parsed.username !== "" || parsed.password !== "") return undefined;
  return parsed.href;
}

/**
 * What a link really leads to, for people to check before following it: the
 * host of a web link, without `www.`, or the address of an email link.
 * Undefined for a URL `safeLinkUrl` refuses.
 *
 * @public
 */
export function linkDestination(url: string): string | undefined {
  const safe = safeLinkUrl(url);
  if (!safe) return undefined;
  const parsed = new URL(safe);
  if (parsed.protocol === "mailto:") {
    return decodeURIComponent(parsed.pathname) || undefined;
  }
  return parsed.hostname.replace(/^www\./, "");
}
