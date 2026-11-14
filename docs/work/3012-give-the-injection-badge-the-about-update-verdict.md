---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
---

# Give the injection badge, the About update verdict and the account Disabled badge a names-module home

## What

"Not delivered: no content" (packages/client/src/features/chat/components/injections-manager.tsx:200), "Check for updates" and "Update available" (packages/client/src/features/user-admin/components/about-section.tsx) and "Disabled" (packages/client/src/features/user-admin/components/admin-user-row\.tsx:61) live inline in .tsx files. The new reflow tests type them by hand.

## Why

A name with no zero-import home drifts from the tests that locate by it, and orb/no-hand-copied-label cannot see a .tsx string.

## Done when

Each string is exported from its feature's names module, production renders the export, and the three reflow tests import it.

## Evidence

Filled at landing: what ran and where its output is.
