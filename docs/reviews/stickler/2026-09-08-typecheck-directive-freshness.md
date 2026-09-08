---
kind: review
status: active
updated: 2026-09-08
---

# Vitest typecheck directive freshness investigation (#1892)

## Outcome

Confirmed P2 tooling defect, fixed. Vitest 4.1.11 forcibly enabled native TS7 incremental compilation
for both `.test-d.ts` projects, overriding Orbweaver's repository-wide cold-check policy. A warm TS7
build accepted a newly imported `/// <reference lib="dom" />`, updated its file inventory to include
`lib.dom.d.ts`, but retained the prior semantic verdict for the unchanged purity sentinel and exited 0.
This was not a stale project selection, a missing source file, or Vitest's diagnostic parser dropping an
error: direct cold TS7 and classic TypeScript both selected the same files and reported TS2344, while the
same incremental sequence failed only under native TS7.

The fix routes both Vitest type projects through `scripts/ts7.cjs`, the existing executable shared
compiler wrapper, and makes that wrapper remove incremental/build-info arguments before spawning TS7.
Valid long-option bare/paired/equals forms and short `-i`/`-I` bare/paired forms are stripped; unrelated
argv, the configured project, the 16 GiB heap floor, and the shared/dedicated checker cap are preserved.
Malformed boolean and build-info spellings fail before compiler spawn.

## Reproduction boundary

The investigation ran in detached worktree `/tmp/codex-typecheck-freshness` at
`b849e7addf23ed408e2825d90904ad07557feb41`, provisioned by the repository worktree hook with its own
pnpm `node_modules` links. `node_modules/@orb/client` resolved inside that checkout. No parent
`node_modules` symlink was used, and no active-tree cache was deleted or moved.

The exact source bytes were:

| Subject | SHA-256 |
| - | - |
| restored `packages/client/src/forms/index.ts` | `b72c9b18e991e8fae33d08a1c1b08a6a4c9b967cdbfa339bd2f9824f3d537657` |
| same file with only `/// <reference lib="dom" />` prepended | `8c1cb0a46a7562b361e999d0d78cb3a3ca9d59250c500f12a45b27495ef9e9d7` |
| `tests/tooling/client-pure-doors.test-d.ts` | `a53c45b7848b4353cef5748c0f652b3f69769f69bae992aca191a716d24d83e1` |

Every mutation used a byte-identical backup and ended with the original forms file hash plus a clean
scratch worktree before the implementation delta. The active integration tree received only the approved
four-file fix and this report.

## Root cause proof

Vitest's installed `Typechecker.spawn()` constructs these arguments unconditionally at
`node_modules/vitest/dist/chunks/index.UpGiHP7g.js:1547-1563`:

```text
--noEmit --pretty false --incremental --tsBuildInfoFile <vitest-dist>/tsconfig.tmp.tsbuildinfo -p <configured-tsconfig>
```

`strace` of the real pre-fix scoped command confirmed the exact native process:

```text
node_modules/ts7/bin/tsc --noEmit --pretty false --incremental
  --tsBuildInfoFile .../node_modules/vitest/dist/tsconfig.tmp.tsbuildinfo
  -p /tmp/codex-typecheck-freshness/tsconfig.json
```

That contradicts the explicit repository ruling in `tsconfig.base.json:14-29`: incremental compilation
is disabled because a warm native checker already produced false greens after ambient changes.

The controlled sequence was:

1. Cold native Vitest baseline: exit 0. Its build info contained 8,387 files and no DOM library.
2. Add only the reference-lib directive to the imported pure forms front door.
3. Direct non-incremental native TS7 7.0.2: exit 1, TS2344 at the sentinel. Direct non-incremental classic
   TypeScript 6.0.3: exit 2, the same TS2344. Both listed exactly 8,388 files, including
   `lib.dom.d.ts`, `packages/client/src/forms/index.ts`, and
   `tests/tooling/client-pure-doors.test-d.ts`.
4. Direct warm incremental native TS7: exit 0 with no diagnostic. Direct warm incremental classic
   TypeScript: exit 2 with TS2344. This isolates the false verdict to native TS7 incremental invalidation.
5. Exact warm pre-fix `pnpm test:scoped tests/tooling/client-pure-doors.test-d.ts`: exit 0. The build-info
   inventory updated to 8,388 files and added `lib.dom.d.ts`, proving the new source and library were
   loaded despite the stale semantic result.
6. Moving aside only the isolated Vitest build-info file made the exact command exit 1 with TS2344; a
   repeated run stayed red. Restoring the source returned green.

The earlier DOM/export and editor/export probes correctly returned exit 1 because ordinary source
diagnostics were re-evaluated. The reference-lib probe exposed the narrower global-program invalidation
class; those successful probes do not refute it.

