---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: client
---

# List arrival focus lands on the band

## What

On arrival the Chats and Presets list surfaces park focus on their own root, which sits after the list band, so a forward Tab skips the band's New button.

## Why

Forward Tab must reach the list band's controls before the search field and rows.

## Owner ruling

Arrival focus lands on the band's first control (or the band), so Tab order is New, then search, then the rows.

## Done when

Every list surface with a band follows the ruling through one shared arrival-focus mechanism, a CT per affected section asserts the first Tab stop, and a planted root-focus control fails.

## Evidence

Filled at landing: what ran and where its output is.
