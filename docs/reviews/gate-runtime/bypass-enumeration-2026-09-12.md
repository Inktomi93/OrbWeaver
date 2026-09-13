---
kind: review
status: active
updated: 2026-09-12
---

# What the #1584 hook bypass actually stopped enforcing (#2269)

Lane `p-bypass-enumeration`, own worktree `agent-a6e281ca440b8c178`, measured at `8fc7eb6dd`. The #1584
standing exception (constitution §0.1.6) nulls the lefthook hooks as a BLANKET — "every whole-tree check
the hooks run is RED by construction" — and nobody enumerated the set. `#2266` is the proof it is not
theoretical: `badc14944` edited `.claude/agents/side-eye.md` with no `.codex/` counterpart, and
`pnpm check:agents` read `side-eye.toml is stale` on every checkout for several folds until a verifier in
an unrelated worktree tripped over it (fixed `6e03f7dae`).

**The headline: the blanket is wrong. 14 of the 19 commit-tier commands are GREEN on this tree, and 10 of
them cost 101 seconds in total.** Only 2 of the 19 are red for the reason the exception states.

## The hooks and what the bypass suppresses

`lefthook install` reports four installed stages (measured, the `prepare` leg of any `pnpm` invocation:
`sync hooks: ✔️(pre-commit, pre-merge-commit, pre-push, post-checkout)`), matching `lefthook.yml`:

| hook | command | suppressed by `git -c core.hooksPath=/dev/null …` |
| - | - | - |
| `pre-commit` | `pnpm check` (= `verify --static`) | yes — every lane commit tonight |
| `pre-merge-commit` | `pnpm check` (identical body) | yes — every orchestrator merge tonight |
| `pre-push` | `pnpm verify --push` | yes in principle; in practice the owner runs the bare `pnpm verify --push` barrier by hand, so this stage has a compensating control already |
| `post-checkout` | `bootstrap-deps` (install only when `{3}=1` and no `node_modules`) | NOT suppressed in practice — no lane runs `checkout`/`worktree add` under a nulled hooksPath |

`pnpm check` and `pnpm verify --push` are not single commands: they are the `static` and `push` tiers of
the stage registry (`tooling/src/verify/lib/registry.ts`; tier membership read from `pnpm verify --list`,
exit 0). **19 stage rows at `static`, 26 at `push`.** Each row's argv is the thing the bypass actually
suppresses.

`structure:agent-config` → `pnpm check:agents` is registry row `registry.ts:169-170`, tier `STATIC` —
which confirms the #2266 diagnosis: the check that went dark is a pre-commit stage, not a separate hook.

## The measurements

Every row below was run individually on this worktree at `8fc7eb6dd` in this session. Exit codes are the
real ones. `structure:full`, `tests:node`, `browser:ct` and `browser:e2e-smoke` were NOT run here —
`check:structure` publishes a report pointer (forbidden this session) and the three suites are >10-minute
class; their evidence is named separately below.

### GREEN-AND-CHEAP — suppressed for free, no reason on record (the finding)

| stage | command | exit | wall |
| - | - | - | - |
| `lint:hook-syntax` | `node --check .claude/hooks/*.mjs` | 0 | <0.1s |
| `structure:agent-config` | `pnpm check:agents` | 0 | 0.4s |
| `structure:drizzle-kit` | `pnpm check:drizzle-kit` | 0 | 1.0s |
| `structure:asset-refs` | `pnpm check:asset-refs` | 0 | 1.8s |
| `structure:db-baseline` | `pnpm check:db-baseline` | 0 | 2.1s |
| `config:biome-rule-liveness` | `pnpm check:biome-rule-liveness` | 0 | 7.2s |
| `types:testd` | `pnpm test:types` | 0 | 8.9s (40 files, 129 tests, no type errors) |
| `types:ownership` | `pnpm check:type-ownership` | 0 | 10.9s |
| `tests:execution-membership` | `pnpm check:tests-execution-membership` | 0 | 11.8s |
| `imports:depcruise` | `pnpm depcruise` | 0 | 12.0s |
| `ledgers:fresh` | `pnpm check:ledgers-fresh` | 0 | 26.6s |
| `types:native` | `pnpm typecheck` | 0 | 27.7s |
| `lint:biome` | `pnpm lint` | 0 | 28.2s |
| `structure:policy-conformance` | `pnpm check:policy-conformance` | 0 | 39.2s |

