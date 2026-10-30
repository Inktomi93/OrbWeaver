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

- Cause: the open Context sheet on a phone runs over the tab bar's row (`shell/mobile.css`) and over the LIST pane, but only `.shell-content` was inert.
- Fix: `ShellLayout.underSheet` (`use-shell-layout.ts`) is true on a phone while the Context sheet is open. `app-shell.tsx` passes it to the tab bar (`Rail` `inert`) and to the LIST pane (`PanelChrome` `covered`).
- Red first: `tests/client/features/app-shell/surfaces/platform-sheet-inert.suite.ct.tsx` (coarse portrait 390x844 and landscape 667x375) failed on the old source at the tab bar `inert` assertion. A 40-stop Tab walk reaches the sheet, never the bar or the roster, and the sheet's own close restores both. Green on Chromium and on `pnpm test:ct:webkit` (2 of 2 each).
