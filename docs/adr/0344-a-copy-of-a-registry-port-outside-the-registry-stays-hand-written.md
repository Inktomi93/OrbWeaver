---
kind: adr
status: active
updated: 2026-11-11
---

# A copy of a registry port that cannot import the registry stays hand-written

## Context

The port registry in `tooling/src/floor/host/ports.ts` is the one home for every TCP port the tooling, harnesses and runners bind. Some places that need a registry number cannot read it. `packages/client/vite.config.ts` carries the dev server and API defaults, and `tooling` sits above the package cake, so an import from `packages/**` into `tooling` is an upward import. A shell launcher cannot import TypeScript at all; `scripts/launcher/ui.sh` carries the dev API port. These copies are the mirror side of the registry.

## Decision

A mirror copy of a registry port stays a hand-written default that names the registry. The mirror side has no env file, and the registry does not move into `@orb/kit`. The Vite fallbacks stay env-overridable defaults (`VITE_PORT`, `VITE_API_TARGET`) that match `DEV_PORTS`. Homes: the header of `tooling/src/floor/host/ports.ts` and the comment above the fallbacks in `packages/client/vite.config.ts`.

## Consequences

Change a mirror value and the registry row together; each file names the other. Do not add an env file, a generated copy or a kit module to remove a mirror. No test or rule checks that a mirror matches its registry row, so the match is held by that pointer alone. A new place that can import the registry reads it and is not a mirror.

## Alternatives rejected

An env file shared by the registry and its mirrors, and a move of the registry into `@orb/kit`: the owner ruled against both as the house precedent. No other reason is recorded.
