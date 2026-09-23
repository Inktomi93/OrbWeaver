---
kind: law
status: active
updated: 2026-09-23
---

# Docs and work items

How the repository records decisions, standing rules, programs and open work, and how that record
stays true. [ADR 0222](../adr/0222-docs-plans-adrs-no-archive.md) records why it has this shape. For mechanics,
agents follow `.claude/rules/docs.md`, and for style, `.claude/rules/writing.md`.

## The homes

| Home | Holds | Changes |
| - | - | - |
| `docs/law/` | Standing rules that apply to all work: architecture, the tiers, the spines, the gate catalog | Edited in place when the rule changes |
| `docs/adr/` | One decision per file: context, decision, consequences, rejected alternatives | Never edited in meaning; a new ADR supersedes it, or it is marked rejected |
| `docs/plans/<slug>/` | One program: its `design.md` and a generated `tasks.md` | Edited while the program runs, then deleted once its lasting knowledge is in an ADR or law |
| `docs/work/` | One work item per file: a bug, a piece of work, an owner decision, or a tooling change | Moves through its states; landing deletes it, and the landing commit keeps the record |
| `docs/Mission.md` | Why the product exists | Rarely |

The code is the doc for anything the code shows. A domain's behavior lives in its code and file headers,
not in a prose file.

Pick the home by the question the text answers:

- "What must always hold?" goes to law.
- "What did we decide, and what did we reject?" goes to an ADR.
- "How do we build this program?" goes to a plan.
- "What is left to do?" goes to a work item.

Agent run output, such as review reports and audit logs, goes under the gitignored `reports/` folder,
never under `docs/`. Git keeps the history, so nothing under `docs/` is kept only as a record: a landed
item and a finished plan are deleted.

## ADR or law?

An ADR records one decision at a point in time: the context that forced it, the ruling, and the
alternatives rejected. It is immutable; a later ADR supersedes it. Reach for an ADR when someone will
later ask "why is it like this?", or will propose an option that was already turned down. For example,
[ADR 0222](../adr/0222-docs-plans-adrs-no-archive.md) records why the docs tree has one structural writer.

Law states a standing rule or mechanism that current work must follow, and it is edited in place when the
rule changes. Reach for law when an agent needs to know "how do I do X here?". For example,
[Spine-Testing](Spine-Testing.md) says where tests live and what each kind proves.

A mechanism that is explained often but was decided long ago, such as the per-world compiler programs, is
law: the law doc explains how it works today and points to the ADR that decided it. A decision considered
and turned down is still an ADR, with status `rejected`, so the option is not proposed again.

## One writer for structure

Agents and people write prose. The `pnpm doc` tool writes every structural part: numbers, frontmatter,
status, supersession links, item states, landing, deletion and the generated indexes (`README.md` in each
home, `tasks.md` in each plan). Never edit a generated file or a frontmatter block by hand. Every verb takes
several ids or paths, so one call can change a batch.

| To | Run |
| - | - |
| Record a decision | `pnpm doc new adr <slug> --title "<t>"` |
| Record a rejected option | `pnpm doc new adr <slug>`, then `pnpm doc status rejected <path>` |
| Start a program | `pnpm doc new plan <slug> --title "<t>"` |
| Park or resume a program | `pnpm doc status parked <plan>/design.md --blocked <reason>`; `pnpm doc status active <plan>/design.md` |
| Write a standing rule | `pnpm doc new law <slug> --title "<t>"` |
| File work | `pnpm doc item "<title>" --kind bug\|work\|decision\|tooling --priority P0..P3 --area <a> [--plan <slug>] [--lane <branch>\|--blocked <reason>] --what <text> --why <text> --done <text>`, or a batch with `pnpm doc item --from <file.json>` |
| Supersede an ADR | `pnpm doc status superseded <old> --by <new>` |
| Fix a law doc's kind | `pnpm doc status active <path> --kind law` |
| Change item state | `pnpm doc set <id…> open\|doing\|blocked\|done [--lane <branch>] [--blocked <reason>]` |
| Edit an item | `pnpm doc set <id> [--kind <k>] [--title "<t>"] [--plan none]`; a new title renames the file and rewrites every link to it |
| Delete a doc | `pnpm doc remove <id\|path…>`: a mistaken item, a finished plan by its `design.md`, a dead ADR or law doc; refuses while anything cites it |
| Land items by hand | `pnpm doc land <id…> --evidence <sha>`; deletes the items and commits the record |
| See the board | `pnpm doc overview` |
| Find drift | `pnpm doc drift` |
| Find docs due for review | `pnpm doc due` |
| Mark docs reviewed | `pnpm doc review <path\|glob…>` |
| Rebuild the indexes | `pnpm doc index` |

## Work items

An item is `open`, `doing` or `blocked`. Any transition among them is legal; the checker validates only
the final shape. There is no done file: landing deletes the item.

| State | Means | Required field |
| - | - | - |
| `open` | Not started. No priority yet means it still needs triage. | none |
| `doing` | A lane is on it | `lane`, the exact branch name |
| `blocked` | It cannot move | `blocked`: `owner`, `on <id>`, `wake path <repo path>` or `wake gone <repo path>` |
| `done` | Only on an item landed before landing deleted files | `evidence`, a commit the checker proves is on `main` |

Review is not a state. A `reviewed` field records who reviewed the item, if anyone did.

A lane never writes item state. It ends its commit message with a `Closes: 12, 14` trailer, and the
post-merge hook on `main` lands those items with the merge commit as evidence. A merge concluded after a
conflict runs no hook. The drift check then names the items to land by hand.

Landing deletes the item file and commits the deletion with a message that records each item's title,
evidence and What text; `git log --diff-filter=D -- docs/work/` finds it later. An item or parked plan
blocked on a landed item is released in the same commit. A landing refuses while another doc still links
to the item, so it never leaves a dead link.

At session start, the onboarding hook prints the drift check. It prints nothing when the state is
consistent. Otherwise it prints one line per problem, each with the command that fixes it:

- a `doing` item with no live branch;
- a `Closes:` trailer on `main` whose item is still on the tree;
- a blocker that is done;
- a wake condition that has fired, on an item or a parked plan;
- an active plan with no open item left.

A `decision` item waits for the owner. When the owner rules, record the ruling in the item's text, and the
item then carries the work the ruling implies.

## Plans

A plan is `active` while its items run, or `parked` while it waits. A parked plan carries its wake
condition in `blocked`, in the item grammar, and the drift check names it when the condition fires. A
plan with no open item has finished: move what it taught into an ADR or law, then delete it with
`pnpm doc remove <plan>/design.md`. A plan is never archived.

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
