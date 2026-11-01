---
kind: work
status: open
updated: 2026-11-01
priority: P2
area: server
plan: unwired-code
---

# Wire the search controls for rerank and scopedCharacterId (owner: wire rerank, drop scopedCharacterId)

## What

Rerank is wired. The Corpus list pane has a Rerank results switch under the search box. It sends `rerank` on `search.search` for the Characters, Scenes, Memories and Images targets. The Text target has no switch. The ask lives in the corpus search store beside the query and target.

The switch is disabled with the reason in its description while no Rerank model is running: unset, set but not running, or still loading. When the model is unset or blocked, the Model roles door sits beside it. A stored ask that no running model can serve is not sent.

`scopedCharacterId` is dropped. The key left the `chat` search scope in `packages/contracts/src/search/index.ts`, and the `chat` scope now carries only `chatId`. The `segments` unified target needed it, so the target left `SEARCH_TARGETS`, the result union and `dispatchSegments`. The `segments` verb stays: chat recall calls it directly. The corpus fixture in `tests/support/node/corpus-data` was republished without the segments read.

## Why

The server branched on `unifiedSearchInputSchema.rerank` and `searchScopeInputSchema.scopedCharacterId`, and no client sent either. The owner ruled to wire rerank. The owner ruled to drop `scopedCharacterId`: it only exists on the chat scope, the Corpus list searches the whole library, and no client surface searches inside one chat.

## Done when

- Switching Rerank results on makes the next `search.search` request carry `rerank: true`, and the result disclosure reports the rerank as requested.
- With no running Rerank model the switch is disabled and states why.
- No `scopedCharacterId` remains in the search scope contract, and no `segments` unified target remains.

## Evidence

`tests/client/features/discovery/surfaces/corpus-search-controls.ct.tsx` mounts the production Corpus list. It fails before the switch exists and passes after.
