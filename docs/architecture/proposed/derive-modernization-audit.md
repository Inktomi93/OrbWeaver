---
kind: program
status: active
updated: 2026-07-16
---

# Derive/Modernization Program — mint → migrate → SEAL (from the 2026-07-15 full-read audit)

> **Provenance:** 12 parallel Opus auditors read ALL of `packages/client/src` + `packages/ui/src` in
> full (~570 files, ~54.5k lines); orchestrator spot-verified the load-bearing claims. Excluded by
> instruction (tracked elsewhere): north-star PP1–PP5 / N1–N5 / §6 board, shell-chrome §E remainder,
> O4. **This doc is the ONLY tracker for what the sweep surfaced.**
>
> **The audit's answer** to "is chrome the last non-uniform seam?": **NO — three more seam classes**
> (W1 form-dialog composite gap · W2 ui skin-fragment tier · W3 state/forms plumbing) + a dupe tail
> (W4/W5) + a dead/stale sweep (W6, ruled). Overall verdict: strongly post-lockdown-disciplined —
> the gaps cluster exactly where no machine exists yet.

## §0 The law of this program: MINT → MIGRATE → SEAL, one wave

The audit's own root-cause: **an unsealed machine rots.** `WorkloadFormDialog` existed and 4 more
hand-rolls accumulated beside it; `useBoundField` declared itself "the ONE home" and 7 of 10 fields
never adopted it; `QueryErrorState`'s header records the 28-arm drift it was built to end — and 7 new
arms grew back. `ConfirmDialog` did NOT rot — because G7 sealed the raw primitive in the same motion.

So every wave below is **atomic**: build/hoist the machine, migrate every site, and land the
adoption gate — in ONE wave, full gate ritual each (inline `mustFlag`/`mustPass` proven to bite the
REAL violation shape, Core-Enforcement row + count bump, `__g_` fixture or `UNFIXTURABLE_GATES`,
scanRoot proven to fire). A composite without its seal is a DEFECT, not a milestone. Growth
(rpg/crew/expressions/plugins) then lands on walls, not conventions.

**Proposed D-ledger entry (owner mints — a law-level act):** *"A shared machine (composite, factory,
skin fragment, plumbing mint) ships WITH the gate that closes its raw-path door, in the same wave.
The audit class 'machine exists, adoption optional' is retired."* Companion doctrine: ui skin
fragments home in `ui/src/lib/` with purity signatures (§W2); client registry/store plumbing homes
behind mints (§W3).

**Standing tripwire ratchet:** after W1+W5 land, lower the `jscpd` threshold from 5% toward the
post-migration measured floor (client tsx was 3.15% after the 2026-07-13 consolidation) so the next
copy-paste class REDs instead of accumulating.

## W1 — the FormDialog rollup + `dialog-via-composite` (G24)

**Mint/migrate:** hoist `WorkloadFormDialog`/`WorkloadSubmitButton`
(`features/workloads/components/workload-dialog-scaffold.tsx`) → `components/` tier-2 `FormDialog`
(+ single-control prompt mode). Migrate: `user-admin/components/{admin-create-user-dialog,
admin-reset-password-dialog,admin-user-sessions-dialog}.tsx` · `persona/anchors/
first-run-persona-dialog.tsx` · `character/components/character-create-menu.tsx` (2 dialogs) ·
`world-info/components/book-details-dialog.tsx` · `preset/components/variable-editor-dialog.tsx`
(judge fit). Build `TagPickerDialog` on it — the tag prompt dialog is byte-identical ×4 across TWO
features (`character/components/{character-bulk-bar.tsx:79,character-tags-row.tsx:75}` ·
`settings/components/{tag-create-button.tsx:41,tag-settings-row.tsx:168}`). Build
`RelationManagerSection` (tier-2; `character-relations-tab.tsx:37-99` vs `:101-163` + the
`world-info/components/attachment-rows.tsx` mirror). `MacroPreviewField`
(`character-facet-editor.tsx:237` vs `character-greeting-preview.tsx`) — med, same wave or W5.

