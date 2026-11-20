---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: docs
---

# Discord post copy bundle: correct the four forum posts

## What

Edit the four live forum posts. The provider line names DeepSeek and says the local option covers search and embeddings. The line saying Orbweaver does not run the model holds only for chat; `local-light` is an in-process ONNX runtime, and No GPU needed stays. In the Latest v0.6.0 line, change lifts every regex script to lifts every regex script it can compile. The line saying updates back up your database first becomes updates that need a schema migration back up your database first (`update.sh` has no backup step; `packages/server/src/entry/boot/migrate.ts:32,55-58,68-72`). Correct the claim that Simple send only unlocks after the first normal message; the code gates on an empty composer (`composer-utility-menu.tsx:187,342`).

## Why

Users read the posts as product claims. Each line promises something the code does not do or hides something it does.

## Done when

Each line above is corrected in the live posts, and the owner confirms the edit.

## Evidence

Filled at landing: what ran and where its output is.
