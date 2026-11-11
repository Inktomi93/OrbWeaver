# Codebase review ledger

Log-only sweep of the whole repository. The ledger is the review; the conversation is disposable.
Unit records live in `units/<id>.md`, where `<id>` is the Unit column below. The index holds
protocol and status only; findings live in the unit file.

## Protocol

1. Resume: read this file, take the first `in-progress` unit, else the first `queued` unit. Trust no
   summary from a previous session that is not written here.
2. Per unit, in order: run the sweeps, paste raw output into the unit file; read the unit's
   `contract/` in full and every file header; targeted-read only where a sweep or header raises a
   question.
3. Write every finding into the unit file the moment it is found, with a path and line. Commit the
   ledger and the unit file between units. Never carry a finding in context across units.
4. Mark the unit `reviewed` only when its sweep output and findings are committed.
5. No fixes during the sweep. Comment truthing on the chunk under review is part of the unit
   (`.claude/rules/comments.md` rule 5); logic and test fixes are a later program.

Unit bands are size classes for splitting work, not tracked values. Recompute with `tokei <path> -o json`.

| Band | Code lines | Action |
| - | - | - |
| S | under 5K | one unit |
| M | 5K–15K | one unit |
| L | 15K–30K | one unit, watch the clock |
| XL | over 30K | split by subfolder into sub-units before starting |

Statuses: `queued`, `in-progress`, `reviewed (N)`, `blocked (reason)`.

Finding format in unit files, one bullet per finding:

```text
[severity] path:line — defect in one sentence — suggested direction.
```

Severities:

| Severity | Meaning |
| - | - |
| P1 | Correctness or data-loss bug |
| P2 | Law or architecture violation (placement, direction, contract home, hatch) |
| P3 | Hygiene: naming, magic strings, dead code, noise |

Fixed status markers inside findings: `FIXED` when the unit change itself cleaned it, otherwise the
finding is open for triage.

## Fixed axes

Every unit gets the same axes so the rollup is rankable.

1. Import direction and package tiers; sideways domain imports.
2. Placement against the homes table in `AGENTS.md`; re-declared shapes.
3. Escape hatches: `any`, `unknown` standing in for a shape, lint suppressions without a verified
   false-positive reason, `TODO`/`FIXME` in place of work, stubbed returns.
4. Swallowed errors, unawaited calls, missing cleanup.
5. Magic strings: literals used in more than one place without a constant.
6. Scope: tables reached without the FK chain from the Principal.
7. Tests in the slice: assertions that pass when contents are wrong, nondeterminism without clock or
   id injection, coverage of every persistence verb.
8. Half-migrations and stale prose: a shape changed in one home and not its coupled homes; comments
   and docs citing files that moved or are untracked (`rg tests/legacy` before closing any unit).

## Sweep commands

Run scoped to the unit; paste output raw into the unit file.

```bash
rg -n '\bany\b|eslint-disable|@ts-|TODO|FIXME' <unit>/
rg -n "from '\.\./(?!')[a-z-]+" <unit>/        # sideways or upward relative imports, eyeball
pnpm depcruise                                    # whole-tree; attribute hits to the unit
rg -n '\.length\)\.toBe|\btoMatchInlineSnapshot' <unit-tests>/   # weak assertions
rg -n 'tests/legacy' <unit>/                      # stale cites after the D333 retirement
```

## Units

### Phase 0 — root and governance

| Unit | Path | Band | Status |
| - | - | - | - |
| root-config | package.json, pnpm-workspace.yaml, tsconfig\*{.base,.node,.tests-dom,.tests-iso,.world-browser,.world-node,.json}, .editorconfig, .gitattributes, .env.example | M | reviewed (7) |
| root-lint-configs | biome.json, eslint.config.ts, eslint-plugins.d.ts, stylelint\*.{ts}, jscpd.json, knip.ts, .dependency-cruiser.ts, lefthook.yml, stryker.config.ts, vitest\*.ts, playwright\*.config.ts, codegraph.json, .mcp.json, .markdownlint.json | L | queued |
| root-dts | aggregator-assets.d.ts, platform\*.d.ts, reset.d.ts — loose ambient types at root | S | queued |
| install-run | install.sh/.cmd, start.sh/.cmd, update.sh/.cmd, Dockerfile, docker-compose.yaml, .dockerignore, docker/ | M | queued |
| scripts-patches | scripts/, patches/ | M | queued |
| instruction-files | AGENTS.md, .claude/rules/, .claude/hooks/, .claude/agents/, .claude/skills/ | L | queued |
| root-docs | README.md, CONTRIBUTING.md, ACCESSIBILITY.md, SECURITY.md, CODE_OF_CONDUCT.md, LICENSE — pass for staleness against the ledger only | S | queued |

### Phase 1 — foundations

| Unit | Path | Band | Status |
| - | - | - | - |
| kit | packages/kit/ | M | queued |
| contracts | packages/contracts/ | L | queued |
| db | packages/db/ incl. migrations | S | queued |

### Phase 2 — tooling law enforcement

Review before anything that trusts these results.

| Unit | Path | Band | Status |
| - | - | - | - |
| tooling-eslint | tooling/src/eslint/ | L | queued |
| tooling-floor | tooling/src/floor/ | M | queued |
| tooling-configs | tooling/src/biome-config/, tooling/src/stack/ | S | queued |
| tooling-unwired | tooling/src/unwired/ | M | queued |
| tooling-codemods | tooling/src/codemods/ | M | queued |
| tooling-doc | tooling/src/doc/ | S | queued |
| tooling-ui-facts | tooling/src/ui-facts/ | S | queued |

### Phase 3 — server below domain

