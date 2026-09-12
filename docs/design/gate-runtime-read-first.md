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
   **specified by that refusal**, shipped, and the gate is still legacy (#2013). Same shape as the deferred
   roster's 8 entries still reading "not yet ported" after landing (#2008). **Re-derive before inheriting.**

## 1. The read list, in order, with what it costs

| # | Read | Size | Stop rule |
| -: | - | -: | - |
| 1 | `gate-runtime-standardization.md` — the LAW | 139 KB | in full, always |
| 2 | `gate-runtime-orchestrator-playbook.md` — what YOU do | 78 KB | in full, always. §2b is where you decide what is next |
| 3 | `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` | 25 KB | **in full — this is the work queue.** 91 defects, each with its state on today's tree |
| 4 | the four LIVE-LAW review docs: `resource-gate-access-patterns` · `uncovered-gate-conversion-census` · `exception-authority-census` · `ordinary-waiver-source-migration` | 155 KB | in full — **except** the last one's 1,600-line `path:line` appendix, whose own banner says every count in it is to re-derive, never quote |
| 5 | `shared-semantic-readers.md` + `checkpoint-2026-09-05.md` | 78 KB | in full. The checkpoint's **§"Resume order"** is a live work list that has been skipped for days — item 2 is still open |
| 5b | **`tooling/src/verify/contract/*.ts` HEADERS — the law you will otherwise rediscover** | **112 KB of comment** in 66 files | **READ THE HEADERS, not the types.** Ten run 20-32 lines before the first export. Start with `resource-declaration` · `resource-json` · `resource-mirror` · `resource-path` · `resource-document` · `resource-installed` · `run-manifest`, plus `lib/resource-declaration.ts`'s `readyResourceValue` header |
| 6 | `Core-Enforcement-Active-Gates.md` | 281 KB | **ONCE per program, then by ROW.** 275 dense rows; after one pass read only the row you are about to break |
| 7 | the 16 family conversion records (`*-family-1584.md`, `bus-pair`, `mixed-runtime-front-door`, `policy-soundness-family`, both `simple-visitors`) | \~300 KB | **read the ONE whose family you are dispatching.** `schema-fact-family-1584.md`'s "Explicit blockers" names five Phase-D modules' exact missing reader |
| — | **`v-audit-wave*`, `v-exemplar-audit`, `v-gate-batch`** | \~430 KB | **DO NOT READ. Send a lane.** Their conclusions are in the ledger (#3) and their METHOD is in guide §4.1 |

**WHY 5b IS RANKED ABOVE THE 281 KB ROSTER, and it is the correction that cost the most this session.**
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

## 2. What NOT to re-derive, because it is already measured

- **The corpus is 275 modules** (171 final / 104 legacy) and the roster is a **PAIR**: 275 active + 28
  deferred + 2 prebuilt + 3 dropped = 308 rows. The deferred half is one-sided (#2008).
- **The remaining legacy count understates its work.** A conversion can SPLIT — one authority, one severity,
  one execution per policy. §12.6 already rules 13 mixed-hook modules into \~32 policies. Price lanes
  against **\~123 policies from the 104 modules**, not 104.
- **The §5b audit is at 112 of 167 and the sweep is CLOSED.** The bar is **one CONFIRMED exemplar per
  evidence plane, named in guide §3** — not a module count. §3 carries the verdict column; **the closed
  RESOURCE plane is the one empty cell.**
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
