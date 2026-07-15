---
kind: reference
status: draft
updated: 2026-07-14
---

# Client-Lockdown — Agent Prompt Templates (M0–M10)

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
  - docs/architecture/core/client-architecture-lockdown.md  (THE task doc — in full)
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
  - THE CT LANE IS SEPARATE — `pnpm test` runs the NODE lanes (unit/integration/contract) and does NOT run
    the playwright component tests. For ANY wave touching a CT-mounted component, a shared provider, or a
    registry Context/Provider, you MUST also run `pnpm test:ct` (the whole CT lane), or at minimum the touched
    `*.ct.tsx` files: a new/changed provider throws in EVERY story that mounts the component but forgot to wrap
    it, and `pnpm test` will stay green while the CT lane is 17-red (learned M6.1 — the verifier caught it).
  - TEST THE NEW BEHAVIOR — "`pnpm test` green" is NOT sufficient. `test-presence-client` only checks a
    store's mirror `.ct.tsx` EXISTS; adding a new action to an existing store passes it WITHOUT covering
    the new action (learned: 4 dual-write actions shipped untested). So: every NEW `#state` action /
    projection / non-trivial behavior you introduce gets an assertion YOU add to the mirror
    `tests/client/state/<store>.ct.tsx` (drive the action, assert the resulting store state — e.g. a
    dual-write writes BOTH channels). Old tests still passing ≠ new behavior tested. If a piece of new
    behavior has no meaningful unit/CT assertion (a pure trpc read = "the library was called"), say so in
    your report rather than silently skipping.
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

PROBE VIA A SCRATCH FILE, NEVER GIT (learned M6.3/M7 — two executors reached for git). To prove a gate BITES
its real shape, plant the violation in a NEW throwaway file at the target path (e.g. `features/__probe/lib/
x.ts`) and `rm` it after — no revert needed, no real file touched. If you must edit a real file to probe, back
it up first (`cp f f.bak; …; mv f.bak f`). NEVER `git stash` / `git checkout <path>` / `git restore` to undo a
probe — those are BANNED (they can silently drop other uncommitted work) and are not "no harm no foul" even
when nothing is lost.

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

ICON IMPORTS: import from `@orb/ui/icons` cleanly — no `noUnresolvedImports` biome-ignore. That rule is OFF
(the lucide-resolver false-positive is fixed at the biome-config level; tsc/tsgo own unresolved imports).
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
> - `shellLayout.listMode` (viewport-dependent READ — HARDER than a plain projection, learned M1.7): a
>   naive `#state` projection of `override ?? default === "docked"` is WRONG on mobile — `listMode` is
>   viewport-aware (mobile is NEVER docked) and `#state` can't read viewport (`no-raw-matchmedia`). The
>   fix: **the shell (the sole viewport-aware layer, `features/app-shell`) publishes `isMobile` into the
>   shell store (`mobileViewport`); the projection reads THAT** — `mobileViewport ? false : (override ??
>   default) === "docked"`. Features read the viewport-derived bit from `#state`, never the viewport hook
>   (they stay @container-only). Distinct from the dual-write: dual-write is for viewport-dependent WRITES
>   (reveal actions, reader self-selects); this is the pattern for viewport-dependent READS.
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
- **M1.cutover (the M1 TAIL only — registry + list/content/header inversion):** once ALL seven definitions
  exist, construct the ONE total `createRegistry("sections", SECTION_IDS, {…})` at the door; flip AppShell to
  consume `sections.get(active)` for rail / panelDefaults / placeholder / **list** / **content** /
  **header** (chat's `chatsHeader` → `definition.header`; refinery's `{planned}` content → its placeholder).
  ATOMICALLY delete `RAIL_SECTIONS` / `SECTION_PANEL_DEFAULTS` / `SECTION_PLACEHOLDER_COPY` + the
  `sections={{…}}` prop's NON-context fields; `SECTION_IDS` stays. Rename `/` → **`app-root.tsx`** (O7).
  Build **G1 `section-registry-completeness`** (`whole-project`) + **G2 `no-parallel-section-map`** (its
  `mustPass` MUST include a legitimately DERIVED map like `MOBILE_PRIMARY_SECTIONS`←`RAIL_SECTIONS`, or STOP
  and report). **CONTEXT IS NOT DONE HERE** — it stays hand-wired, bridged through a SLIM temporary
  context-only prop; `CONTEXT_SLOTS` + the route's inline `<ContextTabsPanel>` + chat's `chatsContext`
  survive to M3. **The temp prop is TRACKED SCAFFOLDING, not silent:** name it clearly and mark every piece
  of it (the prop, its type, the route wiring that feeds it) with a greppable `FLAG[lockdown-M3]` header
  comment citing "temporary context bridge — deleted at M3". Do NOT fold context in — the doc separates M1
  and M3 for a reason (this wave is already large). Only here do G1/G2 go green.
- **M3 (context-unification — its OWN wave; pre-launch, in full):** the section CONTEXT panel moves off the
  FLAG bridge onto each section's `ContextDefinition`, consumed by a blind `SectionContextHost`. The design is
  the `defineContextTabs<S>` MINT (`client-architecture-lockdown.md` §6b) — `S` is paired with its consumer
  INSIDE the definition file and never crosses the shell seam (the M1.cutover `SectionDefinition<never>`
  apparatus is DELETED, not re-hydrated). TWO green steps — **M3-core** (the fused M3.1+M3.2: migrating any
  section to the mint changes `ContextDefinition`'s tabs arm, which breaks chat's raw `{kind:"tabs",tabs}`
  literal at compile, so all sections INCLUDING chat + the bridge death land ATOMICALLY — there is no green
  intermediate) then **M3.3** (the walls). This is a COMPLETE BLUEPRINT below (**"M3 executor spec"**) — an executor has ZERO
  architecture decisions to make, only mechanical construction; the one genuine unknown is flagged as an
  explicit ASK. **M3 DONE-GATE:** `grep -r "FLAG\[lockdown-M3\]"` → 0; no `sectionContext` prop / `SectionContextBridge` / `contextHeader`; `CONTEXT_SLOTS` + both chat context surface files deleted; `ContextTabsPanel` off the app-shell front door; `SectionDefinition` non-generic (no `SectionDefinition<never>` anywhere); G3 green + its `mustFlag` RED; G1/G2 amendments landed; `pnpm ast flow app-shell.tsx` still zero `#features/*` edges; every section's context renders live.

**SEQUENCED FOLLOW-UP WAVES (done properly, not "someday"):**

- **F1 — test-backfill (before F2).** Add assertions for the `#state` actions shipped untested in M1.1-1.4
  — `revealContextPanel` (the dual-write: assert it writes BOTH `mobileSheet` and the panel override),
  `selectPresetFromList`, `dismissPresetSection`, `selectWorldBookFromList` — into their existing
  `tests/client/state/<store>.ct.tsx`. Plus a CT for any content component carrying REAL logic (chat's
  landing/room split); do NOT blanket-CT thin selection-branch components (repo law: no shit tests —
  `Spine-Testing.md` §5 / global "don't confirm obvious behavior").
- **F2 — gate-strengthen (after F1 is green).** Extend `test-presence-client` so each EXPORTED store action
  must be referenced in its mirror `.ct.tsx` — closes the existence-not-coverage loophole (Nate, option b).
  Full gate ritual (mustFlag = a store action absent from its mirror test; mustPass = one covered). It will
  red until F1 lands — that ordering is deliberate.
- **F3 — dead-ignore sweep (anytime; low risk).** Delete the \~123 now-lying
  `biome-ignore lint/correctness/noUnresolvedImports` comments (the rule is OFF — a stale suppression is a
  defect per Documentation-Law §1, not deferred cleanup). Mechanical; `pnpm check` stays green.

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

**M1.cutover executor spec (SCOUTED 2026-07-14 by the orchestrator — this is precise, not exploratory).**
Extra reading in full: `client-architecture-lockdown.md` §5–§7; `features/app-shell/surfaces/app-shell.tsx`
(the consumer); `features/app-shell/lib/rail-slots.ts` + `section-placeholder-copy.ts` (the 3 maps to
delete); `features/app-shell/hooks/use-shell-layout.ts` + `components/{rail,you-sheet}.tsx` (the other map
readers); `main.tsx` (the door) + `routes/home-page.tsx` (the current assembly).

**RESOLVED IN-WAVE (2026-07-14 — settled answers a re-dispatch inherits; do NOT re-derive or re-ask):**

> - **The registry `Def` erasure is `SectionDefinition<never>`, NOT bare / `<void>`.** `S` is contravariant
>   (`when`/`body` take `S`), so all 7 heterogeneous section defs assign to `<never>` (`never ⊂ every S`)
>   but NOT to `<void>` (`void ⊄ CharacterContextState`). `never` is the variance-safe erasure — it is NOT
>   a banned `any`/`unknown`. `main.tsx`: `createRegistry<SectionId, SectionDefinition<never>>(…)`.
> - **The chats-landing `ImportOnboardingCard` graft — DISCONNECT + DELETE (owner ruling, overriding an
>   earlier "scaffold it" call).** Today `routes/home-page.tsx#renderChatsContent` wraps `chatsSection
>   .content()` with `<ImportOnboardingCard/>` (a `#features/settings` export) on the `isLanding` case
>   only — a settings→chat surface graft that can't fold into `chatsSection` (chat→settings is dep-cruiser
>   RED). Do NOT preserve it and do NOT build a content-bridge scaffold. The card is only a first-run
>   NUDGE (its header: "the permanent entry is the Backup & Restore settings pane"; `startImport` =
>   `openSettingsTo("backup")`), so import CAPABILITY is untouched. DELETE the self-contained closure —
>   the card, `state/import-onboarding-store.ts`, both barrel exports, the 3 `importOnboarding*` test-ids,
>   its 2 test files, and the `_ct-stories.tsx` refs (verify zero prod consumers first with `pnpm ast`).
>   Chats content then flows PURELY from the registry — no special case. The nudge is REBUILT PROPERLY
>   post-lockdown via the M8 contributor seam (a settings/import→chat `ChatSurfaceContribution`); it is
>   git-recoverable. This makes the cutover simpler (one fewer temp map for G2).
> - **G2 is scoped to `SectionId` THIS wave** (fork 1). The doc's §16 G2 covers SectionId/ModalSlotId/
>   SettingsCategoryId, but modals migrate at M4 and settings at M6 — real Modal/Settings maps
>   (`YOU_MODAL_ROWS`, `MODAL_SLOTS`, the settings if-ladder) legitimately survive until then, and covering
>   them now would force the banned large allowlist. Scope `no-parallel-section-map` to SectionId; carry a
>   terse comment naming the M4 (ModalSlotId) + M6 (SettingsCategoryId) extension points so the arms read as
>   STAGED, not forgotten. `mustPass` = derived `MOBILE_PRIMARY_SECTIONS`; `mustFlag` = a re-declared
>   SectionId map. Allowlist ONLY the two `FLAG[lockdown-M3]` context maps (`CONTEXT_SLOTS` + the slim
>   context prop).
> - **`app-root.tsx` is the SECOND sanctioned composition route** (fork 2 — an M11 doc-reconciliation:
>   §16 G1 vs §7 conflict). G1's anti-god-map arm has two sub-arms: (a) a `sections={{…}}`/`modals={{…}}`
>   object-literal in ANY route file INCLUDING app-root → RED (the real teeth — the god-map must not
>   re-form); (b) a feature front-door import in `routes/**` → RED EXCEPT the two composition seams
>   `router.tsx`→`features/auth` AND `app-root.tsx` (§7 permanently homes `JoinInviteDialog`/
>   `FirstRunPersonaDialog`/etc there). All other route files stay locked.

