---
"@hussmartinez/pdf-sdk": minor
---

`PdfEditor` has a toolbar, built from `@hussmartinez/ui` 0.3's components, and keyboard shortcuts.

- **Tools:** open a PDF, undo, redo, and rotate the selected pages, or the current one, left or right. `pdfTools` lists them; choose which are present with the new `tools` prop, such as `tools={["pdf.undo", "pdf.redo"]}`, and arrange the toolbar with `toolbar`, as groups of tool ids. `toolbar={[]}` hides the toolbar and keeps the shortcuts. An unknown tool id throws when the editor renders. `icons` replaces any icon by name.
- **Shortcuts:** `Ctrl+Z` and `Ctrl+Shift+Z` or `Ctrl+Y` (`⌘Z` and `⇧⌘Z` on Apple platforms) undo and redo, and `[` and `]` rotate. They work only while focus is inside the editor, never while typing in a field, and each toolbar button names its shortcut in `aria-keyshortcuts`.
- **Announcements:** undoing, redoing and rotating are announced to screen readers, as opening and closing already were, through ui's announcer.
- **Building blocks:** `PdfToolbar` renders a toolbar for your own layout, and `pdfIcons` is the icon set the tools use.
- **Thumbnails:** a fix: thumbnails no longer shrink to the minimum target size when ui's stylesheet is loaded, and the sidebar is five control heights wide, so it follows ui's density.

**`@hussmartinez/ui` is now a dependency, and its stylesheet is required.** Import `@hussmartinez/ui/styles.css` once, before `@hussmartinez/pdf-sdk/styles.css`: the toolbar's focus rings and target sizes are in it. If your application uses ui itself, depend on the same minor version, `^0.3.0`, and check that `npm ls @hussmartinez/ui` lists a single version. The headless `.` entry doesn't import ui or React.
