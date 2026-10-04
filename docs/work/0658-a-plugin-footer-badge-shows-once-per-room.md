---
kind: bug
status: open
updated: 2026-10-04
priority: P2
area: plugin
---

# A plugin footer badge shows once per room

## What

Oracle Deck's footer badge renders under every message and again in each Game actions block because message-footer badges are fixed marks (showcase-plugins oracle-deck main.ts; plugin-message-footer-surfaces.tsx). Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

A plugin status badge shows once per room or only on messages the plugin acted on, with a test.

## Evidence

Lane S6: message-footer badges are a per-row static spec by contract (plugin-message-footer-surfaces.tsx); once per room needs a host rule such as latest row only, or a plugin flag.
