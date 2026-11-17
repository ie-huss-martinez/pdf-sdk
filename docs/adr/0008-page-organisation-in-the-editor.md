# 0008. Organising pages in the editor: delete, move and insert

- **Status:** Accepted
- **Date:** 2026-11-17
- **Builds on:** [ADR 0003](0003-page-plan-document-model.md) (the page plan) and [ADR 0004](0004-pdf-limits.md) (limits); in sdk-core, [ADR 0010](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0010-edits-as-commands.md) (edits as commands), [ADR 0014](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0014-accessibility-and-translatable-text.md) (accessibility), [ADR 0020](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0020-file-policy.md) (file policy) and [ADR 0030](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0030-tools-and-keyboard-shortcuts.md) (tools and shortcuts)

## Context

The session already has the commands to organise a document:
- `pdf.deletePages` and `pdf.restorePages` delete pages and put them back;
- `pdf.movePages` and `pdf.reorderPages` move pages;
- `session.insert()` runs `pdf.insertPages` to add pages from another file.

`PdfEditor` exposes none of them: its toolbar opens, undoes, redoes and rotates. The pdf-editor app can't replace the live app until users can delete, move and insert pages, and merging two files is inserting one into the other.

Four questions need one answer across these tools:
- **Which keys,** given that the thumbnails listbox already uses the arrow keys and Ctrl or ⌘ with them, and that browsers and operating systems reserve many modifier combinations.
- **What is selected afterwards,** and where focus goes, so keyboard and screen reader users keep their place.
- **What undo restores:** the pages, and also the selection and focus that went with them.
- **What the file policy means** when a second file joins the document.

## Decision

### Tools

Each tool is a folder under `src/features/` registered with `defineTool`. Each acts on the selected pages, or on the current page when none is selected (`targetPages`), as the rotate tools do.

| Tool | Command | Toolbar group | Enabled when |
|---|---|---|---|
| `pdf.delete-pages` | `pdf.deletePages` | pages | there are targets, and at least one page would remain |
| `pdf.move-earlier` | `pdf.movePages` | pages | there are targets, and they aren't already one block at the start |
| `pdf.move-later` | `pdf.movePages` | pages | there are targets, and they aren't already one block at the end |
| `pdf.insert-pages` | `session.insert()` | file | a document is open and no insert is running |

**Moving:**
- A selection that isn't contiguous is gathered into one block in plan order, so pressing a move key twice never scatters pages.
- "Move earlier" puts the block one position before its first page; "Move later" puts it one position after its last page.
- Each press is one command, so one undo step.

**Inserting:**
- The insert tool opens the file picker. It inserts every page of the chosen file after the current page, or at the end when there's no current page.
- Choosing which pages to insert needs a dialog. It's left for later, and the session's `pageIndexes` option already supports it.

**The guaranteed path:** the toolbar buttons are the one path that always works: with a pointer, by keyboard, and on narrow screens where the thumbnails are hidden. Shortcuts are additions.

### Keys

Delete and move change the visible selection, and the arrow keys mean "scroll" in the viewer. So their keys work **only while focus is in the thumbnails listbox**, where the selection is shown. They are not editor-wide shortcuts.

The toolbar buttons still advertise the keys with `aria-keyshortcuts`. The tools register no shortcut of their own in the editor's registry, so the keys never fire from the viewer.

| Action | Keys (Windows, Linux) | Keys (macOS) |
|---|---|---|
| Delete the targets | Delete, or Backspace | Delete (⌫), or Fn+Delete (⌦) |
| Move earlier | Alt+↑ | Option+↑ |
| Move later | Alt+↓ | Option+↓ |
| Insert pages | no key | no key |

The thumbnails' existing keys don't change:
- the arrows, Home and End move and select;
- Shift extends the selection;
- Ctrl or ⌘ with an arrow moves without selecting;
- Space adds or removes a page;
- Ctrl or ⌘+A selects every page;
- Escape keeps only the focused page.

Every key the listbox handles has its default prevented, and none is handled in a text field.

#### Checked against browser and system defaults

Each key was checked on 2026-11-17 against these sources:
- Chrome's published shortcuts for Windows, Linux and macOS;
- Firefox's key definitions (`browser/base/content/browser-sets.inc.xhtml`), because its support page couldn't be read;
- Safari's published shortcuts;
- macOS's published system shortcuts;
- Windows' published shortcuts;
- GNOME's published shell shortcuts.

Rows marked † are well-known conflicts that those sources don't list.

| Combination | Taken by | Outcome |
|---|---|---|
| Alt+← / Alt+→ | Back and Forward in Chrome and Firefox on Windows and Linux | Not used |
| ⌘+← / ⌘+→ | Back and Forward in Firefox on macOS | Not used |
| Alt+Home | Home page in Chrome on Windows and Linux, and in Firefox on every platform (Option+Home on macOS) | Not used, so no "move to start" key |
| Alt+Page Up / Alt+Page Down | Scrolling by a screen, in Windows' list | Not used, so no "move to end" key either |
| Alt+Shift+arrows | Moving tiles and taskbar icons in Windows; Alt+Shift alone switches the keyboard layout when there are several † | Not used |
| Ctrl+Alt+arrows, Shift+Ctrl+Alt+arrows | Workspace switching in some Linux desktops; screen rotation with some Windows graphics drivers † | Not used |
| Ctrl+↑ / Ctrl+↓ on macOS | Mission Control and App Exposé | Not used; the listbox's existing "move without selecting" uses ⌘ on macOS |
| ⌘+Option+arrows | Switching tabs and cycling focus to toolbars in Chrome on macOS | Not used |
| **Alt+↑ / Alt+↓** | No browser shortcut in Chrome or Firefox. Windows binds Alt+↑ only inside File Explorer. GNOME binds nothing. | **Used** |
| **Option+↑ / Option+↓** | Scrolling by a screen in Safari and Firefox on macOS: a page default, which the focused listbox prevents. In text fields, paragraph navigation, and the listbox isn't one. | **Used** |
| **Delete, Backspace** | Firefox's `cmd_delete` and `cmd_handleBackspace` are declared `reserved="false"`, so pages may handle them. Chrome no longer goes back on Backspace †. Neither is a browser shortcut in Safari. | **Used**, only in the listbox |

