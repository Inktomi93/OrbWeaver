---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: tooling
plan: snap-secret-hygiene
---

# Mask a token in the snap route positional

## What

diskSafeArgv masks flag values only, so a route positional like /?token=T keeps T in argv and routeSlug puts it in the artifact name.

## Why

This is the same leak class as the routeless slug fix under 2002, through a door that item did not name.

## Done when

The route positional goes through the same query mask, with a red-first canary in argv and the artifact name.

## Evidence

Filled at landing: what ran and where its output is.
