---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: security
---

# A portable bundle import checks an image asset's bytes against its declared type

## What

The portable bundle import (`import-asset.ts`) restores an asset's declared media type without the signature check the store applies to an upload. A crafted bundle can mark video-family bytes as an image type and link them as an avatar. The blob route serves the stored type with sniffing disabled, so nothing executes; the picture is broken.

## Why

The rule that an asset's type comes from its bytes should hold at every door that writes one.

## Done when

The bundle import runs the store's signature check for kinds that admit images and refuses a mismatch with the coded reason, with a test through the production import.

## Evidence

Filled at landing: what ran and where its output is.
