---
kind: bug
status: open
updated: 2026-10-14
priority: P1
area: db
plan: test-foundation
---

# Local database close releases native statement ownership

## What

Complete deterministic local connection, statement and row disposal through the upstream native implementation. Qualify corpus quiescence and preserve supported packaging and SQL behavior.

## Why

A logically closed client does not establish physical writer release. Corpus cloning and isolated graph lifetimes require real ownership completion, not garbage collection or a journal-mode workaround.

## Done when

Owned native controls prove descriptor release and immediate independent reopen after prepared reads, writes, migration and housekeeping, including failure and transaction paths. The strengthened corpus quiescence control passes without forced garbage collection, sleeps or weakened assertions. Preserve native SQL behavior and supported runtime packaging.

## Evidence

Stable native controls distinguish logical client close from retained prepared-statement ownership. The unchanged graph leaves database and WAL descriptors open; the corpus quiescence assertion remains intact.

Reviewed source `384f63f55b` pins `libsql@0.6.0-pre.43` for the existing client and patches its public open-state and sync-result compatibility. Maintained controls prove strongly retained statement and iterator invalidation, descriptor absence before process exit and immediate independent reopen. Migration, housekeeping, rollback, transaction, SQL and failure controls pass without garbage collection. The installed Linux binary matches the official release digest. The adoption report is `/tmp/codex-db-file-identity-1014-adoption-handoff.md`.

Reviewed source `7859a8567c` closes the acquired `createDb` client when wrapping or initial execution fails, preserving the original failure. Bounded controls fail on the unchanged source and pass the correction. The focused housekeeping diagnostic confirms that Drizzle preserves the original failure as its cause and closes the client. This does not fix stable native statement retention.

Parent-scoped aliases resolve the Windows and Linux arm64-musl loader names to matching official packages. Independent review confirms the lock and public compatibility delta. Cross-platform runtime, native asynchronous operations and broader replica compatibility remain unqualified.

Reviewed corpus source `505c900fb5` passes the strengthened expanded pipeline on this installed driver. Before inspection, cloning or cleanup, no owned Linux descriptors remain. Independent reopen detaches WAL as sole holder; real recall, OIDC and automation outputs survive secret-free DB/CAS cloning. Independent review confirms this bounded application lifetime and publication evidence. Cross-platform runtime remains CI qualification, not a local Linux claim.

The managed runtime is pinned in `package.json`; [its upstream platform policy](https://github.com/nodejs/node/blob/v26.10.0/BUILDING.md#supported-platforms) treats ARMv7 as experimental without official release binaries. Qualify the existing source-install matrix and published image rather than building a new ARMv7 distribution. Record the native package target delta without claiming unsupported-platform parity.