- **Delivery = a React CONTEXT, not a prop (the load-bearing decision).** `AppShell` is mounted in the
  route but `createRegistry` must live in `main.tsx` (G8), and the registry is read deep in app-shell —
  including inside the `use-shell-layout` HOOK, which can't take a prop. So add
  `SectionRegistryContext` + `SectionRegistryProvider` + `useSectionRegistry()` in `#state` (it holds
  `Registry<SectionId, SectionDefinition>`; the type already lives in `state/section-registry.ts`).
  **This is NOT a cross-feature import:** app-shell reads the registry as a runtime context VALUE and calls
  `def.list()`/`def.content()` blind — dep-cruiser checks static imports, not context values (confirm with
  `pnpm ast flow` that app-shell gains no `#features/*` edge). `main.tsx` constructs
  `const sections = createRegistry("sections", SECTION_IDS, { chats: chatsSection, characters:
  charactersSection, corpus: corpusSection, worldInfo: worldInfoSection, presets: presetsSection, refinery:
  refinerySection, analytics: analyticsSection })` (imports all 7 front-door exports — the door), and wraps
  `<SectionRegistryProvider value={sections}>` around `<RouterProvider>`.
- **Re-point every map reader at the registry (exact list from the scout), then DELETE the 3 maps:**
  `SECTION_PANEL_DEFAULTS` (1 reader — `use-shell-layout.ts:49`) → `registry.get(s).panelDefaults[panel]`;
  `SECTION_PLACEHOLDER_COPY` (1 reader — `app-shell.tsx:88` + its test) → `registry.get(active).placeholder`;
  `RAIL_SECTIONS` (`rail.tsx`, `you-sheet.tsx`, `use-shell-layout` label, `home-page` palette, + derived
  `MOBILE_PRIMARY_SECTIONS`/`RAIL_SLOTS`) → `registry.list().map(d => d.rail)`. `AppShell`'s
  `contentBySection` (`<Activity>` pane-keeping) rebuilds from `registry.list()`. Update the
  `section-placeholder-copy.test.ts`. `SECTION_IDS` STAYS (retained vocabulary).
- **`home-page.tsx` → `app-root.tsx` (O7):** the `sections={{…}}` assembly MOVES to `main.tsx` (as the
  `createRegistry` call). `app-root` keeps only §7 residue (`useUserBus` mount, `AriaAnnouncer`, the
  `?join=` capture + `JoinInviteDialog`, `FirstRunPersonaDialog`) and mounts `<AppShell>`.
- **The slim temp CONTEXT prop (FLAG\[lockdown-M3] scaffolding) carries BOTH `context` AND `contextHeader`**
  — `AppShell` renders both from the slot today (`app-shell.tsx:158` header via ShellTopbar, `:165`
  contextHeader, `:196` context body). Context stays hand-wired to M3, so `AppShellProps` keeps a slim
  `sectionContext?: Partial<Record<SectionId, {context, contextHeader}>>` fed by `app-root`'s inline
  `ContextTabsPanel`/`chatsContext`. Mark the prop, its type, and the app-root wiring with `FLAG[lockdown-M3]`.
- **G1 + G2 with the temp-scaffolding allowlist.** G1 = `section-registry-completeness` (whole-project).
  G2 = `no-parallel-section-map` — its `mustPass` MUST include a real DERIVED map (`MOBILE_PRIMARY_SECTIONS`
  ←`RAIL_SECTIONS`… now ←the registry). **G2 will flag the two surviving temp maps** (`CONTEXT_SLOTS` and
  the slim `sectionContext` prop are both `Record<SectionId,…>` over ≥2 members) — allowlist BOTH as
  `FLAG[lockdown-M3]` temp entries; M3's done-gate removes the maps AND these allowlist entries. **This is
  the ONE sanctioned exception to §A's "no new gate allowlist entry" ban** — that ban is against PERMANENT
  dodges; this is TRACKED scaffolding for maps that legitimately live until M3, greppable and removed by
  M3's done-gate. Cite the FLAG marker in the allowlist entry so it reads as temp, not a dodge. Full gate
  ritual for G1/G2 (inline mustFlag/mustPass; `__g_` fixture or `UNFIXTURABLE_GATES`; Core-Enforcement row +
  count bump).
- **This wave is ATOMIC and large** — the registry is total, so there is no green partial-registry
  intermediate. Build it whole, `pnpm check` whole green, live-drive EVERY section renders. If any single
  piece (the context delivery, a map reader, the G2 allowlist) fights you in a way this spec didn't
  anticipate, ASK — do not improvise the architecture.

**M1.cutover verifier "verify" list (the FINAL step only):** the route is `app-root.tsx` with no
`sections={{…}}` literal; AppShell consumes `sections.get(active)` (not `Partial<Record>` props); the four
app-shell maps (`RAIL_SECTIONS`/`SECTION_PANEL_DEFAULTS`/`SECTION_PLACEHOLDER_COPY`/`CONTEXT_SLOTS`) + the
`sections={{…}}` prop are DELETED not orphaned, and `SECTION_IDS` is RETAINED; G1 REDs on a real half-wired
section
(build one) AND on a god-map literal in `routes/`; **G2 PASSES a real derived map and REDs a real
re-declared one** (the load-bearing false-positive check); the full gate ritual is done (G1/G2 rows + count
bump in `Core-Enforcement-Active-Gates.md` + a `__g_` fixture OR an `UNFIXTURABLE_GATES` entry per gate as
its bite dictates); `pnpm check` whole is green.

**M3 executor spec (DEFINITIVE — authored by the architect 2026-07-14; owner bar: ZERO architecture
decisions left, only mechanical construction).** Extra reading in full: `client-architecture-lockdown.md`
§6a/§6b/§6c + §15 (the M3 corrections); the code cited below. Every open choice is DECIDED here. The ONE
genuine unknown is the ASK at the end — everything else is construction.

**THE DESIGN IN ONE PARAGRAPH.** `S` (a section's context-state projection) appears only contravariantly on
`ContextTabDef` (`when`/`body`), so it can't be produced across the registry seam type-safely (variance proof,
§6b). So a section's `context: ContextDefinition` is minted by `defineContextTabs<S>(spec)`, which PAIRS the
feature-owned projection hook with the feature-owned tabs inside the definition file and returns a NON-generic
`{ kind:"tabs"; useResolved }`. App-shell's `SectionContextHost` switches on `context.kind` and, for `tabs`,
calls `useResolved()` blind. `SectionDefinition` drops its generic; the `<never>` apparatus is deleted.

**M3-core, part A — contracts + host + the five straightforward sections.** (SEQUENCING: M3.1 and M3.2 are
ONE atomic step — migrating any section to the mint changes `ContextDefinition`'s tabs arm, which breaks
`chatsSection`'s raw `{kind:"tabs",tabs}` literal at compile, so the five sections AND chat AND the bridge
death must land together. Build in the order below; there is NO committable green state until part B is done.
M3.3 — the gates — is the separate follow-on.)

- **BUILD `lib/registry-contracts.ts` additions** (exact shapes: `client-architecture-lockdown.md` §6b — copy
  the `ContextTabDef<S>` \[unchanged], `ResolvedContextTab`, `ResolvedContextTabs`, non-generic
  `ContextDefinition`, `ContextTabsSpec<S>`, `defineContextTabs<S>`). Also MOVE these published projection
  types here, EXPORTED (O5 home, §15 correction 1): `CharacterContextState` (from
  `features/character/lib/characters-section.tsx:22-24`), `PresetContextState` (from
  `features/preset/lib/presets-section.tsx:21-23`), and the chat phase-union (M3.2). Fields are `@orb/contracts`
  - `@orb/kit` types only (tier-4 legal). Features re-import them from `#lib`.
- **`defineContextTabs<S>` body** (in `registry-contracts.ts`): `useResolved` is a named hook closure over
  `spec` — `const useContextState = spec.useContextState; const state = useContextState(); if (state === null)
  return null; return resolveContextTabs(spec, state);`. **BUILD `resolveContextTabs<S>(spec, state)`** as a
  PURE exported-for-test function: own tabs → `contributors?.list() ?? []`, filter each by `when?.(state) ??
  true`, map to `{ id, label, node: body(state) }` in declared order (own before contributors), plus `actions:
  spec.actions?.(state)`. At CONSTRUCTION (mint call, not render) THROW on a duplicate tab id across own ∪
  contributors (the `createContributorRegistry` posture). `S` is confined to this ONE parametric function.
- **DROP the `SectionDefinition` generic:** `state/section-registry.ts:38-50` → `interface SectionDefinition`
  (no `<S>`), `context: ContextDefinition` (non-generic). `state/section-registry-context.ts:12` →
  `Registry<SectionId, SectionDefinition>`. `main.tsx:71` → `createRegistry("sections", SECTION_IDS, {…})` with
  no `<SectionId, SectionDefinition<never>>` annotation. Delete the `<never>` comment prose in
  `section-registry-context.ts:4-5`.
- **BUILD `features/app-shell/components/section-context-host.tsx`** (NEW — the ONE context consumer, the
  domain-agnostic dispatcher):
  - `SectionContextHost({ definition }: { definition: SectionDefinition }): ReactElement` — `switch
    (definition.context.kind)`: `"none"` → the `SectionPlaceholder` "Details / Select something…" block
    (lift the exact copy from `app-shell.tsx:207-212`); `"single"` → `<>{ctx.body()}</>`; `"tabs"` → wrap
    `<ResolvedTabsHost useResolved={ctx.useResolved} />` in ONE `QueryBoundary` (`fallback={<Text
    tone="muted">Loading details…</Text>}`, default `renderError`).
  - `ResolvedTabsHost({ useResolved }: { useResolved: () => ResolvedContextTabs | null })` — `const resolved =
    useResolved(); if (resolved === null || resolved.tabs.length === 0) return <the same placeholder>;` else
    `<ContextTabsPanel tabs={resolved.tabs} actions={resolved.actions} />`. (Empty visible set is REACHABLE —
    all `when` false, or contributors-only pre-M8 — so the length-0 guard is required, not defensive.)
- **REWIRE `app-shell.tsx` CONTEXT region** (`:206-213`) to `<RegionAnchor region="context"><SectionContextHost
  key={layout.activeSection} definition={activeDef} /></RegionAnchor>`. **The `key` is REQUIRED** — different
  sections' `useResolved` call different hook sets, legal only across remounts. The context-panel HEADER
  (`:195-201`) reverts to the static "Details" `Text` unconditionally (delete the `ctx?.contextHeader ??`
  branch — F0.2: never fed).
