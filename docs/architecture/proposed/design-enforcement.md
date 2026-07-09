# Design Enforcement — locking the visual/UX bar in so it cannot drift

**Status: COMMITTED program — ledger D62** (2026-07-05; `core/Core-Path-Registry-D62.md` is the
decision record). The gate SET is indexed in law at `core/UI-Gates-and-Lessons.md` §8 (the D62
PLANNED block); THIS doc holds the implementation detail, tiering, and process. Companions:
[`ui-polish-punchlist.md`](ui-polish-punchlist.md) (the fixes) ·
[`ux-flow-revamp.md`](ux-flow-revamp.md) (the flows/parity). This doc answers ONE question:
**after the revamp lands, what makes an agent six months from now unable to ship ugly?**

> **Triage 2026-07-09 (dispatch board — `README.md` §0):** LIVE LAW COMPANION (D62). The gate program is largely LANDED (the 2026-07-09 gate quartet brought the battery to 50 gates / 8 stages — `core/Core-Enforcement-Active-Gates.md` is the live registry). The presets-placement rows stay PENDING the owner decision.

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
|---|---|---|
| P1 | Touch floor vs desktop density | **Pointer-conditional floor.** ≥44px control heights remain law at `pointer: coarse`; fine pointers get the desktop scale — `control-sm` 28px · `control-md` 34px · `control-lg` 40px · icon 34px (the mockup's grammar; Discord desktop runs ~32px). Mechanism: the token layer emits coarse-first values and overrides under `@media (pointer: fine)` — exactly the §4b axis-3 sanctioned site ("@media (pointer/hover) + token sizing — token/shell layer"); features still never branch. LAW AMENDED (2026-07-05): §4b axis 3 now states the pointer-conditional floor. Remaining at L0: the two `tokens.json` `$description` strings + the `touch-target-floor` per-pointer re-scope (CT runs one coarse-emulated pass). |
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
|---|---|---|
| `no-raw-interactive-intrinsics` | In `packages/client/src/features/**` (app-shell exempt as shell-tier), a raw `<button>`, `<input>`, `<select>`, `<textarea>`, or `<a>` JSX element is banned regardless of className — interactive elements come from `@orb/ui` | the bare `<button>Retry</button>` in `chat-context-panel-surface.tsx` (unstyled, no focus ring, invisible to the button-variant system) |
| `no-arbitrary-tw-values` | Bracket-value utilities (`p-[13px]`, `text-[10.5px]`, `w-[560px]`, `tracking-[.08em]`) banned in features AND ui — if a value is worth using it's worth a token | widens the existing `no-raw-spacing`/`no-raw-typography` grit family to the general bracket escape hatch |
| `empty-state-has-action` | ts-morph gate: a JSX `<EmptyState>` in `features/**` must pass `action` OR appear in the allowlist (`scripts/check/gates/` pattern: allowlist-in-gate-file, like other gates' exemption sets) | rule-1 (no dead ends) mechanical half; today 5 of 6 empty states are dead |
| `placeholder-copy-registry` | pairing test (copy `tests/ui/tokens/index.test.ts` freshness pattern): every `SectionId` has a distinct entry in the placeholder-copy map (revamp J10); duplicate strings fail | today three sections share one string — the "snap agent sees no differences" root cause |
| `modal-body-not-placeholder` | extend `check:registry-pairing`: a MODAL_SLOTS body that renders `SectionPlaceholder` must carry an explicit `placeholder: true` flag in the registry entry — silent placeholder shipping becomes a visible, greppable, counted state | theme/command/account modals shipped as sparkles for weeks unnoticed |

### 3.3 ARIA-tree goldens (Tier B — structure cannot drift silently)

Playwright has first-class ARIA snapshots (`expect(locator).toMatchAriaSnapshot()` — repo is on
Playwright ^1.61, well past the 1.49 introduction). Add `tests/e2e/shell-structure.spec.ts`: for
each canonical state (landing · populated chat · character detail · each modal · mobile landing),
assert the CONTENT/LIST/topbar accessible tree against committed snapshots.

**CI prerequisite (do not skip):** `.github/workflows/ci.yml` currently has NO browser lane — its
own comment says "Browser lanes (Playwright e2e + CT) are deferred to Phase 6 — no specs/stack
yet." A spec now exists (`tests/e2e/start-chat-with-character.spec.ts`) and the webServer boots the
stack (`playwright.config.ts`), so activating the lane is: a CI job that installs browsers
(`pnpm exec playwright install --with-deps chromium`) and runs `pnpm exec playwright test`. That
job is the home for §3.3 + §3.4; without it the goldens gate nothing. Pre-push stays untouched
(e2e is too slow for a hook; `pnpm check` unchanged). Update flow: intentional layout change →
`--update-snapshots` in the same PR → the diff IS the design review artifact.

Why ARIA before pixels: token-cheap, theme-independent, catches the drift class that matters
(structure/order/labels), zero flake from anti-aliasing.

### 3.4 Screenshot goldens (Tier B — the pixel backstop)

Phase-6 build plan already commits to "visual-regression (Playwright screenshots) as a gate."
Concretize: same spec file, `expect(page).toHaveScreenshot()` on the canonical states ×
{desktop 1600×950, mobile 390×844}, with: probe mode ON (`orb:probe-mode` freezes relative time —
`packages/client/src/lib/probe-mode.ts`), animations disabled (Playwright option), devtools FAB
masked or env-gated off (punchlist §8), `maxDiffPixelRatio: 0.01`. Baselines committed under the
spec's `__screenshots__` dir. CI-only. The `pnpm snap --probe --baseline/--diff` SSIM harness stays
the *local* fast loop; Playwright goldens are the *merge* gate (one source of truth for baselines —
the committed Playwright ones).

### 3.5 Primitive state-coverage (Tier A, extends the §13.7 CT contract)

Extend `scripts/check/gates/ui-primitive-structure.ts` (or its companion test): every primitive
whose root renders an interactive element must have a CT exercising **focus-visible ring**
(keyboard focus → assert ring token), **disabled opacity**, and — where the primitive claims them —
loading/error states. This is the mockup's "8 states" doctrine (DESIGN.md §9) reduced to the three
machine-checkable ones; hover/active stay Tier C (visual goldens catch gross regressions).

### 3.6 The Tier-C checklist (everything a machine can't judge — keep it exactly this short)

One primary per region · accent ≤10% · chrome quieter than content · empty states teach ·
motion budget only on sanctioned moments (DESIGN.md §7) · micro-caps/mono voice used per the table
· no new region kinds · same action ⇒ same label+icon everywhere · hover-reveal always has
focus-within + coarse-pointer fallbacks · screenshots in every UI PR (the goldens force this).
Lives in the §1 law section; every UI lane brief must paste it verbatim at the bottom (the lane
template in `ux-flow-revamp.md` §5 says so).

## 4. Process lock-in

1. **Born-compliant ordering:** gates 3.1/3.2 land in the same lane as (or before) L2/L3; goldens
   3.3/3.4 land with L3 (first stable canonical states). A lane that ships visual work without its
   golden update fails CI by construction thereafter.
2. **Lane briefs are the unit of enforcement** (memory: dispatch briefs dictate hard decisions).
   The revamp's lane template requires: cited law rows · verify snaps · golden updates · the Tier-C
   checklist. A brief missing those is malformed — reject it before dispatch.
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