**SEAL — G24 `dialog-via-composite`** (ts-morph, both-ways allowlist ratchet — the G6 shape, NOT a
dep-cruiser hard ban): RED when a `features/**` file imports `Dialog` from `@orb/ui/dialog` and is
not on the allowlist. Post-migration the allowlist enumerates the sanctioned NON-form species WITH
cited reasons (expected: chat `rename-chat-dialog`/`invite-dialog` (§13.4), gallery/picker/palette
surfaces — decided at migration, each entry cited); an allowlisted file that stops importing → RED
(stale entry). Every NEW feature dialog is forced to answer "which composite?" — `ConfirmDialog`
(alert) · `FormDialog` (form/prompt) · or an allowlist entry with a reason. `mustFlag`: a feature
file hand-assembling Dialog+DialogTitle+footer. `mustPass`: a `FormDialog` consumer + an allowlisted
species file.

## W2 — the ui skin-fragment tier + `ui-skin-fragment-purity` (G25)

**Mint/migrate:** extract to `ui/src/lib/` (the `FOCUS_RING`/`OVERLAY_MOTION` precedent):
`POPUP_SURFACE` (select/autocomplete/combobox byte-identical + menu/popover) · `OVERLAY_ARROW`
(6 seals) · `SCRIM(tier)` (popover-z ×3 + modal-z ×3) · `ITEM_ROW` (autocomplete≡combobox; select/
menu layer state-attrs) · `SELECTION_CONTROL` + `TOUCH_TARGET_PSEUDO` (checkbox/radio/+switch) ·
`CONTROL_SIZE` (button≡toggle) · `FIELD_CONTROL` (input/textarea/select) · `DISABLED_STATE` (~17
files) · `ACCENT_HOVER`. Fix the two paint defects in the same pass: toast's PARTIAL hand focus-ring
(`toast/variants.ts:24,26` → compose `FOCUS_RING`) and avatar's `ring-(--color-primary)` →
`ring-ring` (`avatar/variants.ts:32`). Restructure `alert-dialog` to COMPOSE dialog's popup/scaffold
(clone today). `LabeledChartFrame` for bar-list/histogram. **Virtualizer trio RULED (Fable, from the
lock-the-shape stance): EXTRACT** `gapPxFor`/`GAP_TOKENS` + the unbounded-height tripwire to `lib/`
— pure token math + an invariant; lib is exactly the shared-infra tier the seals already lean on for
focus-ring/motion; the "each seal owns its own" comments predate the fragment tier and die with the
copies.

**SEAL — G25 `ui-skin-fragment-purity`** (ts-morph over `ui/src/**` variants/class strings;
DATA-DRIVEN signature table so the gate grows with the tier): RED when a class string outside
`ui/src/lib/` contains a banned fragment signature — initial table: `focus-visible:ring-` (compose
`FOCUS_RING*` — catches the toast class forever), `before:size-touch-target` (compose
`TOUCH_TARGET_PSEUDO`), `rotate-45 border border-border bg-popover` (arrow), the scrim/`bg-scrim`
backdrop pair, `data-disabled:pointer-events-none data-disabled:opacity-50` (compose
`DISABLED_STATE`). Adding a fragment to lib = adding its signature row. `mustFlag`: a variants.ts
re-spelling the arrow. `mustPass`: composing the constant; `lib/` itself.

**Sequencing:** ui-package-only — ship WITH the PP1–PP5 lane (one combined ui-polish wave).

## W3 — plumbing mints + three seals (G26–G28)

