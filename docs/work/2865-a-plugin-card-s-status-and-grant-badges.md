---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# A plugin card's status and grant badges wrap inside the card

## What

On Settings, Plugins at 200% and 300% text on a phone, a long status badge such as the one for a plugin that asked for more than the person allowed stays on one line and pushes the settings column sideways. The status badge in `packages/client/src/features/plugin/components/plugin-row.tsx` and the grant badges in `packages/client/src/features/plugin/components/plugin-grant-list.tsx` use the default Badge, which never wraps. The Badge has `whitespace` and `cap` axes, which the plugin leaf nodes use.

## Why

A page that scrolls sideways has stopped reflowing and cuts the badge that says what needs attention.

## Done when

A component test in `tests/client/features/plugin/components/` renders a plugin card with a long status label and the grant badges in a 390px pane at 200% and 300% text. It asserts that every badge lies inside the pane and the settings column does not scroll sideways. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
