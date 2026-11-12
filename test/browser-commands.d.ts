// Browser commands defined in vitest.config.ts.
declare module "vitest/browser" {
  interface BrowserCommands {
    /** Starts recording every request the browser makes. */
    startRecordingRequests: () => Promise<void>;
    /** Stops recording, and returns the URLs requested since it started. */
    stopRecordingRequests: () => Promise<string[]>;
  }
}

export {};
