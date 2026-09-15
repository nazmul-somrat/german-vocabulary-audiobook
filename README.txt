GVA v1.0.2 — LANGUAGE COMPLETION + BOOKMARK TERMINOLOGY

This is a release candidate. Recommended: test in a preview/beta deployment before copying to production.

Main changes:
- Renamed “Difficult Words” to “Bookmarked Words”.
- Bangla: “বুকমার্ক করা শব্দ”.
- German: “Gespeicherte Wörter”.
- Completed localization for episode filters, Grid/List, search, bookmark panels, Review/Open buttons, empty states, transcript labels, recall labels, reset-progress messages, current/playing status, word type/difficulty labels, player hints, and episode word counts.
- A1/A2 section titles now follow the selected UI language.
- Version bumped to 1.0.2.
- Existing progress, bookmarks, quiz scores, settings and positions remain in the same localStorage state; this update does not clear them.

Files included are the full production-candidate set.


BETA RUNTIME FIX:
- Fixed startup ReferenceError: UI_MORE was calling ux() while UI_MORE itself was still initializing.
- Replaced those English default labels with literal strings.
- Bumped cache key/query from langfix1 to langfix2 so beta browsers/service workers fetch the corrected app.js.


v1.0.4 beta — manual seek transcript behavior
- Normal playback keeps smooth auto-follow.
- Dragging the audio progress bar no longer scrolls through intermediate transcript lines.
- Releasing the progress bar instantly jumps to the active transcript line.
- ±10 second controls and headset/media seek controls also jump instantly.
- Clicking a transcript line seeks directly without a long smooth-scroll animation.
- No user progress/bookmark/quiz data is cleared.
