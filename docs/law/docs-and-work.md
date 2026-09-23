---
kind: law
status: active
updated: 2026-09-23
---

# Docs and work items

How the repository records decisions, standing rules, programs and open work, and how that record
stays true. [ADR 0164](../adr/0164-docs-plans-adrs.md) records why it has this shape. For mechanics,
agents follow `.claude/rules/docs.md`, and for style, `.claude/rules/writing.md`.

## The homes

| Home | Holds | Changes |
| - | - | - |
| `docs/law/` | Standing rules that apply to all work: architecture, the tiers, the spines, the gate catalog | Edited in place when the rule changes |
| `docs/adr/` | One decision per file: context, decision, consequences, rejected alternatives | Never edited in meaning; a new ADR supersedes it |
| `docs/plans/<slug>/` | One program: its `design.md` and a generated `tasks.md` | Edited while the program runs, then archived |
| `docs/work/` | One work item per file: a bug, a piece of work, an owner decision, or a tooling change | Moves through four states, then stays as the record |
| `docs/Mission.md` | Why the product exists | Rarely |

The code is the doc for anything the code shows. A domain's behavior lives in its code and file headers,
not in a prose file.

Pick the home by the question the text answers:

- "What must always hold?" goes to law.
- "What did we decide, and what did we reject?" goes to an ADR.
- "How do we build this program?" goes to a plan.
- "What is left to do?" goes to a work item.

Agent run output, such as review reports and audit logs, goes under the gitignored `reports/` folder,
never under `docs/`. Git keeps the history.

## One writer for structure

Agents and people write prose. The `pnpm doc` tool writes every structural part: numbers, frontmatter,
status, supersession links, item states, archiving and the generated indexes (`README.md` in each home,
`tasks.md` in each plan). Never edit a generated file or a frontmatter block by hand. Every verb takes
several ids or paths, so one call can change a batch.

| To | Run |
| - | - |
| Record a decision | `pnpm doc new adr <slug> --title "<t>"` |
| Start a program | `pnpm doc new plan <slug> --title "<t>"` |
| File work | `pnpm doc item "<title>" --kind bug\|work\|decision\|tooling --priority P0..P3 --area <a> [--plan <slug>]` |
| Supersede an ADR | `pnpm doc status superseded <old> --by <new>` |
| Change item state | `pnpm doc set <id…> open\|doing\|blocked\|done [--lane <branch>] [--blocked <reason>]` |
| Land items by hand | `pnpm doc land <id…> --evidence <sha>` |
| Archive a finished plan | `pnpm doc archive <plan-slug>` |
| See the board | `pnpm doc overview` |
| Find drift | `pnpm doc drift` |
| Find docs due for review | `pnpm doc due` |
| Mark docs reviewed | `pnpm doc review <path\|glob…>` |
| Rebuild the indexes | `pnpm doc index` |

## Work items

An item has four states. Any transition is legal; the checker validates only the final shape.

| State | Means | Required field |
| - | - | - |
| `open` | Not started. No priority yet means it still needs triage. | none |
| `doing` | A lane is on it | `lane`, the exact branch name |
| `blocked` | It cannot move | `blocked`: `owner`, `on <id>`, `wake path <repo path>` or `wake gone <repo path>` |
| `done` | It landed | `evidence`, a commit the checker proves is on `main` |

Review is not a state. A `reviewed` field records who reviewed the item, if anyone did.

A lane never writes item state. It ends its commit message with a `Closes: 12, 14` trailer, and the
post-merge hook on `main` lands those items with the merge commit as evidence. A merge concluded after a
conflict runs no hook. The drift check then names the items to land by hand.

At session start, the onboarding hook prints the drift check. It prints nothing when the state is
consistent. Otherwise it prints one line per problem, each with the command that fixes it:

- a `doing` item with no live branch;
- a `Closes:` trailer on `main` that nothing landed;
- a blocker that is done;
- a wake condition that has fired.

A `decision` item waits for the owner. When the owner rules, record the ruling in the item's text, and the
item then carries the work the ruling implies.

## Freshness

Freshness is checked in two tiers. Neither pins a line number or a file hash.

- **Hard, red in `pnpm check`:** every path, symbol, heading and D number a doc cites must resolve.
  `check:agents` and the citation gates in `check:structure` own this.
- **Soft, a warning:** a doc is due for review when a repository path its body cites changed after the
  doc's `updated` date. `pnpm doc due` lists these docs. After review, `pnpm doc review` sets the date.

## Checks

`pnpm check:agents` checks the governed homes: frontmatter per kind, required sections, size caps,
allowed folders, generated-index freshness, dead links and paths, and the writing rules on history,
counts and banned words. Each message names its fixing command. A red during a migration is the to-do
list. No exemption turns it green.

## Legacy tree

Folders under `docs/` other than these homes are legacy. They migrate under
`docs/plans/doc-migration/design.md`. Add nothing to them.
