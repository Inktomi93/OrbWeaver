---
kind: law
status: active
updated: 2026-09-05
---

# Client Architecture Lockdown

> **RATIFIED 2026-07-14 — all eight open decisions resolved by the owner; §18 records the rulings (O2 and O4 stay flagged as tracked follow-ups by explicit choice).** **PROMOTED to `core/` 2026-07-15: M0–M11 COMPLETE — all 14 gates G1–G14 (+ G23) are LIVE (`Core-Enforcement-Active-Gates.md` count 133); O2 is closed (`feature-owns-definition` live); the lockdown is CLOSED.** **§6b was refined POST-RATIFICATION by the M3 design pass (2026-07-14, owner-authorized): the `ContextDefinition<S>` generic became the `defineContextTabs<S>` mint over a non-generic `ContextDefinition` — the variance proof in §6b is why. O5's ruling (strict typing) is unchanged; only its MECHANISM moved to the mint. The M3 corrections in §15 were pulled forward so docs+code stay in lockstep for the M3 executor.** Precedence after promotion: D-ledger → the core `UI-*.md` set → this doc. It BUILDS ON standing law and never restates it: the Discord/region model + settings taxonomy are `UI-Architecture-and-Layout.md` §4.1–§4.3, the reuse primitives are `UI-Primitives-and-Reuse.md` §13, the enforcement families are `UI-Gates-and-Lessons.md` §8. Every code claim was verified against source 2026-07-14 (full-file reads + ast-grep/grep sweeps); where the commissioning brief disagreed with code, the CODE version is recorded, marked **\[CORRECTED]**.
>
> **Audience: a zero-context agent.** Every rule here is (a) spelled out — nothing implicit, (b) backed by a machine gate that goes RED on violation wherever gateable (§16 names each gate; prose is the WHY, the gate is the WALL), (c) demonstrated by a worked example where a mechanism is involved. Start at §1 (the decision table); read depth only for the row you hit.

**The one-sentence thesis:** composition drifted because a section/pane/tab was smeared across parallel static maps no gate forced to agree — the fix is ONE registry primitive, definitions co-located with their owning feature, exactly one assembly at the composition root, and a gate on every seam, so a half-registered section, a god-feature, a shadow map, a god-map route, or an under-fanned event is structurally impossible.

## 0. TL;DR — the non-negotiables (one screen)

1. **Five tiers, one direction:** `@orb/ui` → `components/` → `{data,forms,state}/` → `lib/` → `features/`; routes + `main.tsx` compose on top. A feature imports DOWN only; features never import each other at runtime (dep-cruiser).
2. **Ordinary features touch ZERO CSS.** No `className`/`style` on a raw intrinsic element anywhere in client src (ESLint, LIVE), and no feature owns a stylesheet except the one enumerated shell-frame path (G14). The six homes, their responsibilities, and that bounded exception live in §4; do not restate the vocabulary here.
3. **One registry primitive, no static maps.** A section / settings pane / modal / contributor is ONE co-located definition, assembled ONCE at the composition root. A second `Record<SectionId, …>`-style map anywhere else is RED (G2). "Derive, don't re-declare."
4. **The `/` route is a thin mount.** No `sections={{…}}` god-map, no feature imports in a route body. The registration door is the ONLY place feature definitions/contributors are imported and assembled (G1/G8) — and since the #43 boot code-split the door is TWO modules: `main.tsx` (boot) + `client/src/compose/` (the assemblies, behind the `/` route's lazy boundary). §7 states the split and why.
5. **Cross-feature needs have exactly one channel each** — the eleven-row decision table is §12: ephemeral client state (and navigation) → the `state/` commons; another feature's server data → `trpc.*` (cache-first — NOT a network round-trip when cached); **EXTENDING another feature's surface → a CONTRIBUTOR registry assembled at the door** (ten families live; this is the graft channel); shapes → contracts/type-only; composites → `components/`; a feature's own Content↔Context → its editor-bridge (INTRA-feature only). Anything else is a violation.
6. **Every mutation rides `createEntityMutation`; every paginated browse rides `createCollectionSurface`; every ≥3-field form rides a form factory; every destructive confirm rides `ConfirmDialog`** (G6/G7/G9 + LIVE form gates).
7. **Every suspending read sits in `QueryBoundary`; every surface ships designed empty/loading/error states** (§11). A bare spinner or an unhandled throw is a defect.
8. **Events:** shared-room truth rides the durable seq-stamped chat bus; per-person freshness rides the user bus; both are exhaustively applied and producer-ratcheted; the invalidation seam is the only client event→cache router (§13). A new bus without the full belt set is RED (G11).
9. **A green `pnpm check` proves structure, not logic** — but a RED one proves you broke a law above. Run it; read the FULL output.

## 1. IF YOU ARE ABOUT TO… (the cold-agent's first stop)

| You are about to build… | The ONE right move | NOT | Wall |
| - | - | - | - |
| a new rail section | a `SectionDefinition` in `features/<owner>/lib/`, exported on the front door, added to the `main.tsx` assembly (§6, example E1) | entries in rail/panel/placeholder/context maps + a route branch | G1/G2 + tsc |
| a rail section whose content ISN'T BUILT yet | a full `SectionDefinition` with `content: { planned: "<reason>" }` — the sanctioned PLANNED state (§6a; refinery is the founding member) | a rail entry with no registration; shipping half-wired | G1 |
| a settings group | a `ConfigGroupDefinition` (a `sections` SKIMMER) owned by YOUR feature + one `ConfigSectionContribution` per anchored section, both registered at the root (§8, example E2) | a surface inside `features/settings` + an if-ladder branch; a `surface` render hand-stamping anchors | G4 (`config-group-completeness`) + tsc |
| a tab on the chat context panel from ANOTHER feature | a `ContextTabDef` contributor with a `when` predicate, registered in `main.tsx` (§6c, example E3) | importing `#features/chat`; editing the chat panel | G8 + `client-features-no-cross` |
| a modal | a `ModalDefinition` owned by your feature (self-declares its `trigger`), registered at the root (§6d) | a body in app-shell's `MODAL_SLOTS` + a route override; a `RAIL_ACTIONS`-style parallel trigger map | `modal-registry-completeness` + G2 |
| an entity list row | `@orb/ui/list-row` or `#components` `LibraryRow` | a hand-rolled interactive row | G6 |
| a browse/list over a PAGINATED collection | `createCollectionSurface` | hand-wired `useInfiniteQuery` + list | G9 (seal) |
| a small bounded list (one-shot fetch) | `useSuspenseQuery` + `LibrarySurfaceShell`/`LibraryListLayout` | `createCollectionSurface` ceremony; a bespoke shell | R1 |
| a create/update/delete | `createEntityMutation` | raw `useMutation` + cache surgery | G9 (seal) |
| a destructive confirm | `#components` `ConfirmDialog` | raw `@orb/ui/alert-dialog` in a feature | G7 |
| a form (≥3 fields OR validation OR save/draft) | `createAutosaveEntityForm` (D66 A4) / `createSavedEntityForm` where law says button-gated | hand `useAppForm`/controlled soup | `form-factory-for-multifield` (LIVE) |
| a read that can suspend/fail | `useGatedQuery`/`useSuspenseQuery` inside `QueryBoundary`; error UI = `QueryErrorState` (§11) | bare `useQuery` + `isPending` ladders; a spinner | LIVE data gates + R4 |
| reading ANOTHER feature's server entity | `trpc.*` queryOptions — cache-first, deduped by key (§12) | importing the feature; copying the data into a store | `client-features-no-cross` |
| reading the active chat/section/selection | the `state/` commons hooks (`useActiveChatHandle`, …) | a trpc call for an id that lives client-side | §12 matrix |
| cross-section navigation | `#state` module actions (`setActiveSection` + seed) | prop-drilling a callback; importing the target feature | §5.1 (LIVE) |
| your feature's CONTENT talking to its own CONTEXT inspector | that feature's editor-bridge (`createFormHandleBridge`) | using a bridge ACROSS features; a global event emitter | §12 row 6 |
| a new domain event / bus | add to the union + types-const, emit durable-first, map in `invalidation.ts`, coverage-gate (§13, example E4) | an ad-hoc EventEmitter; an actor-only emit for shared state | G10/G11/G12 + LIVE ratchets |
| observing production readiness and dev tooling state | `lib/app-ready-signal.ts` for the lean production signal; `lib/agent-bridge.ts` for the DEV-only observer surface | importing the dev instrumentation graph from production or importing features to introspect them | §12 row 11 |
| styling ANYTHING | follow §4's paint law: token value → `tv()` skin → primitive layout; a shell-frame mechanism is the bounded exception, so STOP and flag it for shell-tier ownership | raw values; a new `.css` file; `className` on a `<div>` | ESLint keystone + token gates + G14 |
| a shared domain-aware composite (2+ features need it) | `components/` (tier 2) | copy-paste per feature; stuffing it into `@orb/ui` | R2 + `ui-cake` |
| a new client store | one of the 3 doors (`createGatedStore`/`createPersistedStore`/`createEntityDraftStore`) in `state/` | bare zustand `create()`; fields on an existing store past the cap | `state-files` + persist gates (LIVE) |

## 2. The failure analysis (what actually broke — code-verified)

