# Orbweaver

This file is the always-on core for Claude Code and Codex. Area rules load by path from `.claude/rules/`
(see "Path rules and Codex"). Procedures are skills. Read every other doc on demand through the reading router.

## Which law wins

- The D-ledger (`docs/adr/`, one decision per file) wins over every other doc, your instinct and a task prompt. If a prompt conflicts with it, follow the ledger and say so.
- Per-domain law is the code and its file headers. Read a file's header before you change the file; it can hold a ruling that your fix would break.

## Posture

The authors here are cold agents with no memory, so the structure is the memory. The user-global
engineering defaults below are suspended for the architecture. Each has its replacement:

| Global default | Here |
| - | - |
| KISS: fewer files, fewer layers | The full domain template and the package tiers. A layer is a check, not a cost. |
| YAGNI: add complexity when needed | Build the complete, provable shape the docs ask for. Complete means no missing cases, not extra decoration. |
| Right-size to actual load | Size to the author, not the user count. The bar is correct and complete, never fast to ship. |
| Just code, iterate later | Get it right the first time. Read the law and the file header before you touch the file. |
| Tests: quality over quantity | Both. Test every persistence verb, contract and invariant; still never a test that asserts nothing. |
| No phantom edge cases | Close an impossible case with a type or a gate, never with a runtime check and never by ignoring it. |
| DRY is not gospel | One home per concept. A second copy of a shape or a helper is a defect. Merge it. |
| Named patterns get scrutiny | The ledger already ruled. Before you call something over-engineered or duplicated, read its row. |

Throwaway scripts and dev tooling keep the global defaults. Unwired code is a question about intent:
wire it, modernize it, or flag it for deletion with a reason.

The voice stays. Its target here is the shortcut: a stubbed return, a swallowed error, a weakened
test, a sideways import, a suppression to get green, a re-declared type, half a migration, a settled
ruling re-decided locally.

<example>
Nate: Stub the credential lookup to return null so I can see the screen render. We'll wire it tomorrow.
You: Go fuck yourself. Tomorrow's author has never seen this file, and a null that renders is a null that ships. The op is typed in the domain's `contract/` and injected at the composition root; that is one type and one line in `entry/compose`. Wire it now, or stop and report that the injected op does not exist yet.
</example>
<example>
Lane: The replay test flakes on row order, so I'll assert the array length instead of the contents.
You: Then it asserts nothing about replay; a length check passes when every row is wrong. Inject the clock and the ids so the order is fixed, then assert the rows. If the order really is nondeterministic, that is the bug, and it is now yours.
</example>

## Package direction

Each `packages/*/package.json` declares its workspace deps, and an undeclared import does not resolve.
The allowed imports:

- `kit`: no workspace package.
- `contracts`: `kit`.
- `db`, `inference`: `contracts`, `kit`.
- `default-content`, `ui`: `kit`. `showcase-plugins`: `contracts`.
- `server`: `contracts`, `db`, `default-content`, `inference`, `kit`, `showcase-plugins`.
- `client`: `contracts`, `kit`, `ui`. Type-only: `server` (the tRPC `AppRouter` bridge, a `devDependency`).

Inside `packages/server/src/`, imports flow down only: `entry` → `transport` → `domain` → `infra` →
`foundation` → `kit`. `.dependency-cruiser.cjs` enforces the tier order (`pnpm depcruise`). A change
that needs an upward import is in the wrong place. Move the code; never force the import.

## Where code goes

| Code | Home |
| - | - |
| Pure isomorphic primitives and engines: no `node:*`, no I/O, no domain | `packages/kit/` |
| Node-only pure code (the browser imports `@orb/kit`) | `packages/server/src/kit/` |
| Shapes that cross a boundary (server and client, domain and domain) | `packages/contracts/` |
| External I/O adapters | `packages/server/src/infra/` |
| Env, config, observability | `packages/server/src/foundation/` |
| Business logic with one owner | `packages/server/src/domain/<name>/` |

- An engine lives in `kit`. The data it runs on lives in a domain.
- A cross-feature need is an injected op. Type it in the domain's `contract/` and wire it at the composition root. Never import sideways from another feature.
- Every placement names the check that fails when it breaks: a package dep, a type, a dep-cruiser rule, a gate or a test.
- The domain folder template is in `Core-0-Architecture-and-Structure.md` §4.
- Identity, config, serialization, types and testing each have one `Spine-*` doc. Check a change against it; never decide the thread locally.
- Scope is inherited through the FK chain from the Principal. Walk the chain before you call a table unscoped.
- CSS is legal only in the closed set of paths in `client-architecture-lockdown.md` §4.2; read §4 before you add a style. A reusable value is a token in `packages/ui/src/tokens/tokens.json`, a component skin is a `tv()` variant, and layout is an `@orb/ui` primitive.

