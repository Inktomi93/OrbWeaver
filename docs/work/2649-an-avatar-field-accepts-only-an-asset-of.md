---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: security
---

# An avatar field accepts only an asset of an image kind

## What

Setting a character's or a persona's avatar checks that the caller owns the asset and not what kind of asset it is, so an owned document or export asset can be linked as an avatar. The blob route serves only image, video and audio types inline with nosniff and everything else as a download, so nothing executes; the picture is broken.

## Why

The avatar's own write should refuse what its reader cannot draw, and should not lean on the blob route's headers.

## Done when

The character and persona avatar writes refuse an asset whose kind is not an image kind with a coded reason, with a test through each production verb.

## Evidence

Filled at landing: what ran and where its output is.
