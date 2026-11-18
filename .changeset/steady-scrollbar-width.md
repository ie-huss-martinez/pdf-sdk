---
"@hussmartinez/pdf-sdk": patch
---

`PdfViewer` and `PdfThumbnails` no longer flicker when their content only just overflows, with scrollbars that take space: on Windows, or with "always show scrollbars" on macOS or Linux. Before, at certain heights, a scrollbar appeared, the pages narrowed and fit, the scrollbar went, and the pages widened again, every frame.

Pages and thumbnails are now sized as if the scrollbar were always shown, using its measured width. Overlay scrollbars take no space, so nothing changes with them.
