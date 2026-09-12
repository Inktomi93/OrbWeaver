---
kind: design
status: active
updated: 2026-09-12
---

# READ FIRST — the #1584 session onboarding list

**You are a cold or compacted session picking up the gate-runtime program. Read this file, then read the
list below IN ORDER, and STOP where it says stop.** This file exists because a session was told to read
"the two program docs and every doc they mention, in full", did exactly that, and spent **60% of its context
window on \~1.3 MB** — most of it on evidence whose conclusions were already distilled and whose headline
findings were already CLOSED. Do not repeat that.

## 0. The rulings that override anything you read below

1. **NOTHING GETS TO REFUSE TO CONVERT** (owner, 2026-09-12). Convert it or delete it. A gate that needs a
   capability we do not have is a reason to **BUILD THE CAPABILITY**, not to record a refusal and move on.
   The older doctrine — *"a read no shipped kind serves STOPS that module; the refusal is a SUCCESS"* —
   is **narrowed to its original subject** (a resource KIND minted for a single consumer, §11.5) and is not
   a licence to park a gate. Owner: *"legacy shit doesn't get to stay alive — it's a conversion process; if
   it doesn't have what you need then fucking build it."*
2. **A LANE ASKS; IT DOES NOT REFUSE.** A lane missing a reader, a helper, a fixture shape or a ruling
   SendMessages the orchestrator, states its DEFAULT, and **keeps working**. Refuse-and-stop is for exactly
   two cases: work outside its fence, or a design decision the orchestrator has not made. Brief this
   explicitly every time — it was briefed wrong for most of 2026-09-11 and cost at least one lane.
