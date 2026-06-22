---
"@runfusion/fusion": patch
---

Prevent the bundled Droid CLI extension from starting local `droid` probes during server boot; validation now runs only when a Droid stream is actually used while existing probe paths remain non-interactive and timeout-bounded.
