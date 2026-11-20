---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: chat
plan: chat-html-and-presets
---

# A held external image in a card frame shows a placeholder the user can click to open the setting that holds it

## What

When character trust or the install holds internet media, an external image inside a card or styled reply frame is refused by the frame's CSP and shows the browser's broken-image icon, with no way to act on it from the image. The frame document is minted by the server (packages/server/src/entry/http/card-frame.ts), so the external image URLs are known at mint time. Design to settle: a frame-owned stylesheet that swaps each held image for a designed placeholder without changing the author's markup, and a click on the placeholder that reaches the app and opens the control that holds it (the row notice's action). In frames that run no scripts this needs a host-owned bridge allowed only by a CSP nonce while author scripts stay blocked; that is a change to the frame sandbox. The fixer's claim that a placeholder needs rewriting authored HTML cites no ruling in docs/law or docs/adr.

## Why

A broken-image icon tells the user nothing and offers no fix, while the reason and the remedy are already known.

## Done when

Each held external image draws as a placeholder that names why it is held; clicking it opens the deciding control for a host and shows the reason to a member; author markup and scripts are unchanged; frames that run no author scripts still run none, proven by a test that an author inline script stays blocked beside the host bridge; a security-builder review passes; CTs cover a held image at each trust step.

## Evidence

Filled at landing: what ran and where its output is.
