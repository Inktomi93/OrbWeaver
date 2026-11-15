---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: chat
plan: cross-surface-consistency
---

# Blocked images inside a framed card or reply have no notice

## What

The external media gate (`message-media-placeholder`) covers a media block in the transcript. An image or media element inside a framed card or styled reply is refused by the frame's own content security policy when external media is blocked, and the reader sees a broken or empty image with no explanation.

## Why

The same setting has a visible gate in one place and silence in another.

## Done when

Framed content with a refused external image or media element shows the shared notice, naming the install or character media setting and who may change it. Framed content with no external media shows none. Component tests cover a blocked image in a card and in a styled reply.

## Evidence

Filled at landing: what ran and where its output is.
