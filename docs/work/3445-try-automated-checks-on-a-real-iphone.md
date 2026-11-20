---
kind: tooling
status: open
updated: 2026-11-15
priority: P2
area: tests
---

# Try automated checks on a real iPhone

## What

Phone defects the owner found on an iPhone did not show in headless Chromium. The options report is `2026-11-15-cb-iphone-automation-options.md` under `reports/reviews/`. Its no-cost path is a probe page the phone opens plus a Web Inspector proxy from the Linux box over USB.

## Why

Keyboard, safe-area and touch behaviour on iOS differ from the emulated phone, and those are the defects that reach the owner.

## Done when

The probe page and the proxy are tried against the owner's phone and the result is written to a report: what can be driven, what can be read, and whether a paid device service or a borrowed Mac is still needed. The owner has chosen the path.

## Evidence

Filled at landing: what ran and where its output is.