| Mint | Migration | SEAL |
| - | - | - |
| `createRegistryContext<Def>(name)` in `lib/` (returns `{Context, useRegistry, Provider}`) | the 4 byte-identical context+provider pairs (`state/{section,modal,settings-pane,chrome}-registry-{context,provider}` — 8 files → 4 one-line mints) | **G26 `registry-context-via-mint`** (ts-morph): a `createContext` call whose type references `Registry<`/`ContributorRegistry<` outside the mint's home → RED |
| `createDrillSelectionStore(name, {secondary?})` in `state/` (primary id + optional sub-drill + the `fromList`/`dismiss` overlay dual-write arm) | `state/{corpus,analytics}-selection-store.ts` (exact twins) + `{character,preset,world-info}-selection-store.ts` (same + sub-drill) | **G27 `selection-store-via-factory`** (ts-morph, location-keyed like G23): a `state/*-selection-store.ts` calling `createGatedStore(` directly instead of the factory → RED |
| finish `useBoundField` (already exists) | the 7 straggler bound fields (`forms/bound-fields/{text,textarea,select,switch,multi-toggle,macro,avatar-upload}-field.tsx`; restore textarea's dropped `hint`) | **G28 `bound-field-via-hook`** (import-specifier seal, the G9 shape): `useFieldContext(` referenced under `forms/bound-fields/**` outside `use-bound-field.ts` → RED |
| shared base the two form factories COMPOSE (identical `onSubmitInvalid`, debounce const, draft-seed guard, draft-mirror; do NOT merge — submit-gating legitimately diverges) | `forms/create-{autosave,saved}-entity-form.ts` | tsc + existing factory tests (internal refactor; no new gate) |

`SECTION_GROUPS` spelled twice (`state/section-registry.ts:15` + `app-shell/lib/rail-slots.ts:5`):
**ABSORBED by chrome §E-1** (the SectionGroup re-home) — do not double-do.

## W4 — battery adoption + `render-error-via-battery` (G29)

**Migrate:** the 7 hand `renderError` arms → `QueryErrorState`
(`preset/surfaces/preset-editor-surface.tsx:50` · `preset/components/preset-usage-context.tsx:24` ·
`stats/surfaces/analytics-{overview,character}-surface.tsx` ·
`stats/components/analytics-{models,personas,time}-tab.tsx`). Build the small non-suspense
`QueryInlineStates` helper in `data/` (pending/error/empty slots) for the dialog/poll reads
QueryBoundary can't absorb (`user-admin/components/admin-engines-section.tsx:45` +
`admin-user-sessions-dialog.tsx:57`; optional: `chat/anchors/character-gallery-dialog.tsx` ×2).

**SEAL — G29 `render-error-via-battery`** (ts-morph, incremental-safe): a `renderError` JSX attr in
`packages/client/src/**` whose expression is not `QueryErrorState`-rooted (reference to it, or an
arrow returning it) → RED. QueryBoundary already DEFAULTS to QueryErrorState, so custom arms should
be rare-to-zero; a genuinely-custom error UI earns an allowlist entry with a cited reason.
`mustFlag`: an inline `renderError={() => <Text>failed</Text>}`. `mustPass`: default (no prop) + a
`renderError={({retry}) => <QueryErrorState onRetry={retry} …/>}` arm. The non-suspense
`isPending` ladder class stays R-review (predicate too fuzzy to gate honestly — do NOT ship a
half-gate).

## W5 — small derive/dupe fixes (one mech-executor wave; jscpd ratchet after)