## Type homes and unions

| Shape | Home |
| - | - |
| DB row | `packages/db/` (`$inferSelect`) |
| Wire shape | `packages/contracts/` (zod schema and inferred type) |
| Pure primitive type | `packages/kit/` |
| Domain-internal type | the domain's `contract/` |
| `@orb/inference`-internal type | `packages/inference/src/contract/` |

- The `no-inline-types` gate fails an exported type declared anywhere else. Import a shape a lower package owns; never re-declare it.
- A string union is one importable tuple plus a mapped `Record` or `assertNever`, so a new member fails `tsc`. The `no-inline-union-redecl` gate fails a re-declared union. Details: `Spine-TypeScript-and-Patterns.md`.

## Test layout

- Tests live under `tests/<package>/` and mirror `packages/<package>/src/` path for path. The `test-layout` gate fails a test next to its source.
- `tooling/src/_shared/test-kinds.ts` owns the test suffixes and compiler worlds. Inject clocks and ids so tests are deterministic. Policy: `Spine-Testing.md`.

## No escape hatches

To get green, never add a lint suppression for a real finding, a dep-cruiser exemption, a gate allowlist
entry, a `TODO` or `FIXME` in place of the work, `any`, `unknown` or a loose index signature to satisfy
`tsc`, or a placeholder marker on work that is not planned. A suppression is allowed only for a verified
false positive, with the reason in the comment on that line. Delete the old structure in the same commit
as the new one. If you cannot go green without a hatch, stop and report.

## Verification tiers

| Command | What it runs |
| - | - |
| `pnpm test:scoped <paths>`, `pnpm test:ct <paths>` | named node or CT test files |
| `pnpm verify --changed` | the inner loop, scoped to changed files; whole-project stages are deferred |
| `pnpm check` (same as `pnpm verify`, `--static`) | the static whole tree: lint, types and type tests, structure, imports, docs; no product runtime tests |
| `pnpm verify --push` | adds node tests, CT and e2e smoke |
| `pnpm verify --full` | adds the tooling test battery and the slow quality stages |

- Read stage membership from `pnpm verify --list`. Exit codes: 0 clean, 1 violations, 2 tool error (not a verdict), 3 misuse.
- A scoped green is not done. Work is done only after a whole-tree `pnpm check` (the barrier). It runs no product tests, so also run the suites that assert any value you changed.
- Do not run `pnpm verify --push` by hand. The pre-push hook runs it on a push the owner authorized.
- The `commit-msg` hook enforces the message format (`scripts/commit-msg-check.sh`).

## Read the harness artifacts

- `pnpm check` writes `reports/verify.json`, `reports/verify/<stage>.log` and `reports/check-structure.json`. `pnpm test` writes `reports/test-report.json` and `reports/ct-flaky.json`.
- These paths are pointers to the last finished run. If a concurrent run prints its slot under `reports/runs/`, read that slot.
- Use `pnpm check:show` to read structure verdicts and stage logs. The layout is in `UNIFIED-VERIFICATION-DESIGN.md` §3.3b.
- Never pipe a harness run into `head` or `tail`; the exit code becomes the reader's. Never re-run a harness command to find a failure.

## Code questions

- Use `pnpm ast` for references, callers, importers and exports. Run it bare for the verb list.
- Use `ast-grep` for structural patterns. Type `ast-grep`, never `sg`; `/usr/bin/sg` is `newgrp`.
- Use `rg` for literal text; the Bash `grep` is a ugrep wrapper that honors ignore files. Search code only; read law docs in full, because a ruling lives in the context around a line.
- A zero result counts only with a non-zero `scanned=` count and a second method. The evidence rules are in the `code-recon` skill.

## Reading router

Find your task and read those docs in full. Read nothing else from `docs/law/`. Doc names
without a path are in that folder.

