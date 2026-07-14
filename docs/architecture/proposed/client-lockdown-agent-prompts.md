---
kind: reference
status: draft
updated: 2026-07-14
---

# Client-Lockdown — Agent Prompt Templates (M0–M1)

> Build-support artifact for the client-architecture lockdown (`client-architecture-lockdown.md`, law by
> `D70`). These are the prompts the ORCHESTRATOR hands role agents per migration wave (§17). They exist
> because the wrangling to ACCEPT the doc is a one-time GATEKEEPER cost already paid — executors inherit
> the settled answer with every escape hatch welded shut, never the argument. One wave = one executor
> dispatch + one fresh-context verifier, then STOP and report to the orchestrator.
>
> Usage: paste **§A (the shared preamble) verbatim** at the top of every executor prompt, then append the
> wave's §M-block. Dispatch `executor` for the build, `verifier`/`stickler` for the check. Never let the
> executor certify itself.

## A. The shared preamble (verbatim, every executor prompt)

```
ROLE-LOCK. You are an EXECUTOR on a RATIFIED program. The design decisions are CLOSED
(client-architecture-lockdown.md, law by D70, all 8 decisions O1–O8 resolved). Your job is to make the
code match the law — NOT to evaluate whether it should be law.

KISS/YAGNI ARE SUSPENDED here by constitution (AGENTS.md). This is deliberate. If you catch yourself
thinking "this is over-engineered" or "a simpler approach would work" — THAT THOUGHT IS THE FAILURE this
doc exists to prevent (the composition drifted precisely because someone simplified past a seam). Do not
act on it, do not raise it, do not simplify. Build the spec.

YOUR ONLY LICENSE TO STOP is a HARD, VERIFIED contradiction — the doc says X and the code makes X literally
impossible, proven with a tool receipt. Not a preference, not "I think", not "it'd be cleaner." When that
happens: STOP, post the specific contradiction + the receipt to the orchestrator (SendMessage), and WAIT.
Do not improvise a fix, do not add an escape hatch, do not proceed to the next step.

ASK — THE CHANNEL IS LIVE (a question is NOT a stop). You have a direct line to your orchestrator:
`SendMessage` to `main`. USE IT LIBERALLY. A hard contradiction is a STOP (above); a QUESTION is different
and far more common — a real ambiguity, a design fork, a "the spec says A but the cleanest fit is B, which
do you want," an unexpected shape the docs don't cover. For those: first try to resolve it with your OWN
tools (Read/ast/code — the answer is often there); if docs+code genuinely don't settle it, MESSAGE THE
ORCHESTRATOR AND ASK. Do not guess and do not silently pick — a wrong guess is expensive, a question is
cheap and expected. You often need not halt: ask, and keep working an independent part while you wait, or
ask-and-hold if the whole step depends on the answer. Silence-then-a-wrong-guess is the failure; asking is
the design working.

READ WHOLE — grep is for CODE, never for LAW. Before you touch code, READ IN FULL:
  - docs/architecture/core/AGENTS.md            (the constitution)
  - docs/architecture/core/Documentation-Law.md (how comments/docs are WRITTEN — machine-first; the
    comment ladder — see OUTPUT DISCIPLINE below; this is how the repo does not backslide into a novel)
  - docs/architecture/core/Core-Docs-Formatting-Law.md (markdown formatting mechanics, if you touch a doc)
  - docs/architecture/proposed/client-architecture-lockdown.md  (THE task doc — in full)
  - + the wave's extra reading (named in the M-block below)
You may NOT grep a law doc to settle a design question. Grep returns a line; the ruling lives in the
context around it (the trap: grepping "app-shell" finds the CSS exemption and misses that app-shell is NOT
import-privileged). Reference docs (Core-Path-Registry, Core-Enforcement-Active-Gates) are indexes — random
access is fine there.
PROVE YOU READ: before writing code, restate in your own words (1) the tier direction + precedence order,
(2) this wave's pre-resolved ambiguities, (3) the done-gate. Can't restate it → you didn't read it.

TOOL BELT — you have no memory and no right to assume. You use YOUR OWN EYES: Read / Grep / Glob / Bash /
pnpm ast only. You do NOT delegate, spawn agents, or use scouts — every fact is one you gathered yourself.
Every load-bearing fact is one call away:
  - pnpm ast <refs|callers|importers|exports|jsx|ident|orphans|flow|reaches> — SYMBOL-aware search
    (ts-morph; follows aliases/re-exports, ignores comments/strings). PREFER over grep for code questions.
    `pnpm ast flow <mod>` / `reaches <mod>` run the SAME dep-cruiser config the gates run — use them to
    PREDICT a dep-cruiser RED before you commit an import.
  - ast-grep / sg — structural pattern match (find every X-shaped construct).
  - pnpm typecheck — the completeness oracle (the Record<Id,Def> totality is tsc-checked; "did I wire it
    all" is answered here, not by eye).
  - pnpm check:show --errors-only | --gate <name> | --file <path> — read WHY check failed without
    re-paying the walk (reads reports/check-structure.json).
ASSERTION WITHOUT A TOOL RECEIPT IS THE FAILURE. When you claim X is done or safe, cite the command that
proved it.

THE VERIFY TOOLCHAIN (know the exact contract):
  - INNER LOOP while building: `pnpm verify --scope '<your-wave-folder>/**'` — scoped, fast, runs the
    incremental-safe gates + related tests over your changed set.
  - A SCOPED GREEN IS NOT DONE. The scoped runner DEFERS every whole-project gate (registry / coverage /
    parity / completeness) — and those are EXACTLY the gates that catch this program's target bug class
    (half-registration across maps). Your FINAL verdict is always the WHOLE run: `pnpm check`.
  - DONE-BEFORE-COMMIT: `pnpm check` (= `pnpm verify --static`) GREEN, whole, and `pnpm test` green for
    any wave that touches runtime. Read the FULL output, not the exit code alone.
  - EXIT CODES ARE UNIFORM: 0 clean · 1 violations · 2 tool-error · 3 misuse. Exit 2 means a CHECKER is
    broken (e.g. a gate you wrote throws in conformance) — NEVER "fix" an exit-2 by editing product code.
    Fix the checker.

BANNED ESCAPE HATCHES (shipping one is the failure; if you cannot go green without one, STOP and report):
  - no eslint-disable / biome-ignore added to make code pass
  - no new dep-cruiser exemption, no new gate allowlist entry to dodge a rule
  - no `// TODO` / `// FIXME` left in place of the work
  - no `any` / `unknown` / loose index-signature to appease tsc
  - no leaving the OLD map/structure beside the new one "for now" — DELETE it in the same commit (leaving
    half a migration in place IS the refinery bug you are fixing)
  - no `{planned}` / `{placeholder}` marker on something that is not actually planned/placeholder

