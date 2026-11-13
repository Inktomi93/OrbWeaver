---
kind: tooling
status: open
updated: 2026-11-13
priority: P3
area: security
plan: checked-law
---

# One environment builder serves every inheriting spawn, and a lint refuses a spawn with no env

## What

The tunnel child started in `packages/server/src/infra/relay/quick-tunnel.ts` inherits the process environment, because its package takes no environment option. Every other child takes its environment from one builder, and a lint entry refuses a launch with none. The scrub at boot is the only guard for the tunnel child.

## Why

A spawn added tomorrow inherits whatever the process holds, and nothing fails.

## Done when

The tunnel child takes its environment from the builder, by owning that spawn or by a package option, and the lint entry has no exempt launch in server source besides the packaged probe.

## Evidence

Filled at landing: what ran and where its output is.
