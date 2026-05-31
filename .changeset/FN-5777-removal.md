---
"@runfusion/fusion": patch
---

Removed the Settings modal "Star on GitHub" header button and deleted its `showGitHubStarButton` setting.

This simplifies the Settings surface by removing a promotional control and all of its related client-side logic/styles (including star-count fetch/cache behavior).