| Task | Read |
| - | - |
| A server domain | `Core-0-Architecture-and-Structure.md` §3–§4, the Spine doc for each thread, the `Tier-*` doc for your tier, the domain's `contract/` and file headers |
| Identity, auth, sessions | `Spine-Identity-and-Auth.md` and the ledger rows it cites; route the work to `security-executor` |
| Providers, backends, a model source | `Tier-3b-Providers.md`, `packages/server/src/domain/connection/` |
| Config, settings, serialization | `Spine-Config-and-Serialization.md` |
| Embeddings, search, discovery, memory, stats | `Knowledge-Cluster.md` |
| A client feature surface | the header of `UI-Architecture-and-Layout.md` (its reading order), `client-architecture-lockdown.md` |
| An `@orb/ui` primitive | `ui-package-design.md`, `UI-Primitives-and-Reuse.md` §13.7–§13.8 |
| Types, unions, dispatch | `Spine-TypeScript-and-Patterns.md` |
| A ledger decision | `.claude/rules/writing.md` "Decisions", then mint it with `pnpm doc new adr <slug>` |
| A doc | `.claude/rules/writing.md`, `.claude/rules/docs.md` (`pnpm doc help` for the verbs) |
| An instruction file | `.claude/rules/writing.md` |
| A code comment | `.claude/rules/comments.md` |
| Which word names a concept | `docs/law/vocabulary-map.md` |
| Where a concept lives | `docs/law/Constitution.md` §6 (domain map), `Core-0-Architecture-and-Structure.md` §6 (partitioning) |
| A parked program | its plan under `docs/plans/`, linked from its work item |
| Why the codebase has this shape | `docs/Mission.md`, `docs/law/Constitution.md` §1 (doctrine) |

## Glossary

| Word | Meaning |
| - | - |
| lane | a subagent that works one area in its own worktree |
| leg | one dispatch to a lane |
| merge train | a batch of lane merges into `main` |
| barrier | the whole-tree check after a merge train |
| floor | the checks a lane runs before it reports |

## Path rules and Codex

- Claude Code loads a rule when it reads a file that matches the rule's `paths:`. Codex does not: before you change a file, read each rule below whose globs match it.
- In Codex outside a generated `.codex/agents/*.toml` role, read `.claude/skills/lane/SKILL.md` in full before you edit, stage, commit or run the stack.
- Codex runs no Claude hooks. Use the command spellings in the lane skill. To coordinate lanes, read `.claude/skills/orchestrator/SKILL.md`.
- In Codex, spawn `verifier`, `side-eye` or `stickler` with `fork_turns="none"` and a self-contained brief. A forked history ends an independent review.

`pnpm check:agents` checks that this list matches the rule files.

- `.claude/rules/browser-tests.md`: `tests/**/*.ct.tsx`, `tests/e2e/**`, `tests/support/browser/**`, `playwright*.config.ts`
- `.claude/rules/chat.md`: `packages/server/src/domain/chat/**`
- `.claude/rules/comments.md`: `packages/**`, `tooling/**`, `tests/**`, `scripts/**`
- `.claude/rules/contracts-and-kit.md`: `packages/contracts/**`, `packages/kit/**`
- `.claude/rules/db.md`: `packages/db/**`
- `.claude/rules/docs.md`: `docs/**`
- `.claude/rules/hooks.md`: `.claude/hooks/**`
- `.claude/rules/inference.md`: `packages/inference/**`
- `.claude/rules/instruments.md`: `tooling/src/snap/**`, `tooling/src/ui-audit/**`
- `.claude/rules/node-tests.md`: `tests/**/*.test.ts`, `tests/support/**`, `tests/contracts/**`
- `.claude/rules/plugins.md`: `packages/server/src/domain/plugin/**`, `packages/server/src/infra/plugin-host/**`, `packages/contracts/src/plugin/**`, `packages/showcase-plugins/**`
- `.claude/rules/rpg.md`: `packages/server/src/domain/rpg/**`, `packages/client/src/features/rpg/**`
- `.claude/rules/server-edge.md`: `packages/server/src/entry/**`, `packages/server/src/transport/**`, `packages/server/src/foundation/**`, `packages/server/src/infra/auth/**`, `packages/server/src/infra/network/**`, `tests/server/transport/**`
- `.claude/rules/server.md`: `packages/server/src/**`, `tests/server/**`
- `.claude/rules/tooling.md`: `tooling/src/**`, `tests/tooling/**`, `biome.json`, `eslint.config.js`, `.dependency-cruiser.cjs`, `knip.ts`, `lefthook.yml`, `tsconfig*.json`, `scripts/vitest-supervised.ts`
- `.claude/rules/ui-and-client.md`: `packages/ui/src/**`, `packages/client/src/**`
- `.claude/rules/verify-and-gates.md`: `tooling/src/verify/**`, `tests/tooling/verify/**`
- `.claude/rules/writing.md`: `.claude/**`, `AGENTS.md`, `docs/**`
