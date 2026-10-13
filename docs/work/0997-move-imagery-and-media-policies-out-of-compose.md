---
kind: work
status: doing
updated: 2026-10-13
priority: P1
area: server
lane: codex/compose-media-997
plan: test-foundation
---

# Move imagery and media policies out of compose

## What

Move per-call policy from entry/compose/imagery.ts, materialize-background.ts, inline-reply-image.ts and resolve-image-ref.ts to the genuine domain, infra and transport owners. Keep entry limited to graph construction and inject narrow consumer ports.

## Why

Image funding, room visibility, asset authorization, byte validation and refusal policy remain hidden in composition callbacks. The real harness needs production operations rather than copied adapters.

## Done when

Preserve room-host funding, member visibility floors and subject-seat checks, owned or present-participant asset authorization before byte reads, deferred media conversion, guarded external downloads, raster validation, caps and typed refusal behavior. Keep meaningful production cases with discriminating controls. Remove obsolete policy and compose markers without new grants, fake Principals or sideways imports.

## Evidence

Filled at landing: what ran and where its output is.
