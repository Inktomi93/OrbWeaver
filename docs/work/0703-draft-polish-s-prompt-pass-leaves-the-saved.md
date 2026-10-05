---
kind: bug
status: doing
updated: 2026-10-05
priority: P2
area: plugin
lane: codex/launch-plugins
---

# Draft Polish's prompt pass leaves the saved message as typed

## What

The prompt seam writes its rewrite into canon: the stored message has the ellipses, collapsed spaces and comma fix (checked through the debug db read), while the plugin README promises the room's canon stays exactly what was typed. Final pass leg 2 (plugins); review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

Plugin final pass finding.

Owner ruling: model it on guided Impersonate. Polish takes the composer text and rewrites it in the composer before send, visibly, the way Impersonate fills the composer (packages/client/src/features/chat/components/composer-guided-cluster.tsx fireImpersonate); an undo puts the typed text back, the way the recent-steers recall does (packages/client/src/state/steer-recovery-store.ts). What the user sends is what is stored; no hidden rewrite after send.

## Done when

Polish rewrites the draft in the composer before send, an undo restores the typed text, the sent message is stored exactly as sent, and the README and description match.

## Evidence

Filled at landing: what ran and where its output is.
