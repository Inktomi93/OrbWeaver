---
kind: bug
status: open
updated: 2026-11-16
priority: P2
area: chat
plan: chat-html-and-presets
---

# Rows that can never frame skip the panel readers, and long text fails closed

## What

Every row runs the model panel readers whatever its tier, and the untrusted Markdown render strips raw-text elements before its render length guard. A very long member message made of tag lines stalls each viewer's main thread on every mount.

## Why

Any member can freeze every viewer's tab, and a windowed row remounts on scroll.

## Done when

The panel readers run only on sandbox-tier rows and under a stated length bound past which the row stays plain, the strip runs after the length guard, the streaming row does not rescan the whole text on every render, and a cost row with a stated budget is red on the parent.

## Evidence

Filled at landing: what ran and where its output is.
