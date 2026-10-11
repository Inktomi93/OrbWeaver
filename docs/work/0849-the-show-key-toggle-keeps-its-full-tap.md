---
kind: bug
status: open
updated: 2026-10-11
priority: P3
area: client
---

# The show-key toggle keeps its full tap area inside the connection dialog

## What

In add-connection-dialog.ct.tsx 'the show-key toggle takes a tap 44px wide around its glyph' fails on main at 390px. The toggle's right edge sits flush with FormDialog's inner scroll region (overflow auto), which clips the 44px touch pseudo-element on the right.

## Why

A clipped hit area makes the toggle hard to tap on a phone, and the CT is red on main.

## Done when

The CT passes: the scroll region's inline padding or clip boundary keeps flush-edge controls' hit areas whole.

## Evidence

Filled at landing: what ran and where its output is.
