# Sandbox build-order scratch (2026-07-05c — D62 UI/UX REVAMP DONE through L6; next = L7 parity buildout + §8 micro-polish)

> **SCRATCH, not law.** A session-handoff note for dev-container Claude sessions: the agreed
> build order + operational context as of `f133379` + the UNCOMMITTED D62 doc set (see FIRST
> ACTION). The constitution (`docs/architecture/core/AGENTS.md` — read it IN FULL first), the
> D-ledger, and `Core-BUILD-PLAN.md`/`Core-Audits-and-Debt.md` WIN over anything here. Delete
> this file when it goes stale; update the date line when you land a wave.
>
> **SESSION 2026-07-05 (host session, Fable) — the D62 UI/UX REVAMP PROGRAM was committed and
> FOLDED INTO LAW.** A full visual/UX audit (app snaps vs the design mockup vs neo) produced three
> program docs, adversarially verified (path/law-conflict/completeness critics), all open rulings
> decided under Nate's delegation, and the law amendments LANDED in the core UI docs. Since the
> 07-04c note: the APP-SHELL lane it named "next" has LANDED (4-region shell + panel modes +
> modals + shell topbar + CONTEXT panel tabs [overrides·preview·injections·roster] + cast bar +
> speak-as + wand + inline media + untrusted-default render trust — commits `1e94b90`→`f133379`).
> **NEXT = the D62 lanes, in order, L0 first (no blockers — all rulings pre-decided).**
>
> **UPDATE 2026-07-05c (container session, Opus) — the D62 lanes L0–L6 are ALL LANDED + COMMITTED;
> the whole shell/polish revamp is DONE (the FIRST ACTIONS below are done).** The app opens on a real
> landing, every surface is a designed thing (chat-list · chat room + pill composer · character detail
> · full-bleed settings · theme picker), section placeholders are distinct, and the rail reflows to a
> bottom tab bar on mobile (verified LIVE at 390×844 — You drawer + panel sheets work). Lane→commit:
> **L0** `fa0d2e3` tokens · **L1** `18383f8` primitive deltas + `no-arbitrary-tw-values` gate · **L2**
> `0076f31` shell chrome + `registry-pairing`/`modal-body-not-placeholder` gates · **L3** `1f3a967`
> flow spine (+ server title/star/archive/delete pass-throughs) · **L4** `3cad8a0` chat room · **L5**
> `ab54d38` sections/modals + `placeholder-copy-registry` gate (ALSO pulled the composer effort picker
> — Nate's call: effort's config home is the Presets Reasoning tab, L7; server `UserIntent.effort`→
> `resolveEffort` wiring + the send `intent` seam kept) · **L6** `9de07ab` mobile reflow. Plus
> verification hardening: directory-based tsconfig browser-tsx boundaries (`5189d5e`) + `pnpm test:ct`
> gated at pre-push via `CT_GATE` retries (`0dd888d`). **NEXT = L7 parity buildout (Presets section
> FIRST) + the §8 micro-polish (task #82).** The L0–L7 lane detail below is now a HISTORY record for
> L0–L6; only the L7 row is live.

## FIRST ACTIONS — all DONE (2026-07-05c); NEXT ACTIONS below

1. ~~Commit the D62 doc set~~ — **DONE** (`1528cc6`, docs-only, `check:docs`-green).
2. ~~Fix the dev DB~~ — **DONE** (deleted the stale `orbweaver.db`; next `stack start` recreates it
   fresh with `characters.trust_html`). The boot schema-drift guard is still a live PD candidate.
3. ~~Open L0~~ — **L0–L6 ALL LANDED** (see the UPDATE block above for the lane→commit map).

### NEXT ACTIONS for the next session
- **L7 parity buildout — Presets section FIRST** (the full generation-config editor: Sampling ·
  Output · Quality · **Reasoning** · Templates · Post-process · Compaction · Prompt — and the config
  home for the effort dial pulled from the composer in L5). `domain/preset` server is BUILT; this is
  a client-surface lane. Then World Info · character editor · Connections · Corpus hub · gallery ·
  /imagine (revamp §3 map order). Rides `rail-slots.ts` (a new `presets` section entry) + the
  §4.2 region grid (LIST = preset rows + CRUD; CONTENT = the tabbed editor).
- **§8 micro-polish (task #82):** gate the TanStack devtools FAB (it overlaps the mobile You tab AND
  the desktop composer Send in every snap), `::selection` color, thin scrollbars, focus-ring audit,
  streaming caret/typing dots — plus two mobile follow-ups: character-library selection should close
  the mobile list sheet (route-wire it like chat-list's `setMobileSheet(null)`), and decide
  `{{char}}` raw-vs-resolved in the character detail card description.
- **Standalone follow-ups still valid** (feature/backfill — the D62 lanes were POLISH, so these are
  untouched and stand): **#50** client auth (login + `beforeLoad` gate) · **#67** composer image
  attach + `assetId`→URL resolver (the asset-media producer; the #25 render seam awaits it) · **#68**
  HTML-card producer + per-character `cardTrust` (the other #25 seam) · **#72** admin settings surface
  (NOW has a home = the L5 settings overlay's "Admin"/"System" placeholder panes) · **#78** ChatSummary
  last-message preview + viewer-role (kebab gating) · **#74** destructive-color AA (3.65:1) · **#62 #63
  #64 #66 #69 #71** chat polish/backfills · **#32** chat slot registries · **#42** buddy ownerConsented.
  **#65** appearance fast-follows is PARTLY done (L4 shipped the hover-actions half; remaining =
  per-message metadata row, effects, chatWidth/fontScale shell vars, manual reduced-motion).

## Read order (cold session → productive, in this exact order)

1. `docs/architecture/core/AGENTS.md` — the constitution, IN FULL. Non-negotiable.
2. `docs/architecture/core/UI-Architecture-and-Layout.md` — the UI law. **§4.1/§4.2/§4.3/§4b
   CHANGED 2026-07-05 (D62):** §4.1 = seven-section rail + BOTTOM mobile tabs + landing-in-CONTENT
   + per-section panel defaults; **§4.2 = the region map** (Discord anatomy, per-section grid, six
   interaction-physics rules) and **§4.3 = the ten UX rules + voice table** are NEW LAW — your
   build instincts defer to them; §4b axis 3 = the pointer-conditional touch floor (44px coarse /
   28-34-40 fine).
3. `docs/architecture/core/Core-Path-Registry.md` — the D62 decision record (one long entry;
   everything you're about to build traces to it).
4. `docs/architecture/core/Core-BUILD-PLAN.md` Phase 6 — **the lane sequence L0–L7 you are
   executing.** Every proposed/ initiative is slotted there; do not re-derive sequencing.
5. The three D62 program docs (step-level detail — read the one your lane needs, §0 of each
   first): `docs/architecture/proposed/ui-polish-punchlist.md` (UIP tasks; §0 = snap idioms +
   dev-DB gotcha) · `docs/architecture/proposed/ux-flow-revamp.md` (J1–J12 journeys + the
   NeoTavern parity map + primitive deltas §4) · `docs/architecture/history/design-enforcement.md`
   (gates, goldens, the P1–P6 ruling records).
6. Per-lane law: `UI-Gates-and-Lessons.md` §8 (incl. the NEW D62 PLANNED gate block) ·
   `UI-Primitives-and-Reuse.md` §13.2 map (six new rows) + §13.7/§13.8 (the primitive contract —
   BINDING for every L1 delta) · `UI-Theming-and-Content.md` §12.1 (theme/settings content law).
7. Pre-fold snapshots (reference only, do NOT build from):
   `docs/architecture/history/D62-Prefold-*.md`.

## Marching orders — the D62 lanes (Core-BUILD-PLAN Phase 6 is authoritative; this is the gloss)

**L0 — tokens (START HERE; ~1 lane-day; zero open questions):** `packages/ui/src/tokens/tokens.json`
→ `pnpm --filter @orb/ui tokens:build`. The corrected Hearth palette (UIP-101 has the full old→new
table — chroma ≤0.009 @ hue 60, Ember `oklch(0.72 0.175 52)`) · pointer-conditional control heights
(UIP-102: coarse keeps 44/48/56; `@media (pointer: fine)` override emits 28/34/40 + icon 34 at the
TOKEN layer — features never branch) · `--text-micro`+`--tracking-micro` · the `avatar-sm/md/lg`
display trio · `--color-info` · `--glow` · `--shadow-overlay`. Same commit: the two `$description`
strings in tokens.json, the `touch-target-floor` per-pointer re-scope, AA re-check
(muted-foreground on background ≥4.5:1). Verify: freshness test green + `pnpm snap / --wide` reads
neutral-charcoal + ember, not brown-on-brown.

**L1 — primitive deltas + the gate wave:** revamp §4 is the delta list (new `kbd`; Text micro/caps;
Avatar sizes+deterministic fallback hue; Dialog width variants + `full`; EmptyState
`action`/`decoration`; Skeleton shimmer; Button secondary→bordered + ghost→muted; Tabs underline;
weave-glyph re-home to `client/src/lib/`). Every delta under §13.7 (trio + variants naming + CT)
and §13.8 (read the shipped `.d.ts` first). **The gate wave rides here (§11.7):** ALL remaining
§8-PARKED belts + the D62 design-gate set (design-enforcement §3 is the implementation spec) +
**activate the CI browser lane** (ci.yml has NO Playwright job — its own comment says so; add
install-browsers + `playwright test`; the ARIA/screenshot goldens are dead weight without it).

**L2 — shell chrome:** punchlist §2 (rail polish + grouped sections · kill the triple-title ·
topbar identity header + ⌘K chip · context header · **UIP-205 the document-scroll-leak bug** —
clicking shell controls horizontally scrolls the page; fix at the shell tier, every snap depends
on it) + `SECTION_PANEL_DEFAULTS`.

**L3 — flow spine:** J1 landing (`{kind:"landing"}` discriminant; the app must NEVER open on an
empty room) · J2 new-chat character picker (multi-select founds groups — `startChat` takes
`characterIds[]` and the client `DraftSeed` is ALREADY plural; J2 step 3 has the exact 3-touch
modal registration incl. the pairing-test reachable-set trap) · J4 real ⌘K over `@orb/ui/command`
(surface home: `features/chat/…/command-palette-surface.tsx`, route-composed — NOT app-shell, NOT
modal-slots bodies) · J5 chat-list `ListRow` rows + search + kebab. **J5's first step is server:**
title/star/archive/delete exist on `ChatService` but are NOT in `transport/trpc/routers/chat.ts` —
your own 07-04c "domain is AHEAD of the transport router" pattern, ~10th occurrence; wire thin
pass-throughs + a transport test. ARIA + screenshot goldens land on these states in this lane.

**L4 — chat room:** J3 (identity header via `ShellTopbar`'s unused `header` prop · 65–75ch column ·
UIP-304/305/306: hover-reveal actions with `:focus-within` + coarse-pointer fallbacks · pill
composer) · J6 (⋯ options menu · bulk-select via `selection-bar` + `state/message-selection-store.ts`
— stores go in `state/`, NEVER a feature dir, the state-files gate only scans there) · J7 (cast-bar
`+` add-member) · effort picker · `message-media` wiring · token-counter CONTEXT tab.

**L5 — sections & modals:** distinct Weave placeholders per section (J10; the placeholder-copy
registry) · J9 character detail card · J11 settings full-bleed overlay (USER/APP groups; Appearance
migrates first; generation config is NOT settings — it's the Presets section) · J8 interim theme
picker (Hearth active · Mocha/Light disabled — §12.1's set, never the mockup's Catppuccin/Loom names).

**L6 — mobile:** J12, ruling P3 — **BOTTOM tab bar** (Chats · Characters · Corpus · You), land on
CONTENT, sheet polish, `interactive-widget=resizes-content` + all four safe-area insets.

**L7 — parity growth:** the revamp §3 map is the authority (Presets section → World Info section →
character editor → Connections → Corpus hub → gallery → /imagine → …), each row with its decided
home + NT precedent path. Rulings P1–P6 are DECIDED (design-enforcement §2) — do not re-litigate;
if Nate strikes one, its law text reverts with it.

**Every lane brief must:** cite its §4.1–§4.3 law rows · end with verify snaps · update the golden
baselines in the same commit · paste the §4.3 Tier-C checklist. Acceptance for L0–L5 overall =
BUILD-PLAN Phase 6 checkpoint (app opens on the landing; every section distinct; no sparkle modals).

## Where the tree is (so you don't re-derive it)

- **Phases 0–5 BUILT** (D48 tool-loop chunk still the open Phase-5 seam). **Phase 6:** foundation +
  chat surface + app-shell + the ENTIRE D62 UI/UX revamp (lanes L0–L6, through `9de07ab`) ALL LANDED
  — polished + responsive across every built surface, desktop and mobile. What remains in Phase 6 is
  **L7 parity BUILDOUT** (features into the finished shell, Presets first) + the §8 micro-polish.
  Gate/grit live-state ground truth: `Core-Enforcement-Active-Gates.md` — now includes the D62 gates
  (`registry-pairing`, `modal-body-not-placeholder`, `placeholder-copy-registry`,
  `no-arbitrary-tw-values`, `touch-target-floor` per-pointer). Do not trust stale counts; read the registry.
- **AP3 voicing chain still OPEN** (PD-17) — another session's lane unless Nate says otherwise.
  Automation A1–A3 remains agent-able as a parallel non-UI lane; Wave 2+ (rpg, chat-crew, Phase-7
  grafts) unchanged from the 07-04 order, now sequenced behind/alongside the D62 client lanes per
  BUILD-PLAN. **CW4 (director) stays gated on Nate hand-playtesting — do not start it without him.**
- Remaining `ready` PD rows are lane-absorbed — burn each WITH the lane that touches its surface.

## Operational rules for container sessions (hard-won, do not relearn)

- **You cannot `git push` from the container** (no keys, by design). Commit locally; Nate pushes
  from the host. Corollary: worktree agents base off **origin/main** — if origin is behind local
  commits, have agents `git merge --ff-only <sha>` or brief them with the delta.
- **NEVER `git stash`/`pop`/`restore`/`checkout --`** — multiple sessions share the object store;
  fix mistakes by editing forward. Never touch another session's dirty files.
- **Read FULL `pnpm check`/`pnpm test` output** — never tail; mid-chain errors hide. Don't pipe
  exit codes you branch on (`cmd | tail` eats the code).
- **Sweeps:** `ast-grep` (`sg`) for structure, `/usr/bin/grep -a` for text (the wrapped grep skips
  some .ts as binary).
- **gitignore green-blindness:** after any feature commit, eyeball `git show --stat` against what
  you built (an unanchored ignore glob once ate a whole source dir; biome also skips ignored dirs).
- **Verdicts are pre-made:** judgment PDs carry DECIDED stamps; D62 rulings P1–P6 are DECIDED.
  Don't re-litigate; don't invent new wire-or-strike decisions without Nate. `minisearch` is an
  approved @orb/ui dep. Config never binds to chats — the owning feature carries the association.
- **Committed means full treatment** — cold-read build bar, tests travel with code, no thin slices.
- **Local-light/vLLM suites self-skip in-container** (`VLLM_DISABLED=true`); expected, not failure.
  The firewall blocks everything but npm/GitHub/Anthropic/VS Code.

## Dev/verify tooling that EXISTS (use it, don't reinvent)

- **`pnpm snap <route> [flags]`** — headless agent eyes against `pnpm stack`. TEXT-FIRST
  (`--text`/`--aria`, ~5-8× cheaper than PNG); DEADCSS/EMPTYCSS audit; `--diff` SSIM + `--probe`
  determinism; `--click/--press/--fill/--ls` pre-shot interaction; ffmpeg is in the container.
  Non-zero exit with `failed-req=N` still wrote the PNG — read the RESULT line.
- **`pnpm verify --file <path...>`** (~9s mid-tier verify) · `pnpm check:show` (read last gate JSON)
  · `pnpm record` (streaming gifs) · `trace:render/tail/fire` · `sse-tap`.
- **CT substrate** (`tests/support/ct/`): `routeTrpc` + `CtDataProviders` + `_ct-stories`
  convention + the `query-boundary.ct.tsx` exemplar. Node substrate: composed caller fixtures +
  factories + `freshCountedDb` + custom matchers.
- **Driving the composer in Playwright: `pressSequentially` + Enter, NOT `fill`** (fill skips
  React's onChange; Send stays disabled). The TanStack-devtools FAB overlaps composer Send —
  `--jsclick`/Enter, never a coordinate click (punchlist §8 has the gate-it-off task).
- **The design mockup runs in-container:** esbuild-compile `reference/design/neo-tavern/*.jsx`
  (unpkg CDN is firewall-blocked) → serve → snap. Recipe: `scratch/chat-surface-lane.md`.
- **Real Claude generation works in-container** (agent-sdk provider rides the HOST Claude login,
  no API key; `api.anthropic.com` allowed). Full recipe incl. the RAW batched tRPC body shape +
  the a-chat-needs-a-character rule: `scratch/chat-surface-lane.md` + the 07-04c section of this
  file's git history if needed.

## The orchestrator-crew model (what worked — repeat it, RUN AUTONOMOUSLY)

**You are the MANAGER. Nate delegates — do NOT stop for approval on reversible work.** The "what"
is now doubly unambiguous: neo is the feature bar AND the D62 program docs spell the steps.
Decide, build, verify, commit at major milestones, report. Stop for Nate ONLY on: destructive/
irreversible actions, real scope changes, or a pure-aesthetic call he'd want (rare now — the D62
rulings pre-answered the known ones).

- Dispatch: orchestrator writes scoped briefs (binding-rule not whitelist; dictate hard decisions;
  scope reads); SONNET-5 builders, ONE disjoint file-set each, plan-first checkpoint for
  big/architectural/@orb/ui-seal lanes, build-through for small ones. Anything sharing a file
  (`report.ts`, `eslint.config.js`, `rail-slots.ts`/`modal-slots.tsx` in L3!) sequences.
- **Fanout size discipline (new, 2026-07-05 — paid for):** a 5-agent high-effort fanout on the
  shared account got rate-limit-nuked mid-run (~640k tokens, zero results). Builders are Sonnet
  (fine); keep concurrent agents ≤3, reader/scout agents low-effort, and prefer inline header
  reads for reconnaissance — this repo's file headers are dense enough.
- The two protocols every builder carries: **missing-API** (sweep domain contract/verbs + docs →
  report → orchestrator adjudicates → PD row) and **missing-PRIMITIVE** (sweep the fleet +
  package.json exports + Base UI `.d.ts` + the §13.9 do-not-carve list → then request; a new
  primitive is its own §13.7 chunk).
- **HOLD commits until a co-running wave settles** (whole-tree pre-commit check); commit the wave
  once merged-verify passes.
- Never trust truncated/"exit 0" reads; capture real `Test Files … | Tests …` counts. Run
  `pnpm exec eslint` on new TSX explicitly (CT files skip it otherwise). Every custom gate
  diagnostic carries a full doc-path pointer (`diagnostic-legibility` enforces).

## The `/reference/` corpus (gitignored, read-only)

- `reference/neo-tavern/` — the feature-coverage bar (headers are spec prose; the D62 parity map
  already extracted + homed everything — check the map before re-sweeping).
- `reference/design/` — the visual grammar (D62 sanctioned it as reference in §4.1's amended
  callout; structural modes stay cut; §12.1 owns the real theme system).
- `reference/upstream/` — neo's evidence base (sillytavern, marinara, guided-generations, …).
- READ-ONLY provenance — never edit/import/copy wholesale; port DECISIONS, not code. Search with
  `/usr/bin/grep -a` or `sg --no-ignore` (gitignored).

## Quick commands

- `pnpm check` (full gate battery) · `pnpm test` · `pnpm vitest run <path>` · `pnpm check:structure`
  · `pnpm verify --file <path>` · `pnpm check:show`
- `pnpm stack start|stop|status|logs` · `pnpm snap <route> --text` · `pnpm test:ct <file>`
- Registries: `Core-Audits-and-Debt.md` (live PDs) · `Core-Enforcement-Active-Gates.md` (gates) ·
  `Core-Path-Registry.md` (the program you're executing) · `history/Core-Debt-Cleared-Ledger.md`
