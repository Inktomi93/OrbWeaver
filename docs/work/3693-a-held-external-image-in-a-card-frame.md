---
kind: work
status: doing
updated: 2026-11-20
priority: P3
area: chat
lane: wt/agent-ae2df25e70dc0ee58
plan: chat-html-and-presets
---

# A held external image in a card frame shows a placeholder the user can click to open the setting that holds it

## What

When character trust or the install holds internet media, an external image inside a card or styled reply frame is refused by the frame's CSP and draws as the browser's broken-image icon. The row's Character trust notice already names held media and offers the one action that opens the deciding control, so the image itself needs no action of its own. The frame document is minted by the server (packages/server/src/entry/http/card-frame.ts), which knows the external image URLs at mint time, so a frame-owned stylesheet can draw a designed placeholder in place of each held image without changing the author's markup or the frame sandbox.

## Why

A broken-image icon tells the user nothing and offers no fix, while the reason and the remedy are already known.

## Done when

Each held external image in a frame draws as a designed placeholder instead of the broken-image icon, in Chromium, WebKit and Firefox; author markup, scripts and the frame sandbox are unchanged; a CT covers a held image at each trust step.

## Evidence

Filled at landing: what ran and where its output is.
