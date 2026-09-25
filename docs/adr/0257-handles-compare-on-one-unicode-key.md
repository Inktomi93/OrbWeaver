---
kind: adr
status: active
updated: 2026-09-25
---

# Handles compare on one Unicode key

## Context

A signup invite is the one path where a stranger picks a handle, and a handle is what a member sees beside every line. A case variant, a compatibility form or a look-alike from another script of a member's handle lets a stranger pass as that member. SQLite `lower()` folds ASCII only, and UTS 39 confusable data maps single characters to prototypes, not whole scripts.

## Decision

Every handle writer compares on one key and refuses a handle it may not store. The writers are the `local` signup route, `createUser`, `provisionIdentity` (the JIT insert and an IdP rename) and the `oidc` pending join. Homes: `packages/kit/src/handle-key/` (`handleKey`, `admitsHandle`), the `users.handle_key` column, and each writer's check.

The key. `handleKey` is two passes of: NFKC, the UTS 39 `internalSkeleton` of the upper-cased form, full case folding, the skeleton again and case folding again. The first skeleton sees capital look-alikes such as Cyrillic `Н`, the second sees lowercase-only ones such as `ɑ`, and the folds make the key case-insensitive. One pass is not idempotent (`ɪ` reaches `i`, which the next pass takes to `l`); two passes are. `users.handle_key` stores the key under a unique index, a writer refuses a key another row holds, and both signup inserts repeat that as a `NOT EXISTS`. An IdP rename onto a held key keeps the old handle. Every handle write goes through `sessions/persistence/users.ts`, which derives the key: admin's mint as an unexecuted statement in its audited batch, and boot's owner seed-key rename through `updateUser`. The displayed handle is never folded.

The admission. `admitsHandle` refuses a handle outside the UTS 39 highly restrictive profile, read from the NFKC form: one script, or Latin with Japanese, Korean or Chinese writing. Common and Inherited characters fit any script, and an unassigned code point fits none. It refuses a handle whose key is blank (only default-ignorable or blank characters), and a handle over `HANDLE_MAX_CODE_POINTS` before any normalization, because NFKC over a long run of combining marks is quadratic; the `createUser` input and `identityFromClaims` refuse one at the boundary and never truncate an IdP name. A writer checks admission before the key; an IdP rename onto an inadmissible handle keeps the old handle.

The data. `baseline unicode-handle-key` vendors the case folding, default-ignorable, confusable and script-code tables for the engine's Unicode version, refusing a source whose SHA-256 differs from its pin, and a kit test pins the two versions together. A Unicode bump re-keys every `users.handle_key` row.

Checks: the `handle-key-writer` gate (a users write that sets `handle` without `handleKey`), the kit suite (idempotence and case-insensitivity over the BMP, the look-alike and mixed-script cases), `users_handle_key_unique`, and each writer's suite.

## Consequences

`i`, `I` and `l` share a key, so `ian` and `lan` cannot both exist; a case-preserving display shows `Ian` and `lan` alike. Residual: a single-script look-alike that UTS 39 does not map, and a spoof that depends on bidirectional display order, since the key compares logical order. Keys compare only under one Unicode version.

## Alternatives rejected

- `lower()` in SQL: it folds ASCII only.
- NFKC, case fold, then skeleton, in that order: folding first turns Cyrillic `Н` into `н`, whose prototype is `ʜ`, so `Нost` and `host` differ.
- An npm dependency for confusables: the vendored tables and a pinned generator do the same work with no new supply chain.
