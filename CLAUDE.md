# Orbweaver

This file is the always-on core. Area rules load by `paths:` from `.claude/rules/`. Procedures are
skills. Read every other doc on demand through the reading router below.

## Which law wins

- The ledger (`docs/architecture/core/Core-Path-Registry.md`) wins over every other doc, your instinct and a task prompt.
- If a prompt asks for something the ledger places elsewhere, follow the ledger and say so.
- Per-domain law is the code and its file headers. Read a file's header before you change the file.
- A header can hold a ruling that your task would break. Check it before you fix a symptom.

## Build the full shape

- These rules override the user-global KISS and YAGNI defaults for architecture. Throwaway scripts and dev tooling keep them.
- Build the complete, provable shape the docs ask for. Complete means no missing cases, not extra decoration.
- Before you call something over-engineered or duplicated, check the ledger. It is usually deliberate.
- Treat unwired code as a question about intent. Wire it, modernize it, or flag it for deletion with a reason.

## Package direction

Each `packages/*/package.json` declares its workspace deps, and an undeclared import does not resolve.
The allowed imports:

- `kit`: no workspace package.
- `contracts`: `kit`.
- `db`, `inference`: `contracts`, `kit`.
- `default-content`: `kit`. `showcase-plugins`: `contracts`.
- `server`: `contracts`, `db`, `default-content`, `inference`, `kit`, `showcase-plugins`.
- `ui`: `kit`.
- `client`: `contracts`, `kit`, `ui`. Type-only: `server` (the tRPC `AppRouter` bridge, a
  `devDependency`).

Inside `packages/server/src/`, imports flow down only: `entry` → `transport` → `domain` → `infra` →
`foundation` → `kit`. `.dependency-cruiser.cjs` enforces the tier order (`pnpm depcruise`).

A change that needs an upward import is in the wrong place. Move the code; never force the import.

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
- A cross-feature need is an injected op. Type it in the domain's `contract/` and wire it at the composition root.
- Never import sideways from another feature.
- Merge two homes for one concept into one.
- Every placement names the check that fails when it breaks: a package dep, a type, a dep-cruiser rule, a gate or a test.
- The domain folder template is in `Core-0-Architecture-and-Structure.md` §4.

## Type homes and unions

| Shape | Home |
| - | - |
| DB row | `packages/db/` (`$inferSelect`) |
| Wire shape | `packages/contracts/` (zod schema and inferred type) |
| Pure primitive type | `packages/kit/` |
| Domain-internal type | the domain's `contract/` |
| `@orb/inference`-internal type | `packages/inference/src/contract/` |

- The `no-inline-types` gate fails an exported type declared anywhere else.
- Never re-declare a shape that a lower package already owns. Import it.
- A string union is one importable tuple plus a mapped `Record` or `assertNever`, so a new member fails `tsc`.
- The `no-inline-union-redecl` gate fails a re-declared union.
- Details: `Spine-TypeScript-and-Patterns.md`.

## Cross-cutting threads

Identity, config, serialization, types and testing each have one `Spine-*` doc. Check a change against
its Spine doc; never decide the thread locally. Scope is inherited through the FK chain from the
Principal. Walk the chain before you call a table unscoped.

## Test layout

- Tests live under `tests/<package>/` and mirror `packages/<package>/src/` path for path.
- `tooling/src/_shared/test-kinds.ts` owns the test suffixes and compiler worlds.
- The `test-layout` gate fails a test next to its source.
- Test every persistence verb, contract and invariant. Inject clocks and ids so tests are deterministic.
- Never write a test that asserts nothing. Policy: `Spine-Testing.md`.

## CSS homes

CSS is legal only in the closed set of paths in `client-architecture-lockdown.md` §4.2. A feature is not
a home. A reusable value is a token in `packages/ui/src/tokens/tokens.json`. A component skin is a `tv()`
variant. Layout is an `@orb/ui` primitive. Read §4 before you add a style.

## No escape hatches

To get green, never add:

