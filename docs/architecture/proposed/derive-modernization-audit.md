---
kind: reference
status: draft
updated: 2026-07-15
---

# Derive/Modernization Audit — client + ui full-read sweep (2026-07-15)

> **Provenance:** 12 parallel Opus auditors, each reading its slice IN FULL (~570 files, all of
> `packages/client/src` + `packages/ui/src`, ~54.5k lines), hunting for anything not yet on the
> derived-everything architecture. Orchestrator spot-verified the load-bearing claims against source.
> Excluded by instruction (already tracked elsewhere): north-star PP1–PP5 / N1–N5 / §6 board,
> shell-chrome §E remainder, O4. **This doc is the work queue for everything the sweep surfaced;
> nothing here is tracked anywhere else.**
>
> **The headline answer** (the owner asked "is chrome the last non-uniform seam?"): **NO — three more
> seam classes surfaced**, each the same disease the lockdown killed (one anatomy, hand-copied, kept
> in sync by discipline): the **form-dialog composite gap** (W1), the **ui skin-fragment tier** (W2),
> and the **state/forms plumbing mints** (W3). Everything else is a tail of small dupes (W4/W5) and a
> dead/stale sweep (W6). Overall verdict: the tree is strongly post-lockdown-disciplined — features
> ride the machines; the gaps are concentrated exactly where no machine exists yet.

## W1 — the FormDialog rollup (the ConfirmDialog move, part 2) — HIGHEST VALUE

`ConfirmDialog` absorbed the ALERT anatomy (G7). Nothing absorbs the **form/prompt-in-a-dialog**
anatomy (Dialog → DialogPopup → Stack → DialogTitle(+Description) → field(s) → Cancel/primary footer),
so it is hand-pasted client-wide. **The composite already exists, feature-private:**
`features/workloads/components/workload-dialog-scaffold.tsx` (`WorkloadFormDialog` +
`WorkloadSubmitButton`, its own header says "settings-local" — clone-audit item 7 left half-finished).

| # | Action | Sites | Conf |
| - | - | - | - |
| 1 | Hoist `WorkloadFormDialog`/`WorkloadSubmitButton` → `components/` (tier-2 `FormDialog`), extend for a single-control "prompt" mode | the scaffold + all below | high |
| 2 | Migrate hand-rolled form-dialog shells | `user-admin/components/{admin-create-user-dialog,admin-reset-password-dialog,admin-user-sessions-dialog}.tsx` · `persona/anchors/first-run-persona-dialog.tsx` · `character/components/character-create-menu.tsx` (2 dialogs) · `world-info/components/book-details-dialog.tsx` · `preset/components/variable-editor-dialog.tsx` (weak fit — judge) | high |
| 3 | `TagPickerDialog` shared composite — the tag prompt dialog is byte-identical ×4 across TWO features | `character/components/{character-bulk-bar.tsx:79,character-tags-row.tsx:75}` · `settings/components/{tag-create-button.tsx:41,tag-settings-row.tsx:168}` | high |
| 4 | `RelationManagerSection` — the attach/detach picker anatomy repeated (query-attached + query-all → id-Set → attached ListRow list + picker Dialog + all-linked empty) | `character/components/character-relations-tab.tsx:37-99` vs `:101-163` (+ mirror shape `world-info/components/attachment-rows.tsx`) | high(dup)/med(hoist) |
| 5 | `MacroPreviewField` — preview↔edit toggle over Markdown/MacroTextarea + token counter, twice | `character/components/character-facet-editor.tsx:237-275` vs `character-greeting-preview.tsx` | med |

Carve-outs that stay (verified, do not migrate): chat `rename-chat-dialog`/`invite-dialog` (§13.4),
`AddCredentialDialog` (full `createSavedEntityForm` form).

## W2 — ui/lib skin-fragment tier (the ui-package parallel-maps disease)

