---
"@runfusion/fusion": patch
---

Fixes a dashboard regression where toggling the in-review Auto-merge switch could leave the UI in a broken/blank state until refresh. Auto-merge toggle state updates now remain consistent during rapid toggles, and regression coverage was added for the settings hook path.
