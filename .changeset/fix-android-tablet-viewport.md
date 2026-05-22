---
"@runfusion/fusion": patch
---

Dashboard no longer renders into a small upper-left rectangle on Android Chrome in multi-window/freeform/split-screen mode. The page now re-asserts its viewport meta with the live `innerWidth` on every resize and orientation change, defeating Chrome's habit of caching `device-width` at the original screen size (which left the layout viewport wider than the actual window, so normal-flow elements clipped while position-fixed elements pinned to the full window). Also drops `maximum-scale=1.0, user-scalable=no` from the viewport meta, and broadens the existing board scroll-snap stabilization from phones to all touch-primary devices so Android tablets get the same first-cards-loaded reflow that iOS Safari mobile already had.
