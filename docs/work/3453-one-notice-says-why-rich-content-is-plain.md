---
kind: work
status: open
updated: 2026-11-15
priority: P1
area: chat
plan: cross-surface-consistency
---

# One notice says why rich content is plain and opens the setting that turns it on

## What

`InertCard` in `packages/ui/src/content/immersive-card/inert-card.tsx` shows a plain card with a line that names the per-character Trust HTML setting. It has no link, never receives the character's name, and names the character setting even when the install-wide switch is what blocks it. A styled reply that cannot get its frame falls back to plain text with no notice found. The settings live in the character Trust tab (`character-trust-tab.tsx`) and the System media and trust section (`media-trust-section.tsx`).

## Why

A preset that depends on HTML trust looks broken to a new user, and nothing tells them what to change. The first outside user's preset is such a preset.

## Done when

Cards and styled replies share one notice. It names the blocking setting: off for this character, with a control that opens that character's Trust tab; off for the install and the viewer is the owner, with a control that opens the System section; off for the install and the viewer is not the owner, with no control and a line to ask the owner. The character's name is shown. A room member who cannot change the setting sees no control. Component tests cover each case.

## Evidence

Filled at landing: what ran and where its output is.
