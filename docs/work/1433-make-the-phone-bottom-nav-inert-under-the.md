---
kind: bug
status: open
updated: 2026-10-30
priority: P2
area: client
---

# Make the phone bottom nav inert under the full-screen Context sheet

## What

On a phone, when the Context panel opens as a full-screen sheet, the bottom tab bar under it stays focusable and is not inert, so keyboard and screen-reader focus can reach controls the user cannot see. Found by the surface walkthrough's occlusion check.

## Why

Focus reaching hidden controls breaks keyboard and assistive-technology use of the sheet.

## Done when

While a full-screen sheet is open, the covered shell regions are inert and focus stays in the sheet; closing the sheet restores them; a production-mounted CT at coarse phone portrait and landscape proves it red then green in Chromium and WebKit.

## Evidence

Filled at landing: what ran and where its output is.