- **GENERALIZE `features/app-shell/components/context-tabs-panel.tsx`** — new props `interface
  ContextTabsPanelProps { readonly tabs: readonly ResolvedContextTab[]; readonly actions?: ReactNode }`.
  DELETE the `section`/`bodies` props, the `CONTEXT_SLOTS` import + `entries = CONTEXT_SLOTS[section]` read. All
  loop bodies now iterate `tabs`; render `tab.node` in each `TabsPanel` (DELETE the `bodies[entry.id] ??
  "Nothing to show here."` fail-soft, `:95` — one object now). KEEP VERBATIM: the store resolve (`contextTab`
  if in the visible id-set else first, `:61-63`), `setContextTab` on change, `MAX_STRETCH_TABS`
  stretch/scroll + measured overflow-fade (`:37-56`), the `actions` row (`:87-91`). REMOVE its export from the
  app-shell front door (`features/app-shell/index.ts:5-6`) — only `SectionContextHost` consumes it now.
- **MIGRATE the four `tabs` sections to the mint** (mechanical — each already has the tab array; wrap in
  `defineContextTabs<S>({ useContextState, tabs, actions? })`):
  - **characters** (`features/character/lib/characters-section.tsx`): `S = CharacterContextState` (now from
    `#lib`). BUILD `features/character/hooks/use-character-context-state.ts` → `export function
    useCharacterContextState(): CharacterContextState | null { const id = useSelectedCharacterId(); return id === null ? null : { characterId: id }; }` (`useSelectedCharacterId` from `#state`,
    `character-selection-store.ts:63`). `actions: (s) => <CharacterActionsMenu characterId={s.characterId} />`
    — the actions menu MOVES from `app-root.tsx:103` into the definition. Tabs unchanged (Field/Links/Options).
  - **presets** (`features/preset/lib/presets-section.tsx`): `S = PresetContextState`. BUILD
    `features/preset/hooks/use-preset-context-state.ts` → `useSelectedPresetId()` (`#state`,
    `preset-selection-store.ts:82`); `null` → `null` else `{ presetId }`. Tabs unchanged (Section/Usage). No
    actions.
  - **corpus** (`features/discovery/lib/corpus-section.tsx`) + **analytics**
    (`features/stats/lib/analytics-section.tsx`): `S = void`. `defineContextTabs<void>({ useContextState: () =>
    VOID_STATE, tabs, … })` where `export const VOID_STATE = undefined as void` lives in `registry-contracts.ts`
    — `useContextState` is always-present and non-null (the section always shows, never suspends), the tabs'
    `body: () => <Tab/>` ignore the arg (corpus/analytics tabs already take no `s`). Sentinel not optional-hook —
    see the RESOLVED note below. Tabs unchanged; the host still remounts per section.
- **worldInfo** (`features/world-info/lib/world-info-section.tsx`): already `context: { kind: "single", body:
  () => <WorldInfoContextBody /> }` — UNCHANGED. The host's `"single"` case renders it. Delete the FLAG note in
  the header.
- **DELETE at M3.1:** `features/app-shell/lib/context-slots.ts` (whole file — `CONTEXT_SLOTS` + `ContextTabEntry`
  - the stale `SectionSlot` prose, §15 correction 7); its export from `features/app-shell/index.ts:14`; the
    `context-slots.ts` allowlist line in `no-parallel-section-map.ts:59`; the five NON-chat entries in
    `app-root.tsx`'s `sectionContext` (`characters`/`corpus`/`analytics`/`presets`/`worldInfo`, `:99-121,155-185`)
    and their now-dead imports (`ContextTabsPanel`, `CharacterActionsMenu`/`CharacterFacetInspector`/… tab
    imports, `CorpusArchetypesTab`…, `AnalyticsModelsTab`…, `PresetSectionInspector`/`PresetUsageContext`,
    `dismissPresetSection`, `useSelectedPresetId`, `useSelectedCharacterId`). KEEP the `chats` bridge entry
    (`app-root.tsx:153`) — it dies at M3.2.
- **No standalone green here — part A does NOT compile on its own.** The mint migration forces the new
  `ContextDefinition` shape, which breaks `chatsSection`'s raw tabs literal at compile; chat's bridge entry +
  its `app-root.tsx` allowlist line survive only TRANSIENTLY within the atomic pass and die in part B. `pnpm
  check` goes green only after part B lands.

**M3-core, part B — chat + the bridge death (the SAME atomic step as part A — no commit between).**

- **PUBLISH the chat projection union** in `registry-contracts.ts` (§15 correction 3):
  `CommittedChatContext { phase:"committed"; chatId; participants; viewerUserId; pendingHostUserId;
  roomOverrides; isHost; multiHumanCapable }` (types from `@orb/contracts/chat` + `@orb/kit/ids`),
  `DraftChatContext { phase:"draft"; draftKey: string; cast: readonly CharacterId[] }`, `type ChatContextState = CommittedChatContext | DraftChatContext`. DELETE the old `ChatContextState` interface from
  `chats-section.tsx:37-45`.
- **BUILD `features/chat/hooks/use-chat-context-state.ts`** → `export function useChatContextState():
  ChatContextState | null`. Reads (all unconditional — rules-of-hooks): `useActiveChatHandle()`,
  `useActiveDraftSeed()`, `useAuthConfig()` (non-suspense, `multiHumanCapable = authConfig?.multiHumanCapable === true`), `useTRPC()`, `useDraftConfig(handle.kind === "draft" ? handle.draftKey : "")` (frozen EMPTY
  off-draft). The `getChat` read uses the `useSuspenseQueries` DYNAMIC-ARRAY idiom (precedent: `DraftMembersTab`,
  `draft-context-panel-surface.tsx:213-215`) — `queries: chatId === null ? [] : [trpc.chat.getChat.
  queryOptions({ chatId })]` — suspends ONLY when committed (no `useGatedQuery`: it's non-suspense and a
  pending→null would flash the placeholder, a lying state). Return: committed →
  `{ phase:"committed", chatId, participants: chat.participants, viewerUserId: chat.viewerUserId,
  pendingHostUserId: chat.pendingHostUserId, roomOverrides: chat.roomOverrides, isHost: chat.viewerIsHost ===
  true, multiHumanCapable }`; draft → `{ phase:"draft", draftKey: handle.draftKey, cast: [...new
  Set([...(draftSeed?.characterIds ?? []), ...(draftConfig.addedCharacterIds ?? [])])] }`; landing → `null`.
- **AUTHOR `chatsSection` as a FACTORY** (§6c seam): `export function makeChatsSection(chatContextContributors:
  ContributorRegistry<ContextTabDef<ChatContextState>>): SectionDefinition`. `context =
  defineContextTabs<ChatContextState>({ useContextState: useChatContextState, tabs: CHAT_CONTEXT_TABS, actions,
  contributors: chatContextContributors })`. `main.tsx` builds `const chatContextContributors =
  createContributorRegistry("chat-context", [])` (EMPTY but typed — a REAL seam, NOT a stub; M8 only appends)
  and passes `makeChatsSection(chatContextContributors)` into `createRegistry`. rail/panelDefaults/placeholder/
  list/content/header on `chatsSection` are UNCHANGED.
- **THE UNIFIED TAB SET** `CHAT_CONTEXT_TABS: readonly ContextTabDef<ChatContextState>[]`, flat declared order
  `members, overrides, group, preview, injections` (order encodes the Members-default — §6b). Each `body`
  narrows on `s.phase`:

  | id | label | `when(s)` | `body(s)` |
  | - | - | - | - |
  | members | Members | committed: `membersTabJustified(s.participants, s.multiHumanCapable)` · draft: `s.cast.length >= 2` | committed → `<CommittedMembersTab {...toMembersTabProps(s)} />` · draft → `<DraftMembersTabBody draftKey={s.draftKey} cast={s.cast} />` |
  | overrides | Overrides | always (no `when`) | committed → `<RoomOverridesTab chatId={s.chatId} roomOverrides={s.roomOverrides} isHost={s.isHost} />` · draft → `<DraftOverridesTabBody draftKey={s.draftKey} />` |
  | group | Group | committed: `s.isHost && resolveIsGroupChat(s.participants)` · draft: `s.cast.length >= 2` | committed → `<CommittedGroupConfigTab chatId={s.chatId} />` (already `QueryBoundary`-wrapped) · draft → `<DraftGroupConfigTabBody draftKey={s.draftKey} />` |
  | preview | Preview | `s.phase === "committed" && s.isHost` | `<AssemblyPreviewPanel chatId={s.chatId} />` |
  | injections | Injections | always | committed → `<InjectionsManager chatId={s.chatId} isHost={s.isHost} />` (QueryBoundary-wrap as `chats-section.tsx` does) · draft → `<DraftInjectionsTab draftKey={s.draftKey} injections={/* read in-body */} />` |

  `actions: (s) => s.phase === "draft" ? <DraftAddMemberPopover draftKey={s.draftKey} existingCharacterIds={s.cast} /> : null`.
  Each `body` returns a COMPONENT (mounts + may use hooks — `TabsPanel` renders the node). `toMembersTabProps`
  moves with `CommittedMembersTab` (below).
- **MOVE (committed bodies) into `features/chat/components/`** — out of the dying surface file: `CommittedMembersTab`
  - `toMembersTabProps` + `toPersonRows` + `toCastRows` + `CommittedMembersTabProps` (from
    `chat-context-panel-surface.tsx:47-59,52-91,233-312`). Update `chats-section.tsx`'s import to the new home.
- **BUILD the three thin DRAFT wrapper components in `features/chat/components/`** — the current
  `DraftContextPanel` inlines these; each becomes a named component that RE-READS `useDraftConfig(draftKey)`
  in-body (a `ContextTabDef.body` is not a hook context, so the read lives in the child):
  - `DraftOverridesTabBody({ draftKey }: { draftKey: string })` — `const cfg = useDraftConfig(draftKey);`
    renders `<RoomOverridesForm entityId={`${ROOM\_OVERRIDES\_ENTITY\_PREFIX}draft:${draftKey}`} roomOverrides={cfg.roomOverrides ?? EMPTY_ROOM_OVERRIDES} isHost={true} save={(o) => { setDraftRoomOverrides(draftKey, o); return Promise.resolve(); }} />`
    (lifts `draft-context-panel-surface.tsx:79-82,104-111` verbatim; `ROOM_OVERRIDES_ENTITY_PREFIX` from
    `lib/room-overrides-form-model`, `EMPTY_ROOM_OVERRIDES` local const).
  - `DraftGroupConfigTabBody({ draftKey }: { draftKey: string })` — `const cfg = useDraftConfig(draftKey);`
    renders `<GroupConfigForm entityId={`${GROUP\_CONFIG\_ENTITY\_PREFIX}draft:${draftKey}`} config={groupConfigSchema.parse(cfg.groupConfig ?? DEFAULT_GROUP_CONFIG)} save={(next) => { setDraftGroupConfig(draftKey, next); return Promise.resolve(); }} />`
    (lifts `:136-145`; `GROUP_CONFIG_ENTITY_PREFIX` from `hooks/use-group-config-form`; `groupConfigSchema`/
    `DEFAULT_GROUP_CONFIG` from `@orb/contracts/chat`).
  - `DraftMembersTabBody({ draftKey, cast }: { draftKey: string; cast: readonly CharacterId[] })` — `const cfg =
    useDraftConfig(draftKey);` wraps the EXISTING `DraftMembersTab` (`:207-242`, moved into
    `features/chat/components/`) in a `QueryBoundary` (`fallback` "Loading roster…", the lift of `:115-124`),
    passing `characterIds={cast} rosterOverrides={cfg.rosterOverrides}`. `DraftInjectionsTab` (`:164-199`,
    keep its `WeakMap` keying comment) also moves into `components/` and re-reads `cfg.injections` in-body via
    `useDraftConfig` (its `body` in the table passes `draftKey` only; the component reads injections itself).
