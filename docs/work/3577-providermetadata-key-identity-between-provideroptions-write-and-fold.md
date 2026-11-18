---
kind: bug
status: open
updated: 2026-11-18
area: inference
---

# providerMetadata key identity between providerOptions write and fold read

## What

The chat route writes providerOptions under the camel form of the row id (providerOptionsKey in packages/inference/src/backends/openai-compat/model.ts:85) while the fold reads providerMetadata under the raw id (packages/inference/src/backends/v4/result.ts:338). The lane reports the SDK files the response bag under the camel key it was given (openai-compatible dist index.js:13-17,:419,:497,:736). For hyphenated row ids (custom-openai, plugin:acme/my-thing) the two spellings differ, so any providerMetadata the provider emits lands where nobody reads. Harmless today because the openai-compatible route emits no modeled metadata; the day something reads it (a metadataExtractor, usage overlays) the read is silently empty.

## Why

Two spellings of one identity, resolved by accident on today's rows and by silence on hyphenated ones; the fix is a single-keyed read with a test on a hyphenated row id.

## Done when

A wire test on a hyphenated row id proves providerMetadata written by the provider is read by the fold, and the write and read share one key derivation.

## Evidence

Filled at landing: what ran and where its output is.
