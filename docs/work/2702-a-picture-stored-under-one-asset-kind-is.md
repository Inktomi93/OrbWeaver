---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: server
---

# A picture stored under one asset kind is found when used under another

## What

The asset store keeps one row per owner and content hash, and the first kind recorded wins. Readers that select by kind then miss a picture first stored under another kind. A picture first stored as a gallery item or chat attachment and later uploaded as a background is not found as a background (`packages/server/src/domain/settings/persistence/queries.ts` and the legacy pin heal). A picture first stored as an attachment and later set as an avatar is never embedded, because the sweep selects avatar rows only (`packages/server/src/domain/assets/persistence/queries.ts`). The asset list filtered by kind omits it. A chat handoff copy can resolve to the target owner's earlier row of another kind. The avatar check already judges by content. The reader list is in the security lane's report under reports/lanes.

## Why

The same picture works or silently fails depending on which door it came through first, and the person sees an upload that succeeded and a background or gallery item that is not there.

## Done when

Owner ruling: a kind belongs to each use of a stored file, not to the file. The schema records a kind per use through a numbered migration that carries existing rows over, a ledger decision states the rule, every reader listed follows it, and a test per reader stores one picture under two kinds through the production doors in both orders and finds it each time.

## Evidence

Filled at landing: what ran and where its output is.
