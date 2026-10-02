---
kind: work
status: open
updated: 2026-10-02
priority: P2
area: auth
---

# Let the owner turn on sign-in and Start sharing from Settings without editing env

## What

Build an owner-only Settings action that enables sign-in and sharing without environment-file edits. First supersede the conflicting D255 auth-mode ruling and define persisted boot behavior for native and container installs.

## Why

The owner explicitly wants the sharing setup to remain in the app.

## Done when

Prove persisted mode selection and restart recovery under the native launcher and a disposable container volume. Preserve password and seating confirmation, and refuse OIDC and forwarded-header modes. Require independent security and rendered review.

## Evidence

Delegated source audit: `/tmp/claude-launch-punchlist/items.json`, proposal `19 + ruling: Start sharing reachable from Settings without env edits`. The report contains exact source paths, coupled tests and independent skeptic findings. Runtime and implementation acceptance remain required.
