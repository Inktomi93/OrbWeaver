# Codebase review ledger

## START HERE — read this file top to bottom; it is the whole assignment

You are the reviewer in a log-only whole-repo sweep. The conversation is disposable; this ledger
is the review. Nothing found goes unfixed-and-unwritten: every finding is written down with a
path and line the moment it is found, and fixes wait for triage.

Boot sequence, in this order, every cold start:

1. Read this file. Protocol, axes, commands, and the unit table are all in here — there is no
   second guide doc and none is needed.
2. Find the first `in-progress` unit in the table, else the first `queued` one. That is the
   assignment. If it is XL, split it into sub-units by subfolder and rewrite its rows first.
3. Read `units/<id>.md` if it exists (a half-done unit); else create it: title, band, sweeps,
   findings, verdict.
4. Mark the unit `in-progress`, update its status cell, commit nothing yet.
5. Work the unit: load the `code-recon` skill (vendored at `.claude/skills/code-recon`), run the
   sweeps
   (raw output into the unit file), read the unit's
   `contract/` in full, read every file header, then targeted-read only what the sweeps or
   headers made suspicious. For root-level config chunks, also truth the comments per the
   comment law while in there — one combined commit is fine.
6. Append findings as you find them, in the finding format below. A finding held in your head
   across a tool call is a finding you will lose.
7. Close: status to `reviewed (N)`, update the rollup table, run `pnpm format:docs`, commit
   ledger + unit file + any in-unit comment fixes together.

Per-unit workflow rules:

- Verify at the tier the change lives in. Comment/config edits: run the suites that read those
  files plus `pnpm typecheck` when a tsconfig moved. Never call a static pass "done".
- Commit trailer contract (`scripts/commit-msg-check.sh`) is enforced: `type(scope): subject`
  with type in the 11 allowed, and a well-formed `Co-Authored-By: Name <local@domain>` trailer
  on every commit. Message: what changed and why, two to four body lines.
- Commit between units, not mid-unit.
- Push cadence is the owner's: he routinely runs hundreds of local commits before pushing. Local
  accumulation is not a finding and needs no reminder; a cold session must not nag about it.

Context you need to grade findings, not just find them:

- The repo is mid-redo toward compiler errors and mechanical checks (plans `test-foundation`,
  `test-enforcement`, `unwired-code`; `pnpm doc overview` and `docs/plans/README.md` are the live
  board). Judge the enforcement layer against where that program is going; a lint gate the board
  already scheduled for retirement is not a finding. `pnpm doc drift` being clean means the board
  itself is consistent.
- Vendor API questions ("does drizzle 0.45 have this verb") have a current-docs oracle: the `docs`
  MCP server via `execute` — `tools.docs.search_docs` / `list_libraries` / `list_pages`. The index
  is built near one-to-one with the workspace catalog, pinned-version aware, and includes
  `orbweaver` itself (the law docs). Search it before answering from training data, which predates
  Node 26 / TS 7 / current React.