OUTPUT DISCIPLINE — WRITE TO THE DOC/COMMENT LAW (the repo must NOT backslide into a novel). Every comment,
file header, and doc line you write obeys `Documentation-Law.md`. Run its comment ladder before ANY
comment, first hit wins: (1) can a rename or a stronger type make it unnecessary → do that, write NO
comment; (2) WHAT-narration (describes what the code plainly does) → don't write it; (3) type-expressible
(a shape, legal-values set, exhaustiveness) → encode in the type, no comment; (4) irreducible WHY
(non-obvious invariant, gotcha, security belt, "looks wrong but is deliberate," cross-file coupling the
import graph can't show) → KEEP, terse — the ONLY comment that earns its place; (5) a stale/lying comment
you pass → DELETE on sight (a wrong comment is a gated DEFECT, not someone else's cleanup). File headers
≤3 lines. Terse beats comprehensive; one fact, one home; code+types are the source of truth. The ONE place
verbose is correct: a rung-4 load-bearing warning (a security belt, a deliberate-surprise marker) may be as
long as it needs to stop the next agent from "fixing" it. NO commit-message essays, NO restated-code
narration, NO `@param`/`@returns` that echo the signature. It's gated (commented-code, header caps) — a
novel reds.

SCOPE: do ONLY this wave, and within it ONLY the unit named in the M-block. Do NOT proceed to the next
section, wave, or "while I'm here" cleanup. One wave = one commit. When done: report to the orchestrator
with the receipts and STOP.

BUILDING A GATE — THE FULL RITUAL (learned M0; a gate is NOT just the gate file). To ship a new
`scripts/check/gates/<name>.ts` gate green you must ALSO:
  1. THE PROOF IS INLINE (always required): the descriptor exports `gate: GateDescriptor` with `name` ==
     filename, a real `docRow`, `status`, `scopeSafety`, a visit/visitFile/run body, and ≥1 `mustFlag` +
     ≥1 `mustPass`. The loader REFUSES an un-proven gate; `gate-conformance.int.test.ts` runs these
     synthetic examples. This is the primary self-test — you can't ship an always-green fake.
  2. Add its row to `docs/architecture/core/Core-Enforcement-Active-Gates.md` AND bump the "N registered
     gates" count — the `enforcement-registry-parity` gate goes RED until the doc matches the loader.
  3. The live-tree anti-drift test (`tests/tooling/check-gates.int.test.ts`) must ACCOUNT for the gate,
     one of two ways: (a) if its bite is a minimal real-tree violation at its anchor path — add a `__g_`
     fixture (most per-node gates: G8's off-door `createRegistry(` call, G2's parallel map); (b) if it
     reconciles WHOLE-TREE state and no minimal fixture can trigger it (like `enforcement-registry-parity`,
     and likely G1's completeness arm) — add the gate NAME to `UNFIXTURABLE_GATES` instead, relying on the
     inline `mustFlag` from step 1. Do NOT force a fake fixture for an unfixturable gate.
  Miss any of 1–3 and `pnpm check` reds. This is expected wiring, NOT an escape-hatch situation.

DOC-SNIPPET GOTCHA: the lockdown doc's TS interface snippets use method-shorthand (`get(id): Def`), which
biome's `useConsistentMethodSignatures` REJECTS on house style. Write property-style instead:
`readonly get: (id: Id) => Def`. Same shape; do not copy the doc snippet verbatim into code.

ICON IMPORTS: do NOT add a `biome-ignore lint/correctness/noUnresolvedImports` for `@orb/ui/icons`. That
rule is now OFF at the biome-config level (it false-positived on the lucide re-export chain; tsc/tsgo own
unresolved-import detection). Import icons cleanly, no ignore. (The ~123 legacy ignores are harmless silent
warnings, swept separately.)
```

## B. The verifier preamble (verbatim, every verifier/stickler dispatch)

```
You are a FRESH-CONTEXT verifier on a ratified program (client-architecture-lockdown.md, D70). The builder
claims a wave done. Assume it is BROKEN until receipts prove otherwise. You do not fix — you CONFIRM or
REFUTE with evidence, then report.

Re-run the whole gate, do not trust the builder's paste: `pnpm check` (whole, not --scope) + `pnpm test`
if the wave touched runtime. A scoped green is not a done green — confirm the WHOLE run is clean.

The machine proves a gate is self-consistent (the loader refuses an un-proven gate; conformance runs
mustFlag/mustPass). It CANNOT prove the gate's examples are HONEST. That is YOUR job on any wave that
builds a G-gate:
  - Is the mustFlag example the REAL violation shape from §2 of the doc (the actual refinery/god-map bug),
    or a toy strawman that bites trivially while the real shape slips through? Construct the real-shape
    violation yourself and confirm the gate REDs on it.
  - Is scopeSafety correct? A cross-file/registry/completeness gate marked "incremental-safe" gives
    false-greens on scoped runs — verify it is "whole-project" when it reconciles across files.
  - Does docRow cite a real Core-Enforcement-Active-Gates.md row, and name==filename?

Then verify the wave's substance (M-block "verify" list). Report CONFIRMED or REFUTED per claim with the
command + output that proves it. Findings most-severe first.
```

## M0 — the registry primitives + G8

**Extra reading (in full):** doc §5 (the primitive) + §7 (the door) · `Spine-TypeScript-and-Patterns.md`
(the union-redecl / `assertNever` / total-`Record` idioms this leans on) · `scripts/check/contract.ts`
(the `GateDescriptor` shape you must satisfy to build G8) · one existing gate as a worked example
(`scripts/check/gates/placeholder-copy-registry.ts`).

**Executor spec:**

- Build `createRegistry<Id, Def>(name, ids, definitions)` and `createContributorRegistry<Def>(name,
  contributions)` in `packages/client/src/lib/registry.ts`, EXACTLY per doc §5 (total-by-tsc over the
  vocabulary tuple; read-only `get`/`list`/`has`; `get` throws on unknown id; duplicate contributor ids
  throw at construction; NO mutating `register()` API — that is banned, §5 rule 1).
- Add `packages/client/src/lib/registry-contracts.ts` (the tier-4 contract home per §6c — may import
  `@orb/contracts` types; imports zero features). Empty-but-for-types is fine at M0.
- Unit tests: totality is a compile fact (a type-level test that a missing member fails); runtime tests
  for unknown-id throw, duplicate-id throw, `list()` order = ids order.
- Build gate **G8 `registry-assembly-at-door-only`** in `scripts/check/gates/`, born-compliant:
  RED when `createRegistry(` / `createContributorRegistry(` is called outside `main.tsx` or a `compose/`
  module, or when any mutating `register(`-style API exists at all. `scopeSafety: "incremental-safe"`
  (each call site judged by its own path). `mustFlag`: a `createRegistry(` call in a feature file.
  `mustPass`: a `createRegistry(` call in `main.tsx`. `docRow`: the G8 row.

**Done-gate (all required, cite each):** `pnpm typecheck` green · the unit tests green · `pnpm check`
whole green (G8 conformance passes — exit 0, NOT 2) · `pnpm ast importers packages/client/src/lib/registry.ts`
shows only the intended callers (none yet is fine) · zero banned hatches.

**Verifier "verify" list:** the primitive matches §5 (throw-on-unknown, no `register()`, totality is
tsc); G8's `mustFlag` is a genuine off-door call (build one in `features/` and confirm RED); G8 `mustPass`
is a real door call; scopeSafety/docRow/name correct.

## M1 — SectionDefinition + the thin route (characters first)

**Extra reading (in full):** doc §6 (section model) + §7 (the composition root) + §15 (the doc↔code
reconciliations that touch sections) · `UI-Architecture-and-Layout.md` §4.1–4.3 (the region/section model
the doc builds on) · `UI-Primitives-and-Reuse.md` · `packages/client/src/features/README.md` (per-slice
shape) · the `D62` / `D66` / `D70` ledger entries.

**PRE-RESOLVED AMBIGUITY (do this, do not re-derive — the orchestrator already adjudicated it):**

> You WILL find three hooks the current `home-page.tsx` closures capture are homed INSIDE features, so a
> `SectionDefinition` living in a feature that imports them trips `client-features-no-cross` (verified:
> `.dependency-cruiser.cjs:128-138`, only `type-only` is exempt — app-shell gets NO import exemption):
> `useShellLayout` + `useIsMobileViewport` (`features/app-shell`), `useAuthConfig` (`features/auth`).
> This is EXPECTED and RESOLVED — do NOT invent a dep-cruiser exemption or an "app-shell import tier"
> (that path was adjudicated and REJECTED; it breaks the shell's own "features stay @container-only" law
> and the one-directional invariant):
>
> - The `isMobile`-branching closures (`revealSectionInspector` / `dismissSectionInspector` /
>   `revealFieldInspector`, `home-page.tsx:152-184`) are shell-navigation INTENT — fold each into a
>   named `#state` module action (e.g. `revealContextPanel(tab)`). **Do NOT read `isMobile` inside it —
>   `no-raw-matchmedia` bans `matchMedia` outside the app-shell hook, which `#state` cannot import
>   (`client-state-below-data`). Use the REGIME-EXCLUSIVE DUAL-WRITE instead (proven M1.1):** the action
>   writes BOTH channels unconditionally — `setContextTab(tab)` + `setMobileSheet("context")` +
>   `setPanelMode("context","docked")` — and `useShellLayout` reads `mobileSheet` ONLY under `isMobile` and
>   `panelOverrides` ONLY on desktop, so each write self-selects its regime (verified: `mobileSheet` has one
>   consumer, all reads `isMobile`-gated). Viewport-unaware action, correct reveal in both regimes. A
>   section definition NEVER imports `useIsMobileViewport`.
> - `shellLayout.listMode`: expose the narrow projection from `#state` (the shell vocabulary already
>   lives in `state/shell-store.ts`, §5 rule 5).
> - `useAuthConfig` / `multiHumanCapable`: read via `trpc.*` directly in the definition (cache-first),
>   or home the hook in `#data` (mirror `use-viewer.ts`).
>   Precedent, not novelty: 57 feature files already read shell state from `#state` (`pnpm ast importers`
>   the shell-store hooks to see it). You are making three stragglers join that norm.

**WAVE SHAPE (learned M0 — the total-registry constraint dictates the order).** `createRegistry` is TOTAL
over `SECTION_IDS` (tsc), and `knip` reds an unused export — so you CANNOT construct the registry with one
member, and a definition nothing consumes is RED. Therefore M1 is a MULTI-STEP wave, each step green:

- **M1.1 (this dispatch — characters, the proven pattern):** introduce the `SectionDefinition` (§6a) +
  `ContextDefinition<S>` (§6b) TYPES; write the co-located `features/character/lib/characters-section.tsx`;
  and CONSUME it by replacing ONLY the `characters` branch of the existing `home-page.tsx` `sections={{…}}`
  prop map with a render-from-the-definition call. That prop map is a `Partial<Record<SectionId, …>>`
  routed through `AppShellProps`, so a single-key swap is legal. There is NO `createRegistry` yet, NO G1/G2
  yet, NO `app-root` rename yet.
  **DO NOT delete from the other structures at M1.1 (learned M1.1 — the totality law forbids it).** Only
  the `sections={{…}}` prop map is per-key mutable. `SECTION_PANEL_DEFAULTS`, `SECTION_PLACEHOLDER_COPY`
  (total `Record<SectionId,…>` — a per-member delete is TS2741) and `RAIL_SECTIONS`, `CONTEXT_SLOTS` are
  read MODULE-INTERNALLY by app-shell (`app-shell.tsx`, `use-shell-layout.ts`, `rail.tsx`,
  `context-tabs-panel.tsx`) — app-shell is untouched at M1.1 and cannot re-derive them from a feature
  definition without a forbidden cross-feature import, so deleting a member breaks app-shell for EVERY
  section. They stay whole and collapse ATOMICALLY at cutover (when AppShell switches to `sections.get`).
  `SECTION_IDS` is retained vocabulary — never deleted (§5 rule 5). The temporary duplication of characters'
  rail/panelDefaults/placeholder (old maps + the new definition) is intentional until cutover.
- **M1.2–M1.n (later dispatches):** the other six sections, each same shape, each green, chats last — each
  swaps only its own `sections={{…}}` branch; the app-shell-internal maps stay whole throughout.
- **M1.cutover (final dispatch):** once ALL seven definitions exist, flip AppShell from consuming the
  `Partial<Record>` props to `sections.get(active)`, construct the ONE total `createRegistry("sections",
  SECTION_IDS, {…})` at the door, and ATOMICALLY delete the four now-unread app-shell maps (`RAIL_SECTIONS`,
  `SECTION_PANEL_DEFAULTS`, `SECTION_PLACEHOLDER_COPY`, `CONTEXT_SLOTS`) + the `sections={{…}}` prop —
  `SECTION_IDS` stays. Rename the `/` route to **`app-root.tsx`** (O7); build **G1
  `section-registry-completeness`** (`whole-project`) + **G2 `no-parallel-section-map`** (its `mustPass`
  MUST include a legitimately DERIVED map like `MOBILE_PRIMARY_SECTIONS`←`RAIL_SECTIONS`, or STOP and
  report). Only here do G1/G2 go green.
  **CUTOVER FINDING (learned M1.3): the `{kind:"single"}` context arm needs a host.** `ContextTabsPanel`
  today renders ONLY the `tabs` arm; pre-cutover, worldInfo's `single` body is hosted directly in the route
  via a `context.kind === "single"` narrow. At cutover, the shell's context consumption must branch on
  `context.kind` (host `single` bodies too), or `ContextTabsPanel` must be extended to accept a
  `single`-kind definition — otherwise `sections.get(active).context` can't render worldInfo's inspector.

**M1.1 executor spec (characters):**

- `SectionDefinition` + `ContextDefinition<S>` types (STRICT per O5 — `S` a real published projection, never
  `any`/`unknown`). **TYPE HOMES ARE FIXED, not judgment (learned M1.1):** `SectionDefinition` MUST live at
  the STATE tier (`state/section-registry.ts` — it references `SectionId`/`PanelName`/`PanelMode` which §5
  rule 5 pins to `#state`, and `client-lib-floor` forbids `lib/`→`#state`; precedent: `state/chat-handle.ts`
  is a types-only non-store file in state). The vocab-independent generics `ContextTabDef`/`ContextDefinition`
  go in `lib/registry-contracts.ts` (§6c). Any vocab UNION (e.g. `SectionGroup`) must derive from an
  `as const` tuple, never an inline union — `no-inline-union-redecl` reds the inline form (§6a's snippet
  writes it inline; don't copy that).
- `features/character/lib/characters-section.tsx` — self-contained (`#state`/`#data`/`#components`/`@orb/ui`
  only), APPLYING the pre-resolved hook fix above (the `#state` intent action via the dual-write — a section
  definition NEVER imports `useIsMobileViewport`/`useShellLayout`/`useAuthConfig`). The content-branch
  selection component is a `components/` component, NOT a `-surface.tsx` (a `-surface` must manage
  focus-on-mount per `surface-a11y-focus`; the content region's focus is the shell's job).
- Consume it in `home-page.tsx`: replace ONLY the `characters` branch of the `sections={{…}}` prop map
  with the definition render. `content` is a `(() => ReactNode) | { planned }` union, so the render needs a
  `typeof content === "function"` narrow. Do NOT touch `RAIL_SECTIONS` / `SECTION_PANEL_DEFAULTS` /
  `SECTION_PLACEHOLDER_COPY` / `CONTEXT_SLOTS` (they collapse at cutover, per the WAVE SHAPE note) or the
  other six section branches.

**M1.1 done-gate (cite each):** `pnpm verify --scope 'packages/client/src/features/character/**'` green →
`pnpm check` WHOLE green · `pnpm test` green · `pnpm ast flow
features/character/lib/characters-section.tsx` shows ZERO cross-feature runtime edges (esp. no app-shell/
auth) · the `#state` intent action(s) you added are consumed (no `knip` dead-export red) · zero banned
hatches · the app renders the characters section live AND its field-inspector/mobile-sheet behavior still
works (drive it via `run`/`__orb`, don't assert).

**M1.1 verifier "verify" list:** characters section is self-contained (no `features/app-shell` or
`features/auth` runtime import — `pnpm ast flow` it); the characters `revealFieldInspector` isMobile
closure is GONE from the route (now a `#state` intent action); ONLY the `sections={{…}}` characters branch
changed — `RAIL_SECTIONS`/`SECTION_PANEL_DEFAULTS`/`SECTION_PLACEHOLDER_COPY`/`CONTEXT_SLOTS` are still
whole (the temporary duplication is expected); every section still renders (no regression); `pnpm check`
whole green. (G1/G2 do not exist yet — not this step.)

**M1.cutover verifier "verify" list (the FINAL step only):** the route is `app-root.tsx` with no
`sections={{…}}` literal; AppShell consumes `sections.get(active)` (not `Partial<Record>` props); the four
app-shell maps (`RAIL_SECTIONS`/`SECTION_PANEL_DEFAULTS`/`SECTION_PLACEHOLDER_COPY`/`CONTEXT_SLOTS`) + the
`sections={{…}}` prop are DELETED not orphaned, and `SECTION_IDS` is RETAINED; G1 REDs on a real half-wired
section
(build one) AND on a god-map literal in `routes/`; **G2 PASSES a real derived map and REDs a real
re-declared one** (the load-bearing false-positive check); the full gate ritual is done (G1/G2 rows + count
bump in `Core-Enforcement-Active-Gates.md` + a `__g_` fixture OR an `UNFIXTURABLE_GATES` entry per gate as
its bite dictates); `pnpm check` whole is green.
