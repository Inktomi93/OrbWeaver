---
kind: plan
status: active
updated: 2026-09-22
---

# Doc system: markdown with machine-checked structure, one CLI, one checker

## Goal

Replace the doc sprawl with four homes (`docs/law/`, `docs/adr/`, `docs/plans/`, `docs/work/`) plus `docs/Mission.md`, where agents write prose and every structural change goes through `pnpm doc`. `pnpm check:agents` checks the new tree. The legacy tree (docs/architecture/, docs/design/, docs/history/) keeps its current checker until each folder migrates; the migration is `docs/plans/doc-migration/`. The vendored-doc mirrors this plan formerly named already left git entirely rather than migrating into a home here.

## Premises re-derived against the tree

| Brief premise | Tree | Verdict |
| - | - | - |
| ~2,000 tracked files under `docs/` | `git ls-files docs` in this worktree counts a little over two thousand; the vendored-doc mirrors this plan formerly named (docs/work/0010-vendored-docs-leave-git.md, now deleted) were roughly a third, docs/history/ and docs/reviews/ together about half | holds |
| history has three homes | docs/history/, docs/architecture/history/ and docs/history/design/ existed | resolved: all three are gone |
| reviews have two homes | formerly docs/reviews/ and a second historical subtree under docs/history/ (the audit per-lane folders lived there); the reviews item (`docs/work/0008-reviews-leave-docs.md`) emptied the second one entirely | held, no longer current |
| docs/design/ is a flat drawer of about sixty files | sixty-two flat files plus a mocks subtree of about a hundred | resolved: the tree is gone |
| the D-ledger is ~163 rows in a few huge files | the legacy registry file held ids D1 to D163 with a reserved gap D79 to D105, in TWO row shapes: bullet rows (`- **D<n>** — …`) under range headings, and per-ruling `## D<n>` headings with a bold restatement and continuation lines. One id (D119) has two bullet anchors. The longest single row is about 12 KiB; four rows exceed 8 KiB | holds, with two shapes the splitter must parse |
| new ADRs start at `0001` while the ledger keeps its numbers | D1 exists, so `docs/adr/0001-*` would collide with D1's future home | REFUTED: new ADRs continue the ledger's id space (next free is D164, read from both sources); the numbering fork is below |
| code cites doc section numbers and D rows, and `check:structure` reds on a moved heading | code carries about five thousand bare `D<n>` citations across roughly eighteen hundred source files (138 distinct ids), about eleven thousand `§` section citations, and about a thousand `docs/**.md` path citations (236 distinct paths; 229 of them under `docs/law/`). The `d-citation-integrity` gate resolves `D<n>` against the registry's bullet anchors; `dangling-doc-cite` resolves path and basename cites against tracked files | holds; the citer cost is priced in §Ledger split |
| the catalog churns on every edit | the catalog tree is about 5 MB of JSON; `catalog.json` is a generated 3 MB file committed in the tree; each attestation row pins a whole-file hash, a commit, and an append-only prose `evidence` array | held; the owner ruled the attestation out at once (this lane), so the rows now carry a path and an authority only |
| the GitHub board is being torn down | the workboard tool was the GitHub client; nothing in the tree depended on it except its own tests and the rule files that named its CLI spelling | holds (landed, item 13) |

## Shape

### The tree

| Home | Kind | Files | Status values |
| - | - | - | - |
| `docs/law/<Name>.md` | `law` | the legacy core law folder, moved | `active`, `superseded` |
| `docs/adr/NNNN-<slug>.md` | `adr` | one decision per file, immutable, supersede-don't-edit; NNNN is the D number | `active`, `superseded` |
| `docs/plans/<slug>/design.md` | `plan` | the design; forks and coupled sites live here | `active`, `complete` |
| `docs/plans/<slug>/tasks.md` | generated | the plan's work items as a checklist, written by `pnpm doc` | none (generated) |
| `docs/plans/archive/YYYY-MM-DD-<slug>/` | archived plans | moved by `pnpm doc archive`, the one history home | `archived` |
| `docs/work/NNNN-<slug>.md` | `bug`, `work`, `decision`, `tooling` | one work item per file (the board replacement) | `open`, `doing`, `blocked`, `done` |
| `docs/adr/README.md`, `docs/plans/README.md`, `docs/work/README.md` | generated indexes | written by `pnpm doc`, checked for freshness | none |
| `docs/Mission.md` | `reference` | unchanged | `active` |

Agent run output leaves `docs/`: `reports/` is gitignored, and a report a gate or ledger cites by path stays where the gate reads it. Vendored docs leave git (a scheduled task).

