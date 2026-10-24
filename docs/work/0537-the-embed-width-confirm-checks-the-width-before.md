---
kind: bug
status: open
updated: 2026-10-24
priority: P3
area: connection
---

# The embed width confirm checks the width before it warns

## What

The rebind/width confirm ('deletes your search index…') opens before the server's width probe, so a change the server then refuses (an unmakeable width) first warns about deleting the index. Found by the 0507 side-eye spot-check (P3-E).

## Why

A destructive warning for a change that will not happen is noise and erodes trust in the confirm.

## Done when

The change preview runs the same width check the save runs (or the save is dry-run first), so an unmakeable width is refused before any confirm; a CT covers it.

## Plan

Not yet built. The width check exists only on the save path: `settleEmbedSpace` (`packages/server/src/domain/connection/substrate/embed-space.ts`) writes the row, `syncEmbedTargets` reaches `prove` and `probeWidth` (`packages/server/src/domain/embeddings/verbs/sync-target-generations.ts`, `packages/server/src/domain/embeddings/substrate/generation.ts`), and a refused width undoes the write and throws `EmbedWidthUnmakeableError`. The preview the client confirm reads (`connection.embedSpaceChangePreview`, `packages/server/src/domain/connection/verbs/preview-embed-space-change.ts`) counts rebuild scope only, dials nothing, and its schema has no refusal field.

Shape:

1. `embedSpaceChangePreviewSchema` gains `refusal: EmbedTargetRefusal | null`.
2. A read-only probe step in the embeddings domain reuses `prove` and `probeWidth`. For `bind` and `everywhere` it resolves through the target `connectionId` (`pendingTargetMove` already takes one).
3. For `update`, the patched row is not written, and the resolver cannot resolve through it. The probe resolves through a patched-row overlay in the resolve path. This overlay is the design decision; a write, probe and undo inside the owner write queue is rejected because concurrent chat and embed resolves would see the transient row.
4. `useReindexConfirm.guard` (`packages/client/src/components/reindex-confirm.tsx`) shows a preview refusal through `embedRefusalText` and opens no confirm.
5. The preview now dials the embedder, so it handles `unreachable` and `auth` before any confirm opens.

No CT mounts the credentials or role-slot panes yet; the first leg builds that harness through the public door.

## Evidence

Filled at landing: what ran and where its output is.