- a lint suppression for a real finding, a dep-cruiser exemption or a gate allowlist entry;
- a `TODO` or `FIXME` in place of the work;
- `any`, `unknown` or a loose index signature to satisfy `tsc`;
- a placeholder marker on work that is not planned.

Delete the old structure in the same commit as the new one; half a migration is a defect.
A suppression is allowed only for a verified false positive, with the reason in the comment on that line.
If you cannot go green without a hatch, stop and report.

## Verification tiers

| Command | What it runs |
| - | - |
| `pnpm test:scoped <paths>`, `pnpm test:ct <paths>` | named node or CT test files |
| `pnpm verify --changed` | the inner loop, scoped to changed files; whole-project stages are deferred |
| `pnpm check` (same as `pnpm verify`, `--static`) | the static whole tree: lint, types and type tests, structure, imports, docs; no product runtime tests |
| `pnpm verify --push` | adds node tests, CT and e2e smoke |
| `pnpm verify --full` | adds the tooling test battery and the slow quality stages |

- Read stage membership from `pnpm verify --list`, not from prose.
- Exit codes: 0 clean, 1 violations, 2 tool error (not a verdict), 3 misuse.
- A scoped green is not done. Work is done only after a whole-tree `pnpm check` (the barrier).
- Do not run `pnpm verify --push` by hand. The pre-push hook runs it on a push the owner authorized.
- `pnpm check` runs no product tests. Run the suites that assert any value you changed.
- The `commit-msg` hook enforces the message format (`scripts/commit-msg-check.sh`).

## Read the harness artifacts

- `pnpm check` writes `reports/verify.json`, `reports/verify/<stage>.log` and `reports/check-structure.json`.
- `pnpm test` writes `reports/test-report.json` and `reports/ct-flaky.json`.
- These paths are pointers. Each run writes its own slot under `reports/runs/` and publishes the pointer when it finishes.
- If a concurrent run prints its slot, read that slot, not the pointer.
- Use `pnpm check:show` to read structure verdicts and stage logs.
- Never pipe a harness run into `head` or `tail`; the exit code becomes the reader's.
- Never re-run a harness command to find a failure. Read its artifacts.
- The layout is in `UNIFIED-VERIFICATION-DESIGN.md` §3.3b.

## Engines

Never run `tooling/src/stack/ops/engines.ts` or another engine launcher to inspect it, `--help` included.
It starts vLLM on the live ports and stops engines it does not own.

## Code questions

- Use `pnpm ast` for references, callers, importers and exports. Run it bare for the verb list.
- Use `ast-grep` for structural patterns. Type `ast-grep`, never `sg`; `/usr/bin/sg` is `newgrp`.
- Use `rg` for literal text. The Bash `grep` is a ugrep wrapper that honors ignore files.
- Use search on code only. Read law docs in full; a ruling lives in the context around a line.
- A zero result counts only with a non-zero `scanned=` count and a second method.
- The evidence rules are in the `code-recon` skill.

## Reading router

Find your task and read those docs in full. Read nothing else from `docs/architecture/core/`. Doc names
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
| A ledger decision | `Documentation-Law.md` "Ledger-entry style", then write it in `Core-Path-Registry.md` |
| A doc | `Documentation-Law.md`, `Core-Docs-Formatting-Law.md` |
| An instruction file or a code comment | `.claude/rules/writing.md` |
| Which word names a concept | `docs/design/vocabulary-map.md` |
| Where a concept lives | `docs/architecture/core/AGENTS.md` §6 (domain map), `Core-0-Architecture-and-Structure.md` §6 (partitioning) |
| A parked design set | `docs/architecture/proposed/INDEX.md` |
| Why the codebase has this shape | `docs/Mission.md`, `docs/architecture/core/AGENTS.md` §1 (doctrine) |

## Glossary

| Word | Meaning |
| - | - |
| lane | a subagent that works one area in its own worktree |
| leg | one dispatch to a lane |
| merge train | a batch of lane merges into `main` |
| barrier | the whole-tree check after a merge train |
| floor | the checks a lane runs before it reports |

Use plain words for other house slang. Write evidence, case, review, guard, step, control and boundary.
