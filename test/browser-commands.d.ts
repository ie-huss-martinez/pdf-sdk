// Browser commands defined in vitest.config.ts.
declare module "vitest/browser" {
  interface BrowserCommands {
    /** Starts recording every request the browser makes. */
    startRecordingRequests: () => Promise<void>;
    /**
     * Stops recording, and returns the requests made since it started, with
     * Playwright's resource type, such as "script", "fetch" or "xhr".
     */
    stopRecordingRequests: () => Promise<{ url: string; type: string }[]>;
  }
}

export {};
