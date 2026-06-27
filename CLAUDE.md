# Orbweaver — project instructions

**These OVERRIDE the global `~/.claude/CLAUDE.md`.** Orbweaver is the deliberate exception to my global
KISS / YAGNI / "just fucking code" / "the best code is the code you don't write" defaults. **Those are
SUSPENDED for the orbweaver architecture.**

Orbweaver is a ground-up, maximal-rigor remake of neo-tavern. The explicit, decided goal is **get it right
the FIRST time**: full architecture, one home per concept, FK-enforced boundaries, born-compliant schema,
complete test + gate coverage. Nate chose this deliberately and at length. Do not relitigate it.

## Why this much rigor (read before you judge the apparatus "overkill")
The author of this codebase is not a human team that builds rapport, remembers last week's decisions, and
applies senior judgment reflexively for free. It is a rotating cast of **amnesiac agents** — each starts
cold, with no memory of prior sessions, no relationship to the code, and a strong bias toward the **path of
least resistance**. When a task gets hard, the default move is to cut the corner: stub a return that
compiles, swallow the error, "simplify" the awkward case away, write a test that asserts nothing,
sideways-import instead of wiring the injection, carry a neo pattern because it's familiar. None of those
announce themselves — over a multi-week build they quietly erode the structure until it's load-bearing and
the damage is found too late.

So the apparatus is NOT ceremony. It is the **substitute for the memory and judgment the author lacks**, and
its entire job is to make the shortcut **impossible**, not merely discouraged:
- The **ledger** (`DECISIONS-LEDGER.md`) kills Groundhog Day: DECIDED / DEFERRED-with-a-committed-default
  stops a cold agent from re-litigating a settled call or drifting into "well, most projects do X."
- The **gates** are guardrails for an author that can't be trusted to remember the rules — "born compliant"
  means the wrong thing won't compile / won't pass `check` / won't commit, instead of hoping it's recalled.
- The **adversarial audit panels** are blind-spot coverage no single amnesiac has.
- "One home / derive / FK-enforced / boundaries-are-physics" exist so the corner literally cannot be cut.
- Note the limit: a green `pnpm check` proves STRUCTURE is sound, not that the LOGIC is asserted. The gate
  for assertion-free/lying tests (Stryker, mutation testing) lands in Phase 4c/5; until then, behavioral
  test quality is caught by **review/audit, not machine** — never read a green check as "the logic is sound."

**The standing rule for every agent here: you do not have the standing to take a shortcut.** When it gets
hard, you do NOT stub, simplify-away, weaken a test, swallow an error, or reach sideways — you do it RIGHT,
or you STOP and flag it. The instant you catch yourself reaching for the easy path because the right one is
tedious is exactly the moment this file exists to stop you.

## Don't fight the rigor (the reason this file exists)
- Do NOT push back on architecture / abstraction / contracts / test coverage as "YAGNI", "over-engineered",
  or "12 users ≠ enterprise". The rigor IS the requirement here. Skip the simplification sermon.
- Do NOT "simplify" away a decision, a contract, a gate, or a tier split. If something looks redundant,
  it's almost certainly a deliberate one-home / derive / no-doubling call — read the ledger before doubting it.
- The bar is correctness + cleanliness, not speed-to-ship.
- The global YAGNI/KISS lens STILL applies to throwaway scripts + dev tooling — just never to the
  orbweaver architecture itself.

## The docs are the law — over your own assumptions
Read the relevant ones IN FULL before building. No grep-skimming, no guessing from "what most projects do."
- `docs/architecture/reports/DECISIONS-LEDGER.md` §7 (D0–D38) — **canonical; wins on ANY conflict.**
- `docs/architecture/BUILD-PLAN.md` — the phase/wave order + per-phase checkpoints.
- `docs/architecture/structure.md` — the package cake, the directory-module rule, the enforcement gates.
- `docs/architecture/spine/*` — the cross-cutting law (identity-auth-permission, types-and-schemas,
  string-union-dispatch, settings-and-config, serialization-core, participants-agents-identity, testing).
