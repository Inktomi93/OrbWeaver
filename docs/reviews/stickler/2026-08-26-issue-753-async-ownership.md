---
kind: review
status: active
updated: 2026-08-26
---

# Issue #753 async ownership audit

Cold investigation at canonical commit `2d16ef60c90cff86ab236664691d595ddcc14327` in isolated worktree `/tmp/orbweaver-753-stickler.MyN8wqRe/wt`. This report classifies the complete authored-source `require-atomic-updates` population, audits the six recent synchronous admission-lock surfaces, evaluates TanStack mutation scopes for preset autosave, and evaluates whether `fast-check` earns a dependency. No product source, test, package, lockfile, catalog, or Project state was changed.

## Confirmed findings

### P1 — `packages/server/src/infra/providers/vllm/engine/supervisor.ts:436` — one run clears another same-engine run's pending ownership

`queueSpawn` writes `s.pendingSpawn = true` synchronously at line 441 for each admitted operation, appends the operation to one global `spawnChain`, and every operation unconditionally writes `s.pendingSpawn = false` in its own `finally` at line 436. The boolean therefore describes the most recently completed operation, not the multiplicity of queued/running operations for that engine. When two `restart("embed")` calls are admitted, the first operation can clear the bit while the second remains queued or active. The monitor reads that false bit through `viewState` at lines 152 and 521 and can admit a third restart, producing an unnecessary kill/spawn and another breaker charge.

This was reproduced against the real supervisor in this session, not only modeled. A temporary Vitest test started the supervisor, allowed adoption, issued two concurrent admin restarts for `embed`, parked the first and second operations at their real 3,000 ms waits, made `embed` unhealthy after the first operation cleared the bit, and advanced the real 21,000 ms monitor interval. Before the second operation completed, the monitor admitted an unintended third operation. The final trigger count was three, where the two explicit restarts should have been the complete population; the unexpected third operation was visibly parked at the monitor's 5,000 ms wait. Command:

```text
pnpm exec vitest run --config reports/stickler/scratch/vitest.config.ts
```

Result: `1 passed`. The temporary test/config were removed after recording this receipt. The permanent supervisor suite also passed all 43 tests, but none composes two same-engine admin restarts with a monitor tick during the second queued operation:

```text
pnpm exec vitest run --project unit tests/server/infra/providers/vllm/engine/supervisor.test.ts
```

Result: `43 passed`. Existing tests for a monitor tick during restart backoff cover only one queued owner and therefore do not prove the multiplicity invariant.

Consequence: an ordinary concurrent restart/monitor interleaving can spawn an engine a third time, kill or replace a healthy just-started process, and double-charge the restart breaker. Verdict: **CONFIRMED_RACE**.

### P2 decision — `packages/server/src/entry/lifecycle.ts:217` — OIDC discovery-cache concurrency has no settled contract

`getConfig()` reads `cachedConfig` before awaiting discovery and assigns with `cachedConfig ??= await discovery(...)`. Two cold callers can both observe `undefined`, both perform discovery, and receive distinct `Configuration` instances even though only the first result is retained. This is directly implied by the read/await/write shape; there is no synchronous promise owner and no concurrency test.

Whether that is a defect is a product/owner decision, not something the lint rule can decide:

- If the contract is one cold discovery shared by all callers, the current code violates it, can apply duplicate load to the identity provider, and gives concurrent callers different success/failure outcomes.
- If the contract is only “cache one successfully settled result” and duplicate cold discovery is acceptable, this is safe and should be covered as the intended behavior.

Verdict: **REQUIRES_PRODUCT_DECISION**. It is not counted as a confirmed race until that contract is chosen.

## Detector reproduction and population delta

ESLint is `10.7.0`. The repository config does not enable `require-atomic-updates`; `--print-config packages/client/src/agent-seed/index.ts` returned the rule as absent. The exact configured-source command was:

```text
pnpm exec eslint 'packages/*/src/**/*.{ts,tsx}' 'tooling/src/**/*.{ts,tsx}' \
  --rule 'require-atomic-updates:error' --format json
```