- **DELETE at M3.2 (exhaustive):**
  - `features/chat/surfaces/chat-context-panel-surface.tsx` — WHOLE FILE (`ChatContextPanel`,
    `ChatContextPanelBody`, `resolveActiveTab`; the moved `CommittedMembersTab`/`toMembersTabProps`/`toPersonRows`/
    `toCastRows` now live in `components/`).
  - `features/chat/surfaces/draft-context-panel-surface.tsx` — WHOLE FILE (its bodies moved to `components/`).
  - `features/chat/index.ts` exports `:30-31` (`ChatContextPanelProps`/`ChatContextPanel`) + `:43-44`
    (`DraftContextPanelProps`/`DraftContextPanel`).
  - `app-shell.tsx`: the `SectionContextBridge` interface (`:31-35`), the `sectionContext` prop +
    `contextHeader` (`:38-48`), `const ctx = sectionContext?.[…]` (`:91`), and the header/body `ctx?.` reads
    (`:196,207`) — the whole FLAG bridge.
  - `app-root.tsx`: the remaining `chats` `sectionContext` entry + `chatsContext`/`DraftContextPanel` closure
    (`:89-98,152-153`), the whole `sectionContext={{…}}` prop, and now-dead imports (`ContextTabsPanel`,
    `ChatContextPanel`, `DraftContextPanel`, `worldInfoContext`). **KEEP** `handle`/`draftSeed`/`activeChatId`/
    `activeSection`/`draftCharacterIds` reads — `routeAnnouncement` (`:123-140`) still uses them; keep
    `goToSections` (the command palette). Verify with `pnpm ast` no other consumer before pruning each import.
  - the `app-root.tsx` allowlist line in `no-parallel-section-map.ts:60` + its app-root `mustPass` fixture
    (`:244-248`); the "FLAG\[lockdown-M3]" phrases in that gate's doc-comment/`message`/`fix` (`:53,59-60,177`).
  - EVERY remaining `FLAG[lockdown-M3]` marker (census, verify `grep -r` → 0): the seven `*-section.tsx`
    headers, `app-shell/index.ts`, `app-shell/surfaces/app-shell.tsx`, `tests/client/features/app-shell/_ct-stories.tsx:44`.
- **REWORK the CTs:** `tests/client/features/chat/_ct-stories.tsx` `ChatContextPanelStory`/`DraftContextPanelStory`
  (`:777-802`) — re-pin against the new bodies (mount `SectionContextHost` with a stubbed `useChatContextState`,
  or the moved `CommittedMembersTab`/`DraftMembersTabBody` directly); assert the SAME behaviors (host-only
  Group/Preview, guest hides them, draft cast<2 hides Members/Group, default tab). `tests/client/features/
  app-shell/_ct-stories.tsx:44`'s `sectionContext` story → a `SectionRegistryProvider` + `SectionContextHost`
  story. Delete the `chat/index.ts` re-export refs those stories used.

**M3.3 — the walls.**

- **BUILD G3 `context-definition-shape`** (`scripts/check/gates/context-definition-shape.ts`, ts-morph,
  `scopeSafety: "incremental-safe"`, `status: "active"`). FOUR arms (full spec: `client-architecture-lockdown.md`
  §16 G3 row): (1) object literal with `kind:"tabs"` + a `useResolved` member outside `registry-contracts.ts`;
  (2) `defineContextTabs` call with `tabs: []` AND no `contributors`; (3) a `defineContextTabs` call (or any
  `ContextTabDef<…>` type-ref) whose type arg isn't `void` and isn't an identifier import-resolving to a type
  EXPORTED from `registry-contracts.ts` — `any`/`unknown`/inline literal/index-sig RED; (4) a JSX attr or
  interface member named `bodies` typed `Record<string, ReactNode>` (readonly/Partial incl) under `client/src`.
  `mustFlag`: hand-rolled `{ kind:"tabs", useResolved: () => null }` in a feature; `defineContextTabs<ChatContextState>({ tabs: [] })`;
  a no-type-arg call AND `defineContextTabs<any>(…)`; a prop `bodies: Record<string, ReactNode>`. `mustPass`:
  `defineContextTabs<void>({ useContextState: …, tabs: [{ id, label, body: () => null }] })`; a mint with a
  `registry-contracts`-exported `S` + `when`; a contributors-only mint (`tabs: []` + `contributors`); a
  `Record<string, ReactNode>` NOT named `bodies` (false-positive check). Full house ritual: Core-Enforcement
  row + count bump + a `__g_` fixture OR `UNFIXTURABLE_GATES` entry.
- **AMEND G1** (`section-registry-completeness.ts:52-66`): `wiresRealBody` counts any `context` initializer that
  is NOT the literal `{ kind: "none" }` — including a `defineContextTabs(…)` CallExpression — as a real body
  (today it only inspects a non-`none` object LITERAL, so a planned `context: defineContextTabs(…)` slips
  through). Add the `mustFlag` fixture (a planned section wired `context: defineContextTabs(…)`).
- **AMEND G2** (`no-parallel-section-map.ts`): both FLAG allowlist lines already deleted across M3.1/M3.2 —
  confirm `isAllowlisted` (`:54-62`) is back to {`shell-store.ts`, `main.tsx`, `SECTION_FILE_RE`} and the
  message/fix/doc-comment carry no "FLAG\[lockdown-M3]" phrasing; the two removed `mustPass` fixtures are gone.
- **BUILD the `resolveContextTabs` unit test** (`tests/client/lib/registry-contracts.test.ts` or a
  `resolve-context-tabs.test.ts` mirror): assert when-filtering (a `when: () => false` tab is absent), own→
  contributor order, the cross-set duplicate-id THROW at mint, `null` state → `useResolved` returns null,
  and `actions` binding. This is REAL logic (not a shit test) — the pure resolver is the M3 correctness core.

**M3 UX deltas → route to `side-eye` at verify (NOT silent):** (1) the draft "Cast" label row
(`draft-context-panel-surface.tsx:86-91`) collapses into the strip-trail `actions` (add-member popover only);
(2) draft tab order changes (`overrides, members` → `members, overrides` when cast ≥ 2); (3) both chat panels
lose `useFocusOnMount` — now uniform with the four sections that never focused. All three are consistency
wins; side-eye adjudicates whether any regresses.

**RESOLVED (orchestrator, 2026-07-14 — the executor does NOT re-open this fork):** the `void`-host shape uses
the `VOID_STATE` sentinel — `export const VOID_STATE = undefined as void` in `registry-contracts.ts`;
corpus/analytics mint `defineContextTabs<void>({ useContextState: () => VOID_STATE, tabs, … })`. Chosen over
the optional-`useContextState?` alternative because `useContextState` then stays ALWAYS-PRESENT and is called
UNCONDITIONALLY inside the mint — zero rules-of-hooks risk (the hard constraint), a uniform mint signature, no
conditional-hook branch. `() => VOID_STATE` (return type `void`) is assignable to `() => void | null`, and
`undefined === null` is false, so a `void` host proceeds to `resolveContextTabs` (never the null placeholder,
never suspends). If — against expectation — tsc rejects the assignability, that is a narrow TYPE fix at the
sentinel, NOT a re-open of the design fork. Nothing else in M3 is open.

**M3 verifier "verify" list (per step):** M3.1 — five sections render live via the host; `CONTEXT_SLOTS`
deleted not orphaned; `ContextTabsPanel` off the front door; `pnpm ast flow app-shell.tsx` zero `#features/*`
edges; characters' actions menu renders from the definition. M3.2 — both chat surface files deleted; committed
chat gates correctly (guest: no Group/Preview) AND draft gates (cast<2 hides Members/Group; add-member popover
in the strip trail); landing → placeholder; `grep -r "FLAG\[lockdown-M3\]"` → 0; no `sectionContext`/
`SectionContextBridge`/`contextHeader` anywhere; `SectionDefinition` non-generic (no `SectionDefinition<never>`).
M3.3 — G3 green + `mustFlag` fixtures RED; G1 amended (planned + `defineContextTabs` context REDs); G2
allowlist back to three homes; the `resolveContextTabs` test asserts real behavior; `pnpm check` + `pnpm test`
whole green.

## M4 — ModalDefinition + the modal registry (the section-registry move, applied to modals)

**Extra reading (in full):** doc §6d (the modal registry) + §5 (createRegistry) + §7 (the door) + §16
G1/G2/G13; the M1.cutover + M3 executor specs above (M4 MIRRORS them — same door-registry + context-delivery

- gate FAMILY, NO variance crux). Code: `state/shell-store.ts` (MODAL\_SLOT\_IDS + openModal/openSettingsTo/
  useOpenModal), `features/app-shell/lib/modal-slots.tsx` (MODAL\_SLOTS — dies),
  `features/app-shell/components/modal-host.tsx` (the renderer), `features/app-shell/components/rail.tsx` +
  `lib/rail-slots.ts` (the modal-trigger map — DIES; the rail DERIVES instead) + the topbar/mobile-bar that
  render the command/you affordances, `features/app-shell/components/you-sheet.tsx` (YOU\_MODAL\_ROWS shadow),
  `routes/app-root.tsx:63,94-101`, `main.tsx` (the door), `state/section-registry{,-context}.ts` +
  `scripts/check/gates/section-registry-completeness.ts` (the delivery + type + GATE precedent to MIRROR),
  gates `registry-pairing.ts` (RETIRES) + `modal-body-not-placeholder.ts` + `no-parallel-section-map.ts`.

**THE DESIGN (owner-locked 2026-07-14 — "there's gonna be modals; build it right and tight." The extensible
shape, a STRUCTURAL MIRROR of the section registry).** Modals today are a TWO-LAYER indirection (a
`placeholder:true` `MODAL_SLOTS` registry overridden per-route by `AppShellProps.modals`) AND their
rail/topbar/avatar/mobile affordances are a PARALLEL hand-map (`RAIL_ACTIONS`/`ACCOUNT_ACTION`/`COMMAND_ACTION`

- synthetic `NEW_CHAT_ACTION`/`YOU_ACTION`) — a shadow the lockdown kills (and G2's new ModalSlotId arm would
  flag it, forcing an allowlist dodge). M4 collapses ALL of it into ONE door-assembled `ModalDefinition`
  registry where each modal SELF-DECLARES its trigger, the rail DERIVES its modal affordances from the registry
  (exactly as it already derives sections), and the modal GATE FAMILY mirrors the section gate family.