- "Was this decided or just forgotten?" has an oracle too: the full session transcripts live in
  `~/.claude/projects/-home-inktomi-inktomi-stack-development-orbweaver*/` and
  `~/.claude-b/projects/…` (~10G of jsonl, subagents under `*/subagents/`, tool output under
  `*/tool-results/`). `rg -o '.{0,200}KEYPHRASE.{0,300}'` over both dirs finds the decision
  moments; check the hit's date against the death commit before trusting it as post-ruling
  evidence (pre-deletion sessions enforce, they don't decide).
- Fix directions about MISSING machinery must pass the ledger before being written down: grep
  `docs/adr/` titles and the cited-ADR text first. A retired gate is usually retired BY RULING
  (D333 deletes the Verify gates, agent-sync and baseline ledgers and bans "equivalent
  replacements"), and a finding that recommends re-homing what the ledger banned is a re-decision
  smuggled in as hygiene. The honest shapes are "the ledger ruled X dead; the prose still
  promises it" or "no ledger row found; owner call". This exact save happened on the tooling-size
  cap after the finding was already committed with the wrong fix direction.

Operational traps already paid for — do not re-pay them:

- `pnpm exec <tool>`, never `npx` (devEngines will refuse, loudly and rightly).

- `git ls-files ... | xargs wc -l` prints a total PER BATCH; read the last line and you
  undercount by half. Use tokei (`tokei <path> -o json`).

- `rg -r` takes a REPLACEMENT argument; it ate a search pattern once already. `-rn` is not
  "recursive, line-numbered". Same family: `-E` is an ENCODING flag, not an extended-regex flag —
  `-E 'a|b'` dies with "unknown encoding". The cluster forms (`-rn`, `-rln`) have now caused this
  SIX times, always silently, always printing plausible rewritten output ("the n", "450-n").
  Prescription: spell `--count`, `--files-with-matches`, `--line-number` out long-form in this
  sweep. A short flag here costs seconds; a silent replace costs a wrong finding.

- "Does gate/rule X still exist?" has two answers and you need the second: config-grep says where
  it's *written*, a planted probe says whether it *fires*. Write the violating artifact (a 600-line
  clean file for a size cap, a planted error file for a compiler rule), run the real door
  (`pnpm exec biome check`, `pnpm exec tsc`), read the diagnostics. Proved the tooling-size cap
  dead this way after a config sweep had only proved it unfound.

- The doc formatter escapes `[P1]`-style brackets and stray asterisks in markdown; expect
  `\[P2]` in committed ledger text and match it when editing.

- `tests/tooling/**` is excluded from `pnpm test`; run tooling suites with
  `pnpm vitest run --config=vitest.config.ts <path>` or `pnpm test:tools`.

- The citation gate does not scan root files or `scripts/` (logged P2); re-point dead cites by
  hand and grep `tests/legacy` before closing any unit.

- A zero from grep/ast-grep is not absence: print a scanned-file count and use a second method
  before any negative claim. A malformed ast-grep pattern exits the same as a no-match.

- `codegraph callers/impact/affected` resolve only symbols declared in the tree. A vendor import
  (`setGlobalDispatcher`-class) answers "Symbol not found" — that means "declared outside the
  index", never "uncalled". Third-party call sites are `rg` work.

- The pinned compilers are native (Go) builds: `@typescript/typescript6@6.0.2` (the catalog
  `typescript`, for JS-API consumers like typescript-eslint) and
  `@typescript/native`=`typescript@7.1.0-beta` (what `pnpm exec tsc` runs, and what
  `scripts/typecheck.ts` drives) carry NO `lib/*.d.ts` on disk — the libs are embedded. Never
  grep a lib file for a "does the lib have X" claim; compile a planted probe with
  `pnpm exec tsc` and check the exit code. `rg` inside `node_modules` needs `--no-ignore`
  (the repo ignore files eat it).

Unit records live in `units/<id>.md`, where `<id>` is the Unit column below. The index holds
status only; findings live in the unit file. Trust no summary from a previous session that is not
written in a unit file.

## Conventions

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

Structural search has one authority: the `code-recon` skill, vendored at
`.claude/skills/code-recon/SKILL.md` (upstream copy at `~/.claude/skills/code-recon` stays the
author; re-copy after editing it there) — load it before writing any pattern. It carries the
verified rules the commands below cannot: `ts` and `tsx` are separate languages, always run both
and merge; `--inspect summary` prints the `scannedFileCount` receipt every negative claim needs;
one-node-in-a-list questions (object keys, import specifiers) are positional traps as patterns
and need `kind` rules via `--inline-rules`; default `smart` strictness silently skips unnamed
nodes like `async`. The commands here are only the routine literal-level part of the sweep.

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
| root-lint-configs | biome.json, eslint.config.ts, eslint-plugins.d.ts, stylelint\*.{ts}, jscpd.json, knip.ts, .dependency-cruiser.ts, lefthook.yml, stryker.config.ts, vitest\*.ts, playwright\*.config.ts, codegraph.json, .mcp.json, .markdownlint.json | L | reviewed (7) |
| root-dts | aggregator-assets.d.ts, platform\*.d.ts, reset.d.ts — loose ambient types at root | S | reviewed (4) |
| install-run | install.sh/.cmd, start.sh/.cmd, update.sh/.cmd, Dockerfile, docker-compose.yaml, .dockerignore, docker/, scripts/launcher/ | M | reviewed (5) |
| root-ci | .github/ — workflows: the install proof, release train, security scans, CodeQL | S | reviewed (4) |
| root-dev-environment | .devcontainer/, .vscode/ — sandbox image, firewall, tool lock, editor pins | S | reviewed (6) |
| scripts-patches | scripts/, patches/ | M | reviewed (3) |
| instruction-files | AGENTS.md, .claude/rules/, .claude/hooks/, .claude/agents/, .claude/skills/, .codex/ | L | reviewed (4) |
| root-docs | README.md, CONTRIBUTING.md, ACCESSIBILITY.md, SECURITY.md, CODE_OF_CONDUCT.md, LICENSE — pass for staleness against the ledger only | S | reviewed (1) |

### Phase 1 — foundations

| Unit | Path | Band | Status |
| - | - | - | - |
| kit | packages/kit/ | M | reviewed (3) |
| contracts | packages/contracts/ | L | reviewed (3) |
| db | packages/db/ incl. migrations | S | reviewed (1) |

### Phase 2 — tooling law enforcement

Review before anything that trusts these results.

| Unit | Path | Band | Status |
| - | - | - | - |
| tooling-eslint | tooling/src/eslint/ | L | reviewed (2) |
| tooling-floor | tooling/src/floor/ | M | reviewed (4) |
| tooling-configs | tooling/src/biome-config/, tooling/src/stack/ | S | reviewed (5) |
| tooling-unwired | tooling/src/unwired/ | M | in-progress |
| tooling-codemods | tooling/src/codemods/ | M | queued |
| tooling-doc | tooling/src/doc/ — carry the agent-sync remnants in `doc/ops/check.ts:3-5` (dead caller, dead `pnpm check:agents` refusal message) and `doc/index.ts:3`, already counted in `units/tooling-floor.md` F1; do not re-file | S | queued |
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
| e2e | tests/e2e/ + playwright/ (the CT harness mount) + playwright configs' runtime behavior | L | queued |

## Rollup

Triage fills this.

| Severity | Open | Fixed in-unit | Units affected |
| - | - | - | - |
| P1 | 1 | 0 | root-ci |
| P2 | 18 | 0 | root-config, root-dts, root-lint-configs, scripts-patches, instruction-files, root-ci, root-dev-environment, kit, contracts, tooling-floor, tooling-configs |
| P3 | 27 | 16 | install-run, root-config, root-dts, root-lint-configs, scripts-patches, instruction-files, root-ci, root-dev-environment, root-docs, kit, contracts, db, tooling-floor, tooling-configs |

Standing hunt for every unit: comments citing `tests/legacy` paths — the D333 retirement moved
those suites and never re-pointed the prose, and the citation gate
(`tests/tooling/doc/comment-path-citations.repo.int.test.ts`) does not scan root files or `scripts/`.

Working thesis from phase 0, to confirm or eat: **code has gates, prose does not** — see
`units/root-config.md`, section "Program thesis". All phase-0 findings were one crime: structure
moved and its describing sentences went false silently, twice on security tripwires. Treat stale
prose as a P2-class defect here, not a nit, and say so when a later unit contradicts the thesis.
root-lint-configs sharpened it: the gates themselves are derived, guarded and green — the rot is
in the *sentences inside refusal messages* (`units/root-lint-configs.md`): a lint error can tell
an author to import a specifier the resolver refuses or to trust a pin-test that was deleted.
When reviewing any gate, read its message strings with the dead-path sweep, not just its rules.
Phase 0 closed with root-docs and a sharpening, not a contradiction: human-facing docs were
mechanically true on every checkable claim (`units/root-docs.md`) — they have a gate, the author
re-reads them at ship time because a human audience reads them. The rot concentrates in prose
embedded beside machinery (comments, refusal messages, hand-maintained lists) that no audience
ever re-reads. Three confirmed instances of the closed-vocabulary-drift crime by phase 0's end:
lint-rule-id proof obligations, dependabot ignore set vs patchedDependencies, devcontainer
volumes vs pnpm-workspace packages. One fix shape serves all three: generate the list, diff it.

Phase 1's kit and contracts units found the thesis's nastiest subclass so far: **dead doors** —
prose shaped like machinery pointing at a mechanism that no longer exists. Both died the same
death: the verify-CLI removal (821e8f8dff) deleted the checker but not the sentence that promised
it (`kit/handle-key/unicode-data.ts` cites its generator; `contracts/src/prose` calls
`prose-baseline.json` "enforced by"/"gated by" while nothing reads it). The removal program left
at least two orphaned manifests whose whole purpose was a proof obligation. At triage the
integrity-test item should cover the class, not just the instances: every committed data file or
GENERATED header that claims a producer or consumer must have that door resolvable in-tree.

The db unit found the thesis's counterexample and the fix-shape precedent in one package:
`tests/db/schema/enum-tuples.suite.test.ts` is a shipped closed-vocabulary door (dynamic census
of every contracts+kit string-tuple export, member-equality against every enum column), and
`query/batch.ts` shows prose kept honest by MEASUREMENT — it caught its own false empty-batch
contract and made the sentence true instead of narrowing the runtime. Where prose has a proof
obligation, db already knows how to discharge it; the triage item is about extending db's habit,
not importing a new shape.

The tooling-floor unit found the dead-door class at its widest scale: a whole COMMENT DIALECT from
the deleted gate system. Nine `tooling-*` policy names are cited as live enforcement across
`tooling/src/floor/` (`units/tooling-floor.md` F2) but resolve nowhere in dep-cruiser/eslint/knip —
they were `defineGate` policy names until 821e8f8dff. Some constraints have native successors under
other spellings (process-portability → PORTABLE_PROCESS_SYNTAX), so the enforcement often survives
while its named promise dies; the size-cap cite is proved successor-less by planted-file probes
(601 clean lines draw zero Biome diagnostics; no eslint `max-lines` anywhere) — and authors still
split at the ghost cap by faith. Provenance from the ~/.claude + ~/.claude-b transcript sweep:
this was DECIDED, not forgotten — ADR 0333 rules the gates, agent-sync, baseline ledgers and
their commands gone, "without Verify, check aliases or equivalent replacements", "do not build
another policy framework". A native max-lines successor is therefore ledger-banned unless the
owner amends D333; what was forgotten is only the deletion hygiene the ADR itself ordered
(commands, tests, and the sentences about them gone TOGETHER). Two instance-level calls stay
open for the owner at triage: (a) `contracts/src/prose/prose-baseline.json` — transcripts show
its deleted gate caught real staleness in the old world ("pnpm prose:baseline, contract now
40/40"), and a ~20-line plain int test would be D333-legal ("ordinary targeted tests for useful
bounded assertions"), so keep-with-test or delete-with-prose; (b) `kit/handle-key/unicode-data.ts`
— the unwired lane at deletion noted "nothing in tooling regenerates unicode-data.ts" and shipped
without deciding the regeneration strategy; the version-pinned test goes red at the next engine
bump unless the ~30-line fetch script from the kit unit's finding lands. The triage
integrity item now has a concrete second citation shape to cover: besides GENERATED/enforced-by
headers, every `` policy `X` `` cite must resolve to a dep-cruiser rule name or eslint rule id.

The tooling-configs unit proved the dialect escapes floor/ — `tooling-child-process-door` is the
10th dead name, cited with fabricated "reviewed grant" strings in `stack/ops/start.ts` and
`prod-up.ts` — and produced the thesis's sharpest single sentence: `verdicts.ts:9` justifies a
duplicated constant with "not exported from the package" while line 5 of the same file imports
from the barrel that exports it. That is the dead door at its cheapest: the disproving evidence
is one line away and no door ever reads it. It also added a fresh closed-vocabulary instance with
no door at all: `stack/contract/types.ts`'s `DEBUG_ENV_KEYS` claims to enumerate "every
debug-surface knob foundation/env declares" and the server has since grown a fourth member
(`WIRE_CAPTURE_REPLY`, deliberately excluded for a documented reason the tuple never states).
Six of eight header claims in the unit verified TRUE — where the prose is coupled, the pin
exists; every finding here is a claim whose coupling was never written down.
