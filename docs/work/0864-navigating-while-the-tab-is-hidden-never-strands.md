---
kind: bug
status: doing
updated: 2026-10-11
priority: P1
area: client
lane: wt/agent-af804bb63e2a3feb2
---

# Navigating while the tab is hidden never strands the app on the splash

## What

Owner, on v0.2.0: Home then Refinery logged 'Uncaught InvalidStateError: Transition was aborted because of invalid state. Document hidden' and the app stuck on the Orbweaver logo splash. lib/view-transition-settlement.ts:7-9 treats only AbortError and TimeoutError as a skipped transition, so the InvalidStateError Chrome uses for a hidden document is rethrown uncaught (wired via routes/router-view-transition.ts). Whether that or a separate Refinery route load caused the stuck splash is unproven.

## Why

A stuck splash is a dead app until reload.

## Done when

InvalidStateError from a skipped transition is absorbed like AbortError; navigations start no view transition while document.hidden; the stuck-splash cause is reproduced and fixed (Home to Refinery with the tab hidden mid-navigation, and a slow or failed Refinery chunk); tests cover the hidden-document skip and the route reaching its content.

## Evidence

Filled at landing: what ran and where its output is.
