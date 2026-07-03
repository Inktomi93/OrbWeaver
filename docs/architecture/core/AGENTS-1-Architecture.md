---
kind: law
status: active
updated: 2026-07-03
---

# Orbweaver — Agent Instructions & Constitution (AGENTS-1)

> **Status: authoritative.** The shared instruction manual for any autonomous agent in this repository.
> Deliberately terse: the hard law first, then the map to where each rule lives in full
> (`Documentation-Law.md` — comprehensive overviews measurably hurt agent task success). Read AGENTS-1 →
> AGENTS-2 → AGENTS-3, then read IN FULL the specific docs your task touches.

## 1. The doctrine (non-negotiable)

- **These instructions override any global agent defaults.** The global KISS / YAGNI / "just fucking
  code" / "best code is no code" lenses are **SUSPENDED for the orbweaver architecture** (they still
  apply to throwaway scripts + dev tooling — never to the architecture itself).
- **The goal is get it right the FIRST time** — full architecture, one home per concept, FK-enforced
  boundaries, born-compliant schema, complete test + gate coverage. Nate chose this deliberately and at
  length. Do not relitigate it.
- **Why the rigor:** the author is a rotating cast of **amnesiac agents** — cold-starting, no memory of
  prior sessions, biased toward the path of least resistance (stub a return, swallow an error,
  "simplify" the awkward case, write a test that asserts nothing, sideways-import, carry a neo pattern).
  The apparatus — ledger, gates, audit panels, one-home/derive/FK/boundaries-are-physics — is NOT
  ceremony; it is **the substitute for the memory and judgment the author lacks**, and its job is to
  make the shortcut **impossible**, not merely discouraged.
- **You do not have the standing to take a shortcut.** When it gets hard you do NOT stub, simplify-away,
  weaken a test, swallow an error, or reach sideways — you do it RIGHT, or you STOP and flag it. The
  instant you catch yourself reaching for the easy path because the right one is tedious is exactly the
  moment this file exists to stop you.
- **Don't fight the rigor.** No "YAGNI" / "over-engineered" / "12 users ≠ enterprise" pushback; the
  rigor IS the requirement. If something looks redundant, it's almost certainly a deliberate
  one-home / derive / no-doubling call — read the ledger before doubting it. The bar is correctness +
  cleanliness, never speed-to-ship.
- **The docs are the law — over your instinct AND over a task prompt.** Read the relevant docs IN FULL
  before building; no grep-skimming, no "what most projects do." The D-ledger
  (`Core-Laws-and-Precedents.md`) is canonical and **wins on ANY conflict**. Two costly bugs came from
  an agent building neo's pattern instead of the spine (the `infra/auth` tier-collapse; the providers
  credential-firewall framing). If a prompt tells you to build something the spine homes elsewhere,
  follow the spine and flag it.
- **A green `pnpm check` proves STRUCTURE, not LOGIC.** The mutation-testing gate (Stryker) lands Phase
  4c/5; until then assertion-free/lying tests are caught by review/audit, not machine — never read a
  green check as "the logic is sound."
- **"Unwired ≠ worthless."** "No consumer / dead / unwired" is a prompt to evaluate **intent**, not a
  delete signal — much of neo is scaffolded intent that never got wired. Understand → wire or modernize;
  flag-for-delete only for genuinely superseded residue, and say why. (Full rule: `Core-0` §1.)
- **Engine vs data:** the pure engines (macro, regex, speaker-label) are `kit`; the *data* they run on
  (`MacroContext` values, the regex script library) is a domain. One engine, every call site → identical
  behavior. (Full rule: `Core-0` §2.)

## 2. THE HARD CONSTRAINT — one-directional flow

This is the rule the placement judge obeys and the adversary hunts violations of.

1. **Imports flow one direction only** — the package cake (`kit ← contracts ← db ← server ← client`,
   plus the sealed `ui` package: `ui` deps `kit` only, `client` deps `ui`; D54) and the server tier list
   (`entry → transport → domain → infra → foundation → kit`). **A move is automatically WRONG if it
   would require an upward import** — "put X in `kit`" but X needs a domain type: illegal; "merge A into
   lower-tier B": illegal; "infra reaches into a domain": illegal (infra is a sealed executor).