* **ModalDefinition** (type home `state/modal-registry.ts` — mirror `section-registry.ts`; references
  `ModalSlotId`/`DialogPopupProps`/`LucideIcon`):
  ```ts
  /** WHERE a modal's trigger affordance lives — the rail/topbar/mobile-bar DERIVE from this (no parallel
   *  map). Closed as-const vocab (no-inline-union-redecl); extend the tuple to add a placement. */
  export const MODAL_TRIGGER_PLACEMENTS = ["rail-footer", "avatar", "topbar-command", "content", "mobile-tab"] as const;
  export type ModalTriggerPlacement = (typeof MODAL_TRIGGER_PLACEMENTS)[number];
  export interface ModalTrigger { readonly placement: ModalTriggerPlacement; readonly label: string; readonly icon: LucideIcon; }
  export interface ModalDefinition {
    readonly id: ModalSlotId;
    readonly title: string;
    readonly presentation?: "dialog" | "drawer";
    readonly size?: DialogPopupProps["size"];
    readonly trigger: ModalTrigger;                                     // self-declared reachability
    /** REQUIRED — a real body, or the DECLARED-PLANNED arm (mirror SectionDefinition O1: there WILL be more
     *  modals; an unbuilt one registers `{planned:"<reason>"}`, never a placeholder body). */
    readonly body: (() => ReactElement) | { readonly planned: string };
  }
  ```
* **The 6 defs' placements** (bodies STAY where they are — all already in the owning dir; each `*-modal.tsx` is
  a feature front-door export): theme→`rail-footer` ("Switch theme", SunMoon → ThemePickerSurface);
  settings→`rail-footer` ("Settings", Settings, `size:"xl"` → SettingsShell); account→`avatar` ("Account",
  CircleUser → AccountSurface); command→`topbar-command` ("Jump to…", Command → CommandPaletteSurface);
  newChat→`content` ("New chat", Plus → NewChatPicker; triggered by chat content, not the rail);
  you→`mobile-tab` ("You", CircleUser, `presentation:"drawer"` → YouSheet; app-shell owns `you`). Self-contained
  like sections — the `command` def builds `goToSections` from `useSectionRegistry()` itself (not a prop); ASK
  if any body needs an app-root-only value.
* **The rail/topbar/mobile-bar DERIVE from the registry** (kills the parallel map — the section-derives-the-rail
  pattern, now for modals): rail-footer buttons = `modalRegistry.list().filter(m => m.trigger.placement ===
  "rail-footer")`; topbar ⌘K = the `"topbar-command"` modal; mobile "You" tab = the `"mobile-tab"` modal —
  each rendering `{trigger.label, trigger.icon}` with `onClick={() => openModal(m.id)}`. The `"avatar"`
  placement's DESKTOP affordance is the feature-provided `railFoot` (`PersonaPanelSurface`, route-injected in
  `app-root.tsx`) — the ONE placement rendered by a richer feature surface, not a bare derived button; Rail
  itself renders no avatar fallback. The You sheet still derives its account row from the `"avatar"` modal
  (`modalRegistry.list()`, same as rail-footer). `"content"` modals aren't rail-rendered (chat's new-chat
  button keeps calling `openModal("newChat")`).
* **Delivery = ModalRegistryContext** (mirror `section-registry-context.ts` EXACTLY): `state/modal-registry-context.ts`
  (context + `useModalRegistry()` throwing off-provider) + a `ModalRegistryProvider`; `main.tsx` assembles
  `createRegistry("modals", MODAL_SLOT_IDS, {…6…})` + wraps the provider; `ModalHost` reads
  `useModalRegistry().get(openModal)` blind. app-shell gains NO `#features/*` edge (context value; confirm
  `pnpm ast flow`).
* **DELETE:** `MODAL_SLOTS`+`ModalDef` (`modal-slots.tsx` whole file) + front-door export; `AppShellProps.modals`
  - the `app-root.tsx` override assembly + dead imports; `ModalHost`'s two-layer → `registry.get(openModal).body()`
    with the planned-arm narrow (a `{planned}` body renders its title as a placeholder — mirror the section
    content-none render); **`RAIL_ACTIONS`/`ACCOUNT_ACTION`/`COMMAND_ACTION`/`NEW_CHAT_ACTION`/`YOU_ACTION` + the
    `RailModalEntry` interface** (`rail-slots.ts` — the whole modal-trigger map; KEEP `SECTION_GROUPS`);
    `YOU_MODAL_ROWS` (you-sheet — derive its account/settings/theme rows from `modalRegistry.list()`:
    `{id, label: def.title, icon: def.trigger.icon}`). `openModal`/`openSettingsTo`/etc. UNCHANGED.

**Gates — MIRROR the section gate family** (full ritual each; PROVE each bites a real constructed violation
incl. the scanRoot-fires check per F2/G3; Core-Enforcement rows + count reconciled):

- **NEW `modal-registry-completeness`** (mirror `section-registry-completeness.ts`/G1): every `MODAL_SLOT_ID`
  has a def co-located `features/*/lib/*-modal.tsx` (tsc carries completeness; the gate adds co-location +
  uniqueness); the PLANNED-arm honesty (a `{planned}` with an empty reason, or a planned modal wiring a real
  `body` → RED — mirror G1); the **singleton-placement arm** (the derivation assumes exactly ONE modal per
  `avatar`/`topbar-command`/`mobile-tab`; two claiming a singleton placement → RED; `rail-footer`/`content` may
  repeat); the anti-god-map arm (a `modals={{…}}` object literal in `routes/**`).
- **RETIRE `registry-pairing`** — its rail↔modal bijection is now STRUCTURALLY IMPOSSIBLE to break (the rail
  derives from the registry; tsc carries completeness; every modal self-declares a trigger = reachability). A
  gate whose target (`modal-slots.tsx`) is deleted is the F2 false-confidence trap — DELETE the gate file + its
  Core-Enforcement row + decrement the count. (Confirm zero OTHER feature uses a rail↔modal pairing first with
  `pnpm ast`.)
- **RE-POINT `modal-body-not-placeholder`** → scanRoot the `features/*/lib/*-modal.tsx` defs; a modal whose
  FUNCTION-arm `body` renders `<SectionPlaceholder>` is RED (use the `{planned}` arm — the placeholder-body
  anti-pattern is unspellable). Update mustFlag/mustPass + scanRoot + docRow. (Fold into
  `modal-registry-completeness` if that reads cleaner — keep ONE home for the placeholder rule; your call.)
- **G2 ModalSlotId arm** (`no-parallel-section-map.ts`): read `MODAL_SLOT_IDS` alongside `SECTION_IDS`, same 3
  arms, allowlist {`shell-store.ts`, `main.tsx`, `*-modal.tsx`}. **No dodge needed — `RAIL_ACTIONS` is deleted
  (derived), so nothing parallel survives.** Update the scope comment (SectionId + ModalSlotId; SettingsCategoryId
  staged M6) + ModalSlotId mustFlag/mustPass. A rename (2 vocabs now) is an ASK; else broaden the comment.

**Surprises (in/out):** `you`=drawer, `settings`=xl → PRESERVE. `openSettingsTo` UNCHANGED. `FirstRunPersonaDialog`/
`JoinInviteDialog` (app-root always-mounted) OUTSIDE the ModalSlotId system, NOT M4. No dynamic/programmatic
modals, no cross-feature grafts (verified).

**M4 DONE-GATE (cite each):** `pnpm check` whole green + `pnpm test` green · every modal opens + renders its
real body, triggered from its DERIVED affordance (theme/settings\[xl] rail-footer, account avatar, command ⌘K,
newChat from chat content, you\[drawer] mobile) — drive via run/\_\_orb · `MODAL_SLOTS`/`ModalDef`/
`AppShellProps.modals`/`RAIL_ACTIONS`+the trigger consts/`YOU_MODAL_ROWS` DELETED not orphaned ·
`registry-pairing` retired (file + row gone, count decremented) · `modal-registry-completeness` built + its
singleton/planned/co-location arms each biting a real constructed violation · `modal-body-not-placeholder` +
G2 ModalSlotId arm re-pointed + biting · `pnpm ast flow app-shell.tsx` zero `#features/*` edges · zero banned
hatches · nothing committed. **Routing:** executor build → verifier (type-seam + FULL gate-honesty sweep: new
gate bites, retired gate truly obsolete, singleton arm real) → side-eye (6 modals live from their derived
affordances, esp. drawer + xl). One clean atomic wave, no type-coupling.

## M5 — confirm/row adoption (ConfirmDialog migration + G6/G7)

**Extra reading (in full):** doc §14 (the reuse-primitive law — G6/G7) + §16 G6/G7 + §3 (tier ladder —
ConfirmDialog is tier-2 `components/`); `components/confirm-dialog.tsx` (the composite to EXTEND),
`components/row-actions-menu.tsx` (the established call pattern), the 5 sites, `.dependency-cruiser.cjs` (G7
home), `components/library-row.tsx` + `@orb/ui/primitives/list-row` + the list-surface primitives.