At both pinned commits, 3,612 tracked package/tooling TS-family files existed. The repository's `eslint.config.js` ignores two generated files (`**/*.gen.ts` and `packages/ui/src/tokens/index.ts`), so ESLint actually scanned **3,610 files: 2,916 TS and 694 TSX**. At current `2d16ef60c`, that command produced **20 report rows**. At old `a3defb6e5514f2187a31df2c31028cc7e8b71e0d`, the same command produced **22 rows**.

The repository config ignores all of `scripts/**`, so adding a scripts glob to that command exits with “all files ignored”; it cannot substantiate the issue body's claim to include authored scripts. I therefore ran the scripts corpus with this explicit detector-equivalent config at `/tmp/orbweaver-753-eslint-scripts.config.mjs`:

```js
import tseslint from "/tmp/orbweaver-753-stickler.MyN8wqRe/wt/node_modules/.pnpm/typescript-eslint@8.65.0_eslint@10.7.0_jiti@2.7.0_supports-color@7.2.0__supports-color@7.2.0_typescript@6.0.3/node_modules/typescript-eslint/dist/index.js";

export default [{
  files: ["scripts/**/*.{ts,tsx}"],
  ignores: ["scripts/probes/st-goldens/sillytavern-runtime/**"],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      ecmaFeatures: { jsx: true },
    },
  },
  rules: { "require-atomic-updates": "error" },
}];
```

```text
pnpm exec eslint 'scripts/**/*.{ts,tsx}' \
  --config /tmp/orbweaver-753-eslint-scripts.config.mjs --format json
```

That scanned **33 TS and 0 TSX** and produced **4 rows** at each commit. The honest stated authored scope is therefore **3,643 files: 2,949 TS and 694 TSX**, with **24 current rows** and **26 old rows**.

The issue body's old total of 22 is reproducible only for package/tooling source; it omits all four authored-script rows despite saying scripts are included. Its stated 3,618-file count is not reproducible at either pinned commit from the stated globs: the repository has 3,612 tracked package/tooling files, ESLint scans 3,610 after configured ignores, and the honest scripts-inclusive scope is 3,643. No undocumented eight-file subset was invented to force the old number.

There is no unexplained row disappearance. A scoped two-commit diff shows only `packages/client/src/agent-seed/index.ts` and its new `retry-attempt.ts` changed. The old agent-seed implementation reported at lines 353, 439, and 441; integrated #752 removed the race and two of those three reports. The surviving current line 439 assignment is protected by `GameSeedFlights.run`: a flight is owned synchronously before the first await, compatible callers join it, incompatible callers refuse, and `PendingGameSeed.releaseOwnership` is identity-guarded. Every other old report survives at the same line and classification. The exact net delta is therefore **26 → 24 honest rows**, or **22 → 20 configured-only rows**, entirely due to #752.

Measured precision for current report rows is **1/24 = 4.17% confirmed race**, **22/24 = 91.67% safe false positive**, and **1/24 = 4.17% product decision**. For package/tooling-only output it is 1/20 = 5% confirmed. Row precision is not defect precision: old #752 emitted three rows for one defect; old report-row classification was 4/26 confirmed rows (15.38%), 21/26 safe, and 1/26 decision.

## Complete current-row semantic classification

Every file named below was read in full. “Test proof” distinguishes a test that exercises the ownership/interleaving from a merely adjacent suite.

