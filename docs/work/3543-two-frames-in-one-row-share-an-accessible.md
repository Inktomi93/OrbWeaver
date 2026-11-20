---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: chat-html-and-presets
---

# Two frames in one row share an accessible name

## What

A row split into several frames gives each the same title, so a screen reader cannot tell the reply's parts or the card apart.

## Why

A screen reader user hears the same name for each frame in a row.

## Done when

Each frame's name says whose reply it is and which part, and a component test asserts distinct names in a split row.

## Evidence

Filled at landing: what ran and where its output is.
