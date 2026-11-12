---
kind: plan
status: active
updated: 2026-11-12
rank: 7
---

# Stored data that cannot be read is named, kept and repairable

## Goal

A stored row that this build cannot interpret is reported as unreadable, is never overwritten or presented as defaults, and has a door that repairs or removes it. A stored fact has one meaning wherever it is read.

## Shape

Finish the unreadable stored JSON work at every column and exporter, give an asset's kind to each use of the file, and settle the open rulings on stale markers and admitted rows.

## Rejected

Defaults presented as the person's data. A reader that trusts a label over the stored bytes.

## Coupled sites

The stored JSON text column type and the asset store.

## Test plan

Each case plants the bad row before the production read or boot and asserts the bytes are untouched.
