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

## Integrated verification

Main `204607e84` passed all 8 tests in `eslint.int.test.ts`. Native discovery measured 449,336 bytes across 7,811 admitted files. Artifact: `reports/runs/test/main-955718-2026-09-13T08-46-27-341Z/test-report.json`. This is a dated measurement, not a fixed population contract.

# #2212 final review

**Verdict: ACCEPT.** Reviewed commit `1a2d144b9cfdbeb66a27dd028921b447cbbd0334` and the complete changed implementation, test, and report files. I did not rerun the ~30-second real-tree enumeration because the committed artifact already records the requested 8/8 run and source review exposed no new concern requiring a duplicate floor.

## Findings

`parsedDiscovery` now catches only the `JSON.parse` boundary and throws a discovery-owned error stating that no lint verdict is available while retaining the original error as `cause` (`tooling/src/verify/ops/eslint.ts:39-45`). Shape, filename-list, count-type, and count-equality failures remain distinct explicit refusals (`:46-60`). Because `readDiscoveredPopulation` rethrows every non-ENOBUFS error unchanged (`:108-120`), malformed/clipped JSON cannot be relabelled as a capture-ceiling failure.

The valid-JSON mismatch diagnostic says only that the envelope is inconsistent and no verdict exists (`:56-59`). It neither says the transport truncated the list nor recommends `maxBuffer`. That is the strongest support available from a count and array produced from the same list. The tests construct a healthy producer-shaped envelope, clip it, require the translated message and a `SyntaxError` cause, forge a same-envelope mismatch, reject malformed shapes, and retain the healthy twin (`tests/tooling/verify/ops/eslint.int.test.ts:83-108`). The separate 8-byte ENOBUFS arm still requires the ceiling-specific site and remedy while a normal-ceiling twin succeeds (`:111-127`).

Native population ownership is unchanged. `discoverEslintFiles` still loads the flat config, disables typed program creation and rule execution only for discovery, calls ESLint's `lintFiles(["."])`, and normalizes its returned paths (`eslint-discovery.ts:38-50`). Its runtime change is documentation of the envelope's actual limit. `runEslint` still cross-checks ConfigArray admission, reads the native compiler inventory, partitions through `predictedProgram`/compiler membership, and runs the unchanged ESLint shards (`eslint.ts:134 onward`). The existing tests retain native-dot equality and typed/untyped/unowned/duplicate partition controls (`eslint.int.test.ts:15-69`).

## Receipts and limits

The committed artifact `reports/runs/test/agent-a4b56e42a341a205a-882843-2026-09-13T08-33-38-514Z/test-report.json` records 8/8 passing. The earlier artifact `...-865977-2026-09-13T08-30-28-444Z/test-report.json` records the clipped control red first: exactly the envelope test failed because the raw parser error escaped, while 7 tests passed. The final artifact proves the real-tree measurement test executed, but JSON reporter output does not retain its stderr measurement line. The report records that run as 445,877 bytes across 7,775 files; I verified the test computes both values from live native discovery and asserts the payload below both 64 MiB and the current 1 MiB population threshold, but I did not independently reproduce those exact transient numbers.

The repaired envelope detects malformed serialization and internal disagreement. It cannot prove that the producer's native enumeration itself omitted a file, because `count` and `files` share one source; the comments and report now state that limit honestly. It also does not simulate a well-formed prefix loss with a correspondingly forged count, which is indistinguishable within this protocol. The explicit spawn ENOBUFS path owns actual capture loss.

No confirmed blocker found.

Integrated native `tooling/tsconfig.json` and `tsconfig.json`, scoped Biome, and scoped ESLint also passed after the repair train reached `0276b6a57`.
