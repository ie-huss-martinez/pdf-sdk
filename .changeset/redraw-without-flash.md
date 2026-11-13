---
"@hussmartinez/pdf-sdk": patch
---

Pages no longer flash blank while they redraw. When the viewer's or thumbnails' width changes, for example as a scrollbar appears or the window is resized, each page keeps showing its previous drawing until the new one is ready, and then switches to it at once.
