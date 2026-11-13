import { type Platform, platformOf } from "@hussmartinez/sdk-core";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const onClient = (): Platform => platformOf(globalThis.navigator);
const onServer = (): Platform => "other";

/**
 * The platform for shortcut labels. A server can't know it, so the server
 * and hydration render `"other"`, and Apple platforms switch to their keys
 * right after, without a hydration mismatch.
 */
export function usePlatform(): Platform {
  return useSyncExternalStore(subscribe, onClient, onServer);
}
