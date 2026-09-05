---
kind: review
status: active
updated: 2026-09-05
---

# #1584 integrated gate-runtime checkpoint review

Reviewed range: `80890046b4f93071d2e77cf242abad31eea31d28..019b28ad8df6220b754ead919dbd99623247de53` on `codex/gate-tsmorph-standardization`.

## Findings

### HIGH — A grant whose policy has been deleted is never rejected or declared stale

**Files:** `tooling/src/verify/lib/gate-authority-validation.ts:47-75`; `tooling/src/verify/lib/gate-authority.ts:326-347`

Reviewed-grant validation accepts every well-formed row whose `policyId` is absent from the selected policy table. Reconciliation then emits stale/over-broad alarms only when `completedReviewed` contains that id. A policy removed from the loaded corpus can never enter that set, so its grant remains silently live forever.

**Failure scenario:** policy `deleted-policy` is removed while its exact `(policyId, subject, operation)` grant survives. A whole-corpus run selects and completes every remaining policy, but returns exit-clean authority data: no tool error, no stale alarm, no withheld owner, and consumption `0`. If the id and semantic identity are later reintroduced, the old grant can suppress the new finding without a fresh review. This is the deletion-liveness version of the loaded-gun class that typed grants were introduced to eliminate.

**Reproduction:**

```text
pnpm exec tsx -e '<coordinateGateAuthority probe>'

selectedPolicies: [{ id: "live-policy", authority: "hard", severity: "error" }]
ownerResults: one successful complete live-policy owner
reviewedGrants: [{ id: "orphan-grant", policyId: "deleted-policy", subject: "src/a.ts", operation: "read", ... }]

toolErrors: []
authorityAlarms: []
withheldPolicyIds: []
reviewedGrantConsumption: [{ id: "orphan-grant", count: 0 }]
verdict: { errors: 0, warnings: 0, blocking: 0, failOnWarnings: false }
```

The code receipt is direct: `validateGrantRows` only checks authority when `policies.get(grant.policyId)` returns a selected policy, while `reconcileAuthority` checks zero consumption only behind `completedReviewed.has(grant.policyId)`.

**Required repair shape:** validate every grant's policy id and authority against the loader-derived full corpus before selection, while retaining the current rule that consumption liveness waits for the selected owner to complete. Add a whole-corpus deletion control and keep the existing unselected-live-policy control, so a scoped run does not call another live policy's grant stale.

**Law:** `docs/design/gate-runtime-standardization.md:123-137` requires exact typed grants with post-success liveness and exact rename/deletion liveness; gate modules may not own a second grant registry or parser.

## Verified clean