**§2 records the PRE-LOCKDOWN state** — the structures it names were the disease; most are now deleted (see §17's completed waves). Read it as the as-was diagnosis, not the current tree.

Two mechanism failures, zero spec failures — §4.2/§13 law was right and ignored-by-structure:

1. **Composition lived in parallel static maps.** A rail section is smeared across SIX structures: `SECTION_IDS` (`state/shell-store.ts:12`), `RAIL_SECTIONS` + `SECTION_PANEL_DEFAULTS` (`features/app-shell/lib/rail-slots.ts:51,88`), `CONTEXT_SLOTS` (partial — `lib/context-slots.ts:18`), `SECTION_PLACEHOLDER_COPY` (`lib/section-placeholder-copy.ts:14`), and the `sections={{…}}` map in `routes/home-page.tsx:260`. Only the total `Record`s are tsc-forced; `CONTEXT_SLOTS` and the route map are `Partial` — so **`refinery` half-exists** (rail entry + defaults + copy; no context tabs, no route body, no `features/refinery/` dir) and nothing is RED.
2. **The settings shell is a hand-if-ladder over a god-feature.** `features/settings/` holds 86 files spanning nine domains (admin · appearance · backup · connections/credentials · persona · regex · system · tags · theme · workloads); `SettingsPane` (`settings-shell-surface.tsx:335`) maps category→surface by if-ladder, so a `built: true` category missing a branch silently renders the placeholder — the settings twin of the refinery bug. Four feature dirs are `.gitkeep` stubs (`credentials` · `prompt-manager` · `user-admin` · `workloads`) whose UI lives inside settings.

Slot census (verified): 5 shell registries in 3 incompatible shapes (discriminated-union array · total `Record` · partial `Record`) + one SHADOW — `YOU_MODAL_ROWS` (`you-sheet.tsx:22`) re-declares rows `RAIL_ACTIONS`/`ACCOUNT_ACTION` own. CONTEXT has four incompatible wirings: registry-tabs (characters/presets/corpus/analytics via `ContextTabsPanel`), chat's bespoke internal `<Tabs>`, worldInfo's single direct body, refinery's nothing. Only RAIL↔MODAL has a bijection gate (`registry-pairing`); `ContextTabsPanel` fail-softs a missing body to "Nothing to show here." with no gate. `ROLE_SLOTS` (`settings/lib/connections-model.ts:63`) is a connection-domain namesake, not shell anatomy.

**\[CORRECTED] — three brief claims the code refutes:**

- *"The paint rule is ungated."* FALSE — the compose-only keystone is LIVE ESLint (`eslint.config.js:87-100,370-400`), covering ALL of `packages/client/src`, three exact exemptions (§4).
- *"16 bespoke mutation hooks bypass `createEntityMutation`."* STALE — all 16 `use-*-mutations.ts` import the factory; a features-wide sweep finds ZERO raw `useMutation(` call sites (2026-07-13 consolidation).
- *"12 raw AlertDialog / 13-of-18 hand-rolled rows."* PARTIALLY STALE — raw `@orb/ui/alert-dialog` importers in features are FIVE (`chat/anchors/character-gallery-dialog.tsx`, `settings/components/{admin-user-sessions-dialog,credential-key-row,workload-row}.tsx`, `world-info/components/entry-editor.tsx`), all destructive confirms bypassing `ConfirmDialog`. Of 18 `*-row.tsx` files 9 import `ListRow`/`#components` — and 4+ of the other 9 are NOT drift (message/facet/setting rows are different anatomy). Filename is the wrong gate predicate (§14).

## 3. The five-tier reuse ladder (the canonical client layering)

The client is FIVE tiers, not "ui + features". A builder reaches DOWN this ladder before hand-rolling anything; each tier names its enforcer. `packages/client/src/components/` is hereby canonized as tier 2 — it exists (`confirm-dialog` · `row-actions-menu` · `library-row` · `library-surface` · `entry-list-editor` · `character-picker` · `regex-editor-dialog`; barrel `components/index.ts`), and the 2026-07-13 consolidation proved the need: 13 hand-rolled rows and 12 raw confirms accumulated while these composites sat unbuilt.

| Tier | Home | What belongs | May import | Enforcer |
| - | - | - | - | - |
| 1 primitives | `@orb/ui` | domain-AGNOSTIC parts (Button, ListRow, Dialog, setting-row) | kit + sealed satellites | resolver physics + `ui-cake` + `ui-satellite-seals` (LIVE) |
| 2 composites | `client/src/components/` | domain-AWARE cross-feature composites with no single feature owner (ConfirmDialog, LibraryRow, CharacterPicker) | ui · kit · contracts · `#data` · `#forms` · `#state` · `#lib` · siblings — NEVER `features/`/`routes/` | **dep-cruiser `client-components-tier` (G5, built M7)** — 3 LIVE rules in `.dependency-cruiser.cjs`: `client-components-tier` + `client-lib-below-components` + `client-state-below-components` |
| 3 factories/seams | `client/src/{data,forms,state}/` | the wiring machines: `createEntityMutation`, `createCollectionSurface`, `QueryBoundary`, form factories, the invalidation seam, the state commons + 3 store doors | per the existing direction rules | `client-data-direction` · `client-forms-direction` · `client-state-below-data` (LIVE) |
| 4 util floor | `client/src/lib/` | cross-cutting display/util seams (time, notify, test-ids, weave-glyph, message-render, message-role-labels, theme-override-form, agent-bridge) + the NEW registry primitive | ui/kit/contracts only — reaches UP to nothing in-client | `client-lib-floor` (LIVE; extend to forbid lib→components, G5) |
| 5 features | `client/src/features/` | the slices (per-slice shape: `features/README.md` — surfaces/anchors/components/hooks/lib/index.ts); compose tiers 1–4, never each other | everything below + type-only cross-feature | `client-features-no-cross` · `client-feature-front-door` (LIVE; verified zero live cross-feature imports) |

Above the tiers: `routes/` composes features (never the reverse — `client-features-below-routes`, LIVE) and `main.tsx` is the top nothing imports (`client-nothing-imports-main`, LIVE). Their jobs are §7.

**The COMPOSITION-TIER DIRECTORY MODULE (added 2026-08-03, F-3 — the pattern existed unwritten and unwalled).** A top-level `client/src/<name>/index.ts` sitting BESIDE `main.tsx` is a sixth, door-owned residency class — not a tier. What earns it: **dev-only glue that must compose feature FRONT DOORS plus `#state` module actions and is injected into the agent bridge.** Five members today, all `index.ts`-only: `agent-nav/` (the `__orb.nav` impl — every arm calls the EXACT store action the real UI calls, ids validated against the vocabulary tuples), `agent-seed/` (the `__orb.seed` impl — every write is the EXACT `rpg.*` wire verb the real UI sends), `agent-rpg/` (the `__orb.rpg` read impl), `agent-plugin/` (the `__orb.pluginLog` read impl over the production `plugin.list`/`plugin.getLog` reads), and `agent-handles/` (the ASSEMBLY: it composes the other four and calls `installAgentDebugHandle`, so `main.tsx` can reach the whole dev bridge through ONE `import.meta.env.DEV` dynamic import — #433, §7). They cannot live at tier 4: `lib/agent-bridge.ts` declares the handle TYPES, and `client-lib-floor` forbids the floor from importing `#state`/`#features`/`#data`, which the impls need. They are not features (they own no registered definition — G23) and not routes (`app-root.tsx` is the only route that may import a feature front door — G1's anti-god-map arm). **The wall: `client-composition-tier-door-only` (dep-cruiser, LIVE) — only `main.tsx` imports them** (a sibling composition-tier module may compose another; they are all door glue). Without it, `features/x → agent-nav → features/chat` is a backdoor to a foreign front door on which every individual hop passes `client-feature-front-door` AND `client-features-no-cross`.

**BUCKET NESTING IS LEGAL IN EVERY BUCKET, and it changes NO rule (ruled 2026-08-03, F-4).** A bucket may group its modules into sub-dirs (`features/preset/components/{prompt-assembly,readout}/` is the founding precedent, and chat's 75-file `components/` is why). Grouping is presentation for the reader — it never alters a file's ROLE — so `client-structure`'s per-file contracts (surface naming + surface purity, `use-*` hooks, container-suffix anchors) **RECURSE to any depth**. Before F-4 they did not: `filesIn` read only the top level, so `surfaces/thread/foo.tsx` with its own `<Drawer>` root shipped gate-green and the containment law (§4, the responsiveness model itself) would have rotted invisibly. What nesting may NOT do is re-declare the bucket axis: a group dir NAMED after a bucket (`components/hooks/`, `surfaces/anchors/`) is a slice growing inside a slice while the file contracts still key on the OUTER bucket — `client-structure` rule 8 makes it RED, and rule 4 (known buckets only) keeps keying on the feature ROOT.

**Tier-placement rule:** a domain-aware composite needed by ≥2 features belongs in `components/`, never duplicated per-feature — §13.0's bar (3+ AND changing together) decides *when* to hoist; two features sharing decides *where* (tier 2, not a feature, not `@orb/ui` — ui stays parts-only per the `components/index.ts` header ruling). `jscpd` (tsx scanned, 5% threshold) is the standing tripwire; the hoist itself is review R2.

**What IS a feature (ENFORCED under O2):** a feature dir earns its existence by owning ≥1 registered definition — a rail section, a modal, a settings pane, a chrome widget, or (since the config rail's R1) a config COLLECTION. The O2 gate `feature-owns-definition` is LIVE: a feature dir owns a co-located `lib/*-{section,modal,pane,chrome,collection}.tsx` or it is deleted. No exemptions. (`collection` joined for the migration that took tags/regex out of the settings modal: their whole product surface is a member LIBRARY contributed to the Configuration workspace, so they own a `*-collection.tsx` and no pane — see `docs/design/config-rail-spec.md`.)

## 4. The paint law — who may write CSS, and WHY

### 4.1 The rule

**Every reusable portable visual VALUE is a conformant DTCG token; every component SKIN is a `tv()`
variant; LAYOUT is an `@orb/ui` primitive. A generated value that inherently depends on the CSS runtime is
explicit vendor-extension data, never a fake token type. CSS is legal in exactly the six homes below, and a
feature is not a seventh home.** This is a path-closed set: a CSS file outside these paths is a defect even
when its declarations use tokens.

### 4.2 The six homes — closed by path

| Home | What it is | Hand-written? |
| - | - | - |
| `packages/ui/src/tokens/tokens.json` | THE reusable-value source: stable DTCG tokens/value-set composition plus schema-validated `orb.cssValues` metadata for generated values that cannot be portable. Edit → `pnpm --filter @orb/ui tokens:build` regenerates | yes (the source) |
| `packages/ui/src/styles/theme.css` | generated Tailwind `@theme` plus seed `[data-theme]` value sets — DO NOT EDIT. The value-set sources are `packages/ui/src/tokens/themes/*.json`; there is no authored `ui/src/styles/themes/**` tier | NO — generated by `tokens.build.ts`, freshness-enforced |
| `packages/ui/src/styles/globals.css` | ui's universal CSS mechanism tier: imports, UA/vendor normalization, reduced-motion and reset floors, shared keyframes, masks/formulas, and primitive-wide treatments — never product/shell styling | yes, only when CSS itself is the mechanism |
| `packages/ui/src/styles/tiers.css` | density-tier slot map: semantic slot names repoint to DTCG token steps | yes (token references only) |
| `packages/client/src/styles/globals.css` | client-wide CSS mechanisms: document appearance/defers, capability-query treatments, reading rules, and bounded recipes shared above features — never a component skin or shell-frame rule | yes, only when token/`tv()` composition cannot express it honestly |
| `packages/client/src/features/app-shell/surfaces/shell.css` | the app frame: shell geometry, region paint, responsive regime, and coordinated compositor motion — never component skins | yes — the ONE feature-tier stylesheet |

`packages/ui/src/**/variants.ts` is not a CSS home. It is the component-skin mechanism: `tv()` composes token utilities and may not mint values or stylesheets.

### 4.3 Placement and literals

Route by responsibility, not merely by path: reusable values and palettes originate in the token vault;
nonportable custom-property outputs live under its validated `orb.cssValues` extension;
generated theme output only reflects those sources; ui globals own universal browser/CSS mechanisms; tiers
map density semantics; client globals own client-wide appearance, reading, and capability treatments; shell
owns the frame's geometry, structural paint, and coordinated motion; `variants.ts` owns component skins. An
authored stylesheet expression is legal only when CSS itself is the mechanism and it belongs to that home's
named responsibility; it carries a local WHY and a test or gate pin. The allowed path is not a dumping-ground
license, and the vendor extension is not a second token vocabulary or a place for feature paint.

When a builder needs paint, add a conformant token value in `tokens.json`; when its generated output cannot
exist outside the CSS runtime, add an explicitly owned `cssValues` entry instead of lying about `$type`;
otherwise add a semantic density slot in `tiers.css` or a component variant/primitive in `@orb/ui`. Client
features compose those mechanisms. Raw colour, spacing, radius, shadow, motion, and z-index values are illegal
outside the expressly structural shell literals below; an unknown or unsupported utility/token name is not a
harmless extension — it resolves to no declaration and must be added to the governed vocabulary first.

Owner-authored custom CSS is user data, not a seventh repository CSS home. It enters through `CustomThemeStyle` after `validateThemeCss`, is deliberately unlayered so the owner wins, and targets the stable `data-slot` and `.shell-*` API. The validator warns on `@import`, rejects `position: fixed`/`sticky`, and the contracts schema caps the field at `THEME_CSS_MAX`. The complete trust and validation contract lives in `UI-Theming-and-Content.md` §12; this exception never licenses raw literals or another authored stylesheet in source.

### 4.4 Why `shell.css` is the exception

Verified against the file on 2026-08-31, `shell.css` owns the shell's structural surfaces and layout algebra:
rail/list/context track arithmetic and the zero-width sentinel, co-motion variables, one viewport media query,
and specificity-ordered elevation. Density repointing lives in `tiers.css`; #951 moved the historical compact
arm there with rendered parity so shell no longer owns density semantics. Its panel motion uses FLIP because
animating dynamic grid tracks produced a recorded `0.2774` layout shift; the transform path preserves the
zero-layout-shift contract and the reduced-motion arm still settles transforms immediately. That FLIP is
the CSS-owned-delta shape (JS stamps `data-list-flip`, `shell.css` owns distance and keyframes); the rule
for when a FLIP may compute its delta in JS instead is NOT restated here — `motion-and-animation-guide.md`
§1.5 is its one home (2026-09-02, #1069).

Its structural literals are limited to viewport units, grid ratios and zero sentinels, query conditions, and per-site alpha composition. Everything else wants a token. `shell.css` does contain colour declarations: all 56 are token-sourced and it contains zero raw colour literals. That paint is legal because it belongs to the shell's own region fills, seams, scrim, and elevation; a component's skin never lands there.

### 4.5 The two cascade mechanisms

**Unlayered is the mechanism.** Tailwind v4 emits utilities into `@layer utilities`; an unlayered rule beats a layered utility regardless of specificity. That is how `theme.css` and `tiers.css` repoint a primitive's utility-backed defaults and how ui's document floors stay floors. There are zero `@layer` blocks in the authored CSS, and that count must remain zero. Owner-authored custom CSS is also deliberately unlayered so the owner wins within the validation boundary in §4.3.

**Source order is load-bearing.** Production and Playwright CT both import `packages/client/src/styles/index.ts`, the one CSS front door: it imports `shell.css` first, then client globals, whose first import is UI globals. Thus the effective source order is shell → UI globals → client globals. Client globals and shell contain overlapping selectors at identical specificity, so reversing them can silently change the winner. CT adds only its `tests/` Tailwind source root through `playwright/index.css`; it carries no product import or product source. `playwright-css-topology` derives and closes this graph from the shared front door. Moving an import changes the cascade contract and requires an explicit law change.

### 4.6 Polarity has one mechanism

`light-dark()` arms selected by `color-scheme` are the only sanctioned polarity mechanism. `ThemeScope` derives
`color-scheme` from the palette's measured black-vs-white contrast through `surfacePolarity`, so custom themes and native
controls resolve the same polarity without enumerating theme names. A `dark:` variant keyed to named
`[data-theme]` values cannot see a custom theme's derived polarity and is therefore a defect, not a second
supported path. #954 deleted the authored `@custom-variant dark` declaration. Its replacement gate consumes
the repaired whole-project static-class provenance substrate and passes the focused cross-file/alias/member/
array/object/template and false-positive matrix; the grouped CSS-train barrier graduated that contract.

### 4.7 Enforcement and honest holes

Every row below is ENFORCED TODAY — the CSS-prevention program's REPORTED-BUT-UNREAD and OPEN categories are
empty as of #953. A named boundary (the last paragraph of this section) is still not a category: never count
one as enforcement, and never promote a row here without its gate, floor, or test.

- **ENFORCED TODAY:** the colour/value/motion gates constrain authored values; `playwright-css-topology`
  makes production and CT share the ordered product CSS graph while keeping the CT-only source explicit; G14
  (`sanctioned-css-homes`) path-closes repository-owned product CSS to the six-home table and fails on a
  missing home; compose-only keeps client intrinsic paint out of features; class-merge seals and tests
  preserve primitive ownership. The sanctioned homes are path permissions, not proof that every declaration
  inside them is correct.
- **ENFORCED TODAY:** #951's `css-family-ownership` responsibility wall, #956's semantic-writer proof,
  \#955's length ownership, #954's polarity rule, and #949's single configured class-merge provenance all
  graduated the grouped CSS barrier. #972 then proved 413 previously opaque static `tv` observations in each
  ownership gate; the remaining 508 observations are genuinely runtime-assembled, and the repository has no
  `cva` package, lockfile entry, import, or call population. Static proof therefore stops at a measured
  boundary instead of inventing a grammar for a zero population.
- **ENFORCED TODAY:** #950/#975 prove the final browser cascade through the revision-pinned official DevTools
  frontend SDK. A declaration for which `propertyState(property)` is `null` is a legitimate unclassified SDK
  row and is skipped before the denominator; mixed populations retain their classified `Active`/`Overloaded`
  rows, while zero classified declarations remain `INSTRUMENT ERROR` except for the explicit
  `allowComputedDefault` arm. The same-revision closure is 479 resources / 9,853,687 bytes, including the two
  transitively discovered formatter-worker assets. Vite's blank rule URLs recover repository provenance only
  from the authoritative `data-vite-dev-id` stylesheet header. The six live cascade queries returned
  structured nonzero results with 1,891 requests, zero failed requests, and zero page errors.
- **ENFORCED TODAY:** `css-var-defined` rejects unresolved static `var(--x)` references and
  declaration-proven arbitrary-variable utilities. Its definition set includes generated tokens, authored
  declarations, explicit fallbacks, exact CSSProperties-backed runtime writers, and the installed Base UI
  custom-property contract; all vendor/runtime rows are stale-armed in both directions and the gate prints
  its definition/reference/source populations.
- **ENFORCED TODAY:** `tokens-contract` validates the hash-pinned DTCG 2025.10 Format/Resolver schemas,
  structured portable values, exact Light/Mocha seed membership, bounded Hearth/Light/Mocha Resolver,
  explicit `orb.cssValues` output roles and `theme|root` placement, removed portable paths, and exact CSS
  target identity. Its scanned-entry denominator is the base/Light/Mocha constituent sum pinned by
  `tests/tooling/token-contract.test.ts` and printed on the gate's own scan line, and it fails loud on
  schema/hash/zero-population/Git-history blindness. The type-directed emitter preserves ThemeScope, polarity, carried palettes, runtime formulas,
  and owner custom CSS; #936's frontier cold review is the implementation receipt.
- **ENFORCED TODAY:** #953 wired the dead/empty CSS census into a blocking floor. `pnpm snap --dead-css`
  evidence is no longer a warning report nobody reads: the appearance-invariant evaluator
  (`tooling/src/snap/ops/appearance-invariants.ts`) reddens a cell on any dead or empty CSS identity, and
  treats a zero denominator, an unreadable sheet, or an unsettled `motion-dead-class-flagger` drain as
  INSTRUMENT ERROR. Matrix cells compare identities rather than totals, so a same-count replacement cannot
  pass.
- **ENFORCED TODAY:** #953's rated appearance floors. One policy-neutral planner
  (`tooling/src/_shared/variant-matrix.ts`) feeds the public Snap and design-audit verdict consumers;
  Snap's `--matrix --motion <selector>` reuses the retained pure planner/verdict engine in `tooling/src/motion-audit` without a second parser or browser path. The literal R1–R7 invariant policy has one home
  at `packages/client/src/lib/appearance-invariant-manifest.ts`. Route mode is the only R1–R7 verdict
  owner; scenario mode publishes `not-applicable: scenario-owned-drive` rather than counterfeiting one.
  \#976's exact settled-subject and requested/resolved/actual theme accounting and #977's
  requested/applied/actual browser identity are its trustworthy inputs. The full contract, the rejected
  alternatives, and the cold graduation receipts live in `docs/design/953-appearance-invariant-matrix.md`.

Runtime-assembled class strings remain outside static proof. Their named backstop is the rendered side-eye sweep. That is a named boundary, not permission to widen the set.

**Auto-overlay is REAL committed behavior (ratified O6 — build to the law, never amend the law down):** UI-Arch §4.1's "docked panels auto-`overlay` below a width breakpoint (the one app-shell `@media`)" is BUILT at M10 (`de513984`) — the shell gains the desktop auto-overlay. Below the 64rem shell breakpoint a docked-default side panel becomes a **CLOSED slide-over** (renders `collapsed` — content reclaims the width), **openable on demand** (it slides over with a scrim); `overlay` is the OPEN state, `collapsed` the CLOSED state (§4.1's "zero width closed, slides over on demand"). It restores to docked on re-widen. The "which slide-over is open" tracker is the regime-agnostic device-transient `openOverlayPanel`; ONE shared `resolvePanelMode` algebra in `#state` is consumed by BOTH `resolvePanel` and `useListDocked` so they cannot drift. `togglePanel`/`collapsePanel`/`toggleFocus` write `openOverlayPanel` (ephemeral) in the overlay regime and the persisted `panelOverrides` only when wide — so a resize NEVER mutates the stored preference; Escape closes the open slide-over (yielding to an open modal). The 64rem breakpoint is a second `matchMedia` signal (`narrowViewport`) in the `no-raw-matchmedia` legal home — overlay is MODE-gated rendering, not `@media`-gated, so the one app-shell CSS `@media` (the 48rem mobile column flip) stays the only one. **User override wins inside each regime:** an explicit `overlay`/`collapsed` override passes through unchanged in BOTH regimes; only a `docked` resolution auto-closes, and only while narrow — and an explicit `docked` override is ALSO slide-over-closed while narrow (docked is unavailable there by definition; the override's intent is honored by restore-on-widen). The mobile regime (`<48rem`) is the SEPARATE, narrower regime below it and is unchanged (the same `openOverlayPanel` tracker, renamed from `mobileSheet`, byte-identical behavior).

## 5. The registry primitive — ONE mechanism, three applications

**`createRegistry<Id, Def>` (NEW, home `client/src/lib/registry.ts`)** replaces every parallel static map:

```ts
/** Total, closed, validated at construction. Throws on unknown-id get. */
function createRegistry<Id extends string, Def>(
  name: string,
  ids: readonly Id[], // the vocabulary tuple, imported from its ONE home
  definitions: Record<Id, Def>, // TOTAL by tsc — a missing/extra member is a compile error
): Registry<Id, Def>; // read-only: get(id) · list() (ids order) · has(id)

/** Open-ended contributor list (no fixed vocabulary) — the cross-feature extension seam. */
function createContributorRegistry<Def extends { id: string }>(
  name: string,
  contributions: readonly Def[], // duplicate ids THROW at construction
): ContributorRegistry<Def>;
```

Binding rules (each is a §16 gate or tsc):

1. **No side-effect registration.** A definition is an exported VALUE on its feature's front door; the composition root imports and assembles. A mutating `register()` API is banned — import-order nondeterminism and hidden tree-shaking hazards are exactly how a zero-context model "registers" by accident.
2. **Exactly one assembly per registry, at the registration door (§7)** — `createRegistry(`/`createContributorRegistry(` call sites anywhere else are RED (G8).
3. **Completeness is tsc.** The `Record<Id, Def>` assembly is total over the vocabulary tuple — adding a `SECTION_IDS` member fails compile until a definition is registered. The gate half (G1) adds what tsc can't see: co-location and uniqueness.
4. **The anti-hardcode law:** a keyed static map covering the id space outside {the vocabulary tuple, definition files, the one assembly} is RED (G2). This kills the next `SECTION_PANEL_DEFAULTS` and the next `YOU_MODAL_ROWS` before it ships. Derive, don't re-declare — `MOBILE_PRIMARY_SECTIONS` already derives from `RAIL_SECTIONS`; that shape is the standard.
5. **Vocabulary tuples keep their one home, and that home is `state/shell-store.ts` for ALL shell vocabulary:** `SECTION_IDS`/`MODAL_SLOT_IDS`/`PanelMode`/`CONFIG_GROUP_IDS` (the last — born SETTINGS\_CATEGORY\_IDS, re-keyed by the config revamp #866 S1 into its own `state/config-group-ids.ts` — MOVED to state at M6 — ruled M6.1; it was born in `features/settings/lib/settings-nav-model.ts`, but `settingsCategory`/`openSettingsTo` already lived in the shell store as bare `string`, i.e. it was always shell vocabulary, just untyped). State owns the shell vocabulary so features import from state, never the reverse — the shell-store header law; `client-state-below-data` makes the reverse impossible. **The vocabulary test (M6.1):** an id union IS shell vocabulary iff it keys a door-assembled TOTAL registry whose definitions span features, or appears in `ShellState`/a shell action — settings categories hit both. An open-ended id a single host interprets (`contextTab`) is NOT vocabulary — it stays an opaque `string` in the store BY DESIGN; do not "type" it. Registries CHECK against the tuple; they never re-spell it.
6. **A Def's higher-tier need INVERTS to a projection; the Def never moves up (M6.1 ruling — the general form of §6b/M3):** every registry `*Definition` homes in `state/` (it binds state-owned vocabulary to render shapes — the `section-registry.ts` header law; `modal-registry.ts` repeats it), and `client-state-below-data` stays exemption-free (verified: no `dependencyTypesNot` — even `import type` from `data/` is RED). When a Def member needs a `data/`-tier value type (e.g. viewer gating), the Def declares a NAMED state-owned PROJECTION consumed contravariantly (`when: (v: SettingsViewerView) => boolean`), and the HOST — a feature, which may import `#data` — computes and supplies it at filter/render time. Vocabulary needs pull DOWN into shell-store (rule 5); data needs invert to projections (this rule); a tier exemption or a feature-tier Def home is never the answer. The projection homes beside its Def; hoist to `lib/registry-contracts.ts` only when a second party (contributors, another registry) needs it without importing state — the §6c posture.

Applications: sections (§6) · settings panes (§8) · contributors (§6c) · modals (§6d). Recursion is the point — the shell hosts sections, settings hosts panes, the chat lane hosts contributors — all the same primitive, all completeness-checked, zero god-maps.

## 6. The section model

### 6a. SectionDefinition (absorbs six structures)

> **The block below is ILLUSTRATIVE, not copyable — the law is the header of
> `client/src/state/section-registry.ts` (§15a records the deltas).**

```ts
interface SectionDefinition {
  readonly id: SectionId;
  /** RAIL_SECTIONS entry: label · icon · group ("primary"|"authoring"|"insight") · mobilePrimary? */
  readonly rail: RailEntry;
  /** SECTION_PANEL_DEFAULTS entry — the boot default; the persisted per-panel override wins. */
  readonly panelDefaults: Record<PanelName, PanelMode>;
  /** SECTION_PLACEHOLDER_COPY entry — distinct (title, description), gate-checked. */
  readonly placeholder: SectionPlaceholderCopy;
  readonly list?: () => ReactNode;
  /** REQUIRED — a real content pane, or the DECLARED-PLANNED arm (below). A section with neither
   *  is structurally impossible (the refinery bug). */
  readonly content: (() => ReactNode) | { readonly planned: string };
  readonly header?: () => ReactNode;
  /** REQUIRED — `{kind:"none"}` is an explicit decision, never an absence. */
  readonly context: ContextDefinition;
}
```

- One definition per section, co-located `features/<owner>/lib/<id>-section.ts`, exported on the front door. Section-id↔feature-name is NOT a mechanical mirror (`corpus`→`features/discovery`, `analytics`→`features/stats`, `chats`→`features/chat`) — ownership is declared by WHERE the definition lives; G1 keys on location, never name derivation.
- Definitions are self-contained: they read `#state` (selection pointers), `#data` (trpc/Query, `useInvalidation`), `#components`/`@orb/ui` directly. Verified feasible: today's `home-page.tsx` prop-closures are \~all wrappers over `#state` module actions (`selectChat`, `goToLanding`, `startNewChat`, `openModal`) the owning feature may call itself (§5.1's writer rule); `multiHumanCapable` is a trpc read any feature can make cache-first.
- `AppShell` stays domain-agnostic: it consumes the registry (`sections.get(active)`) instead of a `Partial<Record<…>>` prop; `<Activity>` pane-keeping (`section-content.tsx`) and `useShellLayout` are untouched — `panelDefaults` merely arrives from the registry.
- **`SectionDefinition` is NON-generic (final, post-M3).** The M1.cutover shipped it as `SectionDefinition<S=void>` erased to `<never>` at the door (`state/section-registry-context.ts`) — a scaffold for a consumer that computed `S` off the registry. M3's §6b mint makes `context` a `ContextDefinition` that has already applied `S` (S never crosses the shell seam), so the generic and the whole `<never>` apparatus are DELETED: `SectionDefinition` drops its type param, `SectionRegistry` becomes `Registry<SectionId, SectionDefinition>`, and `main.tsx`'s `<…, SectionDefinition<never>>` annotation is gone. `lib/registry.ts` is untouched.

**The PLANNED state (ratified O1 — refinery is the founding member).** A real, planned-but-unbuilt section registers FULLY with `content: { planned: "<the tracked reason>" }` — the shell renders the definition's own `placeholder` copy for its CONTENT. The state is deliberately narrow, and G1 holds all four walls:

1. the `planned` reason is a non-empty string (the tracked citation — the bus-coverage DEFERRED discipline applied to sections);
2. a planned section is FULLY placeholder: no `list`, no `header`, `context: { kind: "none" }` — a "planned" section that also wires real bodies is the refinery bug wearing a badge, RED;
3. the exemption is SELF-CLEANING BY CONSTRUCTION, stronger than a ratchet: the planned marker and the real body are the SAME field, so building the section forces deleting the marker in the same edit — a stale exemption is unrepresentable, not merely detected;
4. what stays RED is the truly-half-wired legacy shape: a rail-visible section with no registration at all.

So a section id is always in exactly one honest state — FULL, DECLARED-PLANNED (with a reason), or ABSENT from the tuple — and limbo is unspellable.

**E1 — worked example: register a section (the RIGHT way).**

```ts
// features/discovery/lib/corpus-section.tsx  (co-located with its owner)
export const corpusSection: SectionDefinition = {
  id: "corpus",
  rail: { label: "Corpus", icon: Library, group: "primary", mobilePrimary: true },
  panelDefaults: { list: "docked", context: "collapsed" },
  placeholder: { title: "Corpus", description: "Search across every thread…" },
  list: () => <CorpusListAnchor><CorpusListSurface /></CorpusListAnchor>,
  content: () => <CorpusContent />, // reads its own selection store internally
  context: defineContextTabs<void>({
    useContextState: () => VOID_STATE,   // Corpus has no shared context state — the S = void sentinel
    tabs: CORPUS_CONTEXT_TABS,
  }),
};
// features/refinery/lib/refinery-section.tsx — the founding PLANNED member (O1)
export const refinerySection: SectionDefinition = {
  id: "refinery",
  rail: { label: "Refinery", icon: FlaskConical, group: "authoring" },
  panelDefaults: { list: "collapsed", context: "collapsed" },
  placeholder: { title: "Refinery", description: "Score → rewrite → analyze a character card…" },
  content: { planned: "refinery design set parked in proposed/ — owner keeps the section; build pending" },
  context: { kind: "none" },
};
// main.tsx (the registration door, §7) — the ONE assembly; total over SECTION_IDS (tsc)
const sections = createRegistry("sections", SECTION_IDS, {
  chats: chatsSection, characters: charactersSection, corpus: corpusSection,
  worldInfo: worldInfoSection, presets: presetsSection,
  refinery: refinerySection, analytics: analyticsSection,
});
```

The WRONG way it replaces: adding a `RAIL_SECTIONS` entry + a `SECTION_PANEL_DEFAULTS` key + a `SECTION_PLACEHOLDER_COPY` key + a `CONTEXT_SLOTS` key + a `sections={{…}}` branch in a route — five files, four of which you can forget (refinery forgot two and shipped).

**THE `SECTION_IDS` COUPLED-SITE PLAYBOOK (added 2026-08-03, F-8 §8).** The registry killed the parallel *maps*; a change to rail MEMBERSHIP (adding a section, retiring one, re-homing a surface between the rail and settings) still touches a fixed set of sites, and tsc only carries three of them. Walk this list — in this order — for every tuple edit; nothing here is optional and nothing here is derivable from a grep of the id:

1. **`state/shell-store.ts`'s `SECTION_IDS` tuple** — the ONE home (§5 rule 5). **Tuple ORDER IS RAIL ORDER**, so an append is a visual decision, not a formality.
2. **The persisted-state sanitizers in the same file** — `isSectionId` (the `migrate()` guard for `activeSection`) and the per-section `panelOverrides` sanitize. A RETIRED id must fall back cleanly for a user whose storage still names it; an ADDED id needs no code but does need its `panelDefaults`.
3. **The definition + its factory + the feature front-door export** — co-located `features/<owner>/lib/<id>-section.tsx` (G1 keys on LOCATION, never on name derivation), and the `main.tsx` door row. tsc's total `Record<SectionId, SectionDefinition>` carries exactly this one.
4. **Per-section selection stores** — a rail workspace with a list drills into something; the pointer is a `createDrillSelectionStore` mint in `state/` (G27), centrally homed so a sibling can read it (§9).
5. **`agent-nav/`'s vocabulary validation** — `__orb.nav` validates against `SECTION_IDS` and REJECTS with the tuple; a retired id must stop being reachable, an added one must be drivable, or the tooling lens lies about the app.
6. **`tests/support/ct/ct-data-providers.tsx`** — the REAL section registry AND the `fakeSection` fold, one of the two hand-maintained door MIRRORS (D120's other is the partition test). tsc reds the `Record` here too, but the mirror's INTENT — a shell CT sees real siblings — is a judgment call per edit.
7. **Mobile fate** — `rail.mobile` (`MobileCuration`) is an EXPLICIT per-section decision, `"tab"` (curated thumb-reach bottom bar) or `"sheet"`; there is no default, and the bottom bar is a curation, not a projection (D121(C)'s brand-cell rule is the adjacent call).
8. **Chrome derivation** — `assembleChrome` reads `sections.list()`, so the rail/topbar entries are SELF-UPDATING. Verify, never edit: an entry you had to hand-add is a G2 parallel map forming.
9. **Placeholder copy** — `placeholder-copy-registry` requires a DISTINCT (title, description) per section; a copied-from-a-sibling placeholder is RED, and it is also the home-tile gloss (the copy has no "left pane" to point at).
10. **The rail prose** — `UI-Architecture-and-Layout.md` §4.1's section list and any spec naming the roster.

A membership change that MOVES a surface between the rail and the Settings section does this surgery twice: once here, once on the `CONFIG_GROUP_IDS` twin (the tuple + the group def + the door + `config-section-partition.test.ts`'s partition mirror).

### 6b. ContextDefinition — the `defineContextTabs<S>` mint (STRICTLY typed — ratified O5, refined by the M3 design pass)

`S` (a section's context-state projection) appears ONLY in contravariant positions (`when: (s:S)=>bool`, `body: (s:S)=>ReactNode`) — which is exactly why `SectionDefinition<S>` erased cleanly to `<never>`. But CONSUMING a tab means PRODUCING an `S` and calling `body(s)`. Any channel that hands `S` to the blind shell — a `useContextState: () => S` hook, a render-prop — is a COVARIANT position: `() => ChatContextState` is NOT assignable to `() => never`, so it BREAKS the never-erasure. TS has no existentials; a `SectionDefinition<never>` registry can NEVER type-safely round-trip `S`. **So don't round-trip it.** Pair `S` with its consumer INSIDE the definition file (where `S` is a real named type) via a mint that returns a NON-generic `ContextDefinition` carrying an ALREADY-RESOLVED `useResolved` hook. `S` never crosses the shell seam.

> **The block below is ILLUSTRATIVE, not copyable — the law is the header of
> `client/src/lib/registry-contracts.ts` (§15a records the deltas).**

```ts
// lib/registry-contracts.ts (tier 4 — the mint lives WITH its shapes)
/** S = the host section's OWN context-state projection — a real named type, never any/unknown (O5). */
interface ContextTabDef<S> {
  readonly id: string;
  readonly label: string;
  /** Absent = always visible. THE dynamic axis — subsumes chat's isHost/group/members conditionals. */
  readonly when?: (state: S) => boolean;
  readonly body: (state: S) => ReactNode;
}

/** What the shell renders — S already applied. NON-generic: the host closed over its own projection. */
interface ResolvedContextTab {
  readonly id: string;
  readonly label: string;
  readonly node: ReactNode;
}
interface ResolvedContextTabs {
  readonly tabs: readonly ResolvedContextTab[]; // when-filtered, own tabs then contributors, declared order
  readonly actions?: ReactNode; // strip-trail actions, already state-bound
}

type ContextDefinition = // ← NON-generic — S never appears here
  | { readonly kind: "none" }
  | { readonly kind: "single"; readonly body: () => ReactNode }
  | { readonly kind: "tabs";
      /** A React hook, minted ONLY by defineContextTabs (G3 wall). null = nothing selected → the shell
       *  placeholder. May suspend. */
      readonly useResolved: () => ResolvedContextTabs | null };

interface ContextTabsSpec<S> {
  /** A module-level named `use*` fn (rules-of-hooks lint must see it); may suspend; null = no selection. */
  readonly useContextState: () => S | null;
  readonly tabs: readonly ContextTabDef<S>[];
  readonly actions?: (state: S) => ReactNode;
  /** §6c — injected at the door (M8); merged after own tabs at the mint, same `when` gating. */
  readonly contributors?: ContributorRegistry<ContextTabDef<S>>;
}

/** THE mint. Throws at construction on a duplicate tab id (own ∪ contributors). `useResolved` is a named
 *  hook closure over `spec`: read `useContextState()`, return null on null state, else `resolveContextTabs`. */
function defineContextTabs<S>(spec: ContextTabsSpec<S>): ContextDefinition;
```

- **Why this is the ONLY viable shape.** It is simultaneously STRICT (O5 — `S` is spelled ONCE, at the mint call, checked against the published projection), ERASURE-FREE (`S` is confined to the pure parametric `resolveContextTabs<S>(spec, state)`, which only pipes `useContextState`'s output into the same spec's `when`/`body`/`actions` — the correlation is carried by the object, re-established generically, ZERO casts), CONTRIBUTOR-TYPED (the spec's `contributors: ContributorRegistry<ContextTabDef<S>>` typechecks against the host's `S` — a contributor reading a field the projection lacks is a compile error), and BLIND AT THE SHELL (the shell only ever sees the non-generic `ContextDefinition`). The alternatives all fail one axis: a consumer-side cast (`registry.get("chats").context as ContextDefinition<ChatContextState>`) is a lie tsc can't check; a typed per-key `get` accessor is sound but needs an id→S type map + a per-id switch + per-section projection recipes IN app-shell (the smear re-forming). See §15.
- Tab id + label + `when` + body are ONE object — the `CONTEXT_SLOTS`↔`bodies` split (registry in app-shell, bodies route-injected, missing body fail-softs to "Nothing to show here.") dies structurally; no bijection gate needed where no bijection can break.
- `when` generalizes `chat-context-panel-surface.tsx`'s proven conditionals (`showMembers` floor-gated, `showGroup`/`preview` host-only); the `resolveActiveTab` posture survives inside `ContextTabsPanel`: active = the store's `contextTab` if visible, else the FIRST VISIBLE tab — never nothing. **The Members-default is encoded by tab ORDER** (members declared first → the generic resolve reproduces `showMembers ? "members" : "overrides"` exactly); there is NO default-tab config field, and none should be added.
- Kills all four wirings: chats = `tabs` (a PHASE-UNION `S`, §6c/§15); characters/presets/corpus/analytics = static `tabs`; worldInfo = `single`; refinery = `none` (declared-planned, §6a). `ContextTabsPanel` becomes the one renderer for every `kind:"tabs"` section including chat (M3).

**§6b (AMENDED 2026-08-30, #860 — supersedes the 2026-08-01 HUD-1 H1 amendment).** `ContextDefinition` gains no arm. A `ContextRegionDef<S>` is `{ id, claims: (s: S) => boolean, band: () => ReactNode }` — a claim on the pane's HEAD BAND only: `resolveContextTabs` folds the FIRST claiming region's `band()` into `ResolvedContextTabs.header` in place of the section's own `header(state)`; there is no `region` field on the resolved shape and no renderer arm a claimant could compose a rail or a viewport through. `ResolvedContextTabs` gains `railLabel?` (the section's meta-rail name, `ContextTabsSpec.railLabel`, falling back to the section's rail label at the host). `S` stays contravariant-only — `claims` consumes `S`, `band` consumes nothing — so §6b's erasure proof is unchanged. A claim NEVER suppresses resolution: `tabs`/`actions` resolve in full either way, and the ONE host (`ContextTabsPanel` → `ContextBracket`) renders them; a claimant never calls `body`/`when`.

### 6c. The contributor seam (rpg/crew/expressions extending chat WITHOUT importing it)

The design docs' `CHAT_CONTEXT_SLOTS`/`CHAT_SURFACE_SLOTS` become two contributor registries — GENERALIZE-THE-BESPOKE (the mechanism is 6b's `when`, which chat already proves), not greenfield:

- **Context-tab contributors:** `features/rpg` exports a `ContextTabDef<ChatContextState>`; `main.tsx` assembles `createContributorRegistry("chat-context", [rpgContextTab, crewContextTab])` and passes it into the chat section definition, which flows it straight into `defineContextTabs`'s `contributors` (merged after own tabs at the mint, same `when` gating). rpg never imports chat; chat never imports rpg; the door imports both — one-directional flow holds (`client-features-no-cross` keeps enforcing it).
- **The `contributors` arm is a REAL typed seam at M3, not a stub.** `chatsSection` is authored as a FACTORY `makeChatsSection(chatContextContributors: ContributorRegistry<ContextTabDef<ChatContextState>>): SectionDefinition` (M3); `main.tsx` builds `createContributorRegistry("chat-context", [])` (an EMPTY-but-typed registry) and passes it in. The mint accepts and merges it (over an empty list = a no-op), so the full type path — door → factory → mint → resolve → render — is COMPILED and EXERCISED at M3 with zero contributions. M8 only ADDS array members; it builds NO new shape. A CT proving a fake contributor renders + `when`-gates is the M8 acceptance (per §17 M8), against a seam that already exists.
- **Surface-anchor contributors (BUILT M8, `d4e4c68b`).** Same door→factory→content mechanism as the context-tab arm, consumed by the chat CONTENT surface at named anchor points. The anchor vocabulary is a closed tuple — `CHAT_SURFACE_ANCHORS = ["thread-flank", "above-composer", "message-footer"] as const` — so an unlisted anchor is unspellable. **The anchors carry DIFFERENT state, so `ChatSurfaceContribution` is a DISCRIMINATED UNION BY ANCHOR, not the design sketch's single `body(state)`** (that shape can't type — a message-footer body needs the row, a flank body needs the room): the room anchors (`thread-flank`/`above-composer`) carry `ChatRoomSurfaceState`; `message-footer` carries `ChatMessageSurfaceState`. Discriminated-union narrowing on the `anchor` literal types every `when`/`body` and every consumer `.filter(c => c.anchor === …)` to its own state with ZERO casts (this is why it is NOT the M3 erasure crux — the state is narrowed, not erased). Assembled empty at the door (`createContributorRegistry<ChatSurfaceContribution>("chat-surface", [])`) and threaded via `makeChatsSection`'s second param into the content by PROPS (mirrors the context-tab factory; no new React context). `message-footer` mounts per COMMITTED message row only — the ghost/streaming row and the draft-greeting row are structurally excluded (no `surfaceContributors` prop on `GhostMessageRow`, none passed by the draft path). **Flank layout is the SEAM's responsibility, not the contributor's** (a contribution supplies only `body`): the `thread-flank` beside-layout is responsive-correct by construction — a `@container` query on the chat-content region's own inline size (never the viewport — the shell's docked panels narrow this pane independently) stacks the flank below the thread beneath `lg` (512px) so no future consumer can crush the reading column. Zero flank contributions ⇒ the thread renders alone with no wrapper (byte-identical to pre-M8). First mounted fake-contributor CTs for BOTH seams (context-tab + all three surface anchors) prove render + `when`-gate, shown AND hidden (`chats-section.ct.tsx`, `chat-room-surface.ct.tsx`).
- Contributor contract types (including each host's published context-state projection, per O5) home in `client/src/lib/registry-contracts.ts` (tier 4 — importable by chat AND contributors without either importing the other; may import `@orb/contracts` types).

**§6c (AMENDED 2026-08-30, #860 — supersedes the 2026-08-01 HUD-1 H1 amendment).** A third contributor arm beside context-tabs and surface-anchors: **region claims**. One claimant may take a host's CONTEXT pane's HEAD BAND for a state it declares (the rpg Waystone on an engaged game chat); the rails, viewport and ground are the shell's context bracket in every room. Assembled at the door like every other contributor; the host consumes it blind. Minted only by `defineContextRegion`, at most ONE call site project-wide (`context-definition-shape` arms 5+6); ONE bracket project-wide (arm 8, the `data-context-bracket` writer).

**E3 — worked example: contribute a chat context tab.**

```ts
// features/rpg/lib/rpg-context-tab.tsx — rpg imports NOTHING from features/chat
export const rpgContextTab: ContextTabDef<ChatContextState> = {
  id: "game",
  label: "Game",
  when: (s) => s.game !== null, // appears only when this chat has an active game
  body: (s) => <RpgHudTab chatId={s.chatId} />,
};
// main.tsx — the door registers it; chat's definition consumes the registry blind
const chatContextContributors = createContributorRegistry("chat-context", [rpgContextTab]);
```

The WRONG way it replaces: `import { ChatContextPanel } from "#features/chat"` (dep-cruiser RED — runtime cross-feature) or editing chat's panel per graft (the closed-feature wall the rpg/crew designs hit).

### 6d. The modal registry (same move)

`MODAL_SLOTS` was a two-layer indirection (a total `placeholder:true` registry in app-shell overridden per-route via `AppShellProps.modals`) AND the rail/topbar/avatar/mobile affordances were a PARALLEL hand-map (`RAIL_ACTIONS`/`ACCOUNT_ACTION`/`COMMAND_ACTION` + synthetic reachability consts). **Both die in M4 (built 2026-07-14, owner-locked "build it right and tight" — the extensible shape, a STRUCTURAL MIRROR of the section registry).** A `ModalDefinition` `{ id, title, presentation?, size?, trigger, body }` registers feature-owned bodies at the door (chat owns `newChat`+`command`, auth owns `account`, settings owns `theme` — its `settings` modal RETIRED into the `config` SECTION with the config revamp, #866 S1, D62 rule 5 finally satisfied — app-shell owns `you`). Two shape rulings beyond the initial sketch: (a) **each modal SELF-DECLARES its `trigger: { placement, label, icon }`** over a closed `MODAL_TRIGGER_PLACEMENTS` vocab (`rail-footer`/`avatar`/`topbar-command`/`content`/`mobile-tab`), and the rail-footer/topbar/mobile-bar DERIVE their modal affordances from the registry (exactly as they derive sections) — killing the `RAIL_ACTIONS` parallel map, not allowlisting it. The `avatar` placement is the one exception: its DESKTOP affordance is the feature-provided `railFoot` (`PersonaPanelSurface`, route-injected), which owns the account trigger itself — Rail renders no derived avatar button. The You sheet still derives its account row from the `"avatar"` modal (`modalRegistry.list()`), same as rail-footer; (b) **the `body` carries the DECLARED-PLANNED arm** `(() => ReactElement) | { planned: string }` mirroring `SectionDefinition` (O1) — there WILL be more modals; an unbuilt one registers `{planned}`, never a placeholder body. Delivered via `ModalRegistryContext` (mirror of `SectionRegistryContext`), consumed blind by `ModalHost`. `YOU_MODAL_ROWS` derives from the registry — the shadow dies. **Gate family mirrors sections:** `registry-pairing` RETIRES (the rail↔modal bijection is now structurally unbreakable — the rail derives, tsc carries completeness, every modal self-declares a trigger); a NEW `modal-registry-completeness` gate mirrors G1 (co-location · uniqueness · planned honesty · the **singleton-placement** arm — one modal per avatar/topbar/mobile-tab · anti-god-map); `modal-body-not-placeholder` re-points at the `*-modal.tsx` defs; G2 gains its ModalSlotId arm (§16).

## 7. The composition root — `main.tsx` (the registration door) + thin routes

**The registration door is `main.tsx` + `client/src/compose/`.** `main.tsx` is the BOOT half: it binds the singletons (QueryClient → tRPC client → toast manager, minted once in `compose/app-singletons.ts`), binds `notify`, installs the error-report hook, installs the lean production readiness signal from `lib/app-ready-signal.ts`, reaches the dev `agent-bridge.ts` observer only through the literal `import.meta.env.DEV` dynamic `agent-handles/index.ts` door, stacks providers (`QueryClientProvider` → `TRPCProvider` → `ToastProvider` → `AppErrorBoundary` → `RouterProvider`), raises the `BootVeil`, and nothing imports it (`client-nothing-imports-main`, LIVE). The readiness module owns the one Promise/DOM marker; `globalThis.__orb.ready` imports that same Promise rather than forking state (#995). `compose/authed-app.tsx` is the COMPOSITION half: **the ONE place feature definitions and contributors are imported and assembled** (`createRegistry`/`createContributorRegistry` call sites live in `main.tsx` or a `compose/` module — G8), plus the registry-provider stack it wraps around the `/` route's `AppRoot`. This is load-bearing for one-directional flow: a contributor "registers" by being IMPORTED AT THE DOOR, never by importing its host feature — a zero-context model that tries `import "#features/chat"` from rpg hits dep-cruiser RED; the door is the only legal path.

**WHY THE DOOR IS TWO MODULES (#43, the boot code-split, 2026-08-14).** Assembling means importing every feature front door, i.e. the whole app: one 4.94 MB entry chunk, parsed before the login form could paint, and served in full to clients that had not authenticated. `routes/router.tsx` now mounts the `/` component via `lazyRouteComponent(() => import("../compose/authed-app.tsx"), "AuthedApp")`, so the assemblies and the feature graph under them are a separate chunk fetched during the route's load phase — AFTER `requireAuthed()` passes. Measured on the production build: boot path 4,936 kB → 1,056 kB (+36.6 kB jsx-runtime), and a driven anonymous visit to `/` lands on `/login` having requested the entry chunk ONLY. Two walls keep this from becoming a backdoor: `client-compose-door-only` (dep-cruiser, LIVE — only `main.tsx`, `routes/router.tsx`, and a `compose/` sibling may import `compose/`, the `client-composition-tier-door-only` mirror) and G8's unchanged one-assembly rule. The singletons live in `compose/app-singletons.ts` because BOTH halves need the same QueryClient/tRPC client; a second of either is a second cache / a second link chain. `@orb/client` used to declare a `sideEffects` allowlist to keep that barrel drag out of the boot chunk; **it was DROPPED 2026-09-05 by owner ruling after #1752.** Rolldown applies the nearest package.json's `sideEffects` to the app's OWN files (vitejs/vite#22620), so every import-for-effect module had to be enumerated by hand — and when the CSS front door `src/styles/index.ts` arrived on 2026-08-31 it became the third such module and nobody added the entry. Its bare import was shaken away, and the production bundle shipped with NO app stylesheet for five days (zero `display:flex` in `dist`; every chat room hit the MessageList unbounded-window guard) with no typecheck, gate or test able to see it. The ruling is "drop it and just raise the boot limit": the barrel drag comes back (boot payload 818,188 B → 3,012,985 B; `chunkSizeWarningLimit` raised to 2800 kB and `BOOT_CHUNK_CEILING_BYTES` re-calibrated to 3,163,000 B, both with their measured receipts in place) and that cost is ACCEPTED, because an enumeration duty no gate enforces is a silent-failure machine. The boot code-split itself and both walls above are unchanged.

**The door's THIRD job: the composition-tier dir modules (§3).** `main.tsx` also installs the agent-bridge implementations — `buildAgentNav(trpcProxy, queryClient)`, `buildAgentSeed(trpcClient)`, `buildAgentRpg(...)` and `buildAgentPlugin(trpcClient)` from `client/src/agent-nav/`, `agent-seed/`, `agent-rpg/` and `agent-plugin/`, handed to `installAgentDebugHandle`. They live beside `main.tsx` (not under `routes/`, not in `lib/`, not a feature) precisely because they compose feature front doors + `#state` actions, which only the door may do; `client-composition-tier-door-only` (LIVE) makes `main.tsx` their only importer. Residency criteria + the failure they wall off are §3.

**THAT ASSEMBLY IS DEV-ONLY AND MUST STAY OUT OF THE BOOT CHUNK (#433, 2026-08-22).** `installAgentDebugHandle` has always no-op'd outside dev — but the three `build*` calls sat at `main.tsx`'s top level, so the impls were live STATIC imports of the boot module script. Through them the production entry carried `@orb/contracts` `preset` / `rpg` / `refinery` and, via `contracts/preset` → `@orb/kit/macro` → `@orb/kit/cel`, the cel-js evaluator (140 kB) and luxon (125 kB) — evaluated by every visitor before the login form could paint. The assembly therefore lives in its own composition-tier sibling `agent-handles/`, and `main.tsx` reaches it through `if (import.meta.env.DEV) { void import("./agent-handles/index.ts") … }`: the bundler constant-folds the arm and the whole graph leaves the production output. Adding a fourth dev handle goes in `agent-handles/`, never back onto `main.tsx`'s static import list.

**AND THE THREE LOWER PACKAGES DECLARE `sideEffects` TOO (#433).** `@orb/kit` and `@orb/contracts` are `"sideEffects": false`; `@orb/ui` is `"sideEffects": ["**/*.css"]` — the same root-cause fix `@orb/client` already carried. Without the field a bundler must assume every module in the package is import-for-effect, so a module reached through a barrel is RETAINED even after every one of its bindings is shaken: that alone held \~200 kB of `@orb/contracts` prose tables and the whole macro/cel/luxon stack in the boot chunk. The three packages have exactly zero bare non-CSS imports (swept; re-swept 2026-09-05 across 523 files — the only bare import is `@orb/ui` `markdown/math.ts:4`, a katex stylesheet, which the `**/*.css` entry covers), which is what makes the declaration true — these are library-shaped packages, the maintainers' sanctioned use of the field, unlike the app-level allowlist above; a module added there that IS import-for-effect must be listed, or it will be silently dropped.

**Routes are thin mounts.** `routes/` = `router.tsx` (hand-written 2-route tree — `/` + `/login`, no file-based codegen; `beforeLoad` auth gates from `features/auth`; D54), `__root.tsx` (root route + NotFound + the recorded router-context upgrade path), `route-pending.tsx`, `login-page.tsx`, and the `/` route component. "Routes compose features, never the reverse" is LIVE (`client-features-below-routes`).

**\[CORRECTED — the owner ruling] `home-page.tsx` is a misnomer and a god-map.** Verified: it is not a home page — it is the `/` route that mounts `<AppShell>` and imports **63 feature symbols across 11 features** to hand-assemble the `sections={{…}}`/`modals={{…}}` maps. Three truths to encode: (a) **`AppShell` (the 4-region frame) IS the top structural component** — the mental model "shell on top, everything renders inside it" is correct; (b) **there is NO "home page" concept** — the no-selection landing is the CHATS section's CONTENT-none-selected state (`{kind:"landing"}`, D62 P4), a SECTION state, not a page \[**AMENDED by D121:** a `home` SECTION now exists (the eighth rail entry, tiles assembled at the door); what this clause kills is a PAGE — a route that hand-assembles other features — and that killing stands]; (c) under the registry inversion the `/` route becomes a TRIVIAL mount that reads the section registry, and is RENAMED **`app-root.tsx`** (ratified O7 — locked; the name says what it is: the app's root mount, not a page). **Neo precedent (cite):** neo had no home page either — a file-based `_authed` LAYOUT route WAS the shell (`_authed.tsx`/`login.tsx`/`__root`); orbweaver dropped file-based routing and, in hand-writing the 2 routes, dumped the composition into a misnamed "home-page" with the god-map. The lockdown RESTORES the intended shape (shell on top, route = thin mount) — it is not a new design.

What legitimately stays on the `/` route (`app-root.tsx`) after M1/M4: the `useUserBus` mount (the always-on freshness driver — mounted at the root so no feature unmount can drop it, per its own header), `AriaAnnouncer`, the `?join=` token capture + `JoinInviteDialog`, `FirstRunPersonaDialog`. **`app-root.tsx` is the SECOND sanctioned composition route** (the M1.cutover fork-2 ruling) — it permanently homes these composed feature front-doors, mirroring `router.tsx`→`features/auth`'s beforeLoad seam. Gate G1's anti-god-map arm: a `sections={{…}}`/`modals={{…}}` object-literal map in a route file, or a feature front-door import in `routes/**` other than the two sanctioned composition seams (`router.tsx` → `features/auth` `requireAuthed`/`redirectIfAuthed`, and `app-root.tsx`), is RED.

## 8. The settings host + pane registry

> **RE-KEYED by the config revamp (#866 S1 — `docs/design/config-revamp-design.md` §3.1 + §6.8).** The pane registry is the config-GROUP registry: `state/config-group-registry.ts` (`ConfigGroupDefinition`, total over `CONFIG_GROUP_IDS` in `state/config-group-ids.ts`, four shelves `CONFIG_SHELVES` = User · App · Collections · Extensions); the settings MODAL retired into the `config` SECTION (host: `features/config`, LIST + CONTENT, rail foot); the body union is `sections | collection | placeholder` — every non-collection group is a `sections` SKIMMER over the D120 contribution seam (`state/config-section-registry.ts`; NO `surface` arm, NO group-owned `subcategories` — the persona, plugins, connections, automation and backup surfaces all decomposed into `ConfigSectionContribution`s); the four collections are `collection` groups whose body is their `CollectionContribution`; `openSettingsTo(category, sub)` + `goToCollection(kind)` are ONE verb `openConfigTo(group, sub?, setting?)` (`state/config-nav-store.ts`); G4 is `config-group-completeness`. The text below is the M6.1 record, kept as the WHY — read its retired spellings through this note.
>
> **The block below is ILLUSTRATIVE, not copyable — the law is the header of
> `client/src/state/config-group-registry.ts` (§15a); the `body` union is the config-revamp-design §3.1/§6.8 shape.**

```ts
// state/settings-pane-registry.ts — the section/modal move repeated (M6.1 ruling; §5 rules 5+6)
/** The state-owned viewer PROJECTION `when` consumes — plain derived values only, no `data/` import
 *  (§5 rule 6). Fields grow as gates need them; today's whole need is the admin gate. */
interface SettingsViewerView {
  readonly isAdmin: boolean;
}

interface SettingsPaneDefinition {
  readonly id: SettingsCategoryId; // tuple home: state/shell-store.ts (§5 rule 5 — moved at M6)
  readonly group: "user" | "app"; // the §4.2 taxonomy: USER (Account · Personas · Appearance · Chat behavior · …) / APP (Connections · Automation · System · Admin)
  readonly label: string;
  readonly icon: LucideIcon;
  readonly description: string; // distinct teaching copy (gate-checked, placeholder-copy pattern)
  /** Declarative viewer gating — replaces `adminOnly`. Consumes the PROJECTION, never `data/`'s
   *  `Viewer` — the host computes `SettingsViewerView` from its non-suspense `sessions.me` probe
   *  (§10's sanctioned non-suspense exception for the settings host) and supplies it at
   *  nav/search/pane filter time (the §6b "def declares, consumer supplies" inversion). */
  readonly when?: (viewer: SettingsViewerView) => boolean;
  readonly subcategories?: readonly SettingsSubcategory[]; // the anchor/search index, unchanged shape (type moved with the Def to state/)
  /** A real pane body, or an explicit placeholder flag — never a silent if-ladder fall-through. */
  readonly body: (() => ReactNode) | { readonly placeholder: true };
}
```

**Homes (M6.1 ruling — the registry pattern has ONE shape; settings is not the exception; the names below are the M6.1 spellings, re-keyed per the note above):** `CONFIG_GROUP_IDS`/`ConfigGroupId` (then SETTINGS\_CATEGORY\_IDS) moved to `state/shell-store.ts` beside `SECTION_IDS`/`MODAL_SLOT_IDS`, which also TYPES the store's existing `settingsCategory: string | null` and `openSettingsTo(category: string)` as `SettingsCategoryId` — the magic-string hole was the tell that the tuple was always shell vocabulary (§5 rule 5 test). `SettingsPaneDefinition` + `SettingsViewerView` + `CONFIG_SHELVES` (then SETTINGS\_GROUPS) + `SettingsSubcategory` home in `state/settings-pane-registry.ts` (now `state/config-group-registry.ts`); the Context+hook / Provider pair mirrors `modal-registry-context.ts`/`-provider.tsx` exactly (`SettingsPaneRegistry = Registry<SettingsCategoryId, SettingsPaneDefinition>`, assembled once at the door, G8). `settings-nav-model.ts` retains only host-presentation residue (group labels, anchor derivation) or dissolves.

- The settings shell became a THIN host: nav + fuzzy search + scroll-spy stay (they are good); `SettingsPane`'s if-ladder became `registry.get(active).body` — a `built: true` category with no branch can no longer silently placeholder (G4 also forces the explicit flag).
- **Features own their panes.** De-god ownership map (as ratified): `admin-*` components + `use-admin-mutations` → `features/user-admin` (owns the `admin` pane) · credential components + `use-add-credential-form` + connections nav/model → `features/credentials` (owns `connections`) · the workloads components/hooks/nav set → `features/workloads` (owns `workloads`) · **`backup` → owned by `features/workloads` + the portability serde system (ratified O3: "backup has no feature" — backup/restore IS the workloads + portability-serde export/import system; the existing `backup-settings-surface` + import/export/bundle-tracker components moved under that ownership at M6, registering the `backup` pane from there — not settings, not a standalone feature)** · `persona-settings-surface` → `features/persona` · `features/settings` KEEPS the genuinely settings-domain panes: appearance, system, tags (settings-owned per O3 — only backup moved), regex, theme editor/picker, chat-behavior + automation (unbuilt — `placeholder: true` or `when`-hidden). Three stubs become real features with a registered pane; `prompt-manager/.gitkeep` stays pending O2 (guidance says resolve-or-delete; the hard call is deferred until core lands — §18).
- The host imports NO pane bodies (they arrive via the door assembly) — `client-features-no-cross` then enforces the de-god for free.
- `openSettingsTo(category: SettingsCategoryId)` (`shell-store.ts`) is now TYPED — was a bare `string`; tsc validates every deep-link call site against the tuple. `contextTab` stays an opaque `string` BY DESIGN — §5 rule 5's vocabulary test separates them (closed door-assembled cross-feature vocabulary vs open ids one host interprets).

**E2 — worked example: add a settings group (the #866 S1 shape).**

```ts
// features/workloads/lib/workloads-group.tsx  (the feature OWNS its group — a SKIMMER, nothing else)
export const workloadsGroup: ConfigGroupDefinition = {
  id: "workloads", shelf: "user", label: "Jobs", icon: ListChecks,
  description: "Background jobs: run, schedule, and inspect.",
  body: { kind: "sections" },
};
// features/workloads/lib/workloads-jobs-section.tsx  (each anchored section is a CONTRIBUTION at the anchor)
export const workloadsJobsSection: ConfigSectionContribution = {
  id: "workloads-jobs", anchor: "workloads", nav: WORKLOADS_JOBS_SUBCATEGORY, body: () => <WorkloadsJobsSection />,
};
// compose/authed-app.tsx — the group registry, total over CONFIG_GROUP_IDS (tsc); compose/config-sections.ts —
// the ONE section registry every group's LIST rows, search rows, spy targets and render derive from.
const configGroups = createRegistry("config-groups", CONFIG_GROUP_IDS, { …, workloads: workloadsGroup, … });
```

The WRONG way it replaces: dropping `workloads-settings-surface.tsx` + 10 support files into `features/settings/` and hand-extending the if-ladder — the god-feature growth vector.

## 9. The state model (partitioned commons — verified census)

Already correct and gated; recorded because "state/ is a god-store" and "editor-bridge is an event bus" are recurring mis-reads:

- **Partition, not scatter, is the anti-god move.** `state/` = small stores + 3 factory doors (+ `create-drill-selection-store.ts`, the drill-selection factory, itself minted through the gated door) + `chat-handle.ts` + `assemble-chrome.ts` (D73) + the registry tier (built M1–M6.1; chrome added by the shell-chrome program). **Census refreshed 2026-08-03 (F-5) — the "14 stores / 4 registries" counts this bullet shipped with are both stale, and counts in prose rot: read them off the tree.** Today: 21 store modules, and the door assembles THIRTEEN registries — three TOTAL (`sections` · `modals` · `settings-panes`, each `Record<Id, Def>`-total by tsc) and ten CONTRIBUTOR (`chrome` · `settings-sections` · `chat-context` tabs · `chat-context-regions` · `chat-surface` anchors · `tool-renderers` · `message-tools-renderer` · `slash-commands` · `character-detail` · `home-tiles`), all countable off the door's `createRegistry(`/`createContributorRegistry(` call sites — `compose/authed-app.tsx` since the #43 code-split (§7), which G8 pins to `main.tsx` or a `compose/` module and nowhere else. A registry delivered through React context carries a `*-registry-context.ts` + `*-registry-provider.tsx` pair (minted via `lib/create-registry-context.tsx`, gate `registry-context-via-mint`); one whose Def type is state-owned adds the `*-registry.ts` contract module beside it (`section-registry`, `modal-registry`, `settings-pane-registry`, `chrome-registry`). Every store is minted through exactly one door (verified 2026-07-16: 7 × `createGatedStore` — 6 stores + the drill factory — 5 × `createDrillSelectionStore`, 3 × `createPersistedStore`, the draft factory; bare zustand `create(`/`createStore(` exists ONLY inside the three door files): `createGatedStore` (devtools + REQUIRED action labels + unique-name throw) · `createPersistedStore` (version + partialize + total migrate) · `createEntityDraftStore` (frozen EMPTY + useShallow + persist). Gates: `state-files`, `persist-partialize-and-total-migrate`, `no-raw-zustand-persist`, both selector-stability belts, the ESLint static-`setState` ban, `persistence-boundary` (device-local vs synced).
- **`shell-store` is ONE drawer for cross-cutting shell state** (activeSection, panelOverrides, openModal, contextTab, openOverlayPanel, settingsCategory) — features READ via narrow hooks, WRITE via intent-named module actions; the handle never escapes the file.
- **Feature-transient stores are feature-owned but centrally HOMED** (`character-selection-store`, `corpus-selection-store`, …) so a pointer another feature must read is never trapped behind a feature boundary — deliberate design, not sprawl. Durability criterion (north-star §0b): per-device transient → a store; anything that must survive across devices → server state.
- **The write/read discipline is §5.1** (writers only write; three render-only reader shapes; `no-effect-on-shared-selection` gates the banned subscribe-and-effect). Nothing here amends it.

## 10. The data/ tier — the whole surface, not just the factories

- **`trpc.ts`** — the typed client + `useTRPC`; queryKeys are 100% proxy-derived (`no-array-literal-querykey`, LIVE).
- **`query-client.ts`** — the §6.1 QueryClient pins have ONE home here (verified header): `staleTime: Infinity` (the bus drives freshness — never `'static'`), `refetchOnReconnect: true` (SSE-gap catch-up), `refetchOnWindowFocus: false`, mutations `retry: 0`, global error toasts via `QueryCache`/`MutationCache` `onError` reading `meta.errorToast`. Do not re-tune these per-surface.
- **The HTTP-route fetch-fn pattern:** endpoints that are Hono routes, NOT tRPC (multipart/binary), get ONE `data/` fetch fn each — `upload-asset.ts` (the one client seam for persisting a picked file), `import-tree.ts` (folder import → `202 {workloadId}`), `import-bundle.ts`, `import-characters.ts`, sharing `http-error.ts` (`throwHttpError`) + the `CSRF_HEADER`. **Rule: tRPC for everything except multipart/binary/streaming-HTTP; an HTTP route consumed anywhere gets a `data/` fetch fn — a feature never hand-writes `fetch()`.** (Gateable later as a `fetch(`-in-features ban; today zero violations — review R5 until a second offender class appears.)
- **`use-viewer.ts` is THE canonical "who am I"** — composes three already-cached reads (sessions.me + settings + persona list) via `useSuspenseQueries` so every caller dedupes on the shared cache. A scattered `trpc.sessions.me` read for identity is the wrong move (the settings host's plain role read is the sanctioned exception class: a non-suspense probe that must never block its shell).
- **The rest:** `invalidation.ts` (§13.5) · `query-boundary.tsx` + `query-error-state.tsx` (§11) · `bus/` (§13) · `skeleton-rows.tsx` (shape-matched loading rows) · `use-gated-query.ts` (`skipToken` — kills `castId("")`).

### 10a. The three-class data contract + the durable-local contract (D138, landed W10 2026-08-14)

Every piece of client state is exactly one of three classes — the blunt "cross-feature → trpc" rule in
§12 is this contract's corollary, not a separate rule:

- **Server truth** lives ONLY in the query cache; freshness rides the buses (§13) + the mutation XOR +
  the gap-heals. Never persisted — a query-cache persister would be a second durable staleness layer, and
  is banned (`staleness-and-session-freshness.md` §4.6).
- **Client-ephemeral** state dies with the tab; needs no invalidation. Home: §12 row 1 (`state/*`).
- **Durable-local** state is device-scoped VIEW/DRAFT state and MUST satisfy the durable-local contract:
  1. **Per-user namespacing.** Every persisted key is `orb:u/<userId>/<name>` (drafts
     `orb-draft:u/<userId>/<name>`); `state/create-persisted-store.ts` mints against a boot pointer
     (`orb:active-user`) and `bindDurableLocalToUser(userId)` rebinds once the viewer resolves, adopting
     any legacy un-namespaced blob into the first bound user then deleting it. A genuine identity CHANGE
     keeps the existing hard-reload boundary.
  2. **Referential integrity for any server row id a persisted field carries** — two pure-render rules
     (no effects; `no-effect-on-shared-selection` stays intact): an id unknown to its authority read is
     EXCLUDED from filtering (a dead reference can never veto rows), and an ACTIVE entry always renders
     its chip (named when resolvable, else an explicit "deleted" chip, clearable either way) — no
     auto-prune, no write-on-render.
  3. **Total migrate** (pre-existing law) stays; identity/referential validity are 1 and 2's job, not a
     smarter migrate.

Enforcer: `persistence-boundary` (raw-storage-outside-the-doors belt, §9) plus `state-files`/
`persist-partialize-and-total-migrate`. Design of record + the as-built deltas (why store rebind reads a
boot pointer rather than minting fresh, why legacy adoption goes through each store's own persist
storage): `docs/history/design/staleness-and-session-freshness.md` §4.2, §5a.

## 11. The error-handling battery + the three-states law

The stack, outermost-in (all verified):

1. **`AppErrorBoundary`** (`lib/error-boundary.tsx`) — the app-level render-throw catch. No retry (no query underneath to reset — a stale state that threw once will throw again); fallback offers RELOAD only. Wired once in `main.tsx` with `onError: reportClientError`.
2. **`reportClientError` → `trpcClient.clientError.mutate(buildClientErrorPayload(…))`** (`lib/client-error-report.ts`) — fire-and-forget telemetry; a failed report must never itself throw (verified: swallowed).
3. **`QueryBoundary`** (`data/query-boundary.tsx`) — the per-surface suspense + error battery. It bakes the `QueryErrorResetBoundary` → error-boundary `onReset` HANDSHAKE: without it, "Try again" re-renders while the query is still errored and throws again; `retry` resets BOTH so the refetch is real. Every suspending read mounts inside one.
4. **`QueryErrorState`** (`data/query-error-state.tsx`) — the ONE read-error block (muted label + Retry wired to the handshake's `retry`); it replaced 6 hand-rolled ErrorStates + 28 inline arms (its own header records the drift cost).
5. **Toasts** — mutation failures surface via `meta.errorToast` → the global `MutationCache.onError` → `notify` (bound once in `main.tsx`). One error slot per mutation (`no-multiplexed-mutation-error`, LIVE).

**The three-states law (§4.3 rule 8, restated as the buildable checklist):** every surface ships all three designed states — EMPTY teaches (an `EmptyState` with an action — `empty-state-has-action`, LIVE), LOADING is a shape-matched skeleton (`skeleton-rows.tsx` / `Skeleton` — never a centered spinner, never layout shift on arrival), ERROR is `QueryErrorState` with a real retry. A zero-context model's failure modes — bare spinner, unhandled throw, dead-end empty — are each individually walled: rule §4.3-8 + `empty-state-has-action` + the QueryBoundary default `renderError`.

## 12. Inter-feature communication — the channel matrix (ratified; refreshed 2026-08-03)

The blunt rule "cross-feature reads → trpc" is WRONG for client-ephemeral state (there is no row to fetch). This matrix is the law; each row carries a live cite and its enforcer. **The critical clarification: a `trpc.*` read is CACHE-FIRST** — TanStack Query dedupes and caches per key, so reading another feature's server entity (a persona's name while the persona list is loaded) is a cache hit, not a network round-trip; `staleTime: Infinity` + the bus means it refetches only on invalidation. The anti-pattern is ONLY using trpc for ephemeral client state (or a store for server rows).

**REFRESHED 2026-08-03 (F-6); row 12 added 2026-08-14 (W10).** The table below is the CURRENT decision
table — twelve rows, one per mechanism that actually exists on the tree, each with its home, its
enforcer, and the ONE question that selects it. It supersedes the four-mechanism version this section
shipped with, which predated region claims (D119), the settings-section seam (D120), home tiles, slash
commands, the two tool-renderer seams, the door-injected `trpcProxy` factory, the door-threaded
render-prop projection, `peekQueryData`, the cross-feature filter store, and the session channel. Every
named symbol was re-verified against the tree on the day it landed.

| # | Channel | Home / receipt | Enforced by | When it is THE choice |
| - | - | - | - | - |
| 1 | state commons — narrow hooks + intent-named module actions | `state/*` (shell, active-chat, per-section drills, composer, `chat-list-filter-store.ts`) | `state-files`, both selector belts, `no-effect-on-shared-selection`, `client-state-below-data` | client-EPHEMERAL cross-cutting state: selection, panel modes, drafts, filters. A trpc call for the active chat id is RETIRE-on-sight |
| 2 | tRPC query cache, cache-first | `trpc.*` queryOptions; `staleTime: Infinity` + bus freshness | `no-array-literal-querykey`, `no-static-staletime`, G9 seals | another feature's SERVER-persisted entity (D43(3): the router IS the cross-feature contract) |
| 2b | `peekQueryData` — hookless sync cache peek | `data/peek-query.ts` | its own header law + `client-cache-surgery-only-in-data` | a pure resolve-time predicate (a `when(state)`) that cannot run a hook. NEVER a substitute for a hook read |
| 2c | door-injected `trpcProxy` into a contributor factory | `main.tsx` `createTrpcProxy(trpcClient, queryClient)` → `makeRpgContextTabs({trpc, queryClient})` | convention + the door's comments | a contributor whose `when`/resolve logic needs the cache OUTSIDE render; ordinary defs read `#data` hooks directly |
| 3 | TOTAL registries (closed vocabulary, tsc-total) | sections · modals · settings-panes | G1/G2/G4/G8/G13 + the `Record<Id, Def>` assembly | a member of a closed shell vocabulary (§5 rule 5's vocabulary test) |
| 4 | CONTRIBUTOR registries (open) | chrome · settings-sections · chat-context tabs · chat-context REGIONS · chat-surface anchors · tool-renderers · message-tools-renderers · slash-commands · character-detail · home-tiles — TEN families, all assembled in `main.tsx` | G3 (8 arms) · G8 · `chrome-`/`modal-`/`home-tile-registry-completeness` · `settings-section-anchored` + the door's `assertSettingsKeyPartition` · duplicate-id throws at mint | a foreign feature EXTENDING a host surface — **THE graft channel** |
| 5 | door-threaded render-prop projection (Arm A) | `makeCharactersSection(characterDetailContributors, (view) => <ChatsWithCharacterPane {...view} />)` | **`section-factory-contribution-bundle`** (the arity wall: on an exported `SectionDefinition`-returning factory, >1 render-prop param is RED — mint the seam — and >1 `ContributorRegistry` param is RED — bundle them) + `client-features-no-cross` (which forces it through the door) | ONE foreign pane projected into a host, host controls placement. **≥2 foreign panes ⇒ mint a contribution seam instead** |
| 6 | shared derivations at tier 4 | `lib/chats-with-character.ts` · `lib/message-role-labels.ts` · `lib/row-qualifiers.ts` | `client-lib-floor`, `client-lib-below-components` | ONE pure predicate/vocabulary both sides must agree on (the "second spelling" wall) |
| 7 | tier-2 composites | `components/` | G5 trio, G6/G7 | domain-aware UI ≥2 features need |
| 8 | event/sync spine → ONE invalidation seam | `data/bus/*` + `data/invalidation.ts` (`BUS_FILTERS` + `USER_BUS_FILTERS` + `RPG_BUS_FILTERS`, heal set derived) | `bus-coverage` ×3, G10/G11/G12, `no-inline-invalidate-outside-seam`, `bus-on-data-no-store-write` | server truth changed; freshness fan-out (§13) |
| 9 | editor-bridge | `forms/create-form-handle-bridge.ts` | INTRA-feature only, by its own header | a feature's own CONTENT ↔ its own CONTEXT inspector. **Plainly: not an inter-feature channel** — across features the analog is row 4 |
| 10 | type-only cross-feature imports | `@orb/contracts` shapes + the `client-features-no-cross` type-only arm | that rule's `dependencyTypesNot: ["type-only"]` | a SHAPE wired at the composition root |
| 11 | readiness + agent observer split | `lib/app-ready-signal.ts` (production marker/Promise) + DEV-only `lib/agent-bridge.ts` and composition-tier handle impls (§3) | header law + `agent-bridge-lock` + `client-composition-tier-door-only` | one shared readiness state; tooling observation/drive never enters the production boot graph |
| 12 | session channel — typed cross-tab BroadcastChannel + Web Locks single-flight | `lib/session-channel.ts` (tier-4, imports nothing above `#lib`); consumed by `data/stale-session.ts` (recovery single-flight) + the auth feature's logout flow | `session-channel-boundary` (LIVE — `new BroadcastChannel` outside this module is RED, plus the §4.6-blindness ARM B tripwire) | SESSION LIFECYCLE coordination across tabs/devices (`signed-out`/`session-recovering`/`session-recovered`) or a `durable-local-written {storeName}` rehydrate poke. **NEVER a server-truth payload** — that is row 8's job (§13) |

Two rows that are NOT on this table because they are not channels: **cross-SECTION navigation** is row 1
(`setActiveSection` + a seed such as `startNewChat({characterIds})` / `selectCharacter` — §4.2 physics rule
4\), and **shared domain-agnostic parts** are `@orb/ui`, which is the ladder (§3), not a cross-feature seam.

**Wrong-channel audit (2026-08-03, the review behind F-6): ZERO confirmed misuses tree-wide.** Hunted and
not found: server rows mirrored into stores (all 20 store headers read — every one is client-ephemeral or
device-local with a stated rationale); trpc round-trips for client-ephemeral pointers; registry bypasses
(no parallel maps, no feature rendering a foreign surface outside the door channels); rogue event channels
(no `CustomEvent`/`EventTarget`/`dispatchEvent` in client src). The gates plus the store-header discipline
are holding — which is why this table is a TRANSFER document, not a remediation list.

**E5 — worked example: cross-feature read, right vs wrong.**

```ts
// RIGHT — chat reads the settings-owned appearance pref: cache-first trpc, fallback until resolved
const { data } = useQuery(trpc.settings.getUserSettings.queryOptions());
return data?.config.appearance.chatStyle ?? DEFAULT_APPEARANCE_SETTINGS.chatStyle;
// RIGHT — persona reads chat's ACTIVE-CHAT pointer: client-ephemeral, the state commons
const handle = useActiveChatHandle();
// WRONG — dep-cruiser RED (runtime cross-feature import):
import { useChatStyle } from "#features/settings"; // ← no such channel exists
// WRONG — a store mirroring server rows (server state never lives in zustand, §5):
const personaName = usePersonaStore((s) => s.names[id]);
```

**`lib/` channel audit (every entry adjudicated; tier-4 bar = "cross-cutting seam, reaches up to nothing"):** `agent-bridge` KEEP (owner-settled; the observer model) · dev/observability set KEEP (`bus-devlog`, `client-error-report`, `dev-flag`, `dev-tools`, `log-clock`, `long-task-tracer`, `motion-stats`, `perf-marks`, `probe-mode`, `render-profiler`, `render-stats`, `trpc-devlog` — all observer-shaped, zero feature imports) · display/util seams KEEP (`time`, `notify`, `download-json`, `error-boundary`, `test-ids`, `use-focus-on-mount`, `view-transition`, `weave-glyph`, `message-render`) · shared-vocabulary maps KEEP (`message-role-labels` — 7 consumers / 6 features, the ONE role-label home; `injection-copy` — 3 features, one warning string; `theme-override-form` — the character↔settings theme-model shape; `list-seeded-backgrounds` — app-shell + settings) · **no RETIRE findings** — nothing in `lib/` is a disguised feature-to-feature coupling (verified: zero `#features/` imports from `lib/`, `components/`, `data/`, `forms/`, `state/`). The risk is prospective, so it gets gates, not cleanup: `client-lib-floor` (LIVE) + G5's lib→components / components→features arms.

## 13. The event/sync spine (multi-tab · multi-device · multi-human)

The same disease-class as the slot registries, highest stakes: a mis-wired or under-fanned event = two humans (or two of one person's devices) seeing different truth. Inventory — **FIVE live bus machineries + presence** (chat · user · notifications · rpg · automation; the count and the rpg/automation rows were added 2026-08-03, F-5 — the table shipped naming four, one of which was buddy and is struck below), on the same THREE deliberate durability tiers:

| Bus | Scope | Durability | Client apply | Producer gate |
| - | - | - | - | - |
| chat (`domain/chat/bus.ts` + `transport/trpc/chat-events-bus.ts`) | per-chat, member-scoped | **durable-first**: `emit` awaits the `chat_events` INSERT (assigns the per-chat `seq`) BEFORE the ring push; 256-entry ring + durable replay, member-gated (`chatEventBounds`); `on()` pre-buffers so the replay/live gap dedupes by seq | `apply-chat-bus-event.ts` — pure switch ending `assertNever` (a new member fails tsc) + exhaustive `BUS_FILTERS` Record | `bus-coverage` (LIVE, D50) |
| user (`transport/trpc/user-events-bus.ts`) | per-person ("an entity you own changed"), all devices | **live-only, fire-and-forget BY DESIGN** — no durable half; gap-heal = `invalidateAllUserRoots()` on every transition into `pending` (first connect AND reconnect — `use-user-bus.ts`) | exhaustive `USER_BUS_FILTERS` mapped Record (tsc-total); the heal set is DERIVED from the same map (`allUserRootFilters`) | `user-bus-coverage` (LIVE; `connectionsChanged` = the sole cited DEFERRED) |
| notifications (`transport/trpc/notifications-bus.ts`) | per-person durable inbox | **durable-first**: entry composes the INSERT (assigns seq) before `publishNotification` | inbox list rides Query + cursor | none (rides the inbox contract, not a broad union) |
| rpg (`domain/rpg/bus.ts`) | per-chat game state | **live-only, self-healing** — a domain-minted `EventEmitter` MODULE singleton keyed `rpg:<chatId>`, no durable table and no replay ring; a verb publishes AFTER its durable write, the client blanket-invalidates on every (re)connect | `data/bus/use-rpg-bus.ts` → the exhaustive `RPG_BUS_FILTERS` mapped Record in `invalidation.ts` | `rpg-bus-coverage` (LIVE, D108) |
| automation (`transport/trpc/automation-bus.ts`) | per-chat, over the `domain/automation` `notify` sink | **transient by design** — rides `defineBusChannel` keyed by `chatId`; no durable row, no resume cursor. The D118 stream fold's ONE-socket/ROOM-sources shape: no standalone subscription, the `automation` room tails it via `stream/sources/automation.ts` | through the room's stream fold | none (no broad union of its own) |
| ~~buddy~~ (`transport/trpc/buddy-bus.ts` over `domain/buddy`'s `createBuddyBus`) | ~~per-person companion reactions~~ | ~~replay-buffer ring, live~~ | ~~(no client consumer yet)~~ | ~~none~~ |

**⚠ Truth-repaired 2026-08-03 (with D121):** the buddy bus + `domain/buddy` above were PURGED with the
2026-07-25 retro burn-down — no `transport/trpc/buddy-bus.ts`, no `domain/buddy` on the tree; the row is
struck and kept only as the design-of-record shape O4 (below) referred to. The live per-chat live-fan bus
today is `automation` (`transport/trpc/automation-bus.ts` over the `domain/automation` `notify` sink,
rides `defineBusChannel` keyed by `chatId` — the D118 stream fold's ONE-socket/ROOM-sources shape: no
standalone subscription, the `automation` room tails it via `stream/sources/automation.ts`), transient by
design (no durable row, no resume cursor).

Plus `presence-registry.ts`: presence = a ref-count per userId over open SSE connections + a 15s grace window — server-derived, never a client-asserted heartbeat (a spoofable presence is a prompt-composition attack). All process-local, `ASSUMES(single-replica)`.

**Verification of the commissioning read (trust code):** (a) *"the user bus has no coverage gate"* — FALSE: `tooling/src/verify/gates/bus-producer-coverage.ts` covers it (it quantifies over every belted bus union, the user bus included), self-tested. (b) *"is the user-bus apply exhaustive?"* — YES, by a different mechanism: a mapped-type Record over `UserBusEvent["type"]` is compile-time-total exactly like `assertNever`. (c) *"is the fanout as rigorous?"* — the TIERING is deliberate, not a gap: shared-room truth rides the durable seq-stamped chat bus; per-person freshness rides the lossy-but-self-healing user bus (its contract header records the design: a dropped tick costs one reconnect-heal, never divergent canon). The member-fan is real and security-scoped: `entry/compose/emit-chat-changed.ts` derives recipients from the LIVE roster (`kind='human'`, `leftSeq IS NULL`) + pre-captured `extraUserIds` for just-kicked members — never a non-member.

**The laws (each names its enforcer; NEW gates in §16):**

1. **Durable-first / fan-out-second** for any bus carrying truth someone can miss (chat, notifications): the durable INSERT assigns `seq` BEFORE the live publish; the seq is the cross-device ordering source of truth; resume/replay reads the durable log. Enforcers: structural in `createChatBus` + pinned by `tests/server/domain/chat/bus.int.test.ts` / `bus-golden.suite.int.test.ts`; `defineBus` (below) makes the ordering non-optional for new buses.
2. **Fan scope follows visibility.** A shared-CHAT event fans to every present member's channel (each member's every device); a per-PERSON event fans to all that person's connected devices (channel keyed by userId, one listener per device). **An event mutating state visible to others MUST fan beyond the actor** — for chat that means the member-fan op or the chat bus, never a single-user emit. Enforcers: G12 mechanically for membership-scoped domains; R3 at contract review for new visibility classes.
3. **Consumer exhaustiveness is compile-time.** Every bus union ends in `assertNever` or a mapped-type-total Record on the client. Enforcer: tsc; `defineBus` bakes it for new buses.
4. **Producer coverage is ratcheted.** Every declared event type has a real server emit site; an owner deferral is a typed warning-debt policy with a work item, not an in-gate citation, and it reds the day the member gains a producer. Enforcers: `bus-producer-coverage` (LIVE, one policy over every belted union) + `user-bus-deferred-member`; G11 requires the belt for any NEW bus.
5. **One client-side event→cache router.** `data/invalidation.ts` is the ONE seam for EVERY client-consumed bus (verified 2026-08-03: `BUS_FILTERS` + `USER_BUS_FILTERS` + `RPG_BUS_FILTERS` + the derived gap-heal set in one file; `no-inline-invalidate-outside-seam` gates every other `.invalidateQueries`; `bus-on-data-no-store-write` keeps `onData` from becoming a second store). A new bus's client half MUST land in this same file — G11 checks it.
6. **Presence is server-derived only.** A client-asserted presence write is banned — review. There is a client READ (`notifications.presence`, #1039 — the roster dot's freshness driver is a poll, cited in `query-freshness-coverage`) and still NO client WRITE: the contract declares no inbound presence schema, so the ban holds at the type, and the read discloses one bit per asked user id through the single gating seam `transport/trpc/presence-disclosure.ts` (the v1 audience is any authenticated caller, owner-ruled 2026-09-01; a tightening is that file plus its one call site).
7. **Server truth never rides BroadcastChannel (D138).** The session channel (§12 row 12) carries SESSION LIFECYCLE + durable-local rehydration pokes only; a data payload on it would fork the ONE invalidation router (rule 5) into a second, unversioned path. Enforcer: `session-channel-boundary`.

**The unification (`defineBusChannel` — the transport half, built M9):** `chat-events-bus.ts`, `user-events-bus.ts`, `notifications-bus.ts` hand-rolled identical machinery three times — module-scope `EventEmitter` + `setMaxListeners(0)` + `channelFor(key)` + `on(emitter, channel, {signal})` + the untyped-args unwrap generator. ONE `defineBusChannel<Key extends string | number, Event>(channelFor: (key: Key) => string, opts?: { firehose: true })` (home `server/src/transport/trpc/bus-channel.ts`) — a per-bus key→channel-string mapper plus an optional firehose opt-in (the `{firehose:true}` overload returns the `FirehoseBusChannel` with `subscribeAll`) — returns `{ publish(key, event), subscribe(key, signal), subscribeAll? }`; durability stays PER-BUS POLICY composed in front of `publish` (chat: the awaited INSERT; user: nothing; notifications: the inbox record op) — the tiers are deliberate and stay; only the plumbing unifies. **Buddy stays as-is — adoption DEFERRED by owner ruling (O4, tracked in §18):** the primitive covers chat + user + notifications now; buddy's `@orb/kit/replay-buffer` emitter (D10) adopts later, in its own decision. **⚠ Truth-repaired 2026-08-03 (with D121): this O4 clause is DESIGN of record, not live — `domain/buddy` was purged 2026-07-25; O4's deferred item has no live subject.** G10 then seals: `new EventEmitter()` under `transport/` outside the primitive's home is RED (buddy's bus is domain-minted, not a transport `EventEmitter`, so it passes as-is — the automation bus rides `defineBusChannel`, so it is unaffected by this rule either way).

**E4 — worked example: add a user-bus event (the full ritual, every step walled).**

```ts
// 1. contracts/src/user-bus/index.ts — the union + the types-const (ONE home)
| { type: "documentsChanged"; documentId?: DocumentId }
export const USER_BUS_EVENT_TYPES = { …, documentsChanged: true } satisfies Record<UserBusEvent["type"], true>;
// ← tsc now FAILS in data/invalidation.ts until the map handles it (total Record)
// 2. data/invalidation.ts — the client route (the heal set derives automatically)
documentsChanged: (_e, trpc) => [trpc.documents.pathFilter()],
// 3. the domain verb emits AFTER its durable write commits (fire-and-forget)
await writeDocument(…); deps.emitUserEvent(ownerId, { type: "documentsChanged", documentId });
// 4. `pnpm check` — bus-producer-coverage goes RED if step 3 is missing
```

The WRONG ways it replaces: a bespoke emitter (G10 RED) · an event type with no emit (coverage RED) · an inline `invalidateQueries` in the feature (`no-inline-invalidate-outside-seam` RED) · a store mirror of the payload (`bus-on-data-no-store-write` RED).

## 14. The reuse-primitive law — gate what §13 already says

§13.2 stays the cold-agent map; §13.6's "review flag" becomes machine teeth. Predicates verified against current code so day-one is green or a named migration:

- **Rows.** An entity-in-a-list row = `@orb/ui/list-row` OR the tier-2 `LibraryRow` (the gate accepts BOTH tiers). Predicate: in LIST-region surface files, a `.map()` callback returning interactive JSX not rooted in `ListRow`/`LibraryRow`/an allowlisted composite is RED (G6). Filename `*-row.tsx` is NOT the predicate — message anatomy (the 8-skin `MESSAGE_ROW_SKINS` machine), facet rows, and `setting-row`/`Field` rows are different species; residual anatomy judgment is R1.
- **Destructive confirms.** `ConfirmDialog` is the ONLY feature-tier confirm. Gate: `features/**` importing `@orb/ui/alert-dialog` is RED (G7, dep-cruiser — clean because the composite lives OUTSIDE features). Migrate the 5 named sites first (M5).
- **Mutations.** Verified clean (zero raw `useMutation(` in features; 16/16 hooks on the factory) → hard seal, no ratchet: importing `useMutation` from `@tanstack/react-query` outside `data/` is RED (G9).
- **Browse.** `createCollectionSurface` owns UNBOUNDED/paginated browse. Verified: `useInfiniteQuery` appears ONLY inside the factory → seal it (G9). **Adjudication the §13.2 map lacked:** a small bounded owner list fetched whole in one `useSuspenseQuery` (presets, world books) legally uses `LibrarySurfaceShell` + `LibraryListLayout` (tier 2) — the boundary is the QUERY SHAPE (paginated ⇒ factory), which is exactly what the seal enforces; no judgment remains.
- **Forms / virtualization / charts / markdown** — LIVE (`form-factory-for-multifield`, `no-direct-useform`, `no-form-reset-in-autosave`, resolver physics + `ui-satellite-seals`; verified zero `useVirtualizer` outside the seal). Cite, nothing new.

## 15. Doc↔code reconciliations (code is truth; fix the docs on promotion)

**Applied 2026-07-15 (M11):** every row below whose Disposition calls for a core-doc edit was APPLIED as
an edit to its target `UI-*.md` doc in the same pass as this promotion. Rows already resolved by the
build (home-page→app-root, `client-structure` RESERVED @ M7, the §7/§16-G1 app-root row already folded
into §7+§16) needed no further edit.

| Doc says | Code truth | Disposition |
| - | - | - |
| UI-Arch §4.2/D66 A1: LIST header = the shared `.shell-panel-header` band with the ONE primary New | `PanelChrome`'s header is optional and the LIST passes none (`app-shell.tsx:147-153`) | A1 is COMMITTED-not-built (north-star N1/N2 lane); record the gap so §4.2 isn't read as as-built |
| UI-Arch §4.2 lists chat CONTEXT tabs as if registry-owned | chat's tabs are a bespoke internal `<Tabs>`; `context-slots.ts` deliberately omits `chats` | Resolved BY this proposal (§6b); until M3, §4.2's table describes the target |
| UI-Arch §4.1 "LEFTOVER width feeds CONTEXT" | the grid gives leftover width to the centered CONTENT gutter (`--width-shell-content` clamp); CONTEXT is a fixed `--dimension-panel` column | Amend §4.1 phrasing (aspirational → actual) |
| "FOUR regions" | `RegionAnchor` names LIST/CONTENT/CONTEXT; RAIL is a non-container region (nav strip, hosts no surface) | Keep "four regions" as anatomy; footnote RAIL is not a containment region |
| UI-Gates §8 keystone "in `features/` (app-shell exempt)" | the keystone covers ALL `packages/client/src`; three exact exemptions | Tighten the §8 sentence (§4 here is the precise record) |
| north-star §0 rule 2 "hand-written CSS legal in exactly ONE file" | true at the FEATURE tier; `client/styles/globals.css` + ui `globals.css` are hand-written styles-tier files, `theme.css` is generated; `settings-shell.css` dissolved at M6.3 | §4's table is the reconciled law; no second CSS-law wording lives here |
| "home-page" as a concept | `routes/home-page.tsx` is the `/` route + a 63-symbol god-map; the "home" screen is the chats section's landing STATE (D62 P4) | §7 — rename to `app-root.tsx` (O7) + thin-mount at M1; neo precedent recorded. **PARTLY REVERSED by D121:** the ROUTE ruling stands (`app-root.tsx` is a thin registry mount, no god-map), but home now exists as the EIGHTH rail SECTION with door-assembled tiles — a section, still never a page |
| `client-structure` RESERVED note: `corpus` stub mirrors no domain | `features/discovery/` is BUILT and already renamed from `corpus` (72b600fc) — the gate's own comment has carried no stale corpus reference since | RESOLVED at M7: doc-only stale follow-up removed from `Core-Enforcement-Active-Gates.md`; no code change needed |
| §7/§16-G1 name only router.tsx→auth as the sanctioned routes→features seam | `section-registry-completeness.ts` also exempts `app-root.tsx` entirely (the M1.cutover fork-2 ruling — app-root is the permanent composition route) | Reconciled into §7 + §16 G1 (this pass); recorded here so M11 promotion carries it |

(The former auto-overlay row is resolved by O6: no longer a doc↔code disagreement — the law stands and the code is BUILT to it at M10; see §4.)

### 15a. The type sketches are ILLUSTRATIVE; the code header is the law (RULED 2026-08-03, F-5)

**Every `ts` block in §5/§6a/§6b/§8 is a SKETCH of the shape at the time it was written, not a copyable
declaration.** A stickler pass found the §6 blocks drifted from the code on six axes at once (and the tree
has since grown two more) — ratified prose that disagrees with a live type re-teaches the dead shape, and
the doc's own history shows agents build from these blocks (M3 was specified off §6b). So the standing
rule, in the §15 discipline: **read the shape off its code header; read this doc for the WHY.** The three
homes, each with a header that IS the per-domain law:

| Shape | The law lives at | This doc's block is |
| - | - | - |
| `SectionDefinition` · `RailEntry` · `SectionPlaceholderCopy` · `SectionPanelAvailability` | `client/src/state/section-registry.ts` | §6a — illustrative |
| `ContextDefinition` · `ContextTabDef<S>` · `ResolvedContextTab(s)` · `ContextRegionDef<S>` · `ContextRegionView` · every published `S` projection | `client/src/lib/registry-contracts.ts` (path is load-bearing — G3 arm 3 resolves projections against it) | §6b — illustrative |
| `SettingsPaneDefinition` · `SettingsViewerView` | `client/src/state/settings-pane-registry.ts` | §8 — illustrative |

The confirmed deltas as of 2026-08-03 — recorded so a reader of the old blocks knows WHICH way they lie,
not as a second declaration to maintain:

1. **`RailEntry`** — §6a sketches `mobilePrimary?`; the code has `mobile: "tab" | "sheet"` (`MobileCuration`
   — an EXPLICIT per-section fate, shell-chrome §A) plus `zone?: RailZone` (`"rail.nav" | "rail.brand"` —
   how `home` claims the brand cell without app-shell ever spelling `"home"`, D121 clause C).
2. **`SectionDefinition`** — the code adds `listHeader?` (the D66 A1 band content) and `panels?`
   (`SectionPanelAvailability` — the "this section has no such pane" arm; `"unavailable"` is NOT a fourth
   `PanelMode`).
3. **`ContextTabDef<S>`** — the code adds `icon?` · `strip?` (`"game" | "meta"`, HUD-1 §4) · `crown?` ·
   `badge?` · `disabledReason?` · `defaultTab?` (the preferred-default marker; the FIRST resolved `true`
   wins, a stored still-visible `contextTab` always beats it).
4. **`ContextDefinition`** — all three arms intersect `ContextEmptyArm` (the definition-owned
   no-selection copy, side-eye F-12), and the `single` arm carries `header?` (the band identity a
   single-body context supplies, which `presets-section.tsx` uses).
5. **`ResolvedContextTabs`** — the code adds `header?` (the band slot, one resolve / two consumers) and
   `region?` (the HUD-1 claim, §6b's 2026-08-01 amendment).
6. **`ContextTabsSpec<S>`** — the code adds `header?` · `regions?` · `empty?` beside `contributors?`.

What has NOT drifted, and is still law as written: the non-generic shell seam, the `defineContextTabs<S>`
mint as the only tabs minter, `S` contravariant-only, and `{kind:"none"}` / `{planned}` as explicit
decisions rather than absences. The §9 registry census and the §13 bus table were refreshed in the same
pass; the §12 matrix was replaced outright (F-6).

**§4 / D66 A1 band clause (AMENDED 2026-08-30, #860 — supersedes the 2026-08-01 HUD-1 H1 amendment).** "The `.shell-panel-header` band ALWAYS renders" holds for the LIST panel and for a `single`/`none` context panel. A `kind:"tabs"` context panel renders no shell band in any mode: `SectionContextHeader` returns null and shell.css collapses the empty band element; the context bracket owns the pane's head — its band slot (the section's `header` or a claimant's band), the 2px ember content↔context binding it paints itself from the primary token, and, while the pane floats, its own dismiss inside the band's corner.

**M3 corrections (pulled forward from M11 by the owner-authorized M3 design pass, 2026-07-14 — the code side lands IN M3; §6b was refined post-ratification):**

1. **§6b/O5 type shape.** `ContextDefinition`/`SectionDefinition` are NON-generic at the shell seam; strictness moves to the `defineContextTabs<S>` mint (`S` spelled once, at the mint call, against a `registry-contracts`-published projection). The variance proof (a covariant `S`-producer can't ride the `never`-erasure — §6b) is why. Supersedes the aspirational generic in the pre-M3 doc + the as-built `SectionDefinition<never>`.
2. **The M3 M-block CRUX sentence is SUPERSEDED.** The prompts-doc M-block said "the consumer computes each section's projection `S` … a typed narrow keyed by the active section id." That was written before the variance was worked. The projection is DEFINITION-OWNED and the consumer is PARAMETRIC (blind), not a keyed narrow. The keyed-narrow + typed-`get` accessor is the REJECTED-BUT-SOUND alternative (sound, but reintroduces an id→S map + per-id switch + per-section recipes in app-shell — the smear).
3. **The M-block UNDER-SCOPED chats.** Chats' bespoke context is TWO surfaces, not one: `ChatContextPanel` (committed) AND its twin `DraftContextPanel` (`features/chat/surfaces/draft-context-panel-surface.tsx`, drafts). Both are Base-UI `<Tabs>` with the same resolve + `when`-gating; both DIE at M3, unified under one `ContextDefinition` over a PHASE-DISCRIMINATED `ChatContextState` union (`CommittedChatContext | DraftChatContext`).
4. **`contextHeader` was never fed.** The M1.cutover bridge's `contextHeader` half has ZERO callers (as-built AND pre-cutover `home-page.tsx`, verified `git show f232a5b1~1`); the context panel renders the static "Details" fallback for every section. M3 DELETES `contextHeader` with zero behavior change and NO replacement — do not build capability for an absent consumer.
5. **§6c M8 note:** `chatsSection` becomes a factory taking the contributor registry, flowed into `defineContextTabs`'s `contributors` (§6c). Recorded so M8 does not re-derive the seam.
6. **§6b addendum:** the Members-default tab is encoded by tab ORDER under the generic resolve — there is no default-tab config field, and none should be added.
7. **No `SectionSlot` type exists.** `context-slots.ts:7`'s header prose references a `SectionSlot.context`; it is stale draft prose, never a real type, and dies with the file at M3.

## 16. THE GATE SPEC

Bias: machine-enforceable — **the gate is the wall; prose is the why.** `E` = exists (cite) · `N` = new (build) · `A` = amend. Every N/A ts-morph gate lands as a `tooling/src/verify/gates/*.ts` descriptor (loader-discovered, `mustFlag`/`mustPass` self-tested per the house contract). Review-only rows state WHY machine-checking fails and carry the exact checklist.

| # | | Gate | Mechanism | RED condition |
| - | - | - | - | - |
| G1 | E (built M1) | `section-registry-completeness` | ts-morph | a `SECTION_IDS` member with no `SectionDefinition` in the door assembly; a definition not co-located under a feature (`features/*/lib/*-section.*`); two definitions for one id; **the PLANNED arm (O1):** a `content: {planned}` with an empty reason, or a planned section that also wires `list`/`header`/a real context (a badge-wearing half-build); **the anti-god-map arm:** a `sections={{…}}`/`modals={{…}}` object-literal map in `routes/**`, or a feature front-door import in `routes/**` other than the two sanctioned composition seams `router.tsx`→`features/auth` AND `app-root.tsx` (the M1.cutover fork-2 ruling — app-root is the permanent composition route). RED is limbo — a rail-visible section with no registration; a FULL or DECLARED-PLANNED definition both pass. (tsc's total Record carries missing/extra; the planned marker and the real body are one field, so a stale exemption is unrepresentable) **M3 amendment:** `wiresRealBody` must count a `context` initializer that is NOT the literal `{ kind: "none" }` — including a `defineContextTabs(…)` CallExpression — as a real body, else a planned section wired `context: defineContextTabs(…)` slips through. |
| G2 | E (built M1) | `no-parallel-section-map` | ts-morph | an object literal / `Record<Id, …>` type / array whose keys or `id` members cover ≥2 members of `SectionId`/`ModalSlotId`/`SettingsCategoryId`, outside the allowlist {the vocabulary tuple file, the door assembly, definition files}. Kills the next `SECTION_PANEL_DEFAULTS`/`YOU_MODAL_ROWS`. **M3 amendment:** the two `FLAG[lockdown-M3]` allowlist entries drop at M3 (those maps deleted). **M4 amendment (built):** the ModalSlotId arm is now LIVE (reads `MODAL_SLOT_IDS`; homes {`shell-store.ts`, `main.tsx`, `*-modal.tsx`}; `RAIL_ACTIONS` was DELETED-not-allowlisted — the rail derives). SettingsCategoryId LIVE (built M6.1), RE-KEYED to `ConfigGroupId` by the config revamp (#866 S1): reads `CONFIG_GROUP_IDS`; allowlist {the tuple homes incl. `state/config-group-ids.ts`, the door, `*-group.tsx` defs}. |
| G3 | E (built M3) | `context-definition-shape` | ts-morph, incremental-safe | post-M3, FOUR arms: (1) **mint-only tabs** — an object literal with `kind:"tabs"` + a `useResolved` member outside `lib/registry-contracts.ts` (a hand-rolled tabs renderer wearing the badge); (2) **zero-tab mint** — a `defineContextTabs` call whose `tabs` is `[]` AND no `contributors`; (3) **strict/publication arm (O5)** — a `defineContextTabs` call (or any `ContextTabDef<…>` type-ref, pre/post-M8 contributors) whose type arg is not `void` and not an identifier import-resolving to a type EXPORTED from `lib/registry-contracts.ts` — `any`/`unknown`/an inline type literal/an index signature is RED; (4) **bodies-split resurrection** — a JSX attribute or interface member named `bodies` typed `Record<string, ReactNode>` (readonly/Partial included) under `client/src`. (Tab↔body bijection is structural — one object — no bijection arm needed; the `Record<SectionId,…>` half is G2's type arm.) **HUD-1 H4 amendment (LIVE, hud-home-spec §8) — FOUR REGION-CLAIM arms, same gate, no new gate:** (5) **mint-only region** — a hand-rolled `{ claims, render }` def, or a hand-assembled `region:` renderer on an object literal, outside `lib/registry-contracts.ts`; (6) **one pane, one owner** — a SECOND `defineContextRegion(` call site project-wide; (7) **no feature paints shell chrome** — the `shell-panel-header` / `ctx-tab-strip` class literals in a `features/**` file outside `features/app-shell/**`; (8) **one region host** — a SECOND writer of the `data-context-region` probe attribute. Arms 6+8 are COUNT-based, never path-keyed (path-keyed-gates-die-on-rename), and self-guard on `ctx.scope.kind === "project"` so a `--changed` run cannot return a false single-writer verdict. DECLARED BLIND SPOT: arms 5–8 read LITERAL shapes — a claim assembled through a variable/re-export/computed property is invisible, so the HUD-1 §10 CTs are the required second lens. |
| G4 | E (built M6.1; RE-KEYED `config-group-completeness` by the config revamp #866 S1) | `config-group-completeness` | ts-morph | a `CONFIG_GROUP_IDS` member with no registered group (tsc); a group definition not co-located with its owner (`*-group`), a collection body outside `*-collection`; two defs for one id; the config host importing a feature's internals; **the ANCHOR-OUTSIDE-REGISTRY arm** (§6.8 — a file stamping `configAnchorId` that no `ConfigSectionContribution` renders); the collection create/import-is-data + orphan-body arms folded in from the retired `collection-registry-completeness`. The placeholder-honesty and skimmer-subcategories arms below are DELETED — tsc owns them since every non-collection group is a skimmer by type. As-was (M6.1 → SET-SEAMS): **SET-SEAMS stage-6 amendment (LIVE, docs/history/design/set-seams-spec.md §5.3):** both body arms key on the §5.3 `body` UNION — the placeholder arm on `{kind:"surface"}`'s `render` (the pre-stage-0 function `body` stopped type-checking, so the arm had gone silently dead), plus a new SKIMMER-PURITY arm: a `{kind:"sections"}` pane that still declares its own `subcategories` is RED — a skimmer's nav derives from the sections contributed at its anchor, so the list is the old map left beside the new |
| G5 | E (built M7) | `client-components-tier` | dep-cruiser (3 rules) | `components/` → `features/`/`routes/`/`main.tsx`; `lib/` → `components/`; `state/` → `components/`. Closes the verified tier hole |
| G6 | E (built M5) | `list-row-adoption` | ts-morph, both-ways allowlist ratchet | a **LIST-region surface file = one using `LibrarySurfaceShell`/`LibraryListLayout`/`createCollectionSurface`** (naturally excludes the R1 carve-out species — message/facet/setting rows live in content/settings regions). Within it, a `.map()` callback **OR a `renderItem`/`renderRow` prop callback** (virtualized lists — the M5-tighten arm; catching only `.map()` was a half-gate) returning interactive JSX (onClick/role/href) not rooted in `ListRow`/`LibraryRow`/an allowlisted composite → RED. Baseline zero; `ALLOWLIST` empty. R1 is the judgment half (cards vs rows) |
| G7 | E (built M5) | `confirm-uses-composite` | dep-cruiser | `from: features/**` `to: @orb/ui/alert-dialog` → RED. The composite (`ConfirmDialog`, tier-2 `components/`) lives outside features — no exemption; alert-dialog's only non-feature importers are the composite + ui tests |
| G8 | E (built M1) | `registry-assembly-at-door-only` | ts-morph | a `createRegistry(`/`createContributorRegistry(` call outside `main.tsx`/`compose/`; any mutating `register(` API existing at all |
| G9 | E (built M7) | `query-machine-seals` | ts-morph (import-specifier) | `useMutation` imported from `@tanstack/react-query` outside `data/`; `useInfiniteQuery` outside `data/create-collection-surface.ts`. Verified green today — hard seal |
| G10 | E (built M9) | `bus-channel-primitive` | ts-morph | `new EventEmitter(` under `packages/server/src/transport/` outside `bus-channel.ts` (buddy's domain-minted replay-buffer bus is out of scope — O4) |
| G11 | E (built M9) | `bus-definition-belts` | ts-morph | a `*_EVENT_TYPES` `satisfies Record<X["type"], true>` const in `@orb/contracts` with NO matching coverage gate file OR no client-side total map in `data/invalidation.ts` — a new bus cannot ship missing the chat bus's belt set |
| G12 | E (built M9) | `membership-fan-guard` | ts-morph | under `domain/chat/**` (the membership-scoped domain list, registry-driven), a single-user emit identifier (`emitUserEvent`) — member-visible state rides the member-fan op (`emitChatChanged`) or the chat bus, never an actor-only channel |
| G13 | E (built M4) | `modal-registry-completeness` (NEW) · `modal-body-not-placeholder` (re-pointed) · `placeholder-copy-registry` | ts-morph | **M4 built (2026-07-14):** `registry-pairing` RETIRED — the rail↔modal bijection is now structurally unbreakable (the rail DERIVES modal affordances from the registry; tsc carries completeness; each modal self-declares its `trigger`). NEW `modal-registry-completeness` MIRRORS G1: co-location (`features/*/lib/*-modal.tsx`) · uniqueness · planned-arm honesty · the **singleton-placement** arm (one modal per `avatar`/`topbar-command`/`mobile-tab`) · anti-god-map. `modal-body-not-placeholder` re-points at the `*-modal.tsx` defs (a function-arm `body` rendering `<SectionPlaceholder>` → RED; use `{planned}`). `placeholder-copy-registry` (M1, done — reads `SectionDefinition.placeholder`). |
| G14 | E (built M6.3; closed-set widened #921) | `sanctioned-css-homes` | fs check (standalone `fsBacked` gate) | a repository-owned product `.css` file under `packages/**` outside the five CSS paths in §4, or any of the six homes (including the DTCG token source) missing. `playwright/index.css` is harness-owned, not a product home. `settings-shell.css` DISSOLVED and its `.settings-flash-anchor` currently lives in `ui/styles/globals.css`; that placement is inventory, not proof of ideal semantic ownership. Since #114 the CT harness imports client globals in production order, so CT visibility no longer justifies the ui home. Count →80 |
| G15 | E | one-directional client tiers | dep-cruiser | `client-feature-front-door` · `client-features-no-cross` (type-only exempt) · `client-lib-floor` · `client-state-below-data` · `client-data-direction` · `client-forms-direction` · `client-features-below-routes` · `client-nothing-imports-main` — LIVE |
| G16 | E | compose, never paint | ESLint keystone | `className`/`style` on a raw intrinsic in `packages/client/src` (3 exact exemptions) — §4. **\[CORRECTED]** not ungated |
| G17 | E | token/value discipline | ts-morph | `no-color-literals` family · `no-arbitrary-tw-values` · `no-off-token-radius-shadow` · `no-off-token-inline-style` · `motion-token-purity` — LIVE |
| G18 | E | state discipline | ts-morph + eslint | `state-files` · `persist-partialize-and-total-migrate` · `no-raw-zustand-persist` · selector-stability pair · `no-effect-on-shared-selection` · static-`setState` ban · `persistence-boundary` — LIVE |
| G19 | E | data/query discipline | ts-morph | `no-array-literal-querykey` · `no-inline-invalidate-outside-seam` · `bus-on-data-no-store-write` · `no-fake-disabled-id` · `no-static-staletime` · `no-multiplexed-mutation-error` — LIVE |
| G20 | E | forms discipline | ts-morph | `form-factory-for-multifield` · `no-direct-useform` · `no-form-reset-in-autosave` · `no-form-state-in-useeffect` — LIVE |
| G21 | E | bus producer coverage | ts-morph | `bus-producer-coverage` — LIVE. ONE policy quantified over every belted bus union (it retired the five per-union ratchets, the user twin included), with `user-bus-deferred-member` carrying the one owner deferral as typed warning debt |
| G22 | E | structure/size/a11y | ts-morph | `client-structure` · `component-size` · `surface-a11y-focus` · `surface-in-a-container` · `no-raw-interactive-intrinsics` · `empty-state-has-action` · `no-interactive-role-in-features` · `test-presence-client` — LIVE |
| G23 | E (built, O2) | `feature-owns-definition` | fs check (standalone `fsBacked` gate) | a `packages/client/src/features/*` dir co-locating NO registered definition (`lib/*-{section,modal,pane,chrome}.tsx`) — a feature owns a rail section, a modal, a settings pane, or a chrome widget, or it is deleted. `prompt-manager` was deleted rather than exempted; NO exemption exists — `notifications` owns a chrome def |
| R1 | review | row/field ANATOMY choice (ListRow vs setting-row vs Field vs message anatomy) | — | WHY ungateable: the correct primitive follows the VALUE TYPE and interaction shape (the §13.8 R4 analog), not a syntactic signature. CHECKLIST: entity-in-a-collection → ListRow/LibraryRow · label+control settings line → setting-row · editable labeled input → Field · chat turn → the MESSAGE\_ROW\_SKINS machine · a repeated interactive row in a LIST surface matching none of these → reject |
| R2 | review + jscpd | composite promotion (≥2-feature duplication → `components/`) | — | WHY ungateable: semantic near-duplicates (same anatomy, different fields) defeat textual clone detection; jscpd (tsx, 5%) is the tripwire, the hoist is judgment. CHECKLIST: same anatomy in 2+ features AND changing together → tier 2; 3+ repeats of wiring → tier 3 factory; a genuine one-off → leave. `confirm-dialog.tsx`'s header (16 hand-assemblies before the composite) is the recorded cost of skipping this |
| R3 | review | fan-scope completeness for NEW multi-visibility features | — | WHY ungateable in general: whether state is "visible to others" is a domain-semantic fact the AST can't derive outside the known membership domains (G12 covers chat mechanically). CHECKLIST at contract review: who can SEE this state? every seer's channel gets the event (member-fan for rooms, per-person for owned) · durable-first if a miss diverges canon (else document the heal path) · the event type joins the union + coverage DEFERRED before the emit lands |
| R4 | review | three-states completeness (§11) | — | WHY ungateable fully: `empty-state-has-action` covers EMPTY mechanically; LOADING shape-match and ERROR-copy quality are visual judgments (side-eye's lens). CHECKLIST: skeleton matches final shape (no layout shift) · error = `QueryErrorState` with real retry · empty names the next step |
| R5 | review | HTTP fetch-fn discipline (§10) | — | WHY not yet gated: zero violations exist; a `fetch(`-in-features gate is trivial to add when the first offender appears — record it in Deferred with that trigger. CHECKLIST: multipart/binary → a `data/` fetch fn beside the existing four; everything else → tRPC |

Tally: **15 new (G1–G12, G14, G23, + the G13 amendment set) · 8 existing families cited (G15–G22) · 5 review-only with stated reasons (R1–R5).** **STATUS (2026-07-15): ALL of G1–G14 + G23 are BUILT and LIVE** — G1/G2/G8 (M1), G3 (M3), G13/`modal-registry-completeness` + `registry-pairing` RETIRED (M4), G6/G7 (M5), G4 (M6.1), G14 (M6.3), G5/G9 (M7), G10/G11/G12 (M9), G23 (O2, un-deferred post-core). The per-row `N` is the plan-time "new-to-build" designation; the live count is NOT restated here — `docs/architecture/core/Core-Enforcement-Active-Gates.md`'s own `(N registered gates)` line is the ONE home for it, and `enforcement-registry-parity` reds the day it disagrees with the discovered descriptor set. A copy in this doc was a second, ungated home and rotted at 133 for a month (repaired 2026-08-14). (`chrome-registry-completeness` is from the shell-chrome program; `feature-owns-definition` is O2.)

## 17. Migration / standardization plan (sequencing, not code)

Ordered so every step lands gate-green and unlocks the next; one commit per step; `pnpm check` + `pnpm test` green-to-commit:

- [x] **M0 — primitives (DONE, committed).** `createRegistry`/`createContributorRegistry` in `lib/registry.ts` + contracts in `lib/registry-contracts.ts` + unit tests; build G8 with it (born-compliant).
- [x] **M1 — sections + the thin route (DONE 2026-07-14, `f232a5b1`; M1.1–1.7 + cutover).** Introduce `SectionDefinition`; migrate one proven section (characters) end-to-end, then the rest (chats last — largest). Absorb the six structures member-by-member; delete each map when empty. The `/` route sheds the god-map, keeps only §7's residue, and is RENAMED `app-root.tsx` (ratified O7). Build G1+G2 in-wave.
- [x] **M2 — refinery registers PLANNED (DONE — ABSORBED into M1).** The total registry over `SECTION_IDS` forced all 7 sections to exist before cutover, so refinery got its declared-PLANNED def at M1.6 and G1's planned arms + the legacy-half-wiring death landed in the M1.cutover — M2 was never separable. `features/refinery/` gains its co-located definition with `content: { planned: "<reason>" }` + rail/defaults/copy + `context: {kind:"none"}` — the founding DECLARED-PLANNED member (§6a, E1); the legacy half-wiring dies with M1's maps. G1's planned arms activate here.
- [x] **M3 — context unification (DONE 2026-07-14, `be15c3f4`; the `defineContextTabs<S>` mint, §6b).** A blind `SectionContextHost` in app-shell switches on `context.kind`; the feature owns each section's projection hook. THREE steps (the M1.cutover bridge is a `Partial`, so per-section retirement is legal — the prop dies with its last entry): **M3.1** — the mint + resolved/non-generic contracts, the S-type move to `registry-contracts.ts`, the host + generalized `ContextTabsPanel(tabs, actions)`, migrate characters/presets/corpus/analytics (mint) + worldInfo (`single` → `body()` direct); delete `CONTEXT_SLOTS` + its 5 bridge entries. **M3.2** — chat's `useChatContextState` over the phase-union `ChatContextState` (both `ChatContextPanel` AND `DraftContextPanel` unified + DELETED, F0.1); delete the whole bridge (prop + `SectionContextBridge` + `contextHeader`, F0.2) + every `FLAG[lockdown-M3]` marker. **M3.3** — G3 (4 arms) + the G1/G2 amendments + a `resolveContextTabs` unit test. Full delete/build/done-gate blueprint: the M3 M-block in `../history/client-lockdown-agent-prompts.md`.
- [x] **M4 — modals (DONE 2026-07-14, `d4a1f3f4`; owner-locked extensible shape).** `ModalDefinition` `{id,title,presentation?,size?,trigger,body}` feature-owned at the door; each modal SELF-DECLARES its `trigger:{placement,label,icon}` and the rail/topbar/mobile-bar DERIVE their affordances from the registry (kills `RAIL_ACTIONS` + the synthetic consts, not allowlisted); `body` carries the DECLARED-PLANNED arm (mirror O1). Delete the `AppShellProps.modals` override + `MODAL_SLOTS` + `YOU_MODAL_ROWS` (derive); delivered via `ModalRegistryContext`. Gate family mirrors sections: RETIRE `registry-pairing`; NEW `modal-registry-completeness` (mirror G1 + singleton-placement); re-point `modal-body-not-placeholder`; G2 ModalSlotId arm LIVE.
- [x] **M5 — confirm/row adoption (built 2026-07-14).** Migrated 6 raw `AlertDialog` sites (the 5 named + `character-history-tab`'s RestoreConfirm) onto `ConfirmDialog`, extended with `cancelLabel?`/optional `description?`/`trigger?: ReactNode` (replacing unused `triggerLabel`)/`forceRender?` (nested-in-Dialog confirms). Wired G7 (dep-cruiser, hard) + built G6 (ratchet, `.map()` + `renderItem`/`renderRow` arms; baseline zero).
- [x] **M6 — settings de-god (DONE 2026-07-15).** M6.1 (`d6f3d6c5`): thin host — pane registry replaces the
  if-ladder; homes RULED (§5 rules 5+6, §8): tuple → `shell-store.ts`, Def + `SettingsViewerView` projection +
  Context/Provider → `state/settings-pane-registry*`, `when` fed by the host from its own non-suspense
  `sessions.me` read (never `useViewer()` — that hook was minted 2026-07-09, after M6.1, and retired
  unwired #73: every candidate consumer needed a narrower read than its composed shape); G4 built.
  M6.2 (`8a51b2c6`): the de-god moves — extract shared cross-boundary primitives to their tier FIRST
  (settingsAnchorId→#state, SettingSwitchRow→components/, scrollBehavior→@orb/ui/lib), then move panes out per
  owner (personas→persona, admin→user-admin, connections→credentials, workloads+backup→workloads; 3 `.gitkeep`
  de-stubbed; `prompt-manager` stays per O2; ownership by code-truth). M6.3: `settings-shell.css` dissolved →
  `ui/styles/globals.css`; G14 built.
- [x] **M7 — tier seals (DONE 2026-07-15, `9f489aeb`).** G5 (components tier) + G9 (query seals) — verified green today, pure locks; update `client-structure`'s stale RESERVED note.
- [x] **M8 — contributor seam (DONE 2026-07-15, `d4e4c68b`).** Both chat contributor registries live with a NO-OP (empty) assembly at the door + first mounted fake-contributor CTs proving render/`when`-gate (shown AND hidden) for BOTH seams. The surface seam is a discriminated union by anchor (room vs message state, §6c); the sketch's single `body` was refined to type each anchor. thread-flank flank layout is seam-owned + `@container`-responsive so no consumer can crush the reading column. rpg/crew now build against a live seam.
- [x] **M9 — bus channel unification (DONE 2026-07-15, `bb5850ff`).** `defineBusChannel<Key,Event>` extracted (chat/user/notifications plumbing unified; buddy EXCLUDED — O4 deferred); G10 + G11 + G12 built (count 80→83). Zero behavior change proven byte-equivalent (durability composition sites `entry/compose/{services,chat}.ts` are `git diff`-empty; the existing bus int-tests passed UNEDITED as the oracle). `subscribeAll` is a typed opt-in via overload (`{firehose:true}`) — only chat declares it; calling it on user/notifications is a tsc error, not a runtime no-op.
- [x] **M10 — auto-overlay (DONE 2026-07-15, `de513984`).** Built to the §4.1 law (O6): below a 64rem shell breakpoint a docked-default panel becomes a CLOSED slide-over (`collapsed`), openable on demand (`overlay`), restoring to docked on re-widen — via a second `narrowViewport` matchMedia signal (legal home) + the shared `resolvePanelMode` algebra (both `resolvePanel` and `useListDocked` consume it — no drift). Toggles write the ephemeral `openOverlayPanel` in the overlay regime, persisted `panelOverrides` only when wide (a resize never mutates the stored preference); Escape closes the slide-over (yields to a modal); `openOverlayPanel` renames `mobileSheet` (mobile byte-identical). The first pass (docked→open-overlay-on-load) was REFUTED by both lenses (a P0: occluded toggle + a sticky persisted collapse) and corrected to closed-by-default before commit. No new gate (still 83).
- [x] **M11 — docs (DONE 2026-07-15).** Promoted this doc to `core/` as ONE document (ratified O8 — no split), minted the D-entry, applied §15's reconciliations to the core `UI-*.md` docs, added R5's trigger to `Core-Enforcement-Deferred-Dropped.md`; every G-gate row was already live in `Core-Enforcement-Active-Gates.md`.

## 18. Decisions — ratified 2026-07-14 (O2 + O4 remain flagged)

| # | Ruling | Status |
| - | - | - |
| O1 | **Refinery: KEEP — registers as the founding DECLARED-PLANNED section** (`content: {planned: reason}`, §6a). G1 allows FULL or DECLARED-PLANNED; RED is limbo (rail-visible, unregistered) or a badge-wearing half-build. The planned marker and the real body are one field — a stale exemption is unrepresentable (the bus-coverage DEFERRED discipline, upgraded to a structural guarantee) | CLOSED |
| O2 | **Stub policy: CLOSED — un-deferred by the owner post-core.** The empty-dir gate SHIPS: `feature-owns-definition` (`Core-Enforcement-Active-Gates.md`) is RED when a `features/*` dir co-locates no registered definition (`lib/*-{section,modal,pane,chrome}.tsx`). `prompt-manager` was DELETED rather than exempted; every remaining feature owns a definition — including `notifications`, which owns a chrome def (`notifications-chrome.tsx`) — so NO exemption exists | CLOSED |
| O3 | **Backup: NO standalone feature — the pane is owned by `features/workloads` + the portability serde system** (backup/restore IS the workloads + portability export/import system). `backup-settings-surface` + import/export/bundle-tracker move under that ownership at M6. Tags stays settings-owned (O3 resolved backup only) | CLOSED |
| O4 | **Buddy bus: adoption of `defineBusChannel` DEFERRED.** The primitive covers chat + user + notifications now (M9); buddy keeps its replay-buffer emitter and adopts later — a tracked follow-up, not a migration item | **FLAGGED — tracked follow-up** |
| O5 | **STRICT typing** ("we like strict technical"): each section's REAL projection type is published in `lib/registry-contracts.ts` and `any`/`unknown`/loose-index escapes are gate-RED (G3 strict arm); contributors typecheck against the host's `S`. **Refined by the M3 design pass (2026-07-14, owner-authorized):** strictness lives at the `defineContextTabs<S>` MINT (`S` spelled once, there, checked against the published projection) — NOT a generic `ContextDefinition<S>`, which cannot ride the `never`-erasure (the variance proof, §6b). `ContextDefinition`/`SectionDefinition` are non-generic at the shell seam | CLOSED (§6b refined post-ratification) |
| O6 | **Auto-overlay: BUILD IT PROPER** — the §4.1 behavior is real committed law; the shell is built to it at M10 (removed from the §15 disagreement table; never amend the law down) | CLOSED |
| O7 | **The `/` route renames to `app-root.tsx`** (the draft's proposed name, locked) at M1 | CLOSED |
| O8 | **ONE document.** Doctrine + gate-spec promote as a single core doc; §16/§17 stay in-doc | CLOSED |
