---
kind: tooling
status: open
updated: 2026-11-07
priority: P2
area: tooling
plan: cross-surface-consistency
---

# ESLint's Tailwind worker gives a verdict under load

## What

Lanes report the Tailwind class lint worker timing out with an Atomics.wait error on directory runs at a loaded box, so pnpm lint:eslint gives no verdict unless SYNCKIT_TIMEOUT is raised. One tsx file takes about half a minute alone on main, so each worker pays the design system load.

## Why

A lint run with no verdict blocks lanes and can fail the owner's pre-push on a busy box.

## Done when

A whole client directory lint gives a verdict at a load near the core count without a hand-set timeout, by loading the design system once per worker or setting the timeout in config with its reason.

## Evidence

Filled at landing: what ran and where its output is.
