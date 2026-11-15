---
"@hussmartinez/pdf-sdk": patch
---

The session's snapshot store and undo history now come from `@hussmartinez/sdk-core`, shared with the other SDKs. Editing, undo, redo and memory trimming behave as before. One difference for code that calls `session.subscribe` directly: a listener that throws no longer stops the other listeners, or the edit that notified them. Its error is reported with `reportError` instead.