### Frontmatter

Flat `key: value` YAML, parsed by the reader in `tooling/src/doc/lib/frontmatter.ts`. `kind`, `status`, `updated` stay required everywhere; `updated` is the one sanctioned date and doubles as the review date (§Freshness). New keys, each entering through `tooling/src/doc/contract/vocab.ts` with this design as the reason:

| Key | Kinds | Meaning |
| - | - | - |
| `supersedes` | `adr`, `law` | existing key; the path of the decision this one replaces |
| `superseded-by` | `adr`, `law` | the path of the replacement; written by `pnpm doc status superseded --by` |
| `priority` | items | `P0` to `P3`; absent means triage |
| `area` | items | one lowercase token |
| `lane` | items | the exact branch name the lane works on; required while `doing`, matched exactly by `drift` |
| `blocked` | items | `owner`, `on <id>`, `wake path <repo path>` or `wake gone <repo path>`; required while `blocked`; nothing in it is ever executed |
| `plan` | items | the plan slug the item belongs to |
| `evidence` | items | a commit that exists on `main`; required while `done` |
| `reviewed` | items | a commit or a reviewer name; a field, never a state |

### Required sections and size caps (per kind)

| Kind | Required `##` sections | Cap |
| - | - | - |
| `adr` | Context, Decision, Consequences, Alternatives rejected | 8 KiB |
| `plan` | Goal, Shape, Rejected, Coupled sites, Test plan | 48 KiB |
| items | What, Why, Done when, Evidence | 4 KiB |
| `law` | none (a law doc's headings are its stable citation anchors) | 48 KiB |

Status is frontmatter only; an ADR has no `## Status` section (fork 2 below).

### The CLI: `pnpm doc`

`tooling/src/doc/` under the five-slot template. Every verb takes lists; every write rewrites whole files (frontmatter block, generated index, generated `tasks.md`) through the repo's markdown formatter, never a regex edit inside prose. Every write verb regenerates the indexes it affects.

| Verb | Effect |
| - | - |
| `new adr <slug> [--title <t>]` | mints `docs/adr/NNNN-<slug>.md` at the next free id (registry anchors ∪ ADR files, skipping the reserved range) from the ADR template |
| `new plan <slug> [--title <t>]` | mints `docs/plans/<slug>/design.md` from the plan template |
| `item <title> --kind <bug\|work\|decision\|tooling> [--priority P] [--area a] [--plan slug] [--lane x]` | mints `docs/work/NNNN-<slug>.md`; `--lane` opens it as `doing` |
| `status <status> <path…> [--by <path>]` | sets `status` on N docs; `superseded --by` also writes `superseded-by` on the old and `supersedes` on the new |
| `set <id…> <state> [--lane x] [--blocked "on 12"] [--priority P] [--area a] [--plan s] [--reviewed x]` | the item transition verb; validates only the final shape |
| `land <id…> --evidence <sha>` | `done` plus evidence; refuses a sha that is not on `main` |
| `land --merged` | the post-merge hook door: reads `Closes:` trailers of `ORIG_HEAD..HEAD` on `main`, lands them with the merge commit as evidence, commits the result |
| `archive <plan-slug…>` | moves `docs/plans/<slug>/` to `docs/plans/archive/<today>-<slug>/`, sets `archived`, rewrites the old path in every tracked text file, moves the plan's done items into the archive folder |
| `index` | regenerates the three indexes and every plan's `tasks.md` |
| `review <path\|glob…>` | sets `updated` to today on N docs in one write |
| `due [glob…]` | the soft freshness report (§Freshness); always exit 0 |
| `overview` | the column view: open (triage first), doing, blocked, done count |
| `drift` | the orchestrator nag; prints nothing when consistent, else one line per drift with the fixing command |

There is no `doc check`; the check is `pnpm check:agents` (ruling 6).

The brief's `task <plan> <n> done|open` verb is replaced by `set <id…> done`: a plan's `tasks.md` is generated from its items, so task state has one home (the item file) and ticking a line by hand would be a second one.

### The checker: `pnpm check:agents` over `docs/**`

`tooling/src/doc/ops/check.ts` composes the docs verdict; `agent-sync/ops/instructions.ts` reaches it through the `#doc` front door and reports it through the same problem list and exit code as the instruction-layer check. The pure structural rules live in `tooling/src/doc/lib/rules.ts`; the writing rules both walks share live on the plumbing floor (`tooling/src/_shared/prose-rules.ts`, `tooling/src/_shared/prose-references.ts`), so `doc` never imports `agent-sync` and there is no cycle.

Over the governed set (the new tree plus `docs/Mission.md`):

1. frontmatter schema per kind: required keys, allowed keys, status in the kind's set, `updated` a date, item fields consistent with the state (`doing` needs `lane`, `blocked` needs `blocked`, `done` needs `evidence`, an `on <id>` blocker names an existing item);
2. required sections per kind, size caps per kind;
3. `docs/work/` accepts only item kinds; `docs/adr/` only `adr`; a plan folder holds `design.md` and optionally `tasks.md`;
4. generated indexes and `tasks.md` are byte-identical to what `pnpm doc index` would write;
5. ADR ids are unique across the registry and the ADR files (the one read of the legacy registry the new tree needs: two homes for one id would be drift, not compatibility), and an ADR names no reserved id;
6. every markdown link and backticked repository path resolves (the existing reference check, widened);
7. writing rules 1, 2 and 4 (history markers, inventory counts, banned words) from `tooling/src/_shared/prose-rules.ts`, with a frontmatter block and a link target treated as data, not prose (`updated:` is the sanctioned date; an archived plan's folder carries one in its path).

Over the whole `docs/` tree:

8. allowed folders: a top-level entry under `docs/` is one of the four homes or `Mission.md` (landed, item 12: the legacy tree and its catalog inventory are gone, so the shrink-only legacy-folder list is deleted from `rules.ts`).

Rule 2 is new in the checker: a number followed by an inventory noun (`files`, `tests`, `rules`, `lessons`, `workers`, `gates`, `docs`, `documents`) in prose. Measured over every instruction file before adding it: zero hits, so it lands without a baseline.

### Freshness: two tiers, no committed hash

Hard (red): mechanical claims. Every cited path, symbol, heading, script and D/ADR id resolves. Owned by `check:structure` (`dangling-refs`, `dangling-ref-citations`, `dangling-doc-cite`, `d-citation-integrity`) and by rule 6 above. Nothing is committed for it.

Soft (warning, never red): semantic drift. A doc's described code is the set of backticked repository paths in its body, read at check time by the existing `backtickedRepoPaths` reader. A doc is due when any of those paths has a commit on the current branch after the doc's `updated` date. `pnpm doc due` computes it with one `git log --since=<earliest updated> --name-only` pass and a prefix match, and prints one line per due doc with its fixing command (`pnpm doc review <path>`). It never appears in `pnpm check`.

Review state is `updated`, written by `pnpm doc review` in batch. No whole-file hash, no per-doc commit, no prose evidence array. The attestation was gone by owner ruling before the new tree existed: a row was a path and an authority, a legacy prose edit red nothing there, and the new tree was outside the catalog corpus from the first commit, so no new document ever needed a lane row or a regenerated catalog. The legacy inventory itself is gone (landed, item 12). The population file of the `caught-failure-ownership` gate (keep the human verdict and reason keyed by `siteId`, derive line and column live) is a scheduled task in the migration plan.

### Work items (the board replacement)

One small file per item, `docs/work/NNNN-<slug>.md`, kind one of `bug`, `work`, `decision`, `tooling`, and exactly four states. Any transition is legal; the checker validates only the final shape. Review and verify are fields, not states. A plan's `tasks.md` is generated from the items carrying `plan: <slug>`, ordered by id, one checklist line each, so `tasks.md` replaces the board's column for that program and has no state of its own.

Chosen over one line per task in `tasks.md` because an item needs the four sections (what, why, done when, evidence) and a blocker reason, two lanes editing one `tasks.md` collide, and planless bugs need a home anyway. Item ids are their own space, separate from ADR numbers.

Lanes never write item state. They add a commit trailer `Closes: 12, 14`; `scripts/commit-msg-check.sh` validates its shape. A `post-merge` hook on `main` (`lefthook.yml`) runs `pnpm doc land --merged`, which reads the trailers of the newly merged commits, lands the items with the merge commit as evidence, regenerates the indexes and commits under the standing commit contract. On any branch other than `main` the hook is a no-op.

`pnpm doc drift` is called from `.claude/hooks/session-onboard.sh` (a shell block that prints the tool's stdout and nothing else). Its four checks: a `doing` item whose lane matches no live worktree and no unmerged branch; a `main` commit whose `Closes:` trailer names an item that is not `done`; a `blocked on <id>` item whose blocker is `done`; a `blocked wake <command>` item whose command exits 0. Each line carries the exact fixing command. A free-text wake condition never fires; a wake condition is written as a command so the nag can evaluate it.

A done item with no plan is deleted by `pnpm doc archive` when named; git keeps it. A done item with a plan moves into the plan's archive folder with the plan.

### Ledger split

The registry keeps its D numbers; each ruling becomes `docs/adr/NNNN-<slug>.md` with the ruling's title as the H1, its text under `## Decision`, and the other three sections carrying the sentence "Not recorded in the ledger row." until the migration lane fills or deletes them. The parser handles both row shapes and refuses a duplicate anchor. Ids never change, so the five thousand bare `D<n>` code citations cost nothing. The split lands as ONE commit: the `d-citation-integrity` gate's ledger resource (`tooling/src/verify/contract/resource-document.ts`) is re-pointed from the registry file to the ADR tree, where an id resolves from a filename; the registry is deleted; registry-prefixed citations (61 code sites, about 180 doc sites) are rewritten to the bare id; and the legacy catalog's registry path goes with the attestation rows. No union resolver and no interval where both homes are valid (owner ruling).

About 40% of the rows carry dates or issue numbers in their prose, so a migrated ADR fails writing rule 1 until its prose is cleaned, and that red is the to-do list (owner ruling: no grandfather exemption). Four rows exceed the ADR cap and are trimmed under the ledger-entry style, which already forbids provenance trails.

### Law move

The legacy core law folder becomes `docs/law/` by path swap, section numbers untouched, so basename citations resolve unchanged and the 229 full-path code citations plus the tooling constants (`resource-document.ts`, `dangling-ref-corpus.ts`, `dangling-ref-citations.ts`, `d-citation-integrity.ts`, `doc/contract/vocab.ts`, `doc/ops/tree.ts`, `verify/lib/selection.ts`) are one mechanical prefix rewrite. `check:structure` is the proof.

## Rejected

| Option | Why not |
| - | - |
| SQLite for docs or items | parallel worktree lanes cannot merge a binary database; the owner ruled it out |
| an MCP server | Claude-only, a server for a script's job, and a mid-session change invalidates the prompt cache; Codex and Qwen must use the same tool |
| spec-kit / OpenSpec proposal-design-tasks trios | measured to cost two to three times the tokens for no better code; a plan is one design file plus a generated task list |
| keeping the single ledger file | 315 KB in one file is the mega-doc problem itself; one row per file keeps the numbers and lets a lane move a bounded batch |
| keeping GitHub Projects | API-throttled, rotted, and off the tree; in-flight state must live in the repo |
| a second checker (`pnpm doc check`) | ruling 6: one checker; the doc tool exports its rules and `check:agents` runs them |
| extending the legacy catalog tool instead of a new `doc/` tool | the catalog is the model being removed; the survivor owns the verbs, and it imported the catalog's frontmatter reader and formatter until those moved (landed, item 12) |
| a union D-id resolver (registry anchors plus ADR filenames) during the split | an owner ruling: no compatibility shim; the split is one commit that re-points the `d-citation-integrity` ledger resource at the ADR tree, deletes the registry and rewrites its citers |
| a `reviewed: <sha>` frontmatter key for soft freshness | a sha is orphaned by every rebase and needs a second field beside `updated`; a date is enough for a warning tier and is the one sanctioned date already |
| a `describes:` frontmatter list of paths | the paths are already in the body as backticked citations; a second list drifts from the first |
| a `## Status` section in ADRs | frontmatter `status` already holds it; two homes drift |
| items as lines in `tasks.md` | no room for the four sections or a blocker reason; two lanes editing one file collide; planless bugs need a home |
| the post-merge hook leaving uncommitted writes | an uncommitted `main` blocks the next merge; the hook commits under the message contract with the whole-tree check excluded, the standing exception spelling |
| new documents entering the catalog with lane rows and attestations | fake issue numbers and a hash-pinned attestation per new file is the churn being killed; the new tree is outside the catalog corpus from the first commit |

## Coupled sites

| Site | Change |
| - | - |
| `tooling/src/doc/**` | new tool: cli, index, contract, lib, ops |
| `tooling/src/agent-sync/ops/instructions.ts`, `tooling/src/agent-sync/cli.ts`, `tooling/src/agent-sync/index.ts` | the docs check joins `--check`; the summary line counts docs |
| `tooling/src/_shared/prose-rules.ts`, `tooling/src/_shared/prose-references.ts` | the writing rules and the reference check, moved to the plumbing floor by importer census; rule 2, frontmatter and link-target masking |
| `tooling/src/doc/contract/vocab.ts` | kinds `adr`, `plan`, `bug`, `work`, `decision`, `tooling`; statuses `open`, `doing`, `blocked`, `done`; keys `superseded-by`, `priority`, `area`, `lane`, `blocked`, `plan`, `evidence`, `reviewed`; the `DOC_TOOL_TREES` prefixes (landed, item 12: moved from the legacy catalog's vocab module) |
| `tooling/src/doc/ops/tree.ts` | the formatted writer for the governed tree |
| `tooling/src/doc/ops/format.ts` | the formatter's living trees include `DOC_TOOL_TREES` (landed, item 12: moved from the legacy catalog's format op) |
| `tooling/src/verify/lib/selection.ts` | scoped `docs:format` selection admits the new tree |
| `tooling/src/verify/lib/registry-triggers.ts` | `structure:agent-config` triggers on `docs/` |
| `tooling/src/verify/gates/d-citation-integrity.ts`, `tooling/src/verify/contract/resource-document.ts` | the ledger resource moves to the ADR tree in the split commit (scheduled, not built here) |
| `package.json` | the `doc` script |
| `.claude/rules/writing.md` | `paths:` gains `docs/**`; a Docs section states the deltas |
| `.claude/rules/docs.md` | points at `writing.md` for style and lists the `pnpm doc` verbs; the board tool's CLI references left (landed, item 13) |
| `AGENTS.md` | the rule list line for `writing.md` must match its new `paths:` |
| `docs/law/Core-Tooling-Law.md` | the tool roster row for `doc/` |
| `scripts/commit-msg-check.sh` | validates a `Closes:` trailer |
| `lefthook.yml` | `post-merge` runs `pnpm doc land --merged` |
| `.claude/hooks/session-onboard.sh` | the drift nag block |
| `tests/tooling/doc/**`, `tests/tooling/agent-sync/**` | the tests |
| the legacy catalog tree and tool | deleted whole (landed, item 12): the generated inventory, the lane/state/authority-row files, the attest verb, hash rules and every git-derived fact |

## Test plan

Every test plants a tree in scratch (`plantedTree`) or drives a pure function; nothing plants in the repository. Each rule has one failing case and one passing control beside it.

| Test | Proves |
| - | - |
| `tests/tooling/doc/lib/rules.test.ts` | per-kind frontmatter, sections, caps, folder admission, item state shape, ADR id uniqueness and reserved range; each rule red on a planted violation and green on the control |
| `tests/tooling/doc/lib/indexes.test.ts` | index and `tasks.md` rendering is deterministic and byte-stable |
| `tests/tooling/doc/ops/verbs.suite.int.test.ts` | each write verb on a planted tree: the file it writes, the indexes it regenerates, the refusal when the target exists or the id is unknown; `archive` rewrites the old path in a planted citer |
| `tests/tooling/doc/ops/board.int.test.ts` | `land` refuses a sha not on `main`; each of the four drift lines fires on a planted repository and stays silent on the consistent control |
| `tests/tooling/doc/cli.int.test.ts` | the exit contract through the real binary: misuse is 3, a refused write is 1, nothing written on refusal |
| `tests/tooling/doc/ops/check.int.test.ts` | the docs check on planted trees, one failure class per case, the clean tree, and the real repository clean |
| `tests/tooling/_shared/prose-rules.test.ts` | rule 2 fires on a count and not on a budget; a dated link target and a frontmatter date are not prose dates |

Suites run: `pnpm test:scoped tests/tooling/doc tests/tooling/agent-sync`, `pnpm typecheck --config tooling/tsconfig.json`, scoped Biome and ESLint on the touched files, `pnpm check:agents`, `pnpm check:docs`, `pnpm check:structure`.

## Forks

1. ADR numbering. The brief names an ADR numbered 0001; D1 exists. Default: new ADRs continue the ledger's id space, so this system's ADR is `docs/adr/0164-docs-plans-adrs.md` and the registry's next-free note moves to D165.
2. ADR `## Status` section. The brief lists Status among the required sections. Default: status is frontmatter only; the body has four sections.
3. The `task` verb. Default: dropped in favour of `set <id…> done`, with `tasks.md` generated from items.
4. Work-item build scope. Default: built in this lane after the doc system lands, as a second commit; anything unfinished becomes the first task of the migration plan.
5. Soft freshness key. Default: `updated` (a date) is the review mark; no `reviewed` sha on docs. Items keep `reviewed` as a field because the owner asked for it.
6. The law style merge. Default: `writing.md` becomes the one style law now by pointer; the two law docs fold into it in the scheduled task rather than in this lane, because each edit to them costs an attestation today.
