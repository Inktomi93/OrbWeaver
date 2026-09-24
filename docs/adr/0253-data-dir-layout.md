---
kind: adr
status: active
updated: 2026-09-24
---

# The runtime data dir is one root with a fixed tree

## Context

The data dir mixed what a backup must copy with what the app regenerates, and every slot had its own env key with no common root. The backup rule was a list of exceptions, the generated keyfiles sat beside the db as dotfiles, and the container docs named a secrets dir the server did not use. A boot that found a keyfile missing minted a new one, which orphans every sealed credential or every local password and session.

## Decision

One env key, `DATA_DIR` (the default is the data dir under the process working directory; the container exports DATA_DIR=/app/data), is the root, and `packages/server/src/foundation/data-layout/index.ts` is the one derivation of every path under it: `db/` (the database and its sidecars), `backups/` (the pre-migration copies and their `.keep` pins), `assets/` (the CAS), `users/` (per-user runtime state), `secrets/` (`credentials_key`, `session_secret`, and the `initial_password` the container writes), `reports/` (import reports) and `cache/` (`models/transformers`, `variants`, `import-staging`). The backup rule is one sentence: copy the root except `cache/`.

The slot keys `DATABASE_URL`, `ASSETS_DIR`, `LOCAL_LIGHT_CACHE_DIR`, `USER_RUNTIME_DIR` and `IMPORT_STAGING_DIR` still override one slot each; the slots with no key derive from the root only. The database stores no filesystem path, so a directory move needs no row rewrite.

This tree is a standing on-disk contract. A later change moves the old names through `packages/server/src/entry/boot/migrate-data-layout.ts` (a rename under a journal, before the db opens, refusing when a target already holds data) and supersedes this decision.

A boot secret is generated only when no row depends on it. A missing keyfile that rows depend on is a boot refusal naming the file (`packages/server/src/entry/boot/boot-secrets.ts`).

The checks: `tests/server/foundation/data-layout/index.test.ts`, `tests/server/foundation/env/index.test.ts`, `tests/server/entry/boot/migrate-data-layout.int.test.ts` and `tests/server/entry/boot/boot-secrets.int.test.ts`.

## Consequences

Tooling that reads the dev data dir resolves paths through the same resolver and never spells one. A test or harness that isolates a stack sets `DATA_DIR`, not one slot key, or its secrets land in the checkout's real `data/secrets/`. A container volume from an older image is moved in place on its first boot. The snap stage copies the dev keyfiles beside its copy of the dev db, because a copy of the db without its keys refuses to boot. An operator who deletes a keyfile with data behind it restores it from the backup or sets the env value; the boot does not paper over it.

## Alternatives rejected

- Keep the flat layout and document the exceptions: the exception list is what an operator gets wrong.
- Delete the caches instead of moving them: a rename is free and keeps a warm variant cache and a multi-gigabyte model download.
- A layout-version marker file: a marker can disagree with the tree, and the tree is the state.
- One env key per new directory: every knob is a new way to split the backup unit.
- Move the db by copy: rename is atomic on one filesystem and leaves no window with two live databases.
- Rename `assets/` to `blobs/`: the table, the domain and the env key all say assets, and a second word for one thing is the defect the vocabulary map exists to stop.
- Move `bug-reports/` and `.st-data` under the root: the first is checkout evidence and the second an import input, and nothing backs either up.
- Disable the credentials store on a missing key instead of refusing: a box that boots and silently cannot read its keys is the failure the refusal exists to name.