Screen readers put a listbox in focus mode, so NVDA and JAWS pass these keys to the page. Their own commands use Insert or Caps Lock, and VoiceOver's use Control+Option, so none overlaps.

**Tests:**
- A browser test runs each key in all three engines and checks that the default is prevented.
- The page must not scroll or navigate.
- A key typed in a field must do nothing.

### Selection and focus afterwards

Selection and the current page are view state (sdk-core ADR 0010). They aren't in the plan, the format or usage events. The editor sets them after each page tool runs:

| After | Selection | Current page |
|---|---|---|
| Delete | The page now at the position of the first deleted page, or the new last page if the deleted pages were at the end | That page |
| Move | The moved pages, in their new positions | The page that was current, if it moved; otherwise the first moved page |
| Insert | The inserted pages | The first inserted page, which the viewer brings into view |

**Focus:**
- Focus stays where it was, unless that element is removed, such as a deleted page's thumbnail. Then focus moves to the current page's thumbnail, or to the viewer when the thumbnails are hidden.
- A toolbar button that becomes disabled keeps focus: for example, "Move earlier" once the block reaches the start. `PdfToolbar` passes ui's `focusableWhenDisabled` to its buttons, so they use `aria-disabled` and keep focus, as the WAI-ARIA toolbar pattern advises, and a keyboard user isn't thrown out of the toolbar. Today it passes plain `disabled`, which drops focus; that changes with the first page tool.
- Focus never falls to the body.

**Announcements** go through the polite live region, with text from the catalogue:
- "Deleted 2 pages."
- "Moved 1 page to position 3."
- "Inserted 4 pages after page 2."

### What undo restores

Undo and redo restore the pages, and also **the selection and current page that went with them**. Otherwise a user who undoes a delete finds the pages back but their place lost.

**The session records view state with each step:**
- For each history step it pushes, the session records the selection and current page from just before the step.
- When the step is undone, the session first records the selection and current page at that moment, then restores the ones from before the step.
- Redo restores the ones recorded at undo.

**How it's stored:**
- This view state is kept beside the history, keyed by the step object that sdk-core's `History.undo()` and `redo()` return. The commands stay serialisable, and the format is unchanged.
- It is never emitted in events.
- When steps are trimmed for memory, their view state goes with them.

**Focus after undo and redo** follows the same rule as above: it stays unless its element is gone, and then moves to the current page's thumbnail. Undo and redo keep their existing announcements.

### The file policy when inserting

The limits apply to the **combined document**, not only to the inserted file. `session.insert()` already checks all of them before it changes anything:
- `maxFileSize` and the other per-file limits apply to the inserted file, as when opening one;
- `maxFiles` counts the documents the session holds, including the new one;
- `maxPages` counts the plan's pages plus the inserted pages, and its warning threshold sets a `maxPages` warning;
- `maxSessionSize` counts every document held. Before giving up, the session drops redo steps, then the oldest undo steps, and sets `historyTrimmed`.

**A failed insert leaves the document untouched:** no pages, no history step, no change to the selection. That covers a limit, an invalid or protected file, and a cancelled picker. The header's alert shows the error's text from the catalogue by its code, as a failed replacement does. A cancelled picker shows nothing.

**When undo steps were dropped,** the editor says so once, in the header's status region. The earliest edits can no longer be undone.

### Dragging, later

Reordering by dragging thumbnails comes in a later release, as an addition:
- pointer events on the listbox;
- an insertion line;
- one `pdf.movePages` per drop;
- Escape cancels.

It adds no new path: the move buttons remain the single-pointer alternative that WCAG 2.5.7 requires, and the keys above remain the keyboard path.

## Alternatives considered

- **Ctrl or ⌘+↑/↓ to move,** as in slide sorters: the listbox already uses Ctrl or ⌘ with the arrows to move focus without selecting, as the WAI-ARIA listbox pattern recommends. On macOS, Ctrl+↑ and Ctrl+↓ belong to Mission Control.
- **Alt+Home and Alt+End to move to the start or end:** Alt+Home opens the home page in Chrome and Firefox. Alt+End alone would be lopsided.
- **A "grab" mode,** where Space picks a page up and the arrows carry it: Space already toggles selection in the listbox, and a mode is easy to get lost in.
- **Editor-wide Delete and move keys:** a key pressed while reading the viewer would change pages the user can't see selected. The listbox is where the selection is visible.
- **Keeping selection out of undo:** simpler, but undoing a delete or a move would leave keyboard users somewhere unrelated to the change.
- **Recording view state inside the history's steps:** the steps hold commands, which are serialisable and portable (sdk-core ADR 0045). View state belongs beside them, not in them.

## Consequences

- The pdf-editor app can delete, move, insert and merge without its own controls.
- Moving to the start or end of a long document takes repeated key presses until dragging arrives. A later tool can add it to the toolbar without a key.
- The session gains view-state bookkeeping beside its history, with tests that undo and redo restore the selection and current page.
- Each tool brings its catalogue strings, its icons from `@hussmartinez/ui`, and its designed states in the screenshot tests. The move tools wait for ui's move-up and move-down icons.
