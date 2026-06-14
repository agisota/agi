---
"@runfusion/fusion": patch
---

Fix mobile board horizontal overflow that caused iOS Safari to zoom-out/cut-off the board and let the whole page pan off-screen. Screen-reader-only `.visually-hidden` spans were `position: absolute` with no offsets, so inside the horizontally-scrolled kanban columns they rendered off-screen-right and ballooned the document's scroll width. Pinning the utility to its containing block's origin keeps the document locked to the viewport on mobile.
