---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: security
plan: test-foundation
---

# Prove a guest's document search ranks only its installer's library

## What

Two owners each ingest through a guest, both libraries are indexed into an active query space, and each guest's search.documents returns only its installer's document ids. The owner scope is the ownerId installer in createPluginDocumentSearch; no test reaches it with indexed data. The 1459 lane could not activate the query space on demand (search answered search_space_reindexing after the index and databank-reindex workloads ran). Route to security-executor.

## Why

The last open case of the plugin bridge restoration row; a widened scope would leak another owner's documents to a plugin.

## Done when

The case runs through a real guest on the production host and is red with the scope widened to both owners; the bridge register row names no security remainder.

## Evidence

Filled at landing: what ran and where its output is.
