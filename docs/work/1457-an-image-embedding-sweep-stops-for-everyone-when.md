---
kind: bug
status: open
updated: 2026-10-30
priority: P2
area: embeddings
---

# An image embedding sweep stops for everyone when one asset file is missing

## What

When an asset row exists but its stored file is gone, embedAssets throws ENOENT and the whole sweep fails (packages/server/src/domain/embeddings/verbs/). Ruling: a vanished file fails that asset, the sweep continues, and the run records the failed asset so the owner sees it.

## Why

One corrupt or deleted file stops every other asset's embedding, and the failure names nothing the owner can act on.

## Done when

A sweep over a set with one missing file embeds the rest, records the missing asset as failed with its id, and a server integration test through the composed root proves it, red on current main.

## Evidence

Filled at landing: what ran and where its output is.
