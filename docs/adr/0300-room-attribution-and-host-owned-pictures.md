---
kind: adr
status: active
updated: 2026-10-03
supersedes: docs/adr/0277-room-connection-attribution-and-pictures.md
---

# Rooms attribute each reply honestly, and room pictures belong to the host

## Context

A room reply can come from a connection that was later deleted, from an import or an edit that recorded nothing, or from another member's connection the viewer cannot see. Generated pictures post into shared rooms. D298 makes the room host their owner, so the room image control must say where the file lands.

## Decision

Each `message_variants` row stores `connectionAttributionProvenance` (`recorded` or `unrecorded`, `packages/contracts/src/chat/messages.ts`), with a database CHECK that a non-null connection id is always `recorded`. Deleting a connection sets the id to null and keeps `recorded`, so the client shows "deleted" only for `recorded` with a null id and "not recorded" for `unrecorded`; imports and edits write `unrecorded` and forks copy both fields. A non-null id the viewer cannot resolve reads as a room connection, never another principal's custom label. The next-turn line reads only the current host's chat binding (D17, D18, D19): members see provider and model, only the host sees the label, and an unset binding is shown as unset.

A generated picture links to its posted message with the `generated-post` origin in the same atomic append. A picture made in a room is the host's asset (D298): it joins the host's gallery, and the shared-room image control says it posts to the room, the host owns it and it joins the host's gallery. The gallery filters by room with the `chatId` param of the gallery list schema (`packages/contracts/src/assets/index.ts`) through a correlated EXISTS over message-asset placements, so an item placed twice returns once and a missing, foreign or departed room returns nothing.

Homes: `packages/client/src/features/chat/lib/swipe-attribution.ts`, `packages/client/src/lib/injection-copy.ts` (the room picture sentence), `packages/server/src/domain/chat/`, the assets gallery query.

## Consequences

Attribution states are data, not guesses, so a new writer of variants must choose a provenance. The gallery room filter stays correct under keyset pagination. A member who makes a room picture does not keep the file; the control's copy must stay in step with D298.

## Alternatives rejected

Inferring a deleted connection from an owner-scoped lookup miss: it reads another member's live connection as deleted. Filtering gallery pages after fetching them: pages come back short or empty and pagination breaks. Telling the member the file stays in their uploads: D298 stores it under the host.
