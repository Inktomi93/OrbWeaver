---
kind: bug
status: open
updated: 2026-10-11
priority: P1
area: client
---

# Report a bug widget squeezes the chat topbar title on desktop and phones

## What

Once CTs mounted the real chrome widgets (item 889), tests/client/features/app-shell app-shell CTs went red: the chat topbar title group is wider than its bound at 1280 and the phone title falls below its floor at 390 and 430. The always-visible bug report chrome widget (bugReportChrome, order 90, packages/client/src/compose or features/app-shell chrome registration) declares no mobile curation, unlike pluginCommandsChrome which uses mobile sheet. Give it the right curation and check the 1280 squeeze.

## Why

The room title is the identity of the chat on every screen; the CTs now prove it is squeezed in production.

## Done when

The app-shell title CTs at 1280, 390 and 430 pass with the real chrome widgets mounted.

## Evidence

Filled at landing: what ran and where its output is.