| Path:line | Read / await / write shape and actual owner | Possible interleaving and verdict | Existing test proof |
| --- | --- | --- | --- |
| `packages/client/src/agent-seed/index.ts:439` | Reads prerequisite state, constructs function-local `PendingGameSeed`, then publishes it. The outer `GameSeedFlights` synchronously owns the `(profile,title)` flight before its first await; the attempt is owned by that flight. | Compatible calls join; mismatches refuse before release; failed owners release; stale cleanup cannot clear a successor. **SAFE_FALSE_POSITIVE** after #752. | Yes: all 30 permanent agent-seed tests plus the five #752 hostile controls cover four-way join, mismatch-before-release, immediate retry, prerequisite recovery, and stale cleanup. |
| `packages/client/src/features/chat/anchors/character-gallery-dialog.tsx:223` | A synchronous ref admission owns the discrete gallery-add command before awaiting the mutation; only the captured owner clears it. | Same-task repeated command is stale input and is deliberately dropped, not queued. **SAFE_FALSE_POSITIVE**. | Yes: CT holds the mutation, repeats the task, asserts one call, then proves retry after settle. |
| `packages/client/src/features/chat/components/add-chat-book-dialog.tsx:73` | Same synchronous `ownedRef` ownership for one discrete add-book command. | A second click while the exact command is outstanding must not create a second attachment. **SAFE_FALSE_POSITIVE**. | Yes: same-task CT proves one mutation and post-settle retry. |
| `packages/client/src/features/chat/components/add-chat-document-dialog.tsx:79` | Same synchronous `ownedRef` ownership for one discrete add-document command. | Repeated outstanding command is dropped by contract. **SAFE_FALSE_POSITIVE**. | Yes: same-task CT proves one mutation and post-settle retry. |
| `packages/client/src/features/settings/hooks/use-theme-autosave.ts:58` | `mintRef.current ?? mint()` is captured and stored synchronously before the create await. Overlapping saves await the same mint promise and publish the same returned row id; rejection clears the mint ref for retry. | Overlaps cannot mint different rows or publish different ids. **SAFE_FALSE_POSITIVE**. | Partial: CT proves zero edits do not mint, first edit mints exactly once, and subsequent save updates the minted row/status. There is no explicit held-concurrent-mint test, but the promise-owner shape is direct. |
| `packages/client/src/lib/session-channel.ts:141` | `localLeaderBusy` is the fallback single-flight owner; the primary path uses Web Locks with `{ ifAvailable: true }`. The leader runs and followers observe, rather than queueing duplicate leadership. | Two contenders cannot both own local leadership; the follower is intentionally non-owning. **SAFE_FALSE_POSITIVE**. | Yes: seven tests include a deliberately unavailable/drop lock and prove two contenders produce one leader run plus follower behavior. |
| `packages/client/src/state/durable-local.ts:179` | `bindTail` serializes every `bindQueuedUser`; desired-user identity is checked before and after hydration before `readyUserId` is published. | Later requested users cannot be overwritten by a stale earlier hydration. **SAFE_FALSE_POSITIVE**. | Yes: ten tests include a held hydration gate and failure/retry. |
| `packages/server/src/domain/automation/engine/analysis-arm.ts:352` | The route evaluates and then writes into one function-owned `DispatchFrame.env.vars`; arm execution for that frame is sequential. | There are no concurrent writers to one frame; ordered writes are the automation semantics. **SAFE_FALSE_POSITIVE**. | Yes: integration tests exercise set/increment within an arm and cross-rule same-batch behavior. |
| `packages/server/src/domain/automation/engine/arm-executors.ts:115` | An awaited evaluation feeds a write into the same dispatch-owned frame; `runArms` and `runDispatch` await arms sequentially. | No sibling arm writes concurrently; later arms intentionally see earlier values. **SAFE_FALSE_POSITIVE**. | Yes: integration tests prove routed score/variable behavior, including the NEEDLE case. |
| `packages/server/src/domain/character/seeder/seed.ts:146` | `redressed` is a function-local accumulator updated inside a sequential awaited card walk; per-user `inFlight` coalesces concurrent `ensure` work. | No other invocation shares this accumulator. **SAFE_FALSE_POSITIVE**. | Partial: seeder tests prove pack migration/count outcomes; no explicit concurrent-ensure test is needed to establish the local accumulator's ownership. |
| `packages/server/src/entry/lifecycle.ts:217` | Two cold callers can read undefined, await separate discovery calls, then each return its own result while only one is cached. | Distinct concurrent results are possible. **REQUIRES_PRODUCT_DECISION** as detailed above. | No concurrency test or documented contract. |
| `packages/server/src/entry/lifecycle.ts:612` | Shutdown sets `isShuttingDown = true` synchronously before awaiting; one admitted shutdown sequentially closes the server and clears the captured resource. | Repeated signals are intentionally dropped; there is one lifecycle owner. **SAFE_FALSE_POSITIVE**. | Partial: lifecycle E2E proves shutdown; no explicit double-signal test. |
| `packages/server/src/entry/lifecycle.ts:646` | Same admitted shutdown owner sequentially closes and clears the captured database after the server. | No competing shutdown writer survives the synchronous guard. **SAFE_FALSE_POSITIVE**. | Partial: lifecycle E2E proves normal close; no explicit double-signal test. |
| `packages/server/src/infra/providers/vllm/engine/supervisor.ts:436` | Each queued operation writes one shared engine boolean true and each `finally` writes false, while multiple same-engine operations can occupy the global chain. | Earlier completion clears later ownership; monitor admits a third operation. **CONFIRMED_RACE**. | No permanent proof; existing 43 tests miss the composition. The temporary real-supervisor reproduction passed as detailed above. |
| `tooling/src/snap/ops/capture.ts:35,39,43,44,47,48` | One `capture()` call owns one local `outcome`. It awaits eval/contrast/map sequentially and fills the corresponding result/error fields; `capturePages` awaits captures sequentially. | No shared outcome exists across calls, so there is no cross-call writer. **SAFE_FALSE_POSITIVE** for all six rows. | Adjacent browser integration tests inspect capture artifacts/fields, but no concurrency test is relevant to a function-local owner. |
| `scripts/probes/impersonate/run.ts:331` | The top-level sequential scenario loop awaits judgment and writes the result to that loop's current scenario object. | No parallel scenario writer exists. **SAFE_FALSE_POSITIVE**. | No automated test; this is an authored probe. |
| `scripts/probes/sdk-cache-probe.ts:210` | The top-level sequential scenario runner executes scenarios in fixed order and publishes the returned SDK session id into one probe-local shared fixture. | The next scenario starts only after the prior one settles. **SAFE_FALSE_POSITIVE**. | No automated test; this is an authored probe. |
| `scripts/probes/st-goldens/generate-goldens.ts:554,585` | One `main()` owns process exit status; sequential branches set the conventional process-global `exitCode` after awaited generation/cleanup outcomes. | There is no concurrent invocation inside the process. **SAFE_FALSE_POSITIVE** for both rows. | No automated test; this is a generation script. |