| # | Fix | Sites | Conf |
| - | - | - | - |
| 1 | DELETE preset's divergent `estimateTokens` (chars/4) — import `@orb/kit/tokens` | `preset/components/prompt-assembly/estimate-tokens.ts:12` | high |
| 2 | `chatSummaryRowView(chat)` in chat lib + `ChatSummaryRow` composite | `chat-list-surface.tsx:186` · `chat-landing-surface.tsx:128` (+2 title-only) | high/med |
| 3 | hoist `PERSON_LABEL` + shared Impersonate submenu | `composer-wand.tsx:17` + `chat-options-menu.tsx:28` (+`preset/…/guided-actions-section.tsx:130`) | high |
| 4 | hoist `headerCopy` + `sectionGlyph` → `preset/lib/assembly-model.ts` | `preset-section-inspector.tsx:66`+`section-body-editor.tsx:47`; `section-body-editor.tsx:38`+`section-row.tsx:37` | med |
| 5 | `RhythmFigures({temporal})` | `analytics-overview-surface.tsx:100` + `analytics-time-tab.tsx:53` | med |
| 6 | discovery: `characterFacetLine` (×4) · shared `CharacterAvatar` (×2 defined, ~3 inlined; the app-wide ~15-file Avatar+initials+hueSeed idiom = a SEPARATE tier-2 decision, flag at build) · promote `ScoreBadge` | `discovery/components/corpus-search-results.tsx` et al | med |
| 7 | `useWorkloadSubscription({onProgress,onTerminal})` adapter | `bundle-workload-tracker.tsx:26` + `use-workload-stream.ts:29` | med |
| 8 | ONE home for the `ROW_REVEAL` posture literal (hoist beside `row-actions-menu`'s copy; candidate G25-client signature later) | `character-card.tsx:44` + `components/row-actions-menu.tsx:23` | med |
| 9 | **G4 ARM (gate, same wave): `settings-section-anchored`** — a heading-bearing `<Section` in a `*-settings-surface.tsx` without `id={settingsAnchorId(…)}` → RED (kills the invisible-to-nav/search class); fix the two live offenders + the stale index entry | `credentials/surfaces/connections-settings-surface.tsx:164,189` (+ subcategory in `connections-pane.tsx`) · `settings/lib/appearance-pane.tsx:124` (`surfaceTexture`) | med |
| 10 | `NEW_INJECTION` seed ×2 · `MaintenanceKindNote` copy ×2 | `injections-manager.tsx:42`+`draft-context-tabs.tsx:29`; `{run-workload,create-schedule}-dialog.tsx` | low |
| 11 | shiki `ORB_LIGHT` derives from `SEED_THEME_VALUE_SETS.light` (kills the admitted silent-drift trap) | `ui/src/markdown/shiki-plugin.ts:124` | high |

## W6 — dead/stale sweep (RULED: the orphan seals are intentional pre-builds)

**OWNER RULING (Nate, 2026-07-15): the four orphan seals are INTENTIONAL pre-builds — KEEP.**
Make the ruling structural so hygiene never re-flags them: each gets a greppable
`PREBUILT[for:<design-doc>]` header line naming its consumer (`@orb/ui/diff` → refinery/compare ·
`charts/meter` `Meter`+`SegmentedClock` → rpg fronts clocks · `stream/stream-text.tsx` →
sanctioned convenience wrapper · `primitives/status-chip` → workloads/automation chips) + one row
each in `Core-Enforcement-Deferred-Dropped.md`. The marker names the consuming design doc; when the
consumer lands, the marker deletes in the same edit (the O1 self-cleaning shape). A `PREBUILT` whose
cited doc is deleted = Documentation-Law defect.

**Mechanical deletes/corrections (mech-executor, one wave):** dead barrel exports —
`settings/index.ts` `SettingsShell`+`ThemePickerSurface` · `app-shell/index.ts:7-8`
`YouSheet`+`useIsMobileViewport` · `forms` `withForm`+`withFieldGroup` ·
`preset/lib/preset-editor-bridge.ts:31` `readAssemblyForm` (lying header) ·
`preview-model.ts:146` retired `fires` param (+ its only-test) · `data/trpc.ts:62` `createTrpcProxy`
false prod-doc claim · `markdown/to-plain-text.ts` (zero consumers + advertised callers that never
materialized — delete OR give it a `PREBUILT` citation like the seals). Stale-comment sweep: 8 files
still cite `routes/home-page.tsx` (`data/bus/use-user-bus.ts:5,12` · `state/active-chat-store.ts:2` ·
`persona/index.ts:3` · `chat/lib/join-token.ts:9` · `chat/anchors/join-invite-dialog.tsx:4` ·
`world-info/index.ts:3` · `character/hooks/use-character-mutations.ts:4` · `auth/index.ts:2`) +
`state/chrome-registry.ts:2` ("no consumer this wave" — false since slice 1) +
`lib/agent-tools.README.md:43` (50ms vs the real 100ms) + generated `--color-highlight` no-op
`light-dark(X,X)` (tokens fix, low).

## Seam coverage — the parked designs vs the built extension surfaces (verified 2026-07-16)

The owner asked whether MORE contributor-style seams are needed for the feature backlog. Swept every
parked design's client-hook expectations against the built surfaces. **The governing bar (the M8
precedent + the M3 `contextHeader` deletion):** a seam is pre-built EMPTY only when a parked design
NAMES the need; otherwise extension = tuple/union growth (compile-forced) and "no capability for an
absent consumer" holds.

