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

The security lane owns the imagery and media batch in its prepared worktree. Propose the owner split before editing shared domains or composition callers. Administrative and room-reach lanes own their separate shared hunks; main coordinates additions.

Use the canonical row-derived Principal resolver instead of the synthetic imagery card Principal. Preserve visibility before host reads and the history floor before extraction. Keep current funding semantics; the runtime funding item owns a broader executor correction unless it blocks this move.

Keep heavy checks queued through main. No live stack drive is required for implementation; the unidentified listener remains untouched. Main owns independent wave review, landing and whole-tree verification.
