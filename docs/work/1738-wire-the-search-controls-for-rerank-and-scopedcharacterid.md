---
kind: work
status: open
updated: 2026-11-01
priority: P2
area: server
plan: unwired-code
---

# Wire the search controls for rerank and scopedCharacterId (owner: wire)

## What

Add a Rerank results switch to the Corpus list pane, under the search box. It sends `rerank` on `search.search` for the Characters, Scenes, Memories and Images targets. The Text target has no switch. The ask lives in the corpus search store beside the query and target.

The switch is disabled with the reason in its description while no Rerank model is running: unset, set but not running, or still loading. When the model is unset or blocked, the existing Model roles door sits beside it. A stored ask that no running model can serve is not sent.

`scopedCharacterId` is not wired. It exists only on the `chat` scope, which also needs a `chatId`. The Corpus list searches the whole library and has no chat. No client surface searches inside one chat, and the digest moment view is a read view. A control would need a new in-chat search surface, which needs an owner design call.

## Why

The server branches on `unifiedSearchInputSchema.rerank` and `searchScopeInputSchema.scopedCharacterId`, and no client sends either. The owner ruled to wire both.

## Done when

- Switching Rerank results on makes the next `search.search` request carry `rerank: true`, and the result disclosure reports the rerank as requested.
- With no running Rerank model the switch is disabled and states why.
- `scopedCharacterId` has a home: either the owner picks a surface for an in-chat search, or the key leaves the contract.

## Evidence

`tests/client/features/discovery/surfaces/corpus-search-controls.ct.tsx` mounts the production Corpus list. It fails before the switch exists and passes after.
