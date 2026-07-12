---
kind: history
status: as-built
updated: 2026-07-11
---

> **AS-BUILT (2026-07-11).** This program is fully realized: rulings P1–P6 landed in D62 core law
> (`core/Core-Path-Registry-D62.md`); every gate is BUILT — `no-raw-interactive-intrinsics` ·
> `empty-state-has-action` · `no-arbitrary-tw-values` · `placeholder-copy-registry` ·
> `modal-body-not-placeholder` (all registered in `report.ts`, green on the real tree via their
> ratchets); the ARIA/screenshot goldens (§3.3/§3.4) and the CT state-coverage sweep (§3.5) were
> DROPPED by owner ruling (no-CI enforcement model). Kept for reference only — do not build from
> this file as a live spec; the law is in core.

# Design Enforcement — locking the visual/UX bar in so it cannot drift

**Status: COMMITTED program — ledger D62** (2026-07-05; `core/Core-Path-Registry-D62.md` is the
decision record). The gate SET is indexed in law at `core/UI-Gates-and-Lessons.md` §8 (the D62
PLANNED block); THIS doc holds the implementation detail, tiering, and process. Companions:
[`ui-polish-punchlist.md`](ui-polish-punchlist.md) (the fixes) ·
[`ux-flow-revamp.md`](ux-flow-revamp.md) (the flows/parity). This doc answers ONE question:
**after the revamp lands, what makes an agent six months from now unable to ship ugly?**

> **Triage 2026-07-09 (dispatch board — `README.md` §0):** LIVE LAW COMPANION (D62). The gate program is largely LANDED (the 2026-07-09 gate quartet brought the battery to 50 gates / 8 stages — `core/Core-Enforcement-Active-Gates.md` is the live registry). The presets-placement rows stay PENDING the owner decision.

> **Status 2026-07-11: EVERY item in this doc is now either BUILT or DROPPED** — §3.2's
> `no-raw-interactive-intrinsics` + `empty-state-has-action` gates landed (registered in
> `report.ts`, both green on the real tree via a BURN\_DOWN/ALLOWLIST ratchet); §3's
> `no-arbitrary-tw-values` also landed (both-ways ALLOWLIST ratchet); §3.3/§3.4 (ARIA +
> screenshot goldens) and §3.5 (CT state-coverage sweep) were DROPPED by owner ruling (no-CI
> enforcement model — orbweaver has no CI, so a CI-only golden gate is dead weight; `pnpm check` +
> the CT suite + `side-eye` cover the ground instead). No outstanding items remain — this doc is
> archive-able.

## 0. The philosophy — why this repo can actually enforce design

Most codebases can't enforce design because they rely on human review taste. This repo has two
levers most don't:

