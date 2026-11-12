---
kind: work
status: open
updated: 2026-11-12
priority: P3
area: rpg
plan: authorization-and-visibility
---

# Trace the rpg capability read's model-catalog fetch for a disabled host

## What

On a cold cache the rpg capability read may fetch a model catalog from the host's server. The path has not been traced for a disabled host.

## Why

If the fetch runs, a disabled account's connection is still used.

## Done when

The path is traced, and it is either gated on the enabled lookup with a test or recorded in the item as spending nothing on the host's account.

## Evidence

Filled at landing: what ran and where its output is.
