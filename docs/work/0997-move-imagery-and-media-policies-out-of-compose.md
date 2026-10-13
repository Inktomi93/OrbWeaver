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

Source `d21b9cdd8d` has independent security review with no findings. Integration `917c7ba7ed` preserves administrative and room-reach owner changes and explicit package doors. The compose barrel resolution removes both obsolete export sets.

Focused media behavior and native server evidence pass. Preserved per-file successes inside a failed aggregate remain separate from aggregate-green evidence. The final native import graph includes every touched production subject without rule changes.

The matching root-native integration run finishes red on the maintained room-reach fixture extension. Its fixture correction and the administrative proof's redundant kind comparisons are assigned to the media lane. Preserve all cases and authority predicates. Item closure waits for matching affected checks; do not replay the broader behavioral population.

Main owns documentation repoints and exact budget reconciliation. Runtime funding and strike-out remain with their own work item. The broader compose item stays open.
