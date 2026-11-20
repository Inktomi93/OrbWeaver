---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: chat
plan: chat-html-and-presets
---

# The script and held-card notices parse once, state their reasons and fit user rows

## What

The plain-content notice calls holdsScript on every render with no memo, so a long transcript re-parses every framed row each time it renders (packages/client/src/components/plain-content-notice.tsx). The two ast-grep-ignore comments in the chat reply frame point at the Biome line above instead of stating their reason on the line, as the comment rules ask. The held-cards notice says reply in its copy but also shows on a user message that carries card markup.

## Why

A per-render parse is the cost the notice was sized to avoid, a pointer-only reason breaks when the line above moves, and the wrong noun misleads a member about whose message is held.

## Done when

holdsScript runs once per row content; each ignore comment states its own reason; the held-cards notice names the row kind it sits on; component tests cover a user row.

## Evidence

Filled at landing: what ran and where its output is.