- Git receipts: the requested base and tip resolve; `HEAD` equals `019b28ad8df6220b754ead919dbd99623247de53`; the worktree was clean before the report; `git diff --check 80890046b..019b28ad8` passed.
- Read the constitution, `.claude/agent-doctrine.md`, the master ledger redirect, the relevant D-registry material, `Core-0` gate/tooling sections, `Core-Tooling-Law.md`, `GATE-AUTHORING.md`, the final runtime design, and the gate-runtime checkpoint reports before judging the code.
- Read the changed final descriptor, authority, loader, validation, scope, compiler-membership, Git inventory, planner, dispatcher, context, conformance, ResourceHost/provider, CLI-tier, and all fourteen converted gate modules in full. Also read their directly called population, workspace, ordinary/reviewed authority, and resource-binding seams.
- The fourteen converted policies pass all 89 declared `mustFlag`/`mustPass` proofs through `verifyPolicyProofs`; zero failures. Structural `ast-grep` sweeps over all fourteen modules scanned 14/14 files for each query and found no gate-owned `Project`, direct source/descendant walk, `WeakMap` cache, legacy descriptor import/field, or baseline reader. Literal corroboration found only explanatory `scanRoot` prose in `settings-section-anchored.ts`.
- Focused composed run: 18 changed runtime test files produced 209/215 passes and zero type errors; six cases hit the same 6,288 ms timeout under concurrent whole-tree structure/gate load. A serial rerun of the five affected files with a 60-second per-test ceiling passed 51/51 with zero type errors, clearing every timeout as load rather than a logic failure.
- The unchanged live-stage compatibility seams also passed fresh: `tests/tooling/verify/ops/run.int.test.ts` and `tests/tooling/verify/cli.int.test.ts` completed 83/83 tests with zero type errors, covering the shared tier tuple, legacy help/refusal surface, and exit-class routing under the 512 MB help ceiling.
- The focused suite covers descriptor branding/plain-object/required-field/work-item validation; unambiguous `defineGate` provenance; 0/1/>1 grant behavior and owner-failure withholding; six scope kinds, published/local-main selection, add/delete/rename/replacement identities, Git symlinks, tsconfig inheritance/references; planner defer/skip/refuse and exact execution-population reconciliation; one-walk dispatch, phase order, re-entry, checker sharing, receipt failure; ResourceHost root/overlay/symlink/cache/receipt behavior; and shared reference/static-value alias, write, dynamic, namespace, global, and re-export cases.
- Shared semantic-reader structural sweeps scanned all eight reader/contract files and found no reader-owned `Project`, `WeakMap`, project walk, hop cap, or depth budget. The dedicated integrated reader suite passed in the focused rerun.
- The bus rename is complete at live code/config/doc sites: the module/id/family, Biome grant removal, `check-gates.int` regex/fixture label, spelling-twins key, active enforcement/design/UI references, and `use-orb-socket.ts` cite use `bus-on-data-no-store-write`. Remaining old spellings are explicitly historical source identities in migration reviews/history.
- `pnpm gate:contract` on the exact tip reported exactly **1,447 findings across 255 gate modules** and exited 1, the expected temporary migration-census verdict. Its header and finding stream remained populated; the count matches the active design's checkpoint and did not hide the residual wrapper, legacy-field, walk, Project/state, or baseline classes.

## Coverage limits and unread regions

- Per charge, I did not run `pnpm check`, `check:structure`, the legacy all-corpus loader, full graph/type programs, global baselines/catalog, knip, dependency-cruiser, CT, e2e, or rendered probes. Broad structure is intentionally red during this atomic migration; no user-visible surface changed.
- The range is 96 files and 21,645 final lines. I read every changed final-runtime integration source, all fourteen converted policies, and the central tests named above in full. I did not independently reread every line of the already-cold-reviewed reference-fact leaf implementations/tests or every ResourceHost leaf test after their dedicated reports; I inspected their final integration seams, structural receipts, diffs, and composed behavior. Their complete prior cold reports are `docs/reviews/stickler/2026-09-05-shared-semantic-readers.md` and `docs/reviews/gate-runtime/resource-host-foundation.md`.
- The large UI law/design files and `biome.json` changed only for the bus-id rename/config-grant removal. I reviewed their exact diffs and ran the literal rename sweep, but did not reread the unrelated portions of `UI-Gates-and-Lessons.md`, `UI-Primitives-and-Reuse.md`, `client-architecture-lockdown.md`, `ui-package-design.md`, `plugin-ui-plane.md`, or all 871 lines of `biome.json`.

## Unconfirmed, low priority

- The compiler-derived final candidate set includes the authored `.mts` test fixture `tests/server/infra/providers/backends/local-light/fixtures/orphan-survival-child.mts`, while the legacy harness/equivalence census was described as a TS/TSX corpus and proof validation accepts only `.ts`/`.tsx`. This may be an intentional compiler-membership widening; I found no current wrong verdict because the final composition root that constructs the execution `Project` has not cut over yet.

## Issue summary

Integrated cold review of #1584 range `80890046b4..019b28ad8` confirmed 1 finding (severity ceiling HIGH): a typed reviewed grant whose policy id no longer exists in the loaded corpus survives a complete run with zero consumption, no stale alarm, no tool error, and no withholding, so it can silently reattach if that identity returns. All 14 converted policies passed 89/89 self-proofs; the focused runtime battery cleared 215/215 cases after six load-timeout non-verdicts were rerun serially. Report: `docs/reviews/stickler/2026-09-05-1584-integration-checkpoint.md`.