`ui/src/lib/` already proves the pattern (`FOCUS_RING`, `OVERLAY_MOTION`, `anchor-gap`) — but the
highest-repetition fragments never got extracted. One PR adds the constants; the seals compose them.

| # | Fragment | Duplicated in | Conf |
| - | - | - | - |
| 1 | `POPUP_SURFACE` (anchored-popup shell) | select/autocomplete/combobox (byte-identical) + menu/popover | high |
| 2 | `OVERLAY_ARROW` (`size-row rotate-45 border border-border bg-popover`) | 6 seals: menu/select/combobox/autocomplete/popover/tooltip | high |
| 3 | `SCRIM(tier)` (backdrop, popover-z + modal-z tiers) | menu/select/popover + drawer/dialog/alert-dialog | high |
| 4 | `ITEM_ROW` (item base skin) | autocomplete≡combobox byte-identical; select/menu same shape, per-lib state attrs | high |
| 5 | `SELECTION_CONTROL` + `TOUCH_TARGET_PSEUDO` | checkbox/radio-group (near-verbatim); the `before:` touch lift identical ×3 (+switch) | high |
| 6 | `CONTROL_SIZE` ramp | button/variants.ts:23 ≡ toggle/variants.ts:21 | high |
| 7 | `FIELD_CONTROL` (input skin) | input/textarea/select | med |
| 8 | `DISABLED_STATE` | ~17 primitives; exact doubled form ≥4 | med |
| 9 | `ACCENT_HOVER` | button secondary/ghost, toast action, toggle/tabs/sortable/number-field | med |
| 10 | **Paint defect:** toast `close`/`action` hand-inline a PARTIAL focus ring (missing offset pair) — the drift `focus-ring.ts` exists to prevent | `toast/variants.ts:24,26` (also autocomplete/combobox per sibling audit) | high |
| 11 | avatar accent ring uses `ring-(--color-primary)` not the semantic `ring-ring` + re-spells the offset pair | `avatar/variants.ts:32` | med |
| 12 | alert-dialog is a structural CLONE of dialog (popup skin + Portal→Backdrop→Viewport→Popup bundle), not a composition | `alert-dialog/{variants.ts:14,alert-dialog.tsx}` | med |
| 13 | `LabeledChartFrame` — bar-list/histogram variants byte-identical + same heading/empty/theme scaffold | `charts/{bar-list,histogram}/` | med |
| 14 | **DOCTRINE ASK:** the 3 virtualizer seals duplicate `gapPxFor`/`GAP_TOKENS`/unbounded-height tripwire VERBATIM with "deliberate isolation" comments — ruling wanted: keep the isolation or extract to lib/ | `virtual-list.tsx:22`, `message-list.tsx:25`, `media-grid.tsx:14` | med |

Sequencing: W2 is ui-package-only — ship WITH or immediately before the PP1–PP5 lane (same territory).

## W3 — state/forms plumbing mints (derive the derive-machinery itself)

| # | Action | Sites | Conf |
| - | - | - | - |
| 1 | `createRegistryContext<Def>(name)` mint in `lib/` — the 4 context+provider pairs are byte-identical modulo type name (~19 lines each; comments admit "mirrors … exactly") | `state/{section,modal,settings-pane,chrome}-registry-{context.ts,provider.tsx}` (8 files) | high |
| 2 | `createDrillSelectionStore(name)` factory — 2 stores code-identical; 3 more add the same sub-drill arm + the same `fromList`/`dismiss` overlay dual-write pair | `state/{corpus,analytics}-selection-store.ts` (exact) + `{character,preset,world-info}-selection-store.ts` | high |
| 3 | Finish `useBoundField` adoption — its header claims it's THE home, but only 3/10 bound fields ride it; the other 7 hand-roll the identical preamble (textarea currently drops `hint`) | `forms/bound-fields/{text,textarea,select,switch,multi-toggle,macro,avatar-upload}-field.tsx` | high |
| 4 | Extract shared base the two form factories compose (identical `onSubmitInvalid`, `DEFAULT_DEBOUNCE_MS`, draft-seed guard, draft-mirror) — compose, do NOT merge (submit-gating legitimately diverges) | `forms/create-{autosave,saved}-entity-form.ts` | med |
| 5 | `SECTION_GROUPS` tuple spelled twice — **ABSORBED BY chrome §E-1** (the SectionGroup re-home is already in that step); fold, don't double-do | `state/section-registry.ts:15` + `features/app-shell/lib/rail-slots.ts:5` | high |