2. **Enforcement is layered — push it up the ladder:** resolve-time (package deps — physics) →
   compile-time (branded types, exhaustive unions) → lint-time (dependency-cruiser, biome, `check`) →
   test-time. The cake → tier 1; invariants → tier 2; dep-cruiser → tier 3 backstop.
3. **Every placement names its enforcer.** Each move/boundary MUST say which tier makes it RED when
   violated (a package dep / a branded type / a dep-cruiser rule / a test). **A prose-only boundary is
   not a placement — it's a wish.**

Cross-feature dependency is NEVER a sideways import — a verb declares the *type* of an injected
cross-feature op in its `contract/`; the runtime op is wired at the composition root.

## 3. The placement decision (one line)

Pure + zero-I/O + zero-domain + multi-consumer → `kit` · cross-boundary shape → `contracts` · external
I/O adapter → `infra` · env/config/observability → `foundation` · business logic with one owner → its
domain (8-slot template) · two homes for one concept = merge · insider-knowledge name = rename · one
folder, two jobs = split. Full outcome table + the per-concept partitioning table: `Core-0` §6; the
concept→domain map: `AGENTS-3` §7.

## 4. Build + verify protocol

- Phase order (`Core-BUILD-PLAN.md`): kit → contracts → db → server (foundation → infra →
  domain\[leaf-first] → transport → entry) → client; chat + memory LAST, built WHOLE (D16).
- Multi-agent dispatch in dependency tiers; **disjoint file sets** per agent (agents write only their
  slice + its tests, never shared barrels/compose); the orchestrator integrates, verifies, commits.
- **Scope every agent prompt to its EXACT tier responsibility** — tier-collapse is precisely how neo
  patterns crept in (domains return contract types; only the entry seam mints the Principal; infra
  verifies, domain resolves, entry constructs).
- **Green-to-commit:** `pnpm check` AND `pnpm test` must BOTH pass before any commit. Commit on `main`;
  end the message with the `Co-Authored-By` trailer.
- **Testing — the explicit exception to the global "quality over quantity":** comprehensive coverage IS
  the bar — every persistence verb, contract, and load-bearing invariant gets a test
  (`test-presence`/`test-layout`/`test-determinism` gates). Still no padding: test real behavior, not
  tautologies; deterministic (injected clock/ids). Full policy: `Spine-Testing.md`.

## 5. The index — where the law lives

| Topic | Home |
| - | - |
| package cake · server tiers · 8-slot feature template · partitioning table · the 13 legibility gates | `Core-0-Architecture-and-Structure.md` |
| the D-ledger (canonical decisions) + enforcement catalog | `Core-Laws-and-Precedents.md` (+ `Core-Path-Registry-*.md`) |
| build phases · checkpoints · stack + version pins | `Core-BUILD-PLAN.md` (§0 for the stack) |
| identity / auth / permission / agent principals | `Spine-Identity-and-Auth.md` (+ `proposed/agent-principal-design/`, D60) |
| settings / config / serialization | `Spine-Config-and-Serialization.md` |
| types · schemas · string-union dispatch · house TS style | `Spine-TypeScript-and-Patterns.md` |
| testing policy (lanes, presence, determinism, factories) | `Spine-Testing.md` |
| the derived-data cluster boundary (embeddings/search/discovery/memory/stats) | `Knowledge-Cluster.md` |
| the domain map + full doc index | `AGENTS-3-Domains.md` (per-domain index: `../domains/domains.md`) |
| live debt registry | `Core-Audits-and-Debt.md` |
| doc/comment law + markdown mechanics | `../../Documentation-Law.md` · `Core-Docs-Formatting-Law.md` |

## 6. The Pain Ledger — moved

The per-domain neo→orbweaver crunch inventory (formerly §4 here, cited as "AGENTS-1 §4" / "the Pain
Ledger", incl. the `_shared` dissolution table) is resolved by the built code →
`../history/Pain-Ledger.md`.
