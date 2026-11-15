---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
plan: import-robustness
---

# Framed tables show copy, download and fullscreen controls that do nothing

## What

A markdown table inside a reply frame renders Streamdown's control strip, but the frame body is static markup from renderToStaticMarkup, so the controls have no handlers.

## Why

Controls that do nothing break the no-dead-control law and invite clicks that fail silently.

## Done when

Frame renders of tables omit the control strip, or the controls work. A rendered check of a framed table shows no inert controls.

## Evidence

Filled at landing: what ran and where its output is.