**THE DESIGN.** Migrate every raw `@orb/ui/alert-dialog` destructive-confirm in `features/**` onto the tier-2
`ConfirmDialog`, seal it (G7), and ratchet interactive rows in LIST surfaces (G6). The 5 sites (scout-verified,
all genuine destructive confirms): `chat/anchors/character-gallery-dialog.tsx` (controlled, "Remove this
image?"), `settings/components/admin-user-sessions-dialog.tsx` (controlled, "Revoke all sessions?"),
`settings/components/credential-key-row.tsx` (controlled, `Remove "${label}"?`), `settings/components/workload-row.tsx`
(controlled, "Cancel this workload?" + Cancel="Keep running"), `world-info/components/entry-editor.tsx`
(UNCONTROLLED, ICON trigger, `Delete "${title}"?`, NO description).

- **EXTEND `ConfirmDialog`** (`components/confirm-dialog.tsx`) — the extensible shape (verified: `triggerLabel`
  has ZERO consumers; the only consumer `row-actions-menu.tsx` is controlled): (a) add `cancelLabel?: string`
  (default "Cancel") — workload-row's "Keep running"; (b) make `description?` OPTIONAL (entry-editor is
  title-only; render the description block only when present — a title-only confirm is valid); (c) REPLACE the
  unused `triggerLabel?: string` with `trigger?: ReactNode` — uncontrolled-mode trigger is now ANY caller
  element (entry-editor's icon button; a text case passes `<Button intent="ghost">Label</Button>`);
  ConfirmDialog owns the open state. KEEP controlled mode + confirmLabel/confirmIntent/onConfirm/confirmDisabled/
  confirmLoading. Cover the 3 extensions in ConfirmDialog's CT.
- **MIGRATE the 5 sites** (drop the raw AlertDialog + its buttons; follow `row-actions-menu`): the 4 controlled
  → `<ConfirmDialog open onOpenChange title description confirmLabel confirmIntent="destructive" onConfirm />`
  (workload-row adds `cancelLabel="Keep running"`); entry-editor → uncontrolled `<ConfirmDialog trigger={<icon
  button>} title confirmLabel="Delete" onConfirm />` (no description). DELETE every `@orb/ui/alert-dialog`
  import from `features/**`.
- **G7 `confirm-uses-composite`** (dep-cruiser, `.dependency-cruiser.cjs`): a rule `from: features/** to:
  @orb/ui/alert-dialog` → RED. ConfirmDialog is tier-2 (outside features) so NO exemption; alert-dialog's only
  non-feature importers are the composite + ui tests. Mirror the `client-features-no-cross` rule shape. Confirm
  `imports:depcruise` REDs a planted `features/** → @orb/ui/alert-dialog` import, then passes clean post-migration.
- **G6 `list-row-adoption`** (ts-morph, ratchet — BUILD; full ritual): a **"LIST-region surface file" = a file
  using `LibrarySurfaceShell` OR `LibraryListLayout` OR `createCollectionSurface`** (the entity-list-pane
  primitives — this NATURALLY excludes the R1 carve-out species: message/facet/setting `*-row.tsx` live in the
  content/settings regions, not entity LIST panes, and use none of these primitives). Within such a file, a
  `.map()` callback returning INTERACTIVE JSX (an element carrying onClick/role/href) whose root is NOT
  `ListRow`/`LibraryRow`/an allowlisted composite → RED. Both-ways ratchet: an explicit allowlist for any
  legitimate edge (baseline the current state — list surfaces already root in LibraryRow, so baseline \~zero;
  if a real current offender exists, allowlist it WITH a cited reason, do not weaken the predicate).
  scopeSafety incremental-safe. mustFlag = a hand-rolled interactive `.map()` row in a LIST-surface file;
  mustPass = a `LibraryRow`-rooted `.map()`; a non-LIST-surface file's interactive `.map()`; a message/facet/
  setting-row file (must NOT flag — the carve-out check). PROVE it bites a real constructed offender + passes
  the baseline + does NOT false-positive the carve-out species. If the LIST-surface predicate is ambiguous
  against a real file, ASK the orchestrator.

**M5 DONE-GATE (cite each):** `pnpm check` whole green + `pnpm test` green · ZERO `@orb/ui/alert-dialog`
imports in `features/**` (`pnpm ast importers`) · all 5 confirms render + fire live (drive via run/\_\_orb —
esp. workload-row's "Keep running" cancel + entry-editor's icon trigger + no-description) · G7 REDs a planted
feature alert-dialog import · G6 built + biting a real offender + passing the baseline + NOT flagging the
carve-out species · full gate ritual (rows + count + fixtures/UNFIXTURABLE) · zero banned hatches · nothing
committed. **Routing:** executor build → verifier (G6/G7 gate-honesty — esp. G6's carve-out non-flagging + the
scanRoot/predicate fires — + the ConfirmDialog type-seam) → side-eye (the 5 confirms render/fire, esp. the 2
that exposed API gaps). One clean wave.

## M6 — settings de-god (SettingsPane registry + move panes to owners + G4/G14)

**Extra reading (in full):** doc §8 (the settings host + pane registry) + §18 O2/O3 + §16 G4/G14 + §5/§7; the
section/modal registry PRECEDENT to mirror — `state/section-registry{,-context}.ts`, `state/modal-registry{,
-context,-provider}.tsx`, `scripts/check/gates/modal-registry-completeness.ts`; `features/settings/surfaces/
settings-shell-surface.tsx` (the if-ladder host, `:335`), `features/settings/lib/settings-nav-model.ts`
(`SETTINGS_CATEGORY_IDS`), `data/use-viewer.ts` (`Viewer` — the `when?` type), the 4 `.gitkeep` stubs.

**THE DESIGN.** The settings god-feature (87 files, 12 categories, an if-ladder host) becomes a SettingsPane
REGISTRY (the section/modal move) + a DE-GOD (panes move to owner features). Scout-verified CLEAN: ZERO
cross-feature grafts either direction. **`theme` is a MODAL (M4-owned), NOT a settings category — out of
scope, do not touch.** 12 categories (`settings-nav-model.ts:14`): account · personas · appearance · tags ·
workloads · backup · chat-behavior · regex · connections · automation · system · admin — **3 UNBUILT**
(account, chat-behavior, automation: `built:false`, no surface file).

- **SettingsPaneDefinition** — RULED by Fable 2026-07-14 (§5 rule 6 / §8 "Homes"): the Def homes in
  **`state/settings-pane-registry.ts`** (mirror modal-registry), and `SettingsCategoryId`/`SETTINGS_CATEGORY_IDS`
  are SHELL VOCABULARY that **MOVE to `state/shell-store.ts`** (beside `MODAL_SLOT_IDS` — the shell store already
  navigates by category untyped: `settingsCategory`/`openSettingsTo`; typing them is rule 5 applied). Shape: `{
  id: SettingsCategoryId; group: SettingsGroup; label; icon: LucideIcon; description; when?: (viewer:
  SettingsViewerView) => boolean; subcategories?; body: (() => ReactNode) | { readonly placeholder: true } }`.
  **`when` crosses the tier via a STATE-OWNED PROJECTION** (state cannot import `#data`'s `Viewer` —
  `client-state-below-data`, zero exemptions): `SettingsViewerView { readonly isAdmin: boolean }` lives beside
  the Def; the HOST (features/settings, may import `#data`) computes `{ isAdmin: globalRole==="owner" ||
  globalRole==="admin" }` from its `sessions.me` read and supplies it — the M3 `ContextTabDef<S>` inversion.
  `adminOnly` dies (admin panes declare `when: (v) => v.isAdmin`). `SETTINGS_GROUPS`/`SettingsSubcategory` move
  WITH the Def into `settings-pane-registry.ts` (pane taxonomy, NOT shell-store — the `SECTION_GROUPS`-beside-Def
  precedent). Do NOT type `contextTab` (ruled opaque). `{placeholder:true}` arm for the 3 unbuilt.
  Section-id↔feature-name is NOT a mirror (`personas` → `features/persona`); G4 keys on WHERE the pane lives.
- **Delivery = SettingsPaneRegistryContext** (mirror Section/Modal EXACTLY): `state/settings-pane-registry-context.ts`
  - `-provider.tsx`; `main.tsx` assembles `createRegistry("settings-panes", SETTINGS_CATEGORY_IDS, {…12…})`; the
    host reads `useSettingsPaneRegistry().get(active).body()` blind — the if-ladder dies. Nav derives from
    `registry.list()` (label/icon/group + `pane.when?.(view) ?? true` where `view` is the host-computed
    `SettingsViewerView`); scroll-spy + fuzzy search + `openSettingsTo` KEPT (now typed `SettingsCategoryId`).

**SUB-WAVES (each green + committed):**

- **M6.1 — thin host (panes STAY PUT — behavior-frozen) + G4** \[executor]: build the type + context + provider
  - door assembly registering ALL 12 pane defs CO-LOCATED IN `features/settings/lib/*-pane.tsx` (the 4
    to-move panes register from settings/lib TEMPORARILY — panes don't move yet, doc §17 "panes stay put"); the
    4 settings-forever built panes (appearance/system/tags/regex) wrap their existing surfaces; the 3 unbuilt →
    `{placeholder:true}`; the 5 to-move built panes (personas/admin/connections/workloads/backup) wrap their
    existing surfaces from settings/lib. REPLACE the if-ladder (`settings-shell-surface.tsx:335-365`) with
    `registry.get(active).body()` + the placeholder narrow. Build **G4 `settings-pane-completeness`** (MIRROR
    `modal-registry-completeness`: every `SETTINGS_CATEGORY_ID` has a co-located `*-pane` in the door; duplicate
    id; placeholder honesty — a `{placeholder:true}` pane can't wire a real body & vice-versa; the host imports
    NO pane body directly). Green.
- **M6.2 — the de-god: EXTRACT-SHARED-FIRST, then move (RULED 2026-07-15 — the standard de-god pattern, done)**:
  **PHASE 1 — hoist every shared cross-boundary primitive to its tier BEFORE moving** (a settings util/component
  imported by BOTH a moving pane AND a staying pane can't be cross-feature-imported once panes leave —
  `client-features-no-cross`; the answer is tier-promotion, §3/§12, NOT an exemption): a vocab-typed util/const
  → `#state` (done: `settingsAnchorId` → `state/settings-pane-registry.ts`, typed over `SettingsCategoryId`);
  a shared client composite → `components/` tier-2 (done: `SettingSwitchRow`); a domain-agnostic primitive →
  `@orb/ui` (done: `scrollBehavior` → `@orb/ui/lib`). **PHASE 2 — the 4 moves** (`git mv` pane def + support
  files; fix imports; door imports from the OWNER front door; de-stub the `.gitkeep`): personas → `features/persona`;
  admin → `features/user-admin`; connections → `features/credentials`; workloads+backup → `features/workloads`.
  **Ownership is by CODE-TRUTH not the file list** — `role-slot-row`/`role-status-dot` went to credentials
  (connections-domain, zero admin refs — `pnpm ast refs` proved it), correcting the doc's guess. G4 fires on
  the new co-located `features/*/lib/*-pane.tsx`. `prompt-manager/.gitkeep` STAYS (O2). knip-clean; `pnpm test:ct`
  green.
- **M6.3 — dissolve `settings-shell.css` + G14** \[executor]: the 14-line `.settings-flash-anchor` scroll-spy
  highlight (token-referenced, `settings-shell.css`) dissolves to a SANCTIONED §4 home (a `@orb/ui` variant or
  `client/styles/globals.css` keyframe — NOT app-shell shell.css unless truly shell-structural; the executor
  judges per §4, ASK if unclear). Build **G14 `feature-css-files`** (fs / `client-structure` arm: a `.css`
  under `features/**` outside `{app-shell/surfaces/shell.css}` → RED). Green — settings-shell.css is the last
  feature .css; once gone, G14's allowlist is just shell.css.

**M6 DONE-GATE (overall):** if-ladder GONE (`registry.get(active).body()`); all 12 panes registered (9 built +
3 `{placeholder:true}`); nav derives from the registry; the 4 owner-panes MOVED (3 `.gitkeep` de-stubbed);
zero `#features/settings` ↔ moved-panes imports; `settings-shell.css` gone; G4 + G14 built + biting real
constructed violations; `pnpm check` + `pnpm test` green; drive every category live (built render, unbuilt
placeholder, admin `when`-gated). **Routing:** M6.1 executor → verifier (G4 honesty + registry type-seam) →
side-eye (all 12 categories render/gate); M6.2 mech-executor → verifier (import graph — no settings↔owner
cycle, panes still resolve) → side-eye (panes render post-move); M6.3 executor → verifier (G14 bites a planted
feature .css). Each sub-wave committed.

---

## M7 — tier seals (G5 + G9)

**M7 — tier seals (DONE `9f489aeb`):** G5 (3 dep-cruiser rules: components-tier, lib-below-components,
state-below-components) + G9 (grit query-machine-seals: useMutation/useInfiniteQuery import bans) +
resolved the stale `client-structure` RESERVED corpus note. Pure locks, baseline green — no new shape.

---

## M8 — the chat contributor seam (surface-anchor registry + fake-contributor CTs)

**Extra reading:** doc §6c (the contributor seam) + §17 M8 + §5 (`createContributorRegistry`). MIRROR the M3
context-tab seam (already built, empty): `main.tsx` (`createContributorRegistry<ContextTabDef<ChatContextState>>
("chat-context", [])` → `makeChatsSection`), `chats-section.tsx` (`makeChatsSection` threads it into
`defineContextTabs({…contributors})`), `registry-contracts.ts` (`resolveContextTabs` MERGES own∪contributors,
`when`-filters in declared order, `defineContextTabs` throws on dup id). The content tree the surface seam mounts
into: `chat-content.tsx` → `chat-room-surface.tsx` (the 3 anchor sites) + `message-list-surface.tsx` /
`message-row.tsx` (message-footer per-row).

**THE DESIGN — RULED 2026-07-15 (orchestrator, from the lock-the-shape stance; NOT Fable — this is a clean
discriminated union, not the M3 erasure crux).** The chat-CONTEXT-tab seam is DONE (M3, empty). M8 adds the
chat-SURFACE-ANCHOR seam + the FIRST fake-contributor CTs for BOTH seams. The scout proved the doc §6c sketch
(`{id; anchor; when?; body}` with one `body(state)`) does NOT type — the 3 anchors carry DIFFERENT state
(`thread-flank`/`above-composer` are room-level; `message-footer` is per-message). The refined shape:

- **Anchor vocab (closed `as const`)** in `registry-contracts.ts`:
  `export const CHAT_SURFACE_ANCHORS = ["thread-flank", "above-composer", "message-footer"] as const;`
  `export type ChatSurfaceAnchor = (typeof CHAT_SURFACE_ANCHORS)[number];` — an unlisted anchor is unspellable.
- **Two state projections** (read the content surface for the REAL fields; keep MINIMAL + extensible — do not
  over-include). Publish both in `registry-contracts.ts` (the §6c contract home):
  - `ChatRoomSurfaceState` — room-level, for `thread-flank` + `above-composer` (the `ChatHandle` + only what
    those slots actually need).
  - `ChatMessageSurfaceState` — per-row, for `message-footer` (the `MessageView` for that row).
- **`ChatSurfaceContribution` — a discriminated union BY ANCHOR** (strict per-anchor state, like `ContextTabDef<S>`
  but the anchor picks S). Discriminated-union narrowing by the `anchor` literal types every consumer cleanly —
  this is why it is NOT the M3 variance crux (state is not erased; the literal narrows it):
  ```ts
  export type ChatSurfaceContribution =
    | { readonly id: string; readonly anchor: "thread-flank" | "above-composer";
        readonly when?: (s: ChatRoomSurfaceState) => boolean;
        readonly body: (s: ChatRoomSurfaceState) => ReactNode }
    | { readonly id: string; readonly anchor: "message-footer";
        readonly when?: (s: ChatMessageSurfaceState) => boolean;
        readonly body: (s: ChatMessageSurfaceState) => ReactNode };
  ```
- **Assembly (mirror M3, empty):** `createContributorRegistry<ChatSurfaceContribution>("chat-surface", [])` at
  the door (`main.tsx`); `makeChatsSection` gains a SECOND param `surfaceContributors` →
  `content: () => <ChatContent surfaceContributors={surfaceContributors} />` → threaded as props down to
  `ChatRoomSurface` (room anchors) + `MessageListSurface` → `MessageRow` (message-footer). No React context —
  mirror the explicit factory-param plumbing (the scout confirmed no existing chat-content context to ride).
  Dup id already throws in `createContributorRegistry`.
- **Consumers (render at each anchor; `when`-filter; key by `id`):**
  - `thread-flank` — a CONDITIONAL flank beside the thread: `chat-room-surface.tsx`'s single-child vertical
    `Stack` around the thread becomes a horizontal row ONLY when `≥1` thread-flank contribution passes `when`
    (zero → render exactly today's layout, no flank column, NO visual change).
    `list().filter(c => c.anchor === "thread-flank" && (c.when?.(room) ?? true)).map(c => c.body(room))`.
  - `above-composer` — between `MessageSelectionBar` and `ComposerSlot` in `chat-room-surface.tsx`. Same filter.
  - `message-footer` — inside `MessageRow`'s render, per message. DECIDE ghost/streaming rows — DEFAULT: footers
    on committed message rows only, NOT the ghost/streaming row (ASK if the row types make this ambiguous).
- **CTs — the M8 deliverable (prove the seam LIVE; there is NO fake-contributor CT today for EITHER seam):**
  drive the REAL `ChatContent`/section with a FAKE contributor registry (a `CtFake…Contributors` test seam,
  mirror the existing section/modal CT fakes + `ct-data-providers`). Prove:
  (a) a fake CONTEXT-tab contributor renders as a tab + `when`-gates (the M3 seam — currently only unit-tested
  at the resolver level in `registry-contracts.test.ts`, never mounted);
  (b) a fake SURFACE contribution at EACH of the 3 anchors renders at the right slot + `when`-gates
  (thread-flank appears AND activates the flank layout; above-composer appears; message-footer appears under a
  committed message). Assert BOTH the shown (`when`→true) and hidden (`when`→false) states.

**M8 DONE-GATE:** `pnpm check` + `pnpm test` + `pnpm test:ct` green · `chat-surface` registry assembled empty at
the door (typed) · all 3 anchors wired so a contribution WOULD render (proven by the fake CTs) · thread-flank
flank is conditional — zero contributions → byte-identical layout, no visual regression · CTs prove render +
`when`-gate (shown AND hidden) for BOTH seams (context-tab + all 3 surface anchors) · dup id throws · `pnpm ast
flow` clean (the seam is chat-owned, assembled at the door; rpg/crew don't exist yet) · zero hatches. Routing:
`executor` → `verifier` (the discriminated-union type-seam holds; the empty registry assembles; the CTs assert
REAL gating not just presence) + `side-eye` (chat room renders unchanged at zero contributions; a fake
contribution appears correctly at each of the 3 anchors). ASK if the discriminated union won't type through the
registry, or an anchor has no clean mount.

---

## M9 — bus channel unification (`defineBusChannel` + G10/G11/G12) — SERVER-TIER, security-scoped

**READ FIRST:** `docs/architecture/core/AGENTS.md`; then in `client-architecture-lockdown.md` the WHOLE of **§13**
(the event/sync spine — the 4-bus inventory table, the 6 LAWS each naming its enforcer, the `defineBusChannel`
unification paragraph, E4) + **§16 rows G10/G11/G12** (lines \~500-502) + **§18 O4** (the buddy deferral). Then read
the THREE current bus modules IN FULL: `packages/server/src/transport/trpc/chat-events-bus.ts`,
`user-events-bus.ts`, `notifications-bus.ts`, and the client seam `packages/client/src/data/invalidation.ts`
(`BUS_FILTERS` / `USER_BUS_FILTERS`). This is a DIFFERENT package from the client registry primitives — M9 mirrors
their CONVENTION (a `define*` mint, born-compliant gate), not their location.

**THE WAVE (spec is §13 — this is an extraction + 3 gates, NOT a redesign). Zero behavior change; the existing
server bus int-tests are the ORACLE.** The three modules hand-roll identical machinery three times (module-scope
`EventEmitter` + `setMaxListeners(0)` + `channelFor(key)` + `on(emitter, channel, {signal})` + the untyped-args
unwrap generator). Unify the PLUMBING only:

- **Mint `defineBusChannel<Key, Event>(name)`** at `packages/server/src/transport/trpc/bus-channel.ts` (greenfield)
  returning `{ publish(key, event), subscribe(key, signal), subscribeAll? }` — the exact machinery above, ONCE.
  **`subscribeAll` is a TYPED OPT-IN capability, not always-on** (only chat's `ALL_CHATS_CHANNEL` firehose /
  `subscribeAllChatEvents` needs it): a channel that doesn't declare a firehose must NOT expose `subscribeAll` in
  its type (user/notifications literally cannot call it) — lock the extensible shape (\[\[lock-the-extensible-shape]]),
  don't bolt a universal method that only one bus uses. If the firehose implies `publish` also fans to the firehose
  channel, that fan is part of the declared capability.
- **Migrate the three buses onto it, BYTE-EQUIVALENTLY:**
  - `chat-events-bus.ts` — rides `defineBusChannel` WITH the firehose opt-in (keeps `ALL_CHATS_CHANNEL` +
    `subscribeAllChatEvents`, the buddy chat-observer tap). **Durability stays composed OUTSIDE the primitive** —
    the awaited `chat_events` INSERT that assigns `seq` stays in front of `publish` (law 1 — durable-first); the
    256-entry ring + member-gated replay are UNCHANGED. Do NOT fold durability into the mint.
  - `user-events-bus.ts` — rides `defineBusChannel`, live-only, NO durability half (fire-and-forget by design).
    Both publish fns (`publishUserEvent`, `publishChatChanged`) ride it.
  - `notifications-bus.ts` — rides `defineBusChannel`; the durable INSERT (assigns seq) stays composed OUTSIDE.
  - **Buddy: DO NOT TOUCH** (O4 — its `@orb/kit/replay-buffer` domain-minted emitter is deferred; it is out of
    G10's scope precisely because it is not a transport `EventEmitter`).
- **Build the last three gates (full gate ritual each — descriptor name==filename, inline mustFlag/mustPass, a
  Core-Enforcement-Active-Gates.md row + count bump 80→83, an anti-drift fixture in `check-gates.int.test.ts` OR a
  PROVEN `UNFIXTURABLE` justification). These scan `packages/server` — you MUST prove each gate BITES on a planted
  server-side violation (the scanRoot path-format trap: a ts-morph gate whose scanRoot doesn't actually cover the
  server file passes GREEN while enforcing nothing — plant a real violation, watch it go RED, then remove it via a
  SCRATCH file, never git):**
  - **G10 `bus-channel-primitive`** (ts-morph): `new EventEmitter(` under `packages/server/src/transport/` OUTSIDE
    `bus-channel.ts` → RED. (Buddy's domain-minted bus is not a transport `EventEmitter` — passes as-is.)
  - **G11 `bus-definition-belts`** (ts-morph): a `*_EVENT_TYPES satisfies Record<X["type"], true>` const in
    `@orb/contracts` with NO matching coverage-gate file OR no client-side total map in `data/invalidation.ts` →
    RED (a new bus can't ship missing the chat bus's belt set — law 4/5).
  - **G12 `membership-fan-guard`** (ts-morph): under `domain/chat/**` a single-user emit identifier
    (`emitUserEvent`) → RED (member-visible state rides the member-fan `emitChatChanged` or the chat bus, never an
    actor-only channel — law 2, the security-scoped fan).

**M9 DONE-GATE:** `pnpm check` green (the full static battery — now 83 gates) · the full server+client test suite
green, with the bus int-tests (`tests/server/domain/chat/bus.int.test.ts`, `bus-golden.suite.int.test.ts`, the
user-bus + notifications int-tests) PASSING UNCHANGED — they are the byte-equivalence oracle; if any bus test
needed editing to pass, that is a behavior change and is WRONG (STOP and report) · `defineBusChannel` is the sole
transport `EventEmitter` home (G10 proves it) · chat keeps durable-first ordering + the firehose; user stays
live-only; notifications stays durable-first — all three behaviorally identical to pre-M9 · buddy untouched ·
G10/G11/G12 each PROVEN to bite on a planted server violation · zero `any`/hatches. Routing: `security-executor`
(server transport + member-scoped event fan-out + the G12 isolation guard) → `verifier` (byte-equivalence: diff
each bus's publish/subscribe path against pre-M9 and confirm the int-test oracle is unedited; the three gates bite;
`subscribeAll` is genuinely absent from user/notifications' types). ASK if byte-equivalence forces a real behavior
choice, or if a gate's server scanRoot can't be made to bite.

---

## M10 — auto-overlay (docked panels auto-overlay below the width breakpoint)

**READ FIRST:** `docs/architecture/core/AGENTS.md`; then in the docs: `UI-Architecture-and-Layout.md` §4.1 (the
3-state panel model docked/overlay/collapsed + "auto-overlay below a width breakpoint") + §4b axis 2 (the shell
is the sole legal viewport-`@media` site), and `client-architecture-lockdown.md` §17 M10 + §16 **O6** ("build it
proper — the §4.1 behavior is real committed law"). Then the code IN FULL: `state/shell-store.ts`
(`PANEL_MODES`, `panelOverrides` \[persisted], `mobileViewport`/`setMobileViewport` \[device-transient]),
`features/app-shell/hooks/use-shell-layout.ts` (`resolvePanel` — the gap), `features/app-shell/hooks/
use-is-mobile-viewport.ts` (the `no-raw-matchmedia` LEGAL HOME, `MOBILE_QUERY = "(max-width: 48rem)"`),
`features/app-shell/surfaces/shell.css` (the ONE `@media` + the overlay clamp), `features/app-shell/surfaces/
app-shell.tsx` (`PanelChrome` `mode` prop + the `.shell-scrim`).

**THE DESIGN — RULED 2026-07-15 (orchestrator, both forks from the lock-the-shape stance; NOT Fable — the
overlay machinery ALREADY EXISTS, this is a derivation + one signal, not a rewrite).** The `overlay` PanelMode
and its rendering (the §11.1 clamp, the scrim keyed to `scrimVisible`, `PanelChrome mode="overlay"`, the
outside-interaction collapse) are ALL already wired end-to-end. `resolvePanel` simply never PRODUCES `"overlay"`
on the desktop branch today. **DO NOT rebuild overlay rendering — make `resolvePanel` produce `overlay` in a new
narrow-desktop regime.**

- **Fork 1 — the second breakpoint (RULED): a "shell-narrow" breakpoint at 64rem (1024px)**, wider than the
  48rem mobile breakpoint → a 3-regime ladder: **wide** (>64rem, docked) · **narrow-desktop** (48–64rem,
  auto-overlay) · **mobile** (<48rem, `mobileSheet` UNCHANGED). Add it as a SECOND matchMedia signal
  `narrowViewport` published into `#state` EXACTLY like `mobileViewport` — a `SHELL_NARROW_QUERY =
  "(max-width: 64rem)"` const in the `no-raw-matchmedia` legal home (`use-is-mobile-viewport.ts` or a sibling in
  that same sanctioned file), the `useSyncExternalStore`+`matchMedia` hook, a `setNarrowViewport` shell-store
  setter, published in `useShellLayout`'s effect. **NO new CSS `@media` block** — overlay is MODE-gated rendering
  (PanelChrome branches on `mode`), not `@media`-gated, so the signal is matchMedia-in-JS (same mechanism as
  `mobileViewport`) and "the one app-shell `@media`" (the 48rem column flip) stays the only CSS `@media`. 64rem
  is a single tunable constant; side-eye validates it at widths straddling the boundary.
- **Fork 2 — override semantics (RULED): auto-overlay is PURE DERIVATION, zero new persisted state.**
  `resolvePanel`'s desktop branch becomes (mobile branch first, unchanged, takes precedence):
  ```ts
  if (isMobile) return mobileSheet === panel ? "overlay" : "collapsed";     // unchanged
  const resolved = override ?? registry.get(activeSection).panelDefaults[panel];
  return narrowViewport && resolved === "docked" ? "overlay" : resolved;    // the M10 line
  ```
  This satisfies EVERY §4.1 clause with no schema change: a `docked` resolution auto-collapses to `overlay` below
  64rem; RESTORES to docked on re-widen (the persisted `panelOverrides` is NEVER mutated by resize — the
  derivation is stateless); the user override WINS INSIDE EACH REGIME (an explicit `overlay`/`collapsed` override
  passes through unchanged in BOTH regimes; only a `docked` resolution downgrades, and only while narrow). No
  auto-vs-explicit flag, no second override slot — the derivation IS the model (lock-the-shape: nothing to
  corrupt). `narrowViewport` is device-transient (NOT persisted), exactly like `mobileViewport`.

**M10 DONE-GATE:** `pnpm check` green (STILL 83 gates — NO new gate; `no-raw-matchmedia` already covers the new
query, so it MUST live in the sanctioned legal home, never a feature — confirm) · `pnpm test` + `pnpm test:ct`
green · a `docked` panel resolves `overlay` in 48–64rem and `docked` >64rem and `mobileSheet` <48rem (the 3-regime
derivation) · an explicit `collapsed`/`overlay` override is identical across all three regimes · the persisted
`panelOverrides` value is BYTE-UNCHANGED after a narrow→wide→narrow resize round-trip (assert it — the derivation
must not write) · mobile `mobileSheet` behavior unchanged · a CT proving `resolvePanel`'s output per regime for a
docked panel + pass-through for an explicit override. Routing: `executor` → `verifier` (the regime precedence
isMobile→narrow→wide; NO store mutation on resize; the second matchMedia is in the legal home; `mobileSheet`
untouched) + `side-eye` (LIVE per the north-star §9 loop: snap at widths straddling BOTH 48rem and 64rem, flat +
ramped, ± glass — panels flow docked→overlay→sheet, scrim correct, NO layout jank at the boundary, the persisted
docked choice restores on re-widen). ASK if 64rem proves wrong under side-eye, or the existing overlay rendering
doesn't cleanly render an auto-overlayed (previously-docked) panel.

### M10 CORRECTION (2026-07-15, after verifier + side-eye P0) — auto-overlay = CLOSED-by-default slide-over

The first M10 pass shipped `resolvePanel: narrow && resolved === "docked" ? "overlay" : resolved`. Both lenses
refuted it: **(side-eye P0)** M10 is the FIRST path to put a docked-DEFAULT panel into `overlay` mode outside
mobile, and `overlay` mode's CSS renders a panel OPEN (slid-over + scrim). So an auto-overlayed panel floated
open over content ON LOAD, occluded the topbar toggle (desktop overlay CSS lacks the topbar-row `inset-block`
clearance the mobile rule at `shell.css:~391` already has → real pointer click times out), and clicking that
toggle mis-fired `togglePanel`'s binary `collapsed?docked:collapsed` into a PERSISTED `collapsed` that then stuck
past re-widen. **(verifier)** `useListDocked` (`shell-store.ts`) — a hand-copied mirror of `resolvePanel` — was
left reading only `mobileViewport`, so it disagreed with `resolvePanel` in 48–64rem and broke chats-landing
`showRecents` (bug #13 inverted). §4.1 is explicit: **overlay = "zero width closed, slides over on demand."** So
auto-overlay must resolve a docked panel to a CLOSED slide-over, openable on demand — NOT open-on-load.

**THE CORRECTED MODEL (ruled — build to the §4.1 law, O6):**

- **The 3 modes are: `docked` (in-column) · `overlay` (slid-over, OPEN) · `collapsed` (zero-width, CLOSED).** A
  slide-over panel that is CLOSED renders as `collapsed`; OPEN renders as `overlay`. "Which slide-over is open" is
  ONE regime-agnostic field: **rename `mobileSheet` → `openOverlayPanel: PanelName | null`** (device-transient,
  NOT persisted → no migration; it already IS this concept, just mis-named for one regime). Mobile behavior stays
  BYTE-IDENTICAL under the rename.
- **`resolvePanel`** (precedence isMobile → narrow → wide):
  ```ts
  if (isMobile) return openOverlayPanel === panel ? "overlay" : "collapsed";     // unchanged semantics
  const resolved = override ?? registry.get(activeSection).panelDefaults[panel];
  if (narrowViewport && resolved === "docked")                                    // auto-overlay: CLOSED by default,
    return openOverlayPanel === panel ? "overlay" : "collapsed";                  //   OPEN only when triggered
  return resolved;                                                                // explicit overlay/collapsed pass through
  ```
- **ONE shared docked-ness/mode algebra in `#state`** that BOTH `resolvePanel` and `useListDocked` consume, so
  they cannot drift again (the verifier's finding is exactly the drift a shared primitive prevents). `useListDocked`
  \= "list resolves to `docked`" through the SAME function (mobile → false; narrow&\&docked-default → false \[it's a
  closed slide-over]; wide&\&docked → true). Sweep for ANY other hand-rolled "is panel docked/visible" derivation
  and route it through the shared function too.
- **The topbar toggle (`togglePanel`)**: when the panel is in an overlay regime (mobile OR narrow-auto-overlay),
  it OPENS/CLOSES via `openOverlayPanel` (ephemeral) — mirror the EXISTING mobile open/close path, do NOT write a
  persisted `panelOverrides` flip. Only in the WIDE regime does the toggle do the persisted docked⇄collapsed flip.
  A closed auto-overlay panel's toggle → opens it; an open one → closes it (scrim-dismiss already does this
  correctly — converge on the same `collapsePanel`/close path).
- **CSS**: the desktop `overlay`-OPEN panel must adopt the same `inset-block` topbar-row clearance the mobile
  overlay rule already uses (`shell.css` desktop overlay rule \~241-261 ← mirror the mobile rule \~386-410), so an
  OPEN overlay never occludes the topbar controls. Closed = `collapsed` = zero width, no occlusion.

**CORRECTED DONE-GATE:** everything in the original M10 done-gate PLUS: a docked-default panel is CLOSED
(`collapsed`, content full-width, NO scrim) by default in 48–64rem — NOT open-on-load; the topbar toggle OPENS it
(slides over, scrim, topbar controls still clickable — a REAL Playwright click on the toggle, not just a resolve
assertion) and closes it; opening/closing in the narrow regime does NOT write `panelOverrides` (ephemeral
`openOverlayPanel` only); `useListDocked` agrees with `resolvePanel` at every width (add a CT mounting the REAL
chats landing at 900px asserting `showRecents` correctness — the verifier's gap); mobile `openOverlayPanel`
(renamed) behavior byte-identical. Re-run BOTH `verifier` (the shared algebra; no persisted write on
narrow-open/close; mobile rename byte-identical) AND `side-eye` (LIVE: closed-by-default at 900px, toggle opens
without occlusion, scrim, re-widen restores docked, mobile unchanged).
