---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: chat
plan: chat-html-and-presets
---

# A row's trust notice follows a frame whose later serve narrows its grant

## What

The Character trust notice on a row is built from what each frame's mint grant reports. When a later serve of the same frame narrows its grant, the notice keeps the earlier report until the frame is minted again.

## Why

The notice under-reports what is held back. It never widens what a frame may do, but the user sees a stale reason.

## Done when

A design for how the client learns a later serve's narrower grant is chosen and reviewed by a security-builder: either the pinned frame height script posts a serve-set attribute, or an authenticated grant read. The row notice then follows the narrower grant, with a CT.

## Evidence

Filled at landing: what ran and where its output is.
