---
kind: review
status: active
updated: 2026-09-13
---

# The #2071 split of `gate-runtime-standardization.md` — a measured plan, and a target measured and REFUSED

Lane `p-docs-residue`, 2026-09-13, measured at `0cfba42a2`. **Nothing in this document has been executed.**
\#2071 asks for the split to run "at a quiet barrier (no lane may hold these files)" and there was no quiet
barrier — five lanes live on one account plus several on the other — so the orchestrator ruled: produce the
plan, move nothing. This file is that plan, so the next executor reads one instead of re-deriving one.

Its companion halves: `gate-runtime-orchestrator-playbook.md` (the destination for §8/§9) and
`gate-runtime-read-first.md` (the ordered read list, whose SIZE column is already generated and freshness-
checked by `ledgers:fresh` — that third of #2071 is DONE and needs nothing from this plan).

## 1. THE MEASUREMENT THAT CHANGES THE ROW

`gate-runtime-standardization.md` is **2,148 lines** (225,719 bytes) at `d8153057a`.

\#2071's premise is that the doc has ACCRETED dated worked cases inside law sections. That premise was
tested rather than assumed. **Signature censused:** the four spellings the corpus actually writes a dated
worked case in — `measured 2026-09-1x`, `on 2026-09-1x`, `(2026-09-1x`, `, 2026-09-1x`. **Result: 49
sentences in 2,148 lines**, distributed:

| Section | lines | dated sentences |
| - | - | - |
| §1-§3 (decision · tree state · the contract) | 26-307 | 14 |
| §4 (proof rules) | 308-1026 | 20 |
| §5b (PRISTINE) | 1073-1135 | 3 |
| §6 (done/remains) | 1136-1175 | 1 |
| §7 (order constraints) | 1176-1301 | 3 |
| §8 (per-conversion procedure) | 1302-1423 | 5 |
| §12 (the contract) | 1567-2148 | 3 |

**The doc is not 2,150 lines of archaeology. It is ~2,150 lines of MECHANISM with 49 dated sentences
threaded through it, and most of those 49 are the REASON a rule reads the way it does.** The clearest
case is the §4.1 cluster at `:974`, `:985`, `:996`, `:1005` — four consecutive self-corrections of the
SAME rule, including one headed *"THE FIRST VERSION OF THIS PARAGRAPH SAID … AND THAT WAS FALSE"* and one
headed *"AND THE PLANT MUST MATCH THE PACKAGE'S REAL SHAPE — THIS RULE WAS BROKEN INSIDE ITS OWN FIX"*.
Move those to history and what survives is a rule whose narrowest form looks arbitrary, which is exactly
the condition under which the next lane widens it back.

## 2. THE MOVE SET — four candidates, three verified, one NOT

### 2.1 §2 "Where the tree is (re-derive before dispatching; these are 2026-09-11 receipts)" — lines 49-68, **20 lines**. VERIFIED, MOVE.

A table of dated counts whose own first data cell reads *"re-derive at every session start"*. Board state
by its own admission. → `docs/history/gate-runtime-worked-cases-2026-09.md`, replaced by a one-line pointer
to `pnpm work:item overview` + `pnpm check:policy-conformance`.

**KEEP IN PLACE, do not move with the section: lines 66-67** — *"Open rows live on the board … and open
defects in the refutation ledger; this document no longer lists either"* and *"Conversions themselves get
no rows; they land as comments on #1584."* Those are RULES about where state lives. They sit inside the
board-state section and would be deleted with it.

### 2.2 §6 "What is done and what remains" — lines 1136-1175, **40 lines**. VERIFIED, MOVE — WITH A CARVE-OUT.

The "Done" paragraph (`:1138-1152`) and the bucket table (`:1159-1165`) are a dated snapshot; the prose at
`:1154-1157` says so itself (*"no bucket count in it is current"*). → history.

> **THE CARVE-OUT, AND IT IS THE WHOLE REASON THIS DOCUMENT EXISTS.** Lines **1167-1174** —
> ***"A FILESYSTEM TEST IS NOT A CONVERTIBILITY TEST, and neither is `gate:contract`"*** — are **LAW**, and
> they are sitting inside a section otherwise made of board state. That paragraph is what routes Phase D
> from the census rather than from a grep; it carries the measurement (60 of 108 modules import no
> `node:fs` and that says nothing about convertibility), the reason (the real blockers are SHARED READERS
> and GRANT MIGRATION, which no `fs` probe can see), and the binding rule (*a row remains blocked when the
> required reader or ResourceHost fact does not yet exist*). **Delete §6 as a unit and that rule dies
> silently, with every section title still present.** This is the exact failure mode #2071's own constraint
> names — "a wholesale rewrite can keep every title and strip a protection" — and it is only findable by
> READING the section, never by moving it.

### 2.3 §8 "Per-conversion procedure" (1302-1423, **122 lines**) + §9 "Dispatch mechanics (orchestrator)" (1424-1444, **21 lines**). VERIFIED BY HEADING, RE-HOME.

Procedure, not law — #2071's own clause (2) puts it in the PLAYBOOK. This is a RE-HOME, not a deletion,
and it is the largest honest move in the set. Whoever executes it must diff the OLD section row by row into
the playbook and keep the `## LEDGER ROWS (N rows)` verifier contract, the structure-leg serialization, the
planter-vs-reader exclusion, the never-default teardown, the four-condition gate and the warm-leg mechanics
that #2071 enumerates.

### 2.4 §12.6 "The 13 mixed-hook modules — ALL CONVERTED 2026-09-12 (the ruled mappings, kept as the record)" — lines 1987-2011, **25 lines**. **UNVERIFIED — DO NOT MOVE ON THIS PLAN'S WORD.**

It is self-declared archaeology and it reads like a clean move. **It is listed here as a candidate and NOT
as a decision, because this lane did not read it closely enough to promise the move is lossless.** The
specific thing that must be read first: the section names **two ruled arities that were AMENDED on the
tree's evidence**. An amended arity is a RULE about what the contract accepts, not a record of what
happened. **Before §12.6 moves, someone must read those two amendments in full and confirm each is either
(a) already stated as a rule in §12.1-§12.5, or (b) re-homed there in the same commit.** If neither, the
move strips a protection in precisely the §6 shape above.

## 3. THE ARITHMETIC, AND THE TARGET REFUSED

```
§2    20 lines
§6    40 lines
§12.6 25 lines   (UNVERIFIED)
§8   122 lines   (re-home to the playbook)
§9    21 lines   (re-home to the playbook)
-------------
     228 lines

2,148 − 228 = 1,920 lines
```

**#2071's "target well under 800 lines" was MEASURED AND IS REFUSED.** To reach it, ~1,150 further lines
would have to go, and the only spans that large are:

- **§4 Proof rules — 719 lines** (§4.1 alone is 380), and
- **§12 The contract — 582 lines.**

**#2071's own text says the LAW doc KEEPS both** ("the LAW doc keeps only the contract (§3, §12), the proof
rules (§4) stated as RULES …"). So the 800 figure is not reachable by moving archaeology; it is reachable
only by COMPRESSING PROTECTIONS. The row's phrase *"no superseded sections are kept"* licenses dropping
history — it does not license compressing a protection list, and the two are easy to confuse at 03:00.

**The right acceptance test is not a line count.** It is: *does a cold session that reads ONLY the surviving
file still get every protection?* That test is satisfied at 1,920 lines. The 800 estimate predates anyone
counting the dated sentences.

## 4. RECOMMENDATION

1. Execute §2, §6 (with the `:1167-1174` carve-out lifted OUT first, as its own commit, so it cannot be
   lost in the move), and the §8/§9 re-home — **228 lines** — at a genuine quiet barrier where no lane
   holds `gate-runtime-standardization.md` or `gate-runtime-orchestrator-playbook.md`.
2. Read §12.6's two amended arities before deciding it; treat §2.4 above as a question, not a plan.
3. Report the result as **~1,920 lines**, with the refused target and this measurement stated, rather than
   chasing 800.
4. Produce the rule-by-rule OLD→NEW map #2071 asks for as the receipt, and have a verifier read the map
   against the OLD section list — a stickler-class review is not available.

## 5. WHAT THIS LANE DID NOT COVER

- §4 and §12 were NOT read paragraph by paragraph. Their line counts and their dated-sentence counts are
  measured; their internal movability is not assessed, and this plan proposes no edit inside either.
- §5 (1027-1072), §5b (1073-1135), §7 (1176-1301), §10 (1445-1453) and §11 (1454-1566) were read only at
  the heading level and are proposed for NO change. §5 in particular is half status ("Phase A landed
  `d21ece8d8`") and half mechanism and would repay a closer read before anyone calls the split complete.
- The playbook's own accretion (927 lines) was not censused; #2071's clause (2) also asks that NO row state
  and NO wave tables survive there, and that is unmeasured by this lane.