3. **A RECORDED REFUSAL IS A SNAPSHOT, NOT A STANDING VERDICT.** Nothing re-opens one when its blocker
   lands. `runner-config-path-liveness` refused citing a missing `authored-path` door; the kind was
   **specified by that refusal**, shipped — and the gate STILL sat legacy afterwards because nothing re-opens
   a refusal when its blocker lands. It has since converted and is FINAL (#2013 closed); the lesson is
   sharper for having been paid twice, and this paragraph itself went stale claiming otherwise until
   2026-09-12. Same shape as the deferred roster's 8 entries still reading "not yet ported" after landing
   (#2008). **Re-derive before inheriting.**

## 1. The read list, in order, with what it costs

| # | Read | Size | Stop rule |
| -: | - | -: | - |
| 1 | `gate-runtime-standardization.md` — the LAW | **180 KB** | in full, always |
| 2 | `gate-runtime-orchestrator-playbook.md` — what YOU do | **116 KB** | in full, always. §2b is where you decide what is next |
| 3 | `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` | **172 KB** | **in full — this is the work queue.** **142 defect rows** across 16 tables, each with its state on today's tree (re-derived 2026-09-12 by the ledger's OWN stated counting method, which it tells you to re-run rather than trust). It read `25 KB · 91 defects` until then — **a 7x understatement of the single largest thing this table prices** |
| 4 | the four LIVE-LAW review docs: `resource-gate-access-patterns` · `uncovered-gate-conversion-census` · `exception-authority-census` · `ordinary-waiver-source-migration` | **164 KB** | **in full. ALWAYS. There is no conditional here and a session that invented one paid for it** (2026-09-12: skipped three of the four, then briefed a lane on readers the first doc explicitly calls *not the new fact boundary*). The ONLY skippable span in the whole tier is `ordinary-waiver-source-migration`'s **791 bare `path:line` bullets** — and **NOT the \~60 lines after them**, which are the METHOD receipts: the exact marker-form opener fence, the instrument-control rule, the closed-universe control, and the importer counts that name the Phase F deletion set. An earlier version of this row said "skip the 1,600-line appendix" and was WRONG in exactly that way |
| 5 | `shared-semantic-readers.md` + `checkpoint-2026-09-05.md` | **80 KB** | in full. The checkpoint's **§"Resume order"** is a live work list that has been skipped for days — item 2 is still open |
| 5b | **`tooling/src/verify/contract/*.ts` HEADERS — the law you will otherwise rediscover** | **112 KB of comment** in 66 files | **READ THE HEADERS, not the types.** Ten run 20-32 lines before the first export. Start with `resource-declaration` · `resource-json` · `resource-mirror` · `resource-path` · `resource-document` · `resource-installed` · `run-manifest`, plus `lib/resource-declaration.ts`'s `readyResourceValue` header |
| 6 | `Core-Enforcement-Active-Gates.md` | **356 KB** | **ONCE per program, then by ROW.** **297 dense rows** (its own declared registered-gate count line, 2026-09-12); after one pass read only the row you are about to break |
| 7 | the 16 family conversion records (`*-family-1584.md`, `bus-pair`, `mixed-runtime-front-door`, `policy-soundness-family`, both `simple-visitors`) | **324 KB** | **read the ONE whose family you are dispatching.** `schema-fact-family-1584.md`'s "Explicit blockers" names five Phase-D modules' exact missing reader |
| — | **`v-audit-wave*`, `v-exemplar-audit`, `v-gate-batch`** | **536 KB** | **DO NOT READ. Send a lane.** Their conclusions are in the ledger (#3) and their METHOD is in guide §4.1 |

**EVERY SIZE IN THIS TABLE WAS STALE ON 2026-09-12 AND ALL EIGHT ARE NOW MEASURED** (`du -k`, same day as
the counts below). They had drifted low across the board — the LAW 139→180, the runbook 78→116, the roster
281→356, the audit set 430→536 — and **the work queue by nearly 7x, 25 KB→172 KB.** That matters more here
than anywhere else in the program: this is a BUDGET table, its whole purpose is telling a cold session what
the reading costs before it commits, and a session budgeting 25 KB for the queue was reading 172. **Re-measure
these rather than trusting them; the file that exists to prevent a context blowout understated its own set.**

**WHY 5b IS RANKED ABOVE THE 356 KB ROSTER, and it is the correction that cost the most this session.**
Constitution `AGENTS.md`: ***"Per-domain law is the CODE + its file headers — the per-domain docs were
gutted (the code is the doc)."*** A session that plans its reading out of `docs/` is reading the wrong half
of this repo. Measured 2026-09-12: **over HALF of `contract/`'s bytes are comment**, and three things this
session "discovered" the hard way were already written there or in the checkpoint —

- that a resource policy can never observe a non-ready resource (so a `-health` sibling is impossible):
  **`lib/resource-declaration.ts`'s header, directly above `readyResourceValue`**;
- the refusal doctrine AND its reopening bar of two-or-more independent consumers:
  **`contract/resource-declaration.ts`'s header**;
- the barrel-re-export reader gap: `checkpoint-2026-09-05.md:206`, and it is **item 2 of that document's own
  Resume order**, open for six days.

**So: when a question is about a CONTRACT — what a declaration means, what a status guarantees, what a phase
orders — read the contract file's header before any design doc.** The design docs state the program; the
headers state the mechanism, and the mechanism is what a lane needs.

**The evidence that the audit-wave row is a rule and not a preference:** both audit waves read in full on 2026-09-12 led
with a defect **already closed on `main`** — wave 3's #1966 fail-open (closed by `policy-pass.ts:729`) and
wave 2's D1 `ctx.relativePath` escape (closed by `lib/declaration-home.ts`, with each repaired module citing
that audit in its own `mustPass` `why`). An audit wave is an UPPER BOUND with a timestamp.

## 1b. THE THREE GATE DOCS IN FULL. THE REST IS ON DEMAND. (owner, 2026-09-12)

**THE SET IS THREE, AND THIS FILE IS ONE OF THEM** (owner, amended 2026-09-13): *"it should be three docs
— it should be gate runbook, the gate plan doc, and then the gate read this first."* So the whole-read set
is **THIS FILE → [`gate-runtime-standardization.md`](gate-runtime-standardization.md) (the plan/law) →
[`gate-runtime-orchestrator-playbook.md`](gate-runtime-orchestrator-playbook.md) (the runbook)** — rows 1
and 2 of the table above plus this file, which carries the standing rulings that override both. The earlier
"two docs" phrasing counted only the pair this file points AT, which read as licence to skip the pointer
itself; it is preserved below as the dated original because it is the ruling that set the boundary.

**"I literally just meant the two docs, not everything they connect to."** Tiers 1 and 2 are read WHOLE,
every time, no skipping inside them. **Tiers 4-7 are looked up when you need them** — by section, for the
question in front of you — and reading them front-to-back is the 1.3 MB mistake this file was written to
stop. A session did it in both directions on the same day: skipped tier 4 entirely, was corrected, then
read 450 KB of tiers 4-7 end-to-end and took the window to 70%.

**So the working rule is: know WHAT each tier-4/5 doc owns, and open the one that owns your question.**
The guide's own §"The review layer is not all one thing" table is that index — it names which document
answers which question. Use it as a lookup, not a reading list.

Below is what the lookup would have answered on 2026-09-12, kept because each one was a live error:

- **`shared-semantic-readers.md:33`** — *"The legacy `ast-read.ts` and `symbol-reference.ts` APIs still have
  capped/undefined-returning readers … **They are not the new fact boundary.**"* A six-module conversion
  brief was one call from dispatch describing exactly those as *"readers that already exist."* `ast-read` has
  26 gate importers. The brief would have told a lane to PRESERVE the thing the program exists to delete.
- **`exception-authority-census.md:93`** — `firehose-import-allowlist` carries three `ALLOWED` regex zones
  needing reviewed-grant migration. The pre-dispatch table scan missed it because it searched `ALLOWLIST`
  and the constant is named `ALLOWED`. **A spelling-shaped blind spot in the orchestrator's own
  measurement.**
- **`exception-authority-census.md:163`** — `runner-config-path-liveness.EXEMPT` is a named empty
  `ExemptionTable`. The conversion merged an hour earlier carried it into a FINAL module. **The "tenth such
  module" figure was a bare grep and is wrong: it is EIGHT** — `ownerid-registry` and
  `persisted-store-registry` declare none (corrected 2026-09-12).

**The general shape:** tiers 1-3 tell you what the program IS; tier 4 tells you what each gate CARRIES.
So before you BRIEF a conversion, open the tier-4 rows for the modules in that brief — the census row, the
exemption census row, the family record if one names them. That is minutes, and it is where all three
errors above were sitting. Reading those documents END TO END is not the same act and is not owed.

## 2. What NOT to re-derive, because it is already measured

- **The corpus is 297 modules** (**237 final / 60 legacy**, re-derived 2026-09-12 from
  `pnpm check:policy-conformance`, which is the roster) and the roster is a **PAIR**: the active half plus 28
  deferred + 2 prebuilt + 3 dropped. The deferred half is one-sided (#2008). **This bullet read
  275 / 171 / 104 until 2026-09-12** — a stale count inside the section titled *what NOT to re-derive*, which
  is the reason every count here now carries its date and its command.
- **The remaining legacy count understates its work.** A conversion can SPLIT — one authority, one severity,
  one execution per policy. **§12.6's 13 mixed-hook modules are now CONVERTED**, so the largest known
  multiplier is already spent and the old "\~123 policies from 104 modules" pricing no longer applies.
  Re-derive the multiplier for what is left rather than quoting one: of the 60 remaining, only two are `O`
  and 58 are `X` (a gate-local table, sanction, deferred row, stale arm or custom marker needing a central
  home first), so the spine is authority migration and not conversion throughput.
- **The §5b audit is at 112 of 167 and the sweep is CLOSED.** The bar is **one CONFIRMED exemplar per
  evidence plane, named in guide §3** — not a module count. §3 carries the verdict column, and **every plane
  now has a confirmed exemplar**: the closed RESOURCE cell was filled at `be4cdebcd`, so the bar is MET.
  Point a resource conversion at `resource-policy-contract.md`, not at a module.
- **`pnpm check:policy-conformance` is the roster**, never a grep. A bare `defineGate` grep overcounts by
  two.

## 3. The traps that have each been paid for at least once

- **A proof row can be green for the WRONG REASON.** Conformance runs on a virtual project with no
  `node_modules`, so a fixture naming a package specifier resolves to nothing and lands as a clean
  `external-door`. On the real tree the same specifier resolves into the installed package's `.d.ts`, whose
  shape the reader may REFUSE. Guide §4.8b; it nearly shipped a "fix" that took a live policy from 21
  real-tree findings to 0.
- **A gate roster is NOT the enforcement surface.** Constitution §2.2 makes enforcement a LADDER; a
  control-flow-dependent property is routinely held by a behavioural suite BY DESIGN. Ask which TIER holds
  it before filing a gap.
- **Grep LOCATES; reading DECIDES.** Measured on this corpus: a `fix`-spelling census by grep would call 45
  of 48 non-compliant modules compliant; a §5b.5 census undercounted by 269%.
- **Never wrap a run in your own `timeout`** — exit 124 is the exit-2 class, not a verdict.
- **Claim at dispatch.** A row dispatched without `claim` sits Ready-with-no-Lane while an agent builds it,
  and `review` then refuses.

## 4. Standing posture

Engines DOWN, prod DOWN. **Never push `origin` without fresh owner authorization for that exact push —
nothing has been pushed.** Cap 5 lanes while #1584 is the work. Every commit and merge:
`git -c core.hooksPath=/dev/null …` with the scoped floor NAMED in the message (standing owner exception —
the whole-tree hooks are RED by construction while the loader is mixed). Never `git stash` / `git checkout <path>` / `git restore`. Conversions are #1584 COMMENTS, not rows. Only the orchestrator mutates Project 1.
`gate-ignore-grammar.repo.int` and `gate-conformance.repo.int` are ORCHESTRATOR-ONLY and are OWED at the
next quiet barrier.
