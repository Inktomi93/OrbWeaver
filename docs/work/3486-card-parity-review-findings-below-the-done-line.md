---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# Card parity review findings below the done line

## What

From the review of the card parity branch. A row with several plain cards shows one notice per card and one per styled reply; the ruling is one notice per row. With the install's HTML trust off and a character set to plain text, an admin is sent to the install switch, which alone does not fix it. An expired frame handle stays in the per-tab mint cache, so a card scrolled back in shows the expiry state again and after a second expiry stays on the plain fallback until reload. The rpg archive card has no forming chip because the chip lives in the chat feature.

## Why

Each is a visible inconsistency in the notice or the card frame.

## Done when

One notice per row. The notice names every setting that must change, in the order to change them. An expired handle leaves the mint cache. The archive card holds the same chip, from a shared home.

## Evidence

Filled at landing: what ran and where its output is.