| Design ask | Seam | Status |
| - | - | - |
| crew panel CONTEXT tab · rpg "Game" tab | `chat-context` contributor registry (`ContextTabDef<ChatContextState>`) | **BUILT (M8, empty)** |
| crew edit-proposal chip / "audit this reply" (asked for a "NEW `message-footer` region") · rpg per-message chips | `chat-surface` registry, anchor `message-footer` | **BUILT (M8)** — crew's ask predates M8; its doc now carries the built-truth note (07-client-ui). Verify at CW5 that `MessageView` covers `{chatId,messageId,variantId}`; extend `ChatMessageSurfaceState` ADDITIVELY if not |
| rpg HUD content-flank (crew 04 names it) | `chat-surface` anchor `thread-flank` (seam-owned responsive flank) | **BUILT (M8)** |
| expressions v1 sprite holder (`#expression-holder` successor) | `thread-flank` fits; else a new `stage` anchor = ONE tuple + union arm (the designed extension move) | **COVERED — decide flank-vs-new-anchor at expressions build** |
| expressions background layer | `ThemeOverride.background` token + ThemeScope/shell render (D44) — the theming pipeline, not a contributor seam | **HOMED (D44)** |
| crew card-evolution review section on the CHARACTER detail page ("same registry pattern, owned by the character feature") | **DOES NOT EXIST** — zero contributor machinery in `features/character` | **THE ONE NAMED GAP.** Build M8-style (empty registry + factory param + fake-contributor CT) at the north-star §6 characters stop or crew CW3, whichever lands first |
| tool-use / rpg tool chips | `TOOL_RENDERERS` (tool kind → chip renderer, D48 `<details>` fallback) — named by tool-use 03 §4 + crew 07 | **FUTURE — lands WITH tool-use's client phase; MUST be a door-assembled contributor registry, never a hand map** (record so it isn't improvised) |
| crew spellchecker composer button | ruled IN-CHAT by crew's own doc (home: the composer feature) — no cross-feature seam named | **NO SEAM NEEDED** |
| databank / hub-browse sections · agent-principal / automation panes · new modals/chrome | the section/modal/pane/chrome registries — closed-tuple growth, tsc-total | **COVERED (the registries ARE the seam)** |
| new message content kinds (imagery D44 blocks, tool records) | `@orb/contracts` DU + the `assertNever` switch — compile-forced | **COVERED (contracts, not a seam)** |
| new domain events (all designs) | the E4 bus ritual + G11 belts | **COVERED** |

**Watch-list (no design names these yet — mint M8-style on the FIRST cross-feature ask, do not
pre-build):** a composer-ACTION contributor (wand items / trailing affordances) · a command-palette
contributor (the palette currently derives sections+modals).

## Clean verdicts (recorded so nobody re-audits)

Seal integrity (echarts/lexical/shiki leak-free) · layout primitives (one GAP/ALIGN table) ·
`invalidation.ts` maximally derived · `main.tsx` door re-spells nothing · routes thin · all mutations
on `createEntityMutation`, all real forms on the factories, zero hand `fetch()` in features ·
workloads vocab fully contracts-derived · G7 held (zero hand-rolled ALERT-confirm anatomy) ·
shell.css no dead rules · ui primitives orphan-free (ast) · label `Record<Enum,string>` maps over
bare contract tuples are the SANCTIONED copy-home, not violations.

## Sequencing + routing (folds into the north-star game plan)

- **W2 merges into the PP lane** (one ui-polish wave: PP1–PP5 + fragments + G25). Executor + verifier;
  side-eye on the visible skins.
- **W1 before the §6 rollout** (the rollout repaints those features — land the composite + G24 first).
  Executor + verifier + side-eye (dialogs live).
- **W3 anytime; pairs naturally with chrome §E-1** (SECTION_GROUPS absorption). Executor (mints) +
  mech-executor (migrations) + verifier (gate honesty — each seal proven to bite the real shape).
- **W4/W5/W6-mechanical:** independent mech-executor waves, verifier on the two new gate arms.
- Gate count 125 → ~131 (G24–G29 + the G4 arm). Every gate: full ritual, scanRoot proven to fire.
- **Plan RATIFIED by the owner 2026-07-16** (docs synced: north-star "Sequencing" is the ONE ordered
  queue across all three programs; shell-chrome carries the W3/§E-1 pairing). **Outstanding owner
  ask: mint the §0 D-entry** (a law-level act) — the doctrine is applied by this program either way.