Push-tier additions, also green:

| stage | command | exit | wall |
| - | - | - | - |
| `quality:cpd` | `pnpm cpd` | 0 | 0.8s |
| `tests:tool-guard` | `pnpm test:scoped tests/tooling/tool-guard.int.test.ts` | 0 | 5.0s |
| `quality:boot-chunk` | `pnpm check:boot-chunk` | 0 | 19.1s |
| `deps:orphan-ratchet` | `pnpm check:orphan-ratchet` | 0 | 48.8s |

The ten WHOLE-ONLY green static rows (the ones no lane floor can reach by scoping) total **101 seconds**.
`lint:biome`, `types:native` and `imports:depcruise` are additionally covered per-file by the PostToolUse
edit hook (`.claude/hooks/biome-check.sh`: biome on the edited file, depcruise for `packages/**`,
typecheck of the planner's primary programs) — which is NOT nulled by the git bypass, but also does not
fire for an edit made with `sed -i` through Bash.

### RED — but not for the reason the standing exception gives

| stage | exit | what it actually says |
| - | - | - |
| `lint:eslint` | 1 (246.7s) | **7 tsdoc/syntax errors in 2 files** — `tooling/src/verify/lib/bus-fact.ts:62-63` (unclosed code span, unescaped `>`), `tooling/src/verify/lib/tuple-vocabulary-fact.ts:131-132` (`@client`/`@server`/`@contracts` read as TSDoc tags). Ordinary landed drift, not loader-red. Nobody has seen it because the whole-repo run costs 4 minutes and no lane runs it. |
| `docs:format` | 1 (18.1s) | 162 unformatted files + 1 REFUSED (`docs/reviews/gate-runtime/v-fix-wave-4-2026-09-12.md`, 12 bare backticks, #2235). Blocked on decision #2246, not on the gate loader. |
| `docs:catalog` | 1 (20.9s) | 133 violations — stale `verifiedSha256` receipts, one `verifiedCommit` not an ancestor of HEAD, ~15 `pending: new debt path … not in the ratchet allowance` rows for tonight's review docs, plus a stale `docs/catalog/catalog.json`. Corpus drift, not loader-red. |

### BASELINE-RED BY CONSTRUCTION — correctly suppressed

| stage | evidence |
| - | - |
| `deps:knip` | exit 1, 6.4s: 65 unused exports + 4 unused exported types, **all but one under `tooling/src/verify/{gates,lib,contract,ops}`** — legacy helper exports orphaned as modules convert. Genuinely a #1584 artifact; clears at cutover. |
| `structure:full` | not run here (publishes). Main's published verdict `reports/check-structure.json`, runId `main-1662184-2026-09-12T23-01-14-421Z` (finished 2026-09-12T23:05Z): `ok=false`, **312 violations across 24 gates**, 0 tool errors, 303/303 gates ran. |

**`structure:full`'s red is a MIXTURE, and this matters.** The migration-shaped rows are
`policy-refusal-coverage` (60), `diagnostic-legibility` (92), `policy-binding-resolution` (23),
`policy-legacy-imports` (5), `gate-modernization` (2). But `test-layout` (53), `dangling-refs` (35),
`no-test-fabrication` (25), `caught-failure-ownership` (23), `tooling-size` (24) and a dozen smaller rows
are ordinary product/tooling debt that will NOT clear at cutover. "Red by construction" is true of the
stage and false of most of its rows.

### Not measured, and why

`tests:node`, `browser:ct`, `browser:e2e-smoke` (push tier only) are the >10-minute behavioural suites.
They are already compensated: the owner runs the bare `pnpm verify --push` barrier, and the orchestrator
runs the post-train whole-tree pass. They are not part of the uncompensated commit-tier hole.

## The planted positive control

`check:agents` green at 0.4s is worthless as evidence unless it can go red. Probed on the very file from
the incident, in this worktree, `cp`-backed:

1. `cp .claude/agents/side-eye.md <scratchpad>/pbe-side-eye.md.bak`
2. `sed -i 's/^effort: high$/effort: medium/' .claude/agents/side-eye.md`
3. `pnpm check:agents` → **exit 1**, `side-eye.toml is stale; run pnpm agents:sync` — byte-identical to
   the #2266 message
4. restored from the backup; `pnpm check:agents` → exit 0; `git status --short` EMPTY

So the 0.4s check would have caught `badc14944` at the moment it was written.

## The proposal: path-touched → check-owed, and the mechanism already exists

A compensating control that lives in a lane brief is remembered, not enforced — #2266 happened because the
brief fenced a lane to `.claude/agents/side-eye.md` and the author could not recall `agents:sync`, because
the mapping was nowhere. The mapping below is the data; the mechanical home for it is **already in the
registry and already proven on one row**.

`registry.ts:24` declares `DOC_CATALOG_PATH_RE`, and `docs:catalog`'s `scopedArgv` (`registry.ts:302`)
reads: if the changed selection contains a matching path, run the WHOLE command; otherwise `skip-empty`.
That is exactly "a commit touching X owes check Y", implemented for exactly one stage. Every other
whole-only static stage has no `scopedArgv` at all, so a scoped tier DEFERS it unconditionally.

**Proposed (NOT built — a separate row):** give each whole-only static stage below (a) `"changed"` in its
`tiers`, and (b) a trigger regex + the same `scopedArgv` shape. Then `pnpm verify --changed` — the
sanctioned lane inner loop — becomes the mechanical compensating control for the entire green set, a brief
can be GENERATED from a lane's fence instead of recalled, and a lane touching nothing relevant pays zero.
No new file, no new concept, one row-shaped edit per stage.

| a commit touching | owes |
| - | - |
| `.claude/agents/**.md` · `.codex/agents/**` | `pnpm agents:sync` in the SAME commit + `structure:agent-config` |
| `packages/db/src/schema/**` · `packages/db/src/migrations/**` · `packages/db/drizzle.config.ts` | `structure:db-baseline` · `structure:drizzle-kit` · `structure:asset-refs` |
| `packages/server/src/domain/assets/persistence/asset-refs.ts` | `structure:asset-refs` |
| `biome.json` · `tooling/biome*.jsonc` | `config:biome-rule-liveness` · `lint:biome` |
| `.claude/hooks/*.mjs` | `lint:hook-syntax`; `tool-guard.mjs` also owes `tests:tool-guard` |
| `tooling/src/verify/gates/**` · `tooling/src/verify/contract/policy.ts` | `structure:policy-conformance` · `structure:full` |
| any file holding a caught-failure marker · `docs/reviews/caught-failure-ownership/**` | `ledgers:fresh` |
| `tests/**` · `vitest.config*.ts` · `playwright*.config.ts` · `tsconfig*.json` | `tests:execution-membership` · `types:ownership` |
| `tests/**/*.test-d.ts` | `types:testd` |
| `packages/**/*.ts(x)` · `tooling/**/*.ts` | `lint:biome` · `lint:eslint` · `types:native` · `imports:depcruise` (the edit hook covers the first, third and fourth per-file — but only for Edit/Write, never for `sed -i`) |
| an export added or removed under `packages/**` · `tooling/**` | `deps:knip` · `deps:orphan-ratchet` |
| `packages/client/src/**` | `quality:boot-chunk` |
| `docs/**/*.md` | `docs:format` · `docs:catalog` (both currently baseline-red; the owed action is "do not make it worse", not "go green") |

## What is built vs proposed

- **Built:** this enumeration, every exit code in it, and the two-direction planted control on
  `check:agents`.
- **Proposed:** the registry trigger generalization above. It is a separate row.
- **Open for the orchestrator:** the proposed vehicle is `pnpm verify --changed`, which PUBLISHES a run
  pointer — the thing lanes are currently told not to do. Either the run-slot layout's concurrency
  guarantee (constitution §4 / `UNIFIED-VERIFICATION-DESIGN.md` §3.3b: each run writes its own slot and
  publishes atomically at finish) already makes concurrent lane runs safe, or the stage set needs a
  non-publishing spelling. That call is not this row's.
