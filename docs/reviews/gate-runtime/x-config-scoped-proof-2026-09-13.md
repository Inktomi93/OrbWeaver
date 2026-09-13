---
kind: review
status: active
updated: 2026-09-13
---

# The real-config SCOPED proof for `eslint-grant-liveness` (#2302's residual, under #2147)

Lane `cb-x-config-scoped-proof`, worktree `.claude/worktrees/agent-ab6b7bfeeb195ed31`, based on `0276b6a57`.
Two commits: the instrument repair that made the proof constructible, then the proof.

## 1. What the row asked for, and what now exists

`#2302`'s residual (cb-adj-reconcile, `1ea2c2a0e`, restated in the integration adjudication of
`adj-ledger-reconcile-2026-09-13.md`): *"the hazard is pinned by two mustFlag fixtures, but
`eslint-grant-liveness.int.test.ts:66-67` deliberately defers the real-tree verdict to check:structure, so
the value-at-index against the real `eslint.config.js` SCOPED assertion the row asked for still does not
exist."* Root rejected the CLOSED-with-residual proposal for exactly that reason; the ledger cell stayed OPEN.

It exists now, as four arms in `tests/tooling/verify/gates/eslint-grant-liveness.int.test.ts`, all four over
the REAL `eslint.config.js` through the PRODUCTION resource selection.

## 2. The resource / selection path used (path:line)

| Step | Where |
| - | - |
| the policy's declaration | `tooling/src/verify/gates/eslint-grant-liveness.ts:129` — `resources: [{ kind: "native-config", id: "eslint" }, { kind: "tracked-files" }]` |
| what `native-config:eslint` names | `tooling/src/verify/contract/resource-config.ts:19-31` — `NATIVE_CONFIG_RESOURCE_PATHS.eslint` derives from `STATIC_CONFIG_RESOURCE_PATHS.eslint = "eslint.config.js"` |
| the selection the proof drives | `tooling/src/verify/lib/resource-declaration.ts:195` `resolveResourceDeclarations(host, gate.resources)` over a `createResourceHost({ root: repoRoot })` — asserted to CONTAIN `eslint.config.js` |
| the acquisition | `tooling/src/verify/ops/resource-native-config.ts:11` `loadNativeConfig` → `lib/config-snapshot.ts:190` `readConfigSnapshot` → the niced worker + `@eslint/config-array` |
| the counterfactual door | `resourceOptions.overlay` (`contract/policy-pass.ts:169`) → `lib/config-snapshot.ts:208` → `ops/config-snapshot-transaction.ts:82`, which stages the real authored transaction and runs the native loader inside it |
| the binding fence the scope-cut arm exercises | `tooling/src/verify/lib/resource-policy.ts:25-30` — an undeclared door read THROWS `resource request native-config:eslint is undeclared` |

No arm hand-loads the config, and no arm writes a tracked file.

## 3. The four controls and their receipts

All from `pnpm test:scoped tests/tooling/verify/gates/eslint-grant-liveness.int.test.ts
tests/tooling/verify/gates/grant-liveness-family.test.ts` — **12 passed (12), 2 files**, in this worktree.

**(c) UNMODIFIED config → green.** `every RATIFIED index names the RECORDED selector in the REAL
eslint.config.js` (9.8s): for each of the SEVEN `RATIFIED` keys (`config[0].ignores[0,1,3,4,5,6,7]`) the live
selector at that identity carries the recorded `value` and `members: 0`; the arm also asserts the table is
non-empty, because an empty table satisfies every per-row assertion by vacuity. The same arm then drives
`runPolicyPass` at the real root with no overlay and asserts ZERO `MSG_STALE` findings.

**(a) INDEX-0 INSERT re-points every ratified key.** `an ignore inserted at index 0 of the REAL config
re-points EVERY ratified key, and the policy names them` (6.2s): the real config's text with one new entry
inserted above `"**/node_modules/**"`, through the overlay; the policy's `MSG_STALE` token set equals
`Object.keys(RATIFIED)` exactly — all seven. The anchor is asserted to occur EXACTLY ONCE first (`    ignores: [`
alone occurs TWICE in the real config; a harness that patched the wrong one would measure nothing).