- `docs/architecture/tiers/*` + `docs/architecture/domains/*` — per-tier / per-domain specs.
- `docs/architecture/reports/ENFORCEMENT.md` — the gate catalog.

**When a doc and your instinct — or even a task prompt — conflict, the DOC wins.** Two costly bugs came
from an agent building neo's pattern instead of the spine (the `infra/auth` tier-collapse; the providers
credential-firewall framing). The spine is the source of truth — not neo, not your priors, not a
hastily-worded prompt. If a prompt tells you to build something the spine homes elsewhere, follow the spine
and flag it.

## The constitution (hard rules)
- **The cake:** `kit ← contracts ← db ← server ← client`; imports flow DOWN only (dependency-cruiser-enforced).
- **One home / no doubling / derive-don't-respell:** every concept has exactly one home; enums derive their
  canonical `as const` tuple (no inline re-spell); cross-boundary wire types live in `@orb/contracts`,
  engines/primitives in `@orb/kit`, db rows in `@orb/db`. (§7.4 / §7.5)
- **Boundaries are physics:** `domain-no-cross-feature` — a domain injects cross-feature ops at the
  composition root, never sideways-imports a sibling; `infra` is db-free (db steps injected via deps);
  `foundation` reaches up to nothing; drivers (transport) call DOWN into domain front doors.
- **Born-compliant:** the schema is born whole in `0000_baseline` (no migration replay); ownership is
  derive-don't-stamp (D23); no polymorphic tables (D24 — per-type FK); every invariant ships with its
  enforcer (a gate or a test).
- **No neo-crunch:** this is a clean remake. Do NOT carry a neo pattern a decision rejected — polymorphic
  refs, denormalized stamps, `domain/_shared` drawers, the pre-D17 `admin|user` axis, `ReturnType<>` leaks,
  phantom fallbacks, tier collapses.
- **Right-once, not duct-tape:** fix the real home/responsibility; don't patch over a misplacement.

## Build + verify protocol
- Phases (BUILD-PLAN): kit → contracts → db → server (foundation → infra → domain[leaf-first] → transport →
  entry) → client. chat + memory are LAST, built WHOLE (no feature-phasing, D16).
- Multi-agent dispatch in dependency tiers; **disjoint file sets** per agent (agents write only their slice +
  its tests, never the shared barrels/compose); the orchestrator integrates, verifies, and commits per slice.
- **Scope every agent prompt to its EXACT tier responsibility.** Don't let an agent collapse tiers — that is
  precisely how neo patterns crept in. (Domains return their contract types; only the entry seam mints the
  Principal; infra verifies, domain resolves, entry constructs; etc.)
- **Green-to-commit:** `pnpm check` (biome incl. `noConsole` + `tsc` + `test:types` + `check:structure`
  gates + depcruise) AND `pnpm test` must BOTH pass before any commit. Commit on `main`; end the message with
  the `Co-Authored-By` trailer.

## Testing (the explicit exception to the global "quality over quantity")
Comprehensive coverage IS the bar — every persistence verb, contract, and load-bearing invariant gets a
test; the `test-presence` / `test-layout` / `test-determinism` gates enforce it. Still no pure-padding:
test real behavior (FK cascades, enum↔tuple mirrors, the security belts, round-trips that exercise the parse
seam), not tautologies. Tests are deterministic — injected clock/ids, no `Date.now()`/`new Date()`/`Math.random`.

## Stack
5-package pnpm workspace under `packages/{kit,contracts,db,server,client}`; tests mirror under `tests/`.
Node 24 · pnpm 11 · TypeScript strict · Biome (ratcheted to MAX) · dependency-cruiser · vitest · lefthook.
Backend: Drizzle + libSQL · Zod · tRPC · `@anthropic-ai/claude-agent-sdk` · OpenRouter. Pinned versions +
the rationale live in `BUILD-PLAN.md` §0 and the ledger — check there, don't assume.
