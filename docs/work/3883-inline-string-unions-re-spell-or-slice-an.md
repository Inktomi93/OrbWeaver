---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: tooling
plan: unwired-code
---

# Inline string unions re-spell or slice an axis that has a home

## What

A typed census of inline string-literal unions of three or more members (key lists excluded by sibling type properties) found axes spelled inline beside their home. Re-spells: packages/server/src/domain/plugin/contract/results.ts mime spells ANTH_IMAGE_MEDIA_TYPES (packages/inference/src/contract/runtime.ts); packages/client/src/lib/console-error-ring.ts source spells SAFE_ERROR_SOURCES (packages/client/src/lib/safe-error-ring.ts). Inline at several sites with no home: the tone set destructive, neutral, success, warning (databank-model.ts, plugin-copy.ts, share-preconditions.tsx); captioned, extracted, user (packages/contracts/src/imagery/index.ts and generate-picture.ts); leading, none, trailing and center, end, start (row-placement.ts, message-row-avatar.tsx, row-actions-menu.tsx); fast, mid, slow (waystone-treatment.ts). Slices of a home spelled out instead of Extract over it: tone subsets of TONES, audio, image, video of MODALITIES, lg, md, sm of CONTROL_SIZES, toast level subsets of PLUGIN_TOAST_LEVELS. The census script is reports/api-play/bloodhound/inline-unions.ts; its JSON lists every site.

## Why

Spine-TypeScript-and-Patterns.md string-union dispatch discipline requires one importable home per axis and no inline re-spelling, so a new member fails the build at every site.

## Done when

Each re-spell imports its home; each multi-site inline axis gets one tuple home and its sites import it; each true slice is written as Extract over its home and each coincidental match is left with a one-line reason in this item; a rerun of the census shows no re-spell and no multi-site inline axis.

## Evidence

Filled at landing: what ran and where its output is.