## False-positive mechanism taxonomy

- **Synchronous discrete-command admission/ref ownership:** gallery, book, document, theme mint, session leader.
- **Explicit serialization plus identity guard:** current agent-seed flights and durable-local bind tail.
- **Owner-local sequential accumulator/frame/result:** automation frames, character seeder, capture outcome, and the three script probes/generators.
- **Single admitted lifecycle owner:** server/database shutdown.
- **Equivalent idempotent publication:** all theme-mint waiters publish the same promised row id.
- **Scalar state representing multiplicity:** vLLM `pendingSpawn`; this is the confirmed defect.
- **Settled-result cache without a chosen concurrent-cold contract:** OIDC; this is the decision seam.

This population does not justify enabling the core rule with a generic suppression ledger. The rule has low measured precision here and cannot distinguish deliberate ownership protocols from real multiplicity loss. Fix the one proven defect and settle the one actual contract question.

## Six synchronous admission-lock contracts

The six requested surfaces contain seven refs because RPG has separate create and engage commands:

| Surface | Source receipt | Contract and test receipt | Verdict |
| --- | --- | --- | --- |
| Regex bulk enable/disable | `packages/client/src/features/regex/components/regex-bulk-bar.tsx:78-107` | One discrete bulk command owns `enabledWriteInFlight`; same or opposite gesture during that exact write is stale. `regex-bulk-bar.ct.tsx` covers held same-task and opposite-task cases. | Intentional **DROP**, not queue. |
| Regex global enable/disable | `packages/client/src/features/regex/components/regex-context-body.tsx:82-90` | One global toggle command owns `globalAdmission`. `regex-context-body.ct.tsx` covers held repeated/opposite input. | Intentional **DROP**. |
| RPG create | `packages/client/src/features/rpg/components/rpg-game-door.tsx:36-46` | A create click is a discrete idempotence door. CT proves held repeated create yields one call and later retry. | Intentional **DROP**. |
| RPG engage | `packages/client/src/features/rpg/components/rpg-game-door.tsx:37,52-60` | A held engage is one discrete command; replaying it after settle could duplicate/reverse user intent. CT proves one call and retry. | Intentional **DROP**. |
| Automation rule enable | `packages/client/src/features/automation/components/rule-row.tsx:121-133` | One enable/disable command owns `enableAdmission`; held same/opposite actions are stale. Rules-section CT covers repeated Enable and Enable/Disable orderings. | Intentional **DROP**. |
| Plugin enable | `packages/client/src/features/plugin/components/plugin-row.tsx:77-91` | One plugin state transition owns `enableAdmission`. Plugin settings CT covers same/opposite held gestures. | Intentional **DROP**. |
| Admin approval | `packages/client/src/features/user-admin/components/admin-approvals-section.tsx:76-87` | Approval is one discrete command, not an edit stream. CT proves held repeated approval is admitted once and can retry. | Intentional **DROP**. |

