---
kind: review
status: active
updated: 2026-09-13
---

# ESLint discovery envelope repair (#2212)

Commit base: `59d30fd49`. Scope: the ESLint discovery producer, reader, and integration family.

## Finding and disposition

The existing `count` and `files` fields came from one `files` array in one JSON serialization. Their equality
could validate envelope consistency, but could not independently prove enumeration completion or diagnose a
transit clip. A clip of that serialized payload failed first in `JSON.parse` with a bare `SyntaxError`, while a
forged count mismatch incorrectly claimed truncation and prescribed a larger `maxBuffer`.

The producer still owns discovery through ESLint's native `lintFiles(["."])` result, and the compiler-program
partition is unchanged. The reader now:

- wraps malformed JSON with an ESLint-discovery no-verdict diagnostic and retains the parser error as `cause`;
- describes a valid-JSON count mismatch as an inconsistent envelope, without assigning an ENOBUFS or truncation
  cause;
- treats the count as a consistency checksum over the same producer-owned list.

The test serializes the healthy producer shape, clips that payload, checks the translated error and retained
`SyntaxError`, passes the healthy envelope, and refuses a forged mismatch without a `maxBuffer` prescription.
The existing tiny-buffer ENOBUFS control, real native-discovery comparison, and native compiler partition
controls remain in the same family.

The live worktree measurement on 2026-09-13 was 445,877 bytes across 7,775 files, below Node's default capture
ceiling. The historical ENOBUFS condition therefore does not reproduce on this fenced repository population;
the explicit 64 MiB production fuse and its forced 8-byte failure control remain valid.

## Receipts

- Red first: the clipped producer payload failed the new assertion with the raw JSON parser message; 1 of 8
  tests failed.
- Restored: `pnpm test:scoped tests/tooling/verify/ops/eslint.int.test.ts` — 8 passed; report
  `reports/runs/test/agent-a4b56e42a341a205a-882843-2026-09-13T08-33-38-514Z/test-report.json`.
- `pnpm exec biome check <three touched TypeScript files> --diagnostic-level=error` — clean.
- `pnpm exec eslint <three touched TypeScript files>` — clean.
- `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` — both programs passed.

## LEDGER ROWS (0 rows)

This repairs the already-owned #2212 defect and found no separate instrument defect.

ledger rows OWED: 0