1. **Docs-are-law culture.** Agents here demonstrably obey written law over instinct (the
   constitution's core bet). So *written design law with the same teeth as architecture law* does
   real work — IF it's specific enough to be checkable by a cold reader. Vague ("make it
   polished") is unenforceable; concrete ("one `intent="primary"` per region at rest") is.
2. **A six-layer gate machine that already exists** (`docs/architecture/core/UI-Gates-and-Lessons.md`
   §8; live registry `Core-Enforcement-Active-Gates.md`): dep-cruiser physics · ESLint · Biome grit
   (`tools/grit/`) · ts-morph structural gates (`scripts/check/gates/*.ts`, run by `check:structure`
   in `pnpm check`, which lefthook runs at EVERY commit) · tests (freshness/CT) · e2e. Design gates
   are new *rows* in an existing machine, not new machinery.

And one governing precedent from the neo autopsy (§11.0): **no exemption zones** — every gate below
applies to `@orb/ui` and features alike, and **born-compliant sequencing** (§11.7) — a gate ships
*with or before* the work it protects, never after.

Three tiers, weakest to strongest. Push every rule to the strongest tier that doesn't lie:

- **Tier A — physics/mechanical** (resolver, grit, ts-morph, tests): the build fails. Use for
  anything expressible over the AST or a golden file.
- **Tier B — golden baselines** (ARIA snapshots + screenshots): drift is a visible diff a human
  approves or rejects. Use for layout/visual truth that ASTs can't see.
- **Tier C — written law + review checklist**: taste rules a machine can't judge. Keep this tier
  SMALL (ten rules, §3.6) — everything demoted here must be listed, or it doesn't exist.

## 1. The law additions — LANDED (2026-07-05)

The law text this section proposed is now IN core: the region map + interaction physics =
`core/UI-Architecture-and-Layout.md` **§4.2**; the ten UX rules + voice table + accent ration =
**§4.3**; the amended anatomy (7 sections, bottom tabs, landing, panel defaults) = **§4.1**; the
pointer-conditional floor = **§4b axis 3**. Do not maintain copies here. Why law text at all when
gates exist: gates catch *violations*; law shapes *what agents build first try*. Both, always.

## 2. Rulings — DECIDED 2026-07-05

> Nate delegated the remaining calls this date ("you can make decisions on all remaining items —
> consider flow first, Discord as a guide"). **All six are RECORDED in ledger D62**
> (`core/Core-Path-Registry-D62.md`) and their law-text amendments LANDED 2026-07-05 (§4.1 rail +
> mobile; §4b axis 3; §4.2/§4.3 new). Still pending at implementation time: the two `tokens.json`
> `$description` strings (P1 — rides lane L0) and the AA re-check (P2). Nate can veto any row by
> striking it here before its lane runs; a veto also reverts the cited law text.

| # | Ruling | DECISION + rationale |
| - | - | - |
| P1 | Touch floor vs desktop density | **Pointer-conditional floor.** ≥44px control heights remain law at `pointer: coarse`; fine pointers get the desktop scale — `control-sm` 28px · `control-md` 34px · `control-lg` 40px · icon 34px (the mockup's grammar; Discord desktop runs \~32px). Mechanism: the token layer emits coarse-first values and overrides under `@media (pointer: fine)` — exactly the §4b axis-3 sanctioned site ("@media (pointer/hover) + token sizing — token/shell layer"); features still never branch. LAW AMENDED (2026-07-05): §4b axis 3 now states the pointer-conditional floor. Remaining at L0: the two `tokens.json` `$description` strings + the `touch-target-floor` per-pointer re-scope (CT runs one coarse-emulated pass). |
| P2 | Hearth palette | **Adopt the corrected table** (punchlist UIP-101) verbatim into `tokens.json`; keep the AA re-check step. |
| P3 | Mobile navigation | **BOTTOM tab bar** — overturns §4.1's earlier top-bar note under the delegation. Flow: thumb-reach beats reach-to-top; Discord mobile, the Pocket mockup, and every modern chat app agree. Tabs: **Chats · Characters · Corpus · You** (You = settings/account sheet; remaining sections reachable via ⌘K + the You sheet). LAW AMENDED (2026-07-05): §4.1's `MOBILE:` line now states the bottom bar. Spec: revamp J12. |
| P4 | Landing state shape | **`{kind:"landing"}` third discriminant** on the active-chat store (NT-proven `landing \| chat` center-pane model). |
| P5 | Button intent grammar | **Retune `secondary` to bordered** (1px `--color-border`, transparent-ish bg, hover fills `--accent`); NO new `outline` intent — fewer intents, Discord's own secondary grammar. |
| P6 | Rail composition | **Seven sections approved** (Chats · Characters · World Info · Presets · Corpus · Refinery · Analytics) with `--spacing-section` group dividers (primary / authoring / insight). Discord's rail comfortably holds more; seven stays scannable. Ceiling stands: anything further goes to modals/settings. LAW AMENDED (2026-07-05): §4.1 now enumerates the seven. **PENDING owner re-decision (2026-07-09): presets→settings candidate** — Nate is considering moving Presets/generation/prompt-manager to SETTINGS categories, which would contract this ruling; needs a ledger amendment before any lane builds the Presets/World-Info rail sections. |

Smaller delegated calls recorded in place: first-run persona ask folds into the J1 landing hero
(no interrupting dialog — revamp §3 personas row) · Workloads → Settings→APP→System (revamp §3) ·
micro-caps voice ships as `Text` variants, no `SectionLabel` primitive (revamp §4.3) · theme
picker set = Hearth · Mocha · Light per §12.1 (punchlist UIP-402).

## 3. The mechanical gates (Tier A) and goldens (Tier B)

### 3.1 Activate the PARKED design-relevant belts (already specced, ship with L2/L3)

From UI-Gates §8 PARKED — these were always planned to land before feature agents; the revamp
lanes ARE feature agents, so §11.7's trigger has fired. §11.7's own scope is **ALL §8-PARKED
belts** ("Every §11.3 client primitive, the §11.4 feature-side gates, and all §8-PARKED belts ship
in the client-foundation wave, BEFORE any feature agent runs") — not just the design-relevant
subset. So: audit the full PARKED list in `Core-Enforcement-Active-Gates.md` against what the
Phase-6 chat work already discharged, activate everything still parked, and record any deliberate
deferral as its own ruling — do NOT silently narrow the set. The belts this program *directly
exercises* (build these first if sequencing within the wave): `no-media-queries-in-features` ·
`no-raw-container-widths` · `touch-target-floor`'s CT half (boundingBox assertions — after P1,
assert the *per-pointer* floor) · the typed-`testId` gate (revamp J5 adds testids; freeform strings
must fail) · `check:registry-pairing` (rail/modal registries grow in J2/J4/§3 — the pairing test
must be live before they do).

### 3.2 New grit/ESLint rows (pattern: existing rules in `biome.json` → `tools/grit/`, and the

compose-only rule in `eslint.config.js`)

| Gate | Rule | Catches (real example found in this audit) |
| - | - | - |
| `no-raw-interactive-intrinsics` | **BUILT (2026-07-11)** `scripts/check/gates/no-raw-interactive-intrinsics.ts`. In `packages/client/src/features/**` (app-shell exempt as shell-tier), a raw `<button>`, `<input>`, `<select>`, `<textarea>`, or an `<a href>` JSX element is banned regardless of className — interactive elements come from `@orb/ui`. Both-ways BURN\_DOWN ratchet; live ratchet holds 3 offenders (hidden `<input type="file">` click-triggers — persona-settings-surface.tsx, persona-panel-row\.tsx, character-hero-band.tsx — no headless file-trigger primitive exists yet, only the visible FileDropzone) | the bare `<button>Retry</button>` in `chat-context-panel-surface.tsx` (unstyled, no focus ring, invisible to the button-variant system) |
| `no-arbitrary-tw-values` | **BUILT (2026-07-11)** `scripts/check/gates/no-arbitrary-tw-values.ts`. Bracket-value utilities (`p-[13px]`, `text-[10.5px]`, `w-[560px]`, `tracking-[.08em]`) on layout/size/spacing/type utilities banned in `packages/client/src` AND `packages/ui/src` — if a value is worth using it's worth a token; variant-SELECTOR brackets (`data-[…]:`, `has-[…]:`, …) and token-driven bodies (`--…`, `var(…)`, `calc(…)`) stay legal. Both-ways ALLOWLIST ratchet; live ratchet holds 2 files — markdown.tsx's `max-h-[60cqh]` (cqh has no token) and layout/variants.ts's `grid-cols-[repeat(auto-fit,…)]` auto-fit/wide grid (no token equivalent) | widens the existing `no-raw-spacing`/`no-raw-typography` grit family to the general bracket escape hatch |
| `empty-state-has-action` | **BUILT (2026-07-11)** `scripts/check/gates/empty-state-has-action.ts`. ts-morph gate: a JSX `<EmptyState>` in `features/**` must pass `action` (or a spread that might) OR appear in the allowlist (`scripts/check/gates/` pattern: allowlist-in-gate-file, like other gates' exemption sets). Both-ways ALLOWLIST ratchet; live ratchet holds 7 files — some genuinely action-less (a search-zero-match, "nothing left to add"), others real debt awaiting a CTA design call (persona-panel-surface.tsx's "No personas yet", chat-list-surface.tsx's "No chats yet", character-library-surface.tsx's "No characters yet", preset-library-welcome.tsx) | rule-1 (no dead ends) mechanical half; today 5 of 6 empty states are dead |
| `placeholder-copy-registry` | pairing test (copy `tests/ui/tokens/index.test.ts` freshness pattern): every `SectionId` has a distinct entry in the placeholder-copy map (revamp J10); duplicate strings fail | today three sections share one string — the "snap agent sees no differences" root cause |
| `modal-body-not-placeholder` | extend `check:registry-pairing`: a MODAL\_SLOTS body that renders `SectionPlaceholder` must carry an explicit `placeholder: true` flag in the registry entry — silent placeholder shipping becomes a visible, greppable, counted state | theme/command/account modals shipped as sparkles for weeks unnoticed |

### 3.3 ARIA-tree goldens — DROPPED (2026-07-11 — no-CI enforcement model)

**Owner ruling (2026-07-11): DROPPED, not deferred.** Orbweaver does not run CI — the enforcement
model is the extensive pre-commit `pnpm check` (structure/lint/type gates) + the CT suite + the
`side-eye` live-verification lens. CI-visual-regression goldens (Playwright ARIA snapshots) only
earn their keep when auto-run on every change; with no CI they're dead weight a human would have
to remember to run and update by hand. This is a deliberate NOT-DOING decision — do not re-flag it
as "to build." (Original proposal, kept for record: `expect(locator).toMatchAriaSnapshot()` over
`tests/e2e/shell-structure.spec.ts` for each canonical state.)

### 3.4 Screenshot goldens — DROPPED (2026-07-11 — no-CI enforcement model)

**Owner ruling (2026-07-11): DROPPED, not deferred.** Same rationale as §3.3 — `pnpm snap --probe --baseline/--diff` (the local SSIM harness) plus `side-eye`'s live visual lens cover this
ground without a CI merge gate that doesn't exist. (Original proposal, kept for record:
`expect(page).toHaveScreenshot()` on canonical states × {desktop, mobile}, CI-only, committed
baselines.)

### 3.5 Primitive state-coverage — DROPPED (2026-07-11 — no-CI enforcement model)

**Owner ruling (2026-07-11): DROPPED, not deferred.** The per-primitive focus-visible/disabled/
loading sweep is covered by the existing CT suite + `side-eye` (which catches state/a11y issues
live, per-lane, without a systematic machine ratchet). Not re-flaggable as "to build." (Original
proposal, kept for record: extend `ui-primitive-structure.ts` to require a CT per interactive
primitive exercising focus-visible ring + disabled opacity + loading/error states.)

**CI browser lane — DROPPED (2026-07-11 — no-CI enforcement model).** `.github/workflows/ci.yml`
has no browser lane and none is planned; §3.3/§3.4 were its only proposed consumers and both are
dropped. Playwright e2e specs that already exist stay as local/manual specs, not a CI gate.

### 3.6 The Tier-C checklist (everything a machine can't judge — keep it exactly this short)

One primary per region · accent ≤10% · chrome quieter than content · empty states teach ·
motion budget only on sanctioned moments (DESIGN.md §7) · micro-caps/mono voice used per the table
· no new region kinds · same action ⇒ same label+icon everywhere · hover-reveal always has
focus-within + coarse-pointer fallbacks · `side-eye` review on every UI-visible change (no CI
golden gate exists — §3.3/§3.4 DROPPED — so live verification is the backstop).
Lives in the §1 law section; every UI lane brief must paste it verbatim at the bottom (the lane
template in `ux-flow-revamp.md` §5 says so).

## 4. Process lock-in

1. **Born-compliant ordering:** gates 3.1/3.2 land in the same lane as (or before) L2/L3. §3.3/§3.4
   (goldens) and §3.5 (CT state-coverage) are DROPPED (2026-07-11 — no-CI enforcement model, see
   their sections) — no golden-update step exists to lock in.
2. **Lane briefs are the unit of enforcement** (memory: dispatch briefs dictate hard decisions).
   The revamp's lane template requires: cited law rows · verify snaps · the Tier-C checklist. A
   brief missing those is malformed — reject it before dispatch.
3. **The mockup corpus is frozen reference** (`reference/design/`) — gates never point at it, law
   text does; if the mockup and law diverge, law wins (already the §4.1 posture).
4. **Drift audit cadence:** the punchlist appendix's snap set is re-runnable; any structural PR
   that touches `shell.css`/`rail-slots.ts`/`modal-slots.tsx` re-runs it (cheap: `--text` mode) —
   wire as a lefthook pre-push conditional later ONLY if CI goldens prove insufficient (don't
   double-gate speculatively).

## 5. What we deliberately do NOT gate

Copy tone beyond the registry strings · exact spacing choices inside a primitive (tokens bound
them) · which chart type a surface picks · icon choice (lucide-only is already gated; which glyph
is taste) · anything requiring a human aesthetic call at review time. Gating these would produce
allowlist churn, not quality — they live in Tier C or nowhere. If one of them drifts repeatedly,
promote it with a NEW row here + a D-ledger note, never an ad-hoc gate.