Focused command:

```text
pnpm exec playwright test -c playwright-ct.config.ts \
  tests/client/features/regex/components/regex-bulk-bar.ct.tsx \
  tests/client/features/regex/components/regex-context-body.ct.tsx \
  tests/client/features/rpg/components/rpg-game-door.ct.tsx \
  tests/client/features/automation/components/rules-section.ct.tsx \
  tests/client/features/plugin/surfaces/plugins-settings-surface.ct.tsx \
  tests/client/features/user-admin/components/admin-approvals-section.ct.tsx \
  --grep 'same-task|same-task opposite|repeated Enable|Enable then Disable|Disable then Enable' \
  --workers=2
```

Result: **9 passed**.

I also swept the likely drop-lock spelling structurally in both languages:

```text
ast-grep run -p 'useRef(false)' -l ts packages/client/src tooling/src scripts \
  --inspect summary --json=compact
ast-grep run -p 'useRef(false)' -l tsx packages/client/src tooling/src scripts \
  --inspect summary --json=compact
rg -l 'useRef\(false\)' packages/client/src -g '*.{ts,tsx}'
```

The structural scans covered 1,127 TS and 588 TSX files and returned 22 hits in 17 files. Every hit was read in its owning file. No autosave/edit-stream in-flight drop lock exists. The generic create-autosave form's `programmaticWriteRef`, `stoppedRef`, and `discardRef` are not admission locks: `stoppedRef` is a circuit breaker, the draft is mirrored before its early return, and retry remains available. The remaining refs are discrete command, lifecycle, or UI-state guards (snapshot/tag, persona duplicate, notification action, invite preview, modal, and scroll behavior), not editable-draft loss.

## Preset autosave and TanStack mutation scope

`packages/client/src/features/preset/hooks/use-preset-autosave.ts` and its generic form/tests were read in full. `forkRef` and `chainRef` at lines 88-90 are not merely a mutation queue. The chain at lines 146-169 serializes this whole composition:

1. resolve the current target identity from any prior fork;
2. merge the newest patch into the queued snapshot;
3. optionally park for an owner fork-choice;
4. update or fork;
5. retarget selection/default/drill state before the next save starts; and
6. repair the chain after rejection so later saves still run.

