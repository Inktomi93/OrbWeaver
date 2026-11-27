---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: settings
lane: wt/agent-a05e04b95b7ac33b0
plan: unwired-code
---

# The settings profile drops the avatar nothing sets

## What

profileSchema.avatarAssetId in packages/contracts/src/settings/index.ts is read by resolve-user-publics.ts and protected by the asset garbage-collection path in asset-refs.ts, and no client or server write sets it; personas carry the avatar.

## Why

A fallback branch and a collector path serve a value that cannot exist.

## Done when

The field, the fallback path and the collector path are gone, a stored blob that carries the key still parses, and the asset garbage-collection suite passes.

## Evidence

Filled at landing: what ran and where its output is.
