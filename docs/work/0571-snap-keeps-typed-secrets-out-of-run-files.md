---
kind: tooling
status: open
updated: 2026-11-06
priority: P2
area: tooling
plan: test-foundation
---

# Snap keeps typed secrets out of run files and session logs

## What

Investigate fill-value, run-metadata and session-log secret handling on live main. Preserve useful ordinary provenance without writing private values.

`AF3-TSSEC-Q0006`: Extend the comparison to explicit debug-token arguments and session boot arguments in exported metadata.

## Why

Browser and network redaction do not cover raw process arguments copied into local run and session records.

## Done when

A fill can obtain its private value from an environment variable. Synthetic secret values remain usable by the authorized operation but absent from exported artifacts.

Check actual run, session and log outputs, including argument provenance. Preserve redaction and ordinary provenance controls.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`, finding `AF3-TSSEC-Q0006`. Runtime exposure is not established. Revalidate the implementation before changing it.