TanStack Query `5.101.4` does support serial mutation scopes: mutations with the same `scope.id` enter one serial queue, and the mutation cache resumes the next paused mutation in `finally`. [The official mutation-scope documentation](https://tanstack.com/query/latest/docs/framework/react/guides/mutations#mutation-scopes) confirms that behavior. That primitive does not preserve this hook's contract with less code:

- A static source-preset scope can queue saves begun under the source hook, but the target identity is dynamic and is known only after an earlier fork/choice response.
- Retargeting remounts the editor under a new preset id/scope, so queue continuity would break unless a new synthetic lineage identity were introduced.
- Scope serializes the mutation execution, not the surrounding fork-choice parking, snapshot merge, selection/default/drill retargeting, or rejection repair. Moving all of that into `mutationFn` would retain the manual composition while hiding it behind a mutation queue.
- React Query's hook options own `scope`; the per-call mutate options only carry callbacks, so the dynamic target cannot be cleanly selected per queued call.

Verdict: keep the explicit chain. `scope.id` makes dynamic identity/composition worse and does not reduce code; do not change merely to use the feature.

Focused CT command:

```text
pnpm exec playwright test -c playwright-ct.config.ts \
  tests/client/features/preset/surfaces/preset-editor-surface.ct.tsx \
  tests/client/features/shared/create-autosave-entity-form.ct.tsx \
  --grep 'FORK-ONCE|FORK-CHOICE|older completion|save failure exposes Retry' \
  --workers=2
```

Result: **6 passed**, covering held second save after fork-once, fork-choice parking without a write, keep/new choice, delayed completion not retargeting a user-selected other preset, newer-completion ownership, and failure/retry.

## `fast-check` dependency assessment

`fast-check` is absent from tracked manifests, source, and lockfile. `pnpm list fast-check --depth 10 --json` found no package. Structural import sweeps scanned 4,615 TS and 1,215 TSX files with no matches, and a literal `rg` independently found no import. Nothing was installed.

After integrated #752, the pure `PendingGameSeed`/`GameSeedFlights` seam already has 30 permanent tests plus five hostile interleaving controls. A bounded scheduler trial would earn consideration only if it did all of the following:

- generate three or four calls over a compatible `(profile,title)` plus one mismatch;
- schedule controllable promises at prerequisite resolution, first seed step/failure, finish, and immediate retry;
- assert at most one compatible owner, common joined `chatId`, refusal before release for the mismatch, release after failure, fresh ownership on retry, and stale cleanup unable to clear the successor;
- persist the random seed/path and scheduler report for replay/shrink; and
- reproduce against pre-#752 code as a planted positive, then shrink a **distinct** current ordering not already represented by the permanent and hostile cases.

[fast-check's scheduler guidance](https://fast-check.dev/docs/advanced/race-conditions/) also notes that uncontrolled tasks make replay harder. Here the scheduler could control only the wrapped promise seams; it cannot add unmanaged external events. Unless the bounded spike discovers and shrinks a new ordering, the dependency has no value. Current recommendation: **do not add `fast-check`**.

## Board-ready follow-ups

### A. Confirmed bug

- **Title:** Count per-engine queued vLLM spawn ownership instead of clearing a shared boolean
- **Kind:** Bug
- **Priority:** P1
- **Area:** Server infrastructure / vLLM supervisor
- **Current receipts:** `packages/server/src/infra/providers/vllm/engine/supervisor.ts:436,441,521`; first queued run clears `pendingSpawn` while a later same-engine run remains queued/running. Permanent suite passes 43 tests but lacks this composition.
- **Reproduction:** Start/adopt engines; issue two concurrent `controller.restart("embed")` calls; park their real 3,000 ms waits; after the first run clears the bit, make embed unhealthy and advance the 21,000 ms monitor interval. The monitor admits a third run, leaving a 5,000 ms monitor wait and producing three spawn triggers for two explicit commands.
- **Scope:** Repair per-engine queued/running ownership and add the red-first real-supervisor regression. Preserve global cross-engine spawn serialization, breaker policy, monitor cadence, and admin restart semantics.
- **Exclusions:** No general ESLint enablement/suppression ledger; no supervisor architecture rewrite; no changes to unrelated admission locks.
- **Done criteria:** `pendingSpawn` remains true while any same-engine operation is queued/running; a monitor tick in the reproduced window cannot admit a third operation or double-charge the breaker; the new regression fails before/fixes after; all existing 43 supervisor tests remain green.
- **Recommended disposition:** **Ready**.

### B. Product/owner decision seam

- **Title:** Decide whether OIDC discovery caching is single-flight or settled-result-only
- **Kind:** Decision
- **Priority:** P2
- **Area:** Authentication / OIDC lifecycle
- **Current receipts:** `packages/server/src/entry/lifecycle.ts:189,217-218`; two cold callers can both perform discovery and return different `Configuration` objects. No concurrency test or documented contract chooses whether that is acceptable.
- **Reproduction:** Hold the first injected `discovery` promise, call `getConfig()` a second time before resolving it, and record two discovery invocations/two returned objects; settle or reject them independently to expose the contract fork.
- **Scope:** Owner chooses and records one contract. If single-flight, implement one synchronous promise owner with rejection recovery and a hostile concurrent-cold test. If duplicate cold discovery is allowed, document and test that settled-result-only behavior.
- **Exclusions:** No OIDC protocol redesign, provider change, auth flow expansion, or broad cache abstraction.
- **Done criteria:** The owner ruling is explicit; a deterministic two-cold-caller test proves it; success and rejection/retry behavior match the ruling; no caller can accidentally depend on the opposite contract.
- **Recommended disposition:** **Needs-owner**.

After these two items exist, issue #753 itself should receive this classification artifact and be marked Done/closed. Its population has been fully adjudicated; neither a generic suppression ledger nor adoption of either proposed primitive remains as implementation work.

## Verification log

- Read in full: `.claude/agent-doctrine.md`, `docs/architecture/core/AGENTS.md`, the D-ledger and relevant spine/design documents, current issue #753 and integrated #752 material, all 18 source files containing the 24 current reports, the six admission-lock source files and their focused tests, preset autosave hook/form/tests, installed TanStack mutation core/React implementation, agent-seed flight primitives/tests, supervisor source/tests, and all other cited ownership/tests.
- Detector outputs were retained in `/tmp/orbweaver-753-eslint-packages-tooling.json`, `/tmp/orbweaver-753-eslint-scripts.json`, `/tmp/orbweaver-753-eslint-old.json`, and the corresponding old scripts output. Both exact commits used the same commands/config.
- `pnpm exec vitest run --project unit tests/client/agent-seed/index.test.ts tests/client/lib/session-channel.test.ts tests/client/state/durable-local.test.ts` — **47 passed** (30 + 7 + 10).
- Six focused automation/seeder integration files — **136 passed**.
- Lifecycle focused serial test — **1 passed**.
- Permanent vLLM supervisor unit suite — **43 passed**.
- Temporary real-supervisor race reproduction — **1 passed**, then removed.
- Focused admission-lock CT set — **9 passed**.
- Focused preset/generic autosave CT set — **6 passed**.
- `pnpm check` ran the complete static tier. Fifteen stages passed; `structure:full` completed all 232 active gates and failed on three pre-existing, out-of-scope violations at the exact pinned commit: `tests/client/agent-seed/index.test.ts:269` (`brand-in-name-position`), `packages/client/src/agent-seed/retry-attempt.ts:4` (`no-inline-types`), and `docs/architecture/core/Core-Enforcement-Active-Gates.md:268` (`dangling-refs`). No review probe caused these findings; this lane did not repair them.

## Unconfirmed suspicions and coverage exclusions

- No unconfirmed async defect remains in the 24-row population. OIDC is separately tracked as a real contract decision, not dressed up as a bug.
- I did not run the full repository behavioral suite, live browser scenarios outside the focused CTs, external IdP discovery, or a real GPU/vLLM process. The vLLM finding was reproduced through the real supervisor state machine with injected process/network seams used by its test contract.
- I did not modify GitHub Project 1, issue comments, product code/tests, dependencies, lockfiles, catalog state, or canonical main.

**Issue summary:** Cold audit at `2d16ef60c90cff86ab236664691d595ddcc14327` found 24 honest authored-source `require-atomic-updates` rows: 1 confirmed P1 vLLM queued-ownership race, 22 safe false positives, and 1 P2 OIDC product-decision seam (severity ceiling P1). Six recent admission locks are verified discrete-command DROP contracts; no autosave/edit-stream data-loss lock was found; TanStack `scope.id` does not preserve preset autosave's dynamic fork/retarget composition with less code; and `fast-check` does not currently earn a dependency. Durable report: `docs/reviews/stickler/2026-08-26-issue-753-async-ownership.md`.
