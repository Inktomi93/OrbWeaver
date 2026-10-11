---
kind: tooling
status: open
updated: 2026-10-11
priority: P2
area: tooling
---

# Snap stages are isolated per run, never shared by sha between sibling sessions

## What

Three side-eyes ran from the main checkout at once. Stages are keyed one directory per sha, so a --stage-db stage at 25bb7c3623 was rebuilt under one reviewer from the dev db (bands.json dbProvenance null) when a sibling bound the same sha; the reviewer had to move to --ref on a docs-only sibling commit to escape. --stage-db also does not link the copied assets (items 878 and 887 cover assets). Also: `pnpm snap --stage-down` stops every stage of the checkout, not the caller's band, so one reviewer tore down two siblings' stages at about 23:58Z on 2026-10-11; a boot race between two runs claiming one stage dir reported a false "leader died during boot".

## Why

A review run on silently replaced data reports findings against the wrong database; reviewers cannot detect the swap without reading bands.json.

## Done when

Concurrent stages from one checkout never share or rebuild each other's data dir, a stage refuses to serve when its provenance changed under it, and a test proves two sibling --stage-db runs at one sha keep separate data.

## Evidence

Filled at landing: what ran and where its output is.
