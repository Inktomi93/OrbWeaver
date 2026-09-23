---
kind: law
status: active
updated: 2026-07-03
---

# Orbweaver — Mission

Orbweaver is a ground-up, maximal-rigor remake of an earlier codebase of ours, built to **get it right the first time**.

## The defining fact

**The authors and the readers of this codebase are amnesiac AI agents, not humans.** Each starts cold — no
memory of prior sessions, no relationship to the code, a standing pull toward the path of least resistance.
Every structural choice here exists because of that fact, not in spite of it.

## The mission, twofold

1. **Build it correct and complete the first time.** One home per concept, FK-enforced boundaries,
   born-compliant schema, full test + gate coverage. The bar is correctness + cleanliness, never
   speed-to-ship. The global "simplest thing that works / YAGNI" defaults are deliberately **suspended** for
   the architecture. (Rationale + the standing "you do not have the standing to take a shortcut" rule:
   [`law/Constitution.md`](law/Constitution.md).)

2. **Make the apparatus the memory and judgment the author lacks.** The ledger kills Groundhog Day
   (a cold agent can't re-litigate a settled call). The gates make the wrong thing fail to compile, not
   merely be discouraged. The docs carry the cross-cutting WHY no single file shows. The rules are not
   ceremony — they are the substitute for the senior judgment a rotating cast of cold agents cannot supply
   for free.

## Machine-first, everywhere

Docs and comments are written for an agent, not a person — optimized for token budget, retrieval, and
drift-resistance. Code + types are the source of truth; prose carries only the irreducible cross-cutting
WHY; a wrong doc is worse than none; built code has no prose doc — the code **is** the doc. The rules:
[`writing.md`](../.claude/rules/writing.md) for docs and [`comments.md`](../.claude/rules/comments.md) for code comments.

## The north star

An agent who reads the law, the ledger, and the code — and nothing else — can build the right thing without
a human in the loop.