| Unit | Path | Band | Status |
| - | - | - | - |
| server-foundation | packages/server/src/foundation/ | S | queued |
| server-primitives | packages/server/src/primitives/ | S | queued |
| server-infra-core | infra/auth/, infra/crypto/, infra/network/ | M | queued |
| server-infra-io | infra/storage/, infra/media/, infra/image/, infra/extraction/ | M | queued |
| server-infra-runtime | infra/plugin-host/, infra/plugin-source/, infra/tasks/, infra/timers/, infra/relay/, infra/acme/, infra/upstream-update/ | M | queued |
| server-transport | packages/server/src/transport/ | M | queued |
| server-entry | packages/server/src/entry/ | M | queued |

### Phase 4 — server domains

Slice rule: each domain unit includes its `contract/`, the trpc wiring, and `tests/server/domain/<name>/`.

| Unit | Path | Band | Status |
| - | - | - | - |
| dom-admin | domain/admin/ | S | queued |
| dom-assets | domain/assets/ | S | queued |
| dom-automation | domain/automation/ | M | queued |
| dom-character | domain/character/ | M | queued |
| dom-connection | domain/connection/ | S | queued |
| dom-credentials | domain/credentials/ | S | queued |
| dom-databank | domain/databank/ | S | queued |
| dom-discovery | domain/discovery/ | M | queued |
| dom-embeddings | domain/embeddings/ | M | queued |
| dom-export | domain/export/ | S | queued |
| dom-imagery | domain/imagery/ | S | queued |
| dom-import | domain/import/ | M | queued |
| dom-notifications | domain/notifications/ | S | queued |
| dom-persona | domain/persona/ | S | queued |
| dom-plugin | domain/plugin/ | M | queued |
| dom-preset | domain/preset/ | S | queued |
| dom-refinery | domain/refinery/ | S | queued |
| dom-regex | domain/regex/ | S | queued |
| dom-roster-preset | domain/roster-preset/ | S | queued |
| dom-rpg | domain/rpg/ | M | queued |
| dom-search | domain/search/ | S | queued |
| dom-sessions | domain/sessions/ | S | queued |
| dom-settings | domain/settings/ | S | queued |
| dom-share | domain/share/ | S | queued |
| dom-stats | domain/stats/ | S | queued |
| dom-tag | domain/tag/ | S | queued |
| dom-tool-use | domain/tool-use/ | S | queued |
| dom-workloads | domain/workloads/ | S | queued |
| dom-world-info | domain/world-info/ | S | queued |
| dom-chat-a | domain/chat/ split by subfolder at start | XL | queued |
| dom-chat-b | second chat sub-unit | XL | queued |
| dom-chat-c | third chat sub-unit | XL | queued |

### Phase 5 — inference

| Unit | Path | Band | Status |
| - | - | - | - |
| inference | packages/inference/ incl. contract/ | L | queued |

### Phase 6 — client

| Unit | Path | Band | Status |
| - | - | - | - |
| client-app-shell | features/app-shell/ + client entry/routing outside features/ | M | queued |
| cli-auth | features/auth/ + user-admin/ | S | queued |
| cli-config-credentials | features/config/, features/credentials/ | M | queued |
| cli-character-preset | features/character/, features/preset/, features/roster-preset/, features/persona/ | M | queued |
| cli-databank-world-info | features/databank/, features/world-info/, features/tag/ | M | queued |
| cli-discovery-stats | features/discovery/, features/stats/ | M | queued |
| cli-refinery-regex | features/refinery/, features/regex/ | S | queued |
| cli-automation-workloads | features/automation/, features/workloads/ | M | queued |
| cli-imagery | features/imagery/ | S | queued |
| cli-notifications-home | features/notifications/, features/home/ | S | queued |
| cli-plugin | features/plugin/ | M | queued |
| cli-rpg | features/rpg/ | M | queued |
| cli-chat-a | features/chat/ split at start | XL | queued |
| cli-chat-b | second chat-client sub-unit | XL | queued |

### Phase 7 — ui

| Unit | Path | Band | Status |
| - | - | - | - |
| ui | packages/ui/ — tokens, primitives, variants | L | queued |

### Phase 8 — plugin packages and content

| Unit | Path | Band | Status |
| - | - | - | - |
| plugin-sdk | packages/plugin-sdk/ | S | queued |
| plugin-toolchain | packages/plugin-toolchain/ | S | queued |
| showcase-plugins | packages/showcase-plugins/ | S | queued |
| default-content | packages/default-content/ | S | queued |

### Phase 9 — tests support and instruments

Other test trees ride their slice units. `tests/support` is where test rot compounds; it gets its own.

| Unit | Path | Band | Status |
| - | - | - | - |
| tests-support | tests/support/ | L | queued |
| tests-tooling-scan | tests/tooling/ — is it behavior or wallpaper: one judgment unit, sample-based | XL | queued |
| snap-a | tooling/src/snap/ split at start | XL | queued |
| snap-b | second snap sub-unit | XL | queued |
| snap-c | third snap sub-unit | XL | queued |
| ui-audit | tooling/src/ui-audit/ | L | queued |
| motion-brand-audit | tooling/src/motion-audit/, tooling/src/brand-flow/ | S | queued |
| e2e | tests/e2e/ + playwright configs' runtime behavior | L | queued |

## Rollup

Triage fills this.

| Severity | Open | Fixed in-unit | Units affected |
| - | - | - | - |
| P1 | 0 | 0 | - |
| P2 | 3 | 0 | root-config |
| P3 | 1 | 3 | root-config |

Standing hunt for every unit: comments citing `tests/legacy` paths — the D333 retirement moved
those suites and never re-pointed the prose, and the citation gate
(`tests/tooling/doc/comment-path-citations.repo.int.test.ts`) does not scan root files or `scripts/`.