**(b) ONE ratified selector's text changed IN PLACE.** `changing ONE ratified selector's text IN PLACE stales
exactly that key` (6.6s): `"**/.cache/**"` → `"**/.cache-cbx-control/**"` at the same index 5, through the
overlay. Exactly one stale token, `config[0].ignores[5]`, and exactly TWO findings on that identity — the
stale arm plus the ordinary unratified dead-selector arm, the same pair `mustFlag[2]` records for #2213,
now driven against the real config instead of a fixture copy of it.

**(d) DECLARED-SCOPE CUT refuses.** `a NARROWED declaration cannot hide the config: dropping `native-config`
REFUSES instead of passing` (0.05s): the same policy re-branded through `defineGate` with
`resources: [{ kind: "tracked-files" }]` produces ONE tool error at phase `evaluate` reading
`resource request native-config:eslint is undeclared`, a non-`success` owner, and ZERO effective findings.
A narrowed declaration cannot buy a clean verdict.

### The two-sided discrimination receipts (cp-backed, both restored, `git status --short` verified empty)

| Direction | What was moved | Result |
| - | - | - |
| CONFIG side | `"__cbx_realfile_control/**"` inserted at index 0 of the REAL `eslint.config.js` (`cp` backup, `sed`, `cp` back) | **2 failed / 4 passed.** The value-at-index arm names the whole shift: index 0 reads `__cbx_realfile_control/**`, index 1 `**/node_modules/**`, index 3 `reports/**` with `members: 1`, … The in-place arm reports all seven keys stale instead of one. So the arm reads the FILE, and the overlay stage and a real-file edit agree exactly. |
| TABLE side | `RATIFIED["config[0].ignores[5]"].value` → `"**/.cache-TABLE-CONTROL/**"` (`cp` backup, `sed`, `cp` back) | **1 failed / 5 passed** — only the value-at-index arm. Worth recording: arm (b) stays GREEN under a table-side move, because it asserts POLICY BEHAVIOUR (one stale key for one moved value) and not table content. The two arms are not redundant; each is the other's blind spot. |

## 4. The deferral rewrite — and the FORK it resolves

The recorded ruling, in this file's own header (unchanged, still in force):

> The old test's ASSERTION ("only the five ratified zero populations") is NOT restored here: real-tree
> finding correctness for a resource policy is the ORCHESTRATOR's `pnpm check:structure` floor.

and at `:66-67` before this lane:

> The real-tree VERDICT (zero effective findings) is no longer asserted here: the mixed front door runs this
> policy on the real corpus on every `pnpm check:structure` and owns that verdict — see the header.

**What I did:** satisfied the NEW symptom and preserved the OLD mechanism — *the ruling survives, its INPUT
changed*. The blanket verdict (`effectiveFindings` empty over every selector) is still NOT asserted here and
still belongs to the front door. `:66-67` now says so in narrowed terms:

> The BLANKET real-tree verdict (zero effective findings over every selector) is still not asserted here: the
> mixed front door runs this policy on the real corpus on every `pnpm check:structure` and owns finding
> correctness for the NON-RATIFIED selectors — see the header. What the four arms below add is the narrower
> property that ruling never covered: RATIFIED value-at-index against the real config.

with a new header paragraph recording the reconciliation, why the deferral swallowed a narrower property
with it, and what stays deferred. **What I refused:** reinstating the blanket `effectiveFindings === []`
assertion the #1932/#1584 lanes deliberately deleted. Root accepted this resolution before it was written.

**What remains genuinely deferred:** finding correctness for every NON-RATIFIED selector — the file-scope
rows, the local ignores, and `config[0].ignores[2,8,9,10]` — is still the front door's, unasserted here.

## 5. The instrument defect this lane had to repair first (commit 1)

**Symptom.** The overlay door REFUSED at the real repository root, so no counterfactual of the real config
could be observed at all:

```
config-snapshot ESLint tracked path is not a contained transaction file: .agents/skills
  at tooling/src/verify/ops/config-snapshot.ts:587 (eslintTrackedPaths)
```

**Mechanism (source-pinned).** `.agents/skills` is a TRACKED SYMLINK TO A DIRECTORY (`git ls-files -s` → mode
`120000`, target `../.claude/skills`; `.codex/hooks` is its twin, and `.codex/agent-doctrine.md` is a
symlink to a FILE and stays in the population). `lib/policy-repo-inventory.ts:96-97` admits every symlink by
design. `eslintTrackedPaths` had TWO branches over THE SAME LIST: the inventory branch returned
`readPolicyRepositoryInventory(root).trackedPaths` unvalidated, while the SUPPLIED branch — taken only under
an overlay, and built at `lib/config-snapshot.ts:211` from that identical call — threw on
`!statSync(canonical).isFile()`. Nothing caught it because every other overlay caller is a `mode: "resource"`
tmpdir fixture with no symlinks in it.

**Repair.** One rule for both callers: containment still refuses; a contained NON-FILE is EXCLUDED and NAMED
in the snapshot's new `excludedNonFilePaths`, never silently dropped (the visibility condition root set).

**No-behaviour-change receipt (root's condition 2).** Real root, plain (unsupplied) read, before vs after:
all **114 selector rows byte-identical** (`diff` over the sorted JSON), `entries` 27 either way, and
`trackedFiles` **9720 → 9718** — exactly the two tracked symlinks-to-directories, now reported by name.
Vitest and depcruise never call this function.

**Red-first receipt.** With `git show HEAD:<path>` restoring all three sources, the new arms in
`tests/tooling/verify/ops/config-snapshot.int.test.ts` run **2 failed / 25 passed**, both with the exact
defect message on the PLANTED fixture symlink (`src/linked-dir`), never on the live tree's contents; the
containment control (`escape` → `..`, and an absent path) stayed green in both directions, which is what a
fence honestly does. After the repair: **27 passed (27)**.

## 6. Proposed ledger cell text for #2302's OPEN row (`refutation-ledger-2026-09-12.md:916`) — root applies it

- **row:** `:916` (`cb-v-wave-12a`, `eslint-grant-liveness`, the positional re-pointing hazard).
- **current:** `OPEN` — *"the requested real-config scoped proof remains absent, so its ledger cell stays OPEN"*
  (integration adjudication, `adj-ledger-reconcile-2026-09-13.md`).
- **proposed:** `CLOSED` at this lane commit 2 (the sha root ff-lands; it is this document commit, so it cannot cite itself) — the scoped proof exists: four arms in
  `tests/tooling/verify/gates/eslint-grant-liveness.int.test.ts` drive the REAL `eslint.config.js` through the
  production resource selection and assert RATIFIED value-at-index (7/7 keys), the stale-arm token set, an
  index-0-insert counterfactual naming all seven re-pointed keys, an in-place value change naming exactly
  `config[0].ignores[5]` (2 findings), and a declared-scope cut that REFUSES with
  `resource request native-config:eslint is undeclared`. Two-sided cp-backed discrimination receipts (config
  side 2 failed/4 passed, table side 1 failed/5 passed) in
  `docs/reviews/gate-runtime/x-config-scoped-proof-2026-09-13.md` §3. The `:66-67` deferral is NARROWED, not
  deleted — the blanket verdict stays with `check:structure`, per the header ruling this preserves (§4).
  Constructibility required commit 1, `4d6cd67e2` (the `config-snapshot` population repair below).

## LEDGER ROWS (1 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `config-snapshot` | cb-x-config-scoped-proof · `tooling/src/verify/ops/config-snapshot.ts:574-590` (at `0276b6a57`) | `eslintTrackedPaths`' two branches disagreed about ONE list: the inventory branch returned `readPolicyRepositoryInventory(root).trackedPaths` unvalidated, the SUPPLIED branch (overlay only, built from the identical call at `lib/config-snapshot.ts:211`) threw `is not a contained transaction file` on a tracked SYMLINK-TO-DIRECTORY that `lib/policy-repo-inventory.ts:96-97` admits by design (`.agents/skills`, `.codex/hooks`). The ESLint overlay door was therefore UNUSABLE at the real repository root — no counterfactual of the real `eslint.config.js` could be observed — and it was invisible because every other overlay caller is a `mode: "resource"` tmpdir fixture with no symlinks | instrument refuses a legitimate input (one function, two rules) | **FIXED** | measured 2026-09-13 in `.claude/worktrees/agent-ab6b7bfeeb195ed31`: red-first at HEAD source `2 failed / 25 passed` on a PLANTED fixture symlink with the exact message; repaired `27 passed (27)`; no-behaviour-change receipt = 114 selector rows byte-identical before/after on the real root, `trackedFiles` 9720 → 9718 (the two symlinks-to-dirs, now named in `excludedNonFilePaths`). Fixed in this lane commit 1, `4d6cd67e2` |

ledger rows OWED: 1

## 7. What I did NOT cover

- **No whole-tree check.** No `pnpm check`, no bare `check:structure`, no `check:policy-conformance`, no CT,
  no planting suite — the lane's load fence. Bounded `--check` runs only.
- **`gate-modernization` reports 1 violation, and it is not mine:** `vector-scope-derived.ts:42:7
  IMPORT_SANCTIONED`, in a module this lane never touches. `policy-soundness` is clean over the whole
  309-file corpus. Both were run bounded (`pnpm check:structure --check policy-soundness --check
  gate-modernization`) precisely because the gate module gained three exports; neither names my files.
- **`pnpm check:policy-conformance` was not run** — the module's `mustFlag`/`mustPass` rows are unchanged and
  the family test executes them through `verifyPolicyProofs` (6/6), but the conformance STAGE's own verdict
  is the barrier's.
- **`ledgers:fresh` was not run**, so this document's effect on the ledger's line-coupled rows is unmeasured;
  the ledger append is root's.