Independent cold verification found one completeness defect in the first wrapper revision: native TS7
also accepts `-i` as a case-insensitive short alias for `--incremental`. A real pre-fix wrapper invocation
with `-i` exited 0 and wrote a 9,157-byte build-info file; the wrapper had removed the accompanying long
`--tsBuildInfoFile` pair but passed `-i` to TS7. Native parser controls established the exact short grammar:
bare `-i`/`-I` enables incremental mode, a separate `true`/`false` value is consumed, and equals forms such
as `-i=true` are invalid TS5023 inputs. The final parser strips the valid short forms and rejects invalid
equals forms rather than silently accepting them.

## Fix and permanent controls

`scripts/ts7.cjs:6-64` now normalizes and removes the incremental cache argument family. It accepts the
valid forms Vitest or a direct caller can supply, including TypeScript's case-insensitive long and short
option names, and refuses missing/empty build-info paths or invalid equals-form booleans. The existing
spawn at `:65-82` still injects the configured checker count and heap ceiling.

`vitest.config.ts:170-172,346-376` gives `types-node` and `types-browser` the shared wrapper as their one
checker. `tests/tooling/_shared/concurrency-profile.test.ts:267-328` pins stripping, preservation of
unrelated operands, case-insensitive spellings, and malformed-input refusal. The existing type-lane
membership test now also requires both project configs to name that wrapper at
`tests/tooling/testd-lane-program-coverage.int.test.ts:46-72,111-119`.

Post-fix `strace` showed Vitest still passing its forced cache arguments to the wrapper, followed by the
actual native compiler process with only:

```text
<native-ts7> --checkers 4 --noEmit --pretty false -p <configured-tsconfig>
```

The final warm reference-lib abuse path exited 1 with the expected sentinel `TypeCheckError`. The isolated
Vitest build-info hash remained byte-identical across that run, proving the compiler never read or rewrote
the stale cache. The restored focused test then returned green.

## Verification receipts

- Isolated wrapper/config controls: 2 files, 17 tests passed.
- Isolated complete type lane: both projects, 39 files / 128 tests passed, zero type errors.
- Isolated `pnpm typecheck:graph`: exit 0.
- Isolated final abuse path: baseline green; imported reference-lib directive red with TS2344; source
  restored byte-for-byte; baseline green again.
- Active-tree wrapper/config controls: 2 files, 17 tests passed. Artifact:
  `reports/runs/test/codex-world-gate-integration-3341371-2026-09-08T14-53-02-893Z/test-report.json`.
- Active-tree complete type lane: both projects, 39 files / 128 tests passed. The pre-existing
  `node_modules/vitest/dist/tsconfig.tmp.tsbuildinfo` SHA-256 remained
  `a9408ebf0557571e4c7e4c20492587976f9007c8f081309a359a33886365ac97` before and after.
- Active-tree `pnpm typecheck:graph`: exit 0.
- Scoped Biome over all four fix files: no errors; one inherited warning in the concurrency-profile test, unchanged from baseline. No fixes applied.
- Scoped ESLint over its covered wrapper/test files: exit 0. `vitest.config.ts` is not in ESLint's configured
  surface; Biome and the root graph typecheck own it.
- Final short-alias controls: isolated and active wrapper suites each passed 15/15. Real `-i` bare and
  case-insensitive `-I TRUE` wrapper invocations each exited 0, preserved the other compiler arguments,
  and created no requested build-info file. Invalid short equals form exited 1 before compiler spawn;
  `-i maybe -p tsconfig.json` preserved `maybe` for native TS7, which rejected the incompatible positional
  source with TS5042.

Primary scratch evidence:

- `/tmp/codex-typecheck-freshness-vitest-execve.log` — pre-fix checker argv.
- `/tmp/codex-typecheck-freshness-native-direct.log` and
  `/tmp/codex-typecheck-freshness-classic-direct.log` — cold TS2344 diagnostics.
- `/tmp/codex-typecheck-freshness-native-incremental-directive.log` and
  `/tmp/codex-typecheck-freshness-classic-incremental-directive.log` — native false green versus classic red.
- `/tmp/codex-typecheck-freshness-vitest-warm-directive.log` and
  `/tmp/codex-typecheck-freshness-vitest-cold-directive.log` — identical source, cache-dependent verdict.
- `/tmp/codex-typecheck-freshness-fixed-execve.log` — post-fix wrapper and native argv.
- `/tmp/codex-typecheck-freshness-final-abuse.log` — final red abuse-path result.
- `/tmp/codex-typecheck-short-{bare,false,true,equals}.log` — native short-alias grammar controls.
- `/tmp/codex-typecheck-active-short-{bare,paired}.log` — final active-tree real-process controls.

No compiler version, project membership, diagnostic suppression, or type-world boundary changed. The
fix restores the cold-check behavior the repository already requires.
