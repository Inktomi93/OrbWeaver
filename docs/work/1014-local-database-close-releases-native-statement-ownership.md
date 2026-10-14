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

Reviewed source `7859a8567c` closes the acquired `createDb` client when wrapping or initial execution fails, preserving the original failure. Bounded controls fail on the unchanged source and pass the correction. The focused housekeeping diagnostic confirms that Drizzle preserves the original failure as its cause and closes the client. This does not fix stable native statement retention.

Official scoped Windows and Linux arm64-musl packages exist with matching source identity. The loader names unscoped packages instead. Evaluate parent-scoped aliases and the public compatibility patch before dependency adoption; no repackaging is required by that naming mismatch. The complete corpus, platform installation and broader native compatibility remain unqualified.

The managed runtime is pinned in `package.json`; [its upstream platform policy](https://github.com/nodejs/node/blob/v26.10.0/BUILDING.md#supported-platforms) treats ARMv7 as experimental without official release binaries. Qualify the existing source-install matrix and published image rather than building a new ARMv7 distribution. Record the native package target delta without claiming unsupported-platform parity.