## W4 — battery adoption (mechanical, mech-executor)

| # | Action | Sites | Conf |
| - | - | - | - |
| 1 | Replace hand `renderError` arms with `QueryErrorState` (its own header names this exact drift) | `preset/surfaces/preset-editor-surface.tsx:50` · `preset/components/preset-usage-context.tsx:24` · `stats/surfaces/analytics-{overview,character}-surface.tsx` · `stats/components/analytics-{models,personas,time}-tab.tsx` (7 arms) | high |
| 2 | Inline non-suspending pending/error/empty triad helper (QueryBoundary can't absorb non-suspense dialog/poll reads) | `user-admin/components/admin-engines-section.tsx:45` + `admin-user-sessions-dialog.tsx:57` (+ optional `chat/anchors/character-gallery-dialog.tsx` ×2) | med |

## W5 — small derive/dupe fixes (feature tier, one mechanical wave)

| # | Action | Sites | Conf |
| - | - | - | - |
| 1 | DELETE preset's divergent `estimateTokens` (chars/4, miscounts non-ASCII) — import `@orb/kit/tokens` (the canonical QuadChars one) | `preset/components/prompt-assembly/estimate-tokens.ts:12` | high |
| 2 | `chatSummaryRowView(chat)` in chat lib (title/subtitle/when projection triplicated) + a `ChatSummaryRow` composite (the two `ListRow` consumers) | `chat/surfaces/chat-list-surface.tsx:186` · `chat-landing-surface.tsx:128` · title-only ×2 more | high/med |
| 3 | Hoist `PERSON_LABEL` impersonate map (+shared submenu) — byte-identical ×2 | `chat/components/composer-wand.tsx:17` + `chat-options-menu.tsx:28` (+3rd label site `preset/components/guided-actions-section.tsx:130`) | high |
| 4 | Hoist `headerCopy` + `sectionGlyph` into `preset/lib/assembly-model.ts` (verbatim ×2 each) | `preset-section-inspector.tsx:66` + `section-body-editor.tsx:47`; `section-body-editor.tsx:38` + `section-row.tsx:37` | med |
| 5 | `RhythmFigures({temporal})` — byte-identical StatFigure cluster ×2 | `stats/surfaces/analytics-overview-surface.tsx:100` + `components/analytics-time-tab.tsx:53` | med |
| 6 | discovery helpers: `characterFacetLine` (×4), shared `CharacterAvatar` (×2 defined + ~3 inlined; NOTE the Avatar+initials+hueSeed idiom recurs ~15 files APP-WIDE — a global composite is a separate decision), promote `ScoreBadge` | `discovery/components/corpus-search-results.tsx` et al | med |
| 7 | `useWorkloadSubscription({onProgress,onTerminal})` adapter — the subscribe envelope decode duplicated | `workloads/components/bundle-workload-tracker.tsx:26` + `hooks/use-workload-stream.ts:29` | med |
| 8 | ONE home for the `ROW_REVEAL` hover-posture literal | `character/components/character-card.tsx:44` + `components/row-actions-menu.tsx:23` | med |
| 9 | Settings derive-coverage: Host Claude/OpenRouter sections have NO subcategory anchor (invisible to nav/scroll-spy/search); `surfaceTexture` missing from the effects search index | `credentials/surfaces/connections-settings-surface.tsx:164,189` + `connections-pane.tsx`; `settings/lib/appearance-pane.tsx:124` | med/low |
| 10 | `NEW_INJECTION` seed constant ×2; `MaintenanceKindNote` copy ×2 | `chat/components/injections-manager.tsx:42`+`draft-context-tabs.tsx:29`; `workloads/components/{run-workload,create-schedule}-dialog.tsx` | low |
| 11 | shiki `ORB_LIGHT` hand-transcribes two `SEED_THEME_VALUE_SETS.light` values (header admits the silent-drift trap) — derive from `#tokens` | `ui/src/markdown/shiki-plugin.ts:124` | high |

## W6 — dead/stale sweep + the build-ahead ruling

**Mechanical deletes/corrections (mech-executor):**

- Dead barrel exports: `settings/index.ts` `SettingsShell`+`ThemePickerSurface` · `app-shell/index.ts:7-8` `YouSheet`+`useIsMobileViewport` · `forms` `withForm`+`withFieldGroup` (zero consumers) · `preset/lib/preset-editor-bridge.ts:31` `readAssemblyForm` (LYING header — claims callers that don't exist) · `preset/components/prompt-assembly/preview-model.ts:146` retired `fires` param (+ its only-test) · `data/trpc.ts:62` `createTrpcProxy` prod-doc claim false (test-only consumer).
- Stale-comment sweep: **8 files still cite `routes/home-page.tsx`** (renamed `app-root.tsx` at O7): `data/bus/use-user-bus.ts:5,12` · `state/active-chat-store.ts:2` · `features/persona/index.ts:3` · `chat/lib/join-token.ts:9` · `chat/anchors/join-invite-dialog.tsx:4` · `world-info/index.ts:3` · `character/hooks/use-character-mutations.ts:4` · `auth/index.ts:2`. Plus `state/chrome-registry.ts:2` header ("no consumer this wave" — false since slice 1) and `lib/agent-tools.README.md:43` (says 50ms; `long-task-tracer.ts:7` = 100ms).
- `markdown/to-plain-text.ts` `toPlainText`: zero consumers, doc advertises callers that never materialized.
- generated `theme.css` `--color-highlight(-foreground)` emit no-op `light-dark(X, X)` — tokens.build or tokens.json fix (low).

**OWNER RULING NEEDED — orphan build-ahead seals (keep-as-prebuild vs delete; all fully built,
CT-only consumers):** `@orb/ui/diff` (`DiffView`) · `charts/meter` (`Meter` + `SegmentedClock` — header
cites rpg "fronts clocks", a proposed/ feature) · `stream/stream-text.tsx` `StreamText` wrapper ·
`primitives/status-chip` (whole primitive, zero consumers). Given [[lock-the-extensible-shape]] and the
proposed/ backlog these are plausibly deliberate pre-builds — but each needs a one-line disposition so
knip/G23-style hygiene doesn't rot.

## Clean verdicts (verified, recorded so nobody re-audits)

Seal integrity (echarts/lexical/shiki/etc leak-free) · layout primitives (one GAP/ALIGN table) ·
invalidation.ts maximally derived · main.tsx door re-spells nothing · routes thin (no god-map creep) ·
all mutations on `createEntityMutation`, all real forms on the factories, zero hand `fetch()` in
features · workloads vocab fully contracts-derived · G7 confirm migration held (zero hand-rolled
ALERT-confirm anatomy anywhere) · shell.css no dead rules · `pnpm ast orphans` clean on ui primitives A
scope · label `Record<Enum,string>` maps over bare contract tuples are the SANCTIONED copy-home
pattern, not violations.

## Sequencing (folds into the north-star game plan)

W2 rides with PP1–PP5 (same ui-package lane). W3-#5 is absorbed by chrome §E-1. W1 lands before the
§6 rollout (the rollout touches those features). W4/W5/W6-mechanical are independent mech-executor
waves, anytime. W6's build-ahead ruling is an owner ASK.
