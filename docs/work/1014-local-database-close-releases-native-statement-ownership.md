---
kind: bug
status: doing
updated: 2026-10-14
priority: P1
area: db
lane: codex/db-file-identity
plan: test-foundation
---

# Local database close releases native statement ownership

## What

Make local database disposal release native connection, statement and row ownership deterministically. Native prepared statements retain a connection after the JavaScript client closes; migrated and analyzed corpus databases therefore retain WAL holders. Inspect supported upstream disposal and packaging before choosing a native dependency repair.

## Why

A logically closed client does not establish physical writer release. Corpus cloning and isolated graph lifetimes require real ownership completion, not garbage collection or a journal-mode workaround.

## Done when

Owned native controls prove descriptor release and immediate independent reopen after prepared reads, writes, migration and housekeeping, including failure and transaction paths. The strengthened corpus quiescence control passes without forced garbage collection, sleeps or weakened assertions. Preserve native SQL behavior and supported runtime packaging.

## Evidence

Direct native execution separates SQL execution from prepared-statement ownership. Native close drops the database reference, while statements and row iterators retain connection references until garbage collection. The public native API exposes no child disposal. Prepared writes and analysis retain owned file descriptors and block immediate WAL detachment; ordinary direct execution releases them. The corpus assertion remains intact. Inspect supported upstream repair before changing native packaging; do not substitute logical close, forced collection or process-exit qualification for in-process ownership.

The isolated official `libsql@0.6.0-pre.43` Linux probe establishes deterministic native release with strongly retained statements and iterators. Its public compatibility wrapper needs open-state and sync-result repairs for the actual client. The scratch-patched candidate passes canonical migration, housekeeping, transaction and SQL controls without garbage collection. Repository dependencies remain unchanged. The qualification report is `/tmp/codex-db-file-identity-1014-qualification.md`.

Canonical `createDb` leaves its acquired client open when wrapping or initial execution fails. The active source assignment fixes that ownership defect and checks failure propagation. A housekeeping error-identity assertion is invalid because Drizzle wraps the cause; its focused diagnostic remains unqualified.

Official Windows and Linux arm64-musl package endpoints are missing despite available release binaries. Resolve supported distribution before dependency adoption. The complete corpus, platform installation and broader native compatibility remain unqualified.
