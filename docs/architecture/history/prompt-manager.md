# THE ASSEMBLY — canonical build spec (the orbweaver prompt manager)

STATUS: build-ready. Consolidated from five refinement rounds; the design decisions here are FINAL —
executors build from this doc, they do not re-litigate. Visual source of truth: the self-contained
mockup (`the-assembly.html`, session scratchpad) — every surface below was rendered there; where the
mockup and this spec disagree, THIS SPEC WINS (§9 lists the reconciliations).

Doctrine that binds every phase (constitution `docs/architecture/core/AGENTS.md`):

- **Compose-only** — a surface cannot paint itself: no `className` on raw intrinsic elements; all
  styling comes from @orb/ui primitives + layout variants.
- **ZERO net-new @orb/ui primitives.** Every composed primitive exists today (§0.2 inventory). The ONE
  net-new piece of machinery in the whole build is the form bridge (§2.3) — flag it to the verifier.
- **Container queries, not viewport** — responsive behavior inside a region derives from the region's
  own width; the ONLY viewport fork is the shell's mobile fork, and it lives in the ROUTE (§3.4).
- **Component-size cap 450 lines** per component file.
- Direct-bind form: every field binds the nested `PromptConfig` via the existing
  `createSavedEntityForm` instance (`use-preset-form.ts:16-18`) — no flat mapper, no parallel state.

---

## 0 · The four-region layout

The Assembly lives entirely inside the existing shell's `presets` section
(`features/app-shell/lib/rail-slots.ts:93`, panel defaults `:119` — `list: docked, context: collapsed`).
No shell changes beyond one registry append (§3.1).

| Region | Role | Built on |
| - | - | - |
| RAIL | Persistent nav — `presets` in the `authoring` group. Already shipped (`rail-slots.ts:93`). | no change |
| LIST | **The preset hub**: "Active for generation" dropdown · search · CRUD (New/Duplicate/Rename/Delete/Import) · library rows with a PASSIVE amber active-indicator. | `preset-library-surface.tsx` + `state/preset-selection-store.ts` |
| CONTENT | **The rack** — the existing tabbed editor (`preset-editor-surface.tsx`); the Prompt tab becomes toolbar · zone strip · full-width sortable rack · three collapsed Sections (Message delivery / Message handling / Guided actions). Two new nav tabs (Variables, Regex). | `preset-editor-surface.tsx`, `preset-structure-tabs.tsx`, `preset-nav.ts` |
| CONTEXT | **The section inspector** as a CONTEXT TAB pair (Section / Usage), registry-driven. Selecting a section docks it open; nothing selected ⇒ collapsed + EmptyState. | `CONTEXT_SLOTS` append (`context-slots.ts:30`), route wiring (`home-page.tsx:300-316`) |

Selection flows left → right: manage in LIST → compose in CONTENT → inspect in CONTEXT.

### 0.1 Region interaction contract

- LIST row click = `selectPreset(id)` (`state/preset-selection-store.ts:23-25`) → route swaps CONTENT
  to `PresetEditorSurface` (`home-page.tsx:306-311`). Row selection NEVER activates a preset.
- Activation = the LIST dropdown ONLY, binding `seeds.defaultPresetId`
  (`contracts/src/settings/index.ts:398`) via `settings.updateUserSettingsSection {section:"seeds"}` —
  the `useSetPersonaSeed` precedent (`features/persona/hooks/use-persona-identity.ts:25-29`,
  `busDriven: true`).
- Rack row's name button = `selectPresetSection(sectionId)` (§2.2) → CONTEXT reveals the Section tab
  (§3.4 choreography). `selectPreset` clears the section selection.

### 0.2 Primitive inventory (all EXIST — verified against `packages/ui/src/`)

`primitives/`: sortable (`SortableList`), badge, status-chip (`StatusChip`), switch, button, input,
select, number-field (`NumberField`), toggle-group (`ToggleGroup`), macro-textarea (`MacroTextarea`),
dialog, empty-state (`EmptyState`), menu, list-row, tabs, toast, alert-dialog, collapsible, tooltip.
`layout/`: container, grid, row, section, stack, toolbar.
Nothing else may be added to @orb/ui for this build.

---

## 1 · BUILD PREREQUISITES (server — do these FIRST; they unblock the client)

### P1 — order-sort bug (ST within-depth ordering)

**Target:** `packages/server/src/domain/chat/assembly/injections.ts:145-153`.
**Decision:** the secondary comparator must sort `order` ASCENDING — ST parity: low = top, high =
closer to the tail. Our schema declares ST parity (`contracts/src/preset/index.ts:51-54`) and the
importer carries `injection_order` verbatim, so a DESC secondary runs imported ST presets with their
within-depth ordering reversed.

**STATE OF TREE (verify, don't re-apply):** the comparator is ALREADY ascending in the working tree —
`injections.ts:151-153` reads `(a.inj.order ?? defaultOrder) - (b.inj.order ?? defaultOrder)` with
`defaultOrder = 100` (`:150`), and the comments at `injections.ts:145-149` + `preset/index.ts:51-54`
already record the corrected semantics. **What REMAINS:** the assembler ordering test — no test file
imports `spliceInChatInjections` today (repo-wide grep: only the four assembly source files reference
it).

**Test (required):** a `spliceInChatInjections` unit test proving low-order-lands-higher: two
`in_chat` injections at the same depth with `order: 5` and `order: 200` splice with the `order: 5`
row ABOVE the `order: 200` row; absent order defaults to 100; equal depth+order keeps array order.
Place it per the mirror-test convention next to the assembly tests.

**Done:** test exists and is green; comparator + both comment sites verified ascending.

### P2 — `roleHandling` schema move (connection knob → preset user intent)

**Decision:** `roleHandling` is USER INTENT, not connection config. Move it from
`RouteChatAssignment` into the preset's `params.advanced`.

Edits:

1. **Schema add:** `contracts/src/preset/index.ts` — add `roleHandling: roleHandlingSchema.optional()`
   inside `userIntentSchema.advanced` (`:161-183`), beside `squashSystemMessages` (`:181`). Import
   `roleHandlingSchema` from `#connection` (`contracts/src/connection/index.ts:135`; the
   `ROLE_HANDLING` tuple `:132-133` = `none · merge · semi-strict · strict`).
2. **Schema retire:** `contracts/src/connection/index.ts:358-361` — delete
   `RouteChatAssignment.roleHandling`; `:316-320` — delete the `ResolvedConnection.roleHandling`
   carry.
3. **Threading retire:** `server/src/domain/connection/verbs/resolve-chat.ts:25-27` (the carry into
   `ResolvedConnection`) and `verbs/resolve-role.ts:42-45, 77, 84, 119, 225` (the per-agent/default
   override merge) — remove the `roleHandling` threading.
4. **READ re-thread:** `server/src/domain/chat/engine/pipeline.ts:450-453` — SHAPE currently receives
   `roleHandling: args.connection.roleHandling`; hand it the PRESET value
   (`config.params.advanced?.roleHandling`) instead. `roleHandlingFloor` stays
   `args.connection.capability.turns?.roleHandlingFloor` (capability schema
   `connection/index.ts:210`).
5. **CLAMP UNCHANGED:** `assembly/shape.ts:249` (`clampRoleHandling(input.roleHandlingFloor,
   input.roleHandling)`) and `role-squash.ts:42` (`max(floor, knob)`) do not move. Update the D66-C
   homing comments (`shape.ts:87-93`, the preset schema comment) to record the reversal.

**Test:** existing role-squash/shape/resolve tests stay green after re-threading; add/adjust one
pipeline-level test proving the preset value reaches the clamp (preset says `strict`, floor `none` ⇒
strict; preset says `none`, floor `strict` ⇒ strict).

**Done:** `rg roleHandling packages/contracts/src/connection` hits only `ROLE_HANDLING`/
`roleHandlingSchema`/`roleHandlingFloor` (the vocabulary + the floor — no user knob); full suite green.

### P3 — SERDE fixes (ST import)

**Target:** `contracts/src/preset/index.ts` `DROPPABLE_FIELDS` (`:1153-1167`).

1. `squash_system_messages` (`:1164`) — currently dropped with reason "neo squashes system messages
   automatically" (false post-D66-C). MAP it: importer sets
   `params.advanced.squashSystemMessages: true` when the ST field is `true`; remove the drop row.
2. `group_nudge_prompt` (`:1155`) — the drop STAYS (the field remains chat/room-owned, not
   preset-owned) but the reason string "no group chats" is stale post-rooms; correct it (e.g.
   "group nudge is room-owned, not preset-owned").

**Test:** adjust the ST-import tests: a preset with `squash_system_messages: true` imports with
`params.advanced.squashSystemMessages === true` and does NOT report it dropped; `group_nudge_prompt`
still reports dropped with the corrected reason.

**Done:** import tests green; `importStChatCompletionPreset` (`preset/index.ts:1233`) round-trips the
squash flag.

**Gate for §1:** `pnpm check` + full `pnpm test` (background run, `timeout: 600000` — never tail).

---

## 2 · PHASE A — scaffolding (pure libs + state + the form bridge)

All client. No rendering yet. Everything here gets its own unit tests (pure functions + the bridge).

### 2.1 Pure libs — `features/preset/lib/`

**`derive-zones.ts` (create).** Pure. Zones are DERIVED at render, never stamped on sections:

- Input: `readonly PromptSection[]` (schema `contracts/src/preset/index.ts:392-437`).
- Find the FIRST section with `type === "marker" && marker === "chat_history"`
  (`PLAIN_MARKERS`, `:347-351`). Everything above = zone `setup`; everything below = zone `post`.
- Returns per-index zone assignments + flags: `missingPivot` (no chat\_history — the rack shows a
  callout), `duplicatePivotIndexes` (2nd+ chat\_history rows render as inert warning rows, zone still
  derives from the FIRST).
- Also derives the zone summaries for the strip: per zone `{enabledCount, tokenEstimate}`.

**`estimate-tokens.ts` (create).** Pure, heuristic (\~chars/4 over resolved-ish text): a section's
displayed `~token` figure — literal `content`, templated `template ??
DEFAULT_MARKER_TEMPLATES[marker]` (`preset/index.ts:465-476`), plain markers `0`/em-dash. This is a
UI hint, mono-rendered; no server call.

**`marker-copy.ts` (create).** `MARKER_COPY: Record<MarkerType, {label, oneLiner, subtitle}>` — the
plain-language per-marker copy (rack subtitles, inspector header one-liners, the empty-default
explainers for `main_prompt`/`post_history`). Registry-as-data; net-new FILE, not net-new machinery.

### 2.2 Selection-store extension — `packages/client/src/state/preset-selection-store.ts` (edit)

> NOTE: the store lives at `packages/client/src/state/` (central state tier), NOT
> `features/preset/state/` — extend it in place (`createGatedStore`, `:17-20`).

Add `selectedSectionId: string | null` beside `selectedPresetId` (`:12-15`); writers
`selectPresetSection(id)` / `clearPresetSection()`; `selectPreset` (`:23-25`) CLEARS
`selectedSectionId` (opening a different preset never carries a stale section). Reactive selector
`useSelectedPresetSectionId()`. Stays non-persisted (transient UI selection — the store's own header
doctrine, `:1-7`).

### 2.3 THE FORM BRIDGE — `features/preset/lib/preset-editor-bridge.ts` (create) ⚠ NET-NEW MACHINERY

The one genuinely new piece; highest-risk item; REQUIRES its own unit tests + a fresh-context
verifier pass.

Why: CONTENT and CONTEXT are sibling shell regions — no shared React ancestor below the route, so
lexical form context cannot cross. TanStack Form instances are external stores, so a published live
handle binds cleanly across the boundary (`form.AppField` works from any subscriber).

Shape:

- Module-scope `let handle: {presetId: PresetId; form: AppFormInstance<PromptConfig>} | null` + a
  listener set — a hand-rolled external store.
- `publishAssemblyForm({presetId, form})` — called from `PresetEditor`
  (`preset-editor-surface.tsx:63-97`) in a mount effect keyed with the existing `key={mountKey}`
  remount (`:101`); cleanup on unmount clears the handle. A remount (save/reset cycles `mountKey`)
  republishes.
- `useAssemblyForm(): typeof handle` — `useSyncExternalStore` subscriber for the inspector.

Guards (the inspector renders the EmptyState unless ALL hold — stale ids must never crash):

1. `handle !== null`
2. `handle.presetId === selectedPresetId`
3. `selectedSectionId` resolves against `handle.form.state.values.sections` (find by `s.id`) — a
   stale id after delete/undo ⇒ EmptyState, never a throw.

**Unit tests (required, colocated):** publish/clear lifecycle; republish-on-remount; subscriber
notification; each guard branch (null handle / preset mismatch / unresolvable section id).

**Done-criteria (Phase A):** all three libs + store extension + bridge exist with green unit tests;
`pnpm check` green. Node tests deep-import the modules, not barrels (dom-less graph rule).

---

## 3 · PHASE B — core: CONTEXT wiring + the rack + the inspector

### 3.1 CONTEXT\_SLOTS wiring

**`features/app-shell/lib/context-slots.ts` (edit).** Append to `CONTEXT_SLOTS` (`:30-40`):

```ts
presets: [
  { id: "section", label: "Section" },
  { id: "usage", label: "Usage" },
],
```

**`routes/home-page.tsx` (edit).** Replace the presets `context` slot (`:312-315`, today a bare
`<PresetUsageContext>`) with the characters precedent (`:282-294`): a `<ContextTabsPanel
section="presets" bodies={{section: <PresetSectionInspector …/>, usage: <PresetUsagePanel …/>}}>`
when `selectedPresetId !== null`, else `undefined`. The Usage body = the existing
`PresetUsageContext` content (`features/preset/components/preset-usage-context.tsx`) PLUS an
"Active for generation" block (reads `seeds.defaultPresetId`, offers the same activation write as
the LIST dropdown — one mutation hook, §4.1, shared).

### 3.2 Prompt-tab recomposition — `preset-structure-tabs.tsx` (edit) + new components

The Prompt tab (`preset-structure-tabs.tsx:41-88`) becomes, top to bottom:

1. **`<AssemblyToolbar>`** (`features/preset/components/assembly-toolbar.tsx`, create): the
   turn-type LENS (`ToggleGroup` over `All` + the 6 `GENERATION_TYPES`,
   `contracts/src/preset/index.ts:364-372` — all six, the mockup's 4-chip lens is superseded §9) —
   a VIEW filter (dims/filters rows whose `trigger` excludes the lens type; local component state,
   not form state) · `Compose | Preview` ToggleGroup (local state) · `Add` Button (Menu: literal /
   each marker type not yet placed).
2. **`<ZoneSummaryStrip>`** (create): two text chips (Row + Badge/StatusChip + Text) from
   `derive-zones` summaries — `SETUP n on · before the conversation · ~tok` / `POST n on · after
   your message · ~tok`.
3. **`<AssemblyRack>`** (§3.3) — full width.
4. Collapsed `<Section>`s (`@orb/ui/layout` Section + Collapsible):
   - **Message delivery** — the PRESERVED existing bindings moved here verbatim:
     `namesBehavior` (`preset-structure-tabs.tsx:45-53`), `continuePostfix` (`:54-62`),
     `params.thinkingDisplay` (`:63-71`), PLUS the orphaned `formatStrings.continueNudge`
     (schema `preset/index.ts:515-520`; default `DEFAULT_FORMAT_STRINGS.continueNudge` `:441-445`
     as ghost) as a `MacroTextarea`.
   - **Message handling** — §5.
   - **Guided actions** — §6 (replaces the current inline guided-action fields `:74-85`).

### 3.3 THE RACK — `features/preset/components/assembly-rack.tsx` (+ `section-row.tsx`, `pivot-band.tsx`)

**ONE `<SortableList handle getItemKey={(s) => s.id}>` over ALL sections — the `chat_history` pivot
INCLUDED as a real sortable item.** `handle` mode = grip-only drag keeps row content clickable and
keyboard reorder free — verified: `sortable.tsx:52-57` (handle prop) + `:6-14` (KeyboardSensor +
Accessibility plugin are on by construction).

- `renderItem` branches: `PivotBand` for `marker === "chat_history"`, `SectionRow` otherwise
  (duplicate pivots after the first render as inert warning rows).
- `onReorder(orderedKeys)` → key-diff against current order → `form.moveFieldValues("sections",
  from, to)` (the real TanStack API — `@tanstack/form-core@1.33.0` `FormApi.d.ts:484`; the design
  summary's `form.moveValue` is shorthand for this).
- Zones re-derive on every render from the first `chat_history` index (`derive-zones`, §2.1):
  left-edge accent setup=steel-blue / post=warm-amber (variant tokens, compose-only). Dragging the
  pivot re-zones live.
- Missing pivot ⇒ callout row (StatusChip warning + "Add chat history" action). No form mutation on
  render — derive, don't stamp.

**`SectionRow`** — a DOMAIN COMPOSITION (`Row` + `Badge` + `Switch` + ghost `Button`), NOT
`ListRow`: ListRow's contract is a string `title` + single clickable body
(`ui/src/primitives/list-row/list-row.tsx:4-57`) and cannot hold this anatomy. Anatomy (3 native
tab stops: name-button · switch · grip):

- grip (SortableList's handle affordance)
- type-glyph `Badge`: quill = literal, brackets = templated marker, gear = plain marker
- name + plain-language subtitle (`MARKER_COPY`) — ONE ghost `Button` wrapping name+subtitle; click
  \= `selectPresetSection(s.id)` + reveal choreography (§3.4)
- cue badges ONLY-WHEN-SET: `@depth·order` inject chip (`inject` present, schema
  `preset/index.ts:386-390`), trigger-count chip (`trigger` non-empty), lock chip
  (`forbidCharacterOverride || forbidRoomOverride`), template-state dot (templated marker with
  custom/silent template), U/A role chip (role !== system)
- `~token` estimate (mono, `estimate-tokens`; struck-through when disabled)
- enabled `Switch` → `form.AppField name={`sections\[${i}].enabled`}`

**`PivotBand`** (`chat_history`) — a real sortable item, full-width horizon band: grip + wave glyph

- "Chat history" + enabled `Switch`; edge labels `up: setup · sent before the conversation` /
  `down: post · sent after your last message`. **NO cache claim on the band** — cache-stability is
  model-dependent (ruled).

### 3.4 Reveal choreography — route-built callbacks

The `useIsMobileViewport` fork lives in the ROUTE (`home-page.tsx`), never a feature→feature import
(the shell precedent: `use-shell-layout.ts:14-20, 76-81`). The route builds and passes down:

- `revealSectionInspector()`: `setContextTab("section")` (`state/shell-store.ts:244-246`) +
  desktop ⇒ `setPanelMode("context", "docked")`; mobile ⇒ `setMobileSheet("context")` (both writers
  exported from `#state`, see `use-shell-layout.ts:23-30`).
- `dismissSectionInspector()`: `clearPresetSection()` (+ mobile sheet close).

Selecting a section docks CONTEXT open; nothing selected ⇒ CONTEXT collapsed with an `EmptyState`
("Select a section to inspect it").

### 3.5 PresetSectionInspector — `features/preset/components/preset-section-inspector.tsx` (create; split per-type bodies into sibling files under the 450 cap)

Renders from the bridge (`useAssemblyForm()`, guards §2.3). Per-type anatomy:

- **Header:** type glyph + marker label + `MARKER_COPY` one-liner + mono section id with copy
  affordance.
- **Identity:** `name` `Input` → `sections[i].name`; `role` `Select` (`MESSAGE_ROLE_ITEMS`,
  `preset-nav.ts:104-112`) → `sections[i].role` — **EXCEPT `chat_history`, which has NO role field**
  (special-cased: the transcript carries its own roles). WI markers (`world_info_before/after`) KEEP
  role + additionally surface the SHARED `formatStrings.wiFormat` wrapper `Textarea`
  (`preset/index.ts:518`; default `{{entry}}` `:444`) with a "shared by both WI markers" hint.
- **Body per-type:**
  - literal → `MacroTextarea` → `sections[i].content`.
  - templated marker → Default / Custom / Silent tri-state (`ToggleGroup`) mapping to `template`
    unset / string / `""` (`preset/index.ts:419-422`), ghosting `DEFAULT_MARKER_TEMPLATES[marker]`
    (`:465-476`); Custom shows `MacroTextarea` → `sections[i].template`. For
    `main_prompt`/`post_history` the default is `""` (`:466-467`) — show the `MARKER_COPY`
    explainer, NOT an empty ghost.
  - plain marker → explainer only (no template).
- **Placement (literal + templated only):** In flow / Spliced `ToggleGroup` (= `inject` unset/set);
  Spliced reveals `depth` `NumberField` (0..`MAX_INJECTION_DEPTH` — `@orb/kit/injection`, value
  100 000; seed **4** on first set) + `order` `NumberField` (seed **100**, the assembler default
  `injections.ts:150`) + a depth ruler visual. **ORDER copy is POSITIONAL:** "lower sits higher;
  higher lands closer to your latest message" (ST-parity post-P1 semantics — no priority/wins
  language). Binds `sections[i].inject.depth` / `sections[i].inject.order`.
- **Fires on:** Every-generation `Switch` (= `trigger` unset) → off reveals 6 `GENERATION_TYPES`
  chips (`ToggleGroup` multi) → `sections[i].trigger`.
- **Override locks** — shown ALWAYS for `main_prompt`/`post_history`; for other templated markers
  only when a flag is already set: `forbidCharacterOverride` + `forbidRoomOverride` `Switch`es
  (`preset/index.ts:425-428`) + hint "only affects main/post".
- **Footer:** Duplicate (`form.insertFieldValue("sections", i+1, {...section, id: newId()})`) ·
  Move-to-zone (splice across the pivot index) · Delete (`form.removeFieldValue("sections", i)` +
  undo toast; on delete, `clearPresetSection()` — the bridge guard then shows EmptyState).

**Done-criteria (Phase B):** rack renders all sections + pivot; grip-drag AND keyboard reorder
reorder the form array; pivot drag re-zones accents + strip counts live; row click reveals the
inspector in CONTEXT (desktop dock + mobile sheet); every inspector field round-trips through
`form.handleSubmit` → `preset.update`; chat\_history shows no role field; stale-section guard
verified by test. Existing Message-delivery bindings preserved.
**Gate:** `pnpm check` + client tests + a side-eye pass on the rack + inspector.

---

## 4 · PHASE C — the LIST hub (`preset-library-surface.tsx` edit + new components)

Builds on the existing surface (`preset-library-surface.tsx:56-129`) + selection store.

1. **"Active for generation" dropdown** (above search): `Select` over `preset.list`, value =
   `seeds.defaultPresetId` (`settings/index.ts:398`). Write via a new
   `useSetDefaultPreset` = `createEntityMutation` on
   `trpc.settings.updateUserSettingsSection` `{section: "seeds", value: {defaultPresetId}}` —
   clone of `useSetPersonaSeed` (`use-persona-identity.ts:25-29`), `busDriven: true`.
2. **Rows:** keep `PresetLibraryRow`; add the PASSIVE amber active-indicator (leading dot / ACTIVE
   chip) when `preset.id === defaultPresetId`. **No per-row "make active" button** (ruled). Row
   click stays `selectPreset` (open-to-edit).
3. **CRUD** (verbs exist — `server/src/domain/preset/verbs/{create,update,remove,…}.ts`; hooks
   `use-preset-mutations.ts`):
   - New = `preset.create` (existing `onCreate`, `preset-library-surface.tsx:71-75`).
   - Duplicate = `preset.create` with the source preset's `config` + "Copy of {name}".
   - Rename = `preset.update` (inline or Dialog; row kebab `Menu`).
   - Delete = `preset.remove` with an ACTIVE-DELETE GUARD: deleting the preset whose id ==
     `defaultPresetId` requires an AlertDialog warning ("this is your active preset") — the stale
     id itself degrades safely at consumption (`settings/index.ts:397` comment), but the user must
     be told.
   - Import = file pick → `importStChatCompletionPreset(json)` (`@orb/contracts/preset`,
     `preset/index.ts:1233` — isomorphic, runs client-side) → `preset.create` with the resulting
     config; surface the `dropped` fields report in a toast/dialog.

**Done:** dropdown activates (bus-driven invalidation refreshes both LIST + Usage tab); passive
indicator tracks; all five CRUD paths work; active-delete guarded.
**Gate:** `pnpm check` + tests; side-eye on the hub.

---

## 5 · PHASE D — Message handling (collapsed Section in the Prompt tab; REQUIRES P2)

Two controls (`features/preset/components/message-handling-section.tsx`, create):

1. **Adjacent-role merging — an EDITABLE preset `Select`**: items none / merge / semi-strict /
   strict (`ROLE_HANDLING`, `connection/index.ts:132-133`) + unset = "Model default". Binds
   `params.advanced.roleHandling` (the P2 schema move). Below it:
   - a live floor line: "this model enforces at least **{floor}** — stricter always wins", floor
     from the chat-role capability the editor already resolves
     (`preset-editor-surface.tsx:71-84` → `capability.turns.roleHandlingFloor`,
     `connection/index.ts:210`); no capability ⇒ line hidden.
   - a clamp `StatusChip` when the picked value is BELOW the floor ("clamped to {floor}").
     This is the FUNNEL made visible: user intent stored, model floor shown, resolver clamps
     `max(floor, choice)` at `shape.ts:249` — the UI never clamps, it only annotates.
2. **Squash system notes** — `Switch` → `params.advanced.squashSystemMessages`
   (`preset/index.ts:176-181`).

**Done:** both fields round-trip; floor line + clamp chip react to the capability; P2 pipeline test
proves the stored value reaches the clamp.

---

## 6 · PHASE E — Guided actions (collapsed Section in the Prompt tab)

Server fully shipped: `guidedActionsSchema` (`preset/index.ts:245-261`), `DEFAULT_GUIDED_ACTIONS`
(`:263-270`), resolver in `@orb/kit/guided`. This is a pure client recomposition replacing the
current flat fields (`preset-structure-tabs.tsx:74-112`).

`features/preset/components/guided-actions-section.tsx` (create):

- **Header:** framing copy ("when you steer a generation, the matching template wraps your text —
  `{{input}}` is where your steer lands") + a live cross-link chip to the `guided_instruction`
  marker in the rack: healthy (marker present + enabled) / OFF-warning (present, disabled) /
  absent-warning (no marker). Chip click scrolls/selects the marker row.
- **A 2-col `Grid` of ALL SIX cards** (`GUIDED_ACTION_KINDS`, `:195-203`: response / swipe /
  impersonate / rewrite / opening / continue — the mockup's 4-card grid is superseded, §9). Each
  card: kind title + fires-on line · role `Select` → `guidedActions.<kind>.role` · template
  `MacroTextarea` → `guidedActions.<kind>.prompt`, ghosting `DEFAULT_GUIDED_ACTIONS[kind].prompt` ·
  Default/Customized state line · a missing-`{{input}}` lint (warning Text when the template
  doesn't contain `{{input}}`).
- `impersonate` card shows a `{{person}}` chip (`GUIDED_IMPERSONATE_PERSONS`, `:209-214`).
- Assistant-role cards show a prefill honesty note (assistant-role delivery is depth-normalized on
  non-prefill wires — `injections.ts:73-79, 137-144`).
- **NO per-action enabled field** (ruled: user-invoked; the `guided_instruction` marker's rack
  switch is the gate).

**Done:** six cards bound (`guidedActions.<kind>.prompt` / `.role`); cross-link chip states correct;
ghost/customized detection correct (compare against `DEFAULT_GUIDED_ACTIONS`).

---

## 7 · PHASE F — Preview mode

Toolbar `Preview` toggle (§3.2) swaps the rack for `<AssemblyPreview>` (create): an assembled
read-out —

- ordered ENABLED sections under the current lens, grouped with role block headers,
- macro chips (render `{{…}}` tokens as inline `Badge`s — display only, NO macro resolution:
  never resolve against live chat data here),
- a conversation band inset showing spliced (`inject`-carrying) sections at their depth positions
  (reuse `derive-zones` + the P1 ordering semantics: within a depth, lower `order` sits higher),
- click-through: clicking any block flips back to Compose, `selectPresetSection(id)` + reveal
  inspector (§3.4).

**Done:** preview order matches the assembler's documented semantics (setup → history → post;
splices by depth desc, order asc within depth); click-through lands on the right section.

---

## 8 · PHASE G — Variables + Regex tabs (+ the LOAD-BEARING merge flip)

1. **`preset-nav.ts` (edit):** append `variables` + `regex` to `PRESET_EDITOR_TAB_IDS` (`:28-37`)
   and `PRESET_EDITOR_TABS` (`:50-59`); `preset-editor-surface.tsx` (edit): two new `TabsPanel`s
   (`:144-155` pattern).
2. **Variables tab:** `ListRow` list over `variables[i]` (`choiceBlockSchema`,
   `preset/index.ts:484-492`: name/question/options/defaultValue/multiSelect/separator/randomPick)
   - editor `Dialog` binding `variables[i].*`; add/remove via
     `form.pushFieldValue`/`removeFieldValue("variables", i)`.
3. **Regex tab:** same shape over `regexScripts[i]` (`regexScriptSchema` via `#regex`,
   `preset/index.ts:510`) + editor Dialog.
4. **⚠ LOAD-BEARING — same commit as the tabs:** in `preset-editor-model.ts` `mergeOnSubmit`
   (`:98-118`) the two hardcoded assignments at `:103-104` — `regexScripts: server.regexScripts` and
   `variables: server.variables` — MUST FLIP to `edited.regexScripts` / `edited.variables`, and the
   stale header comment (`:8-12`, "server-only fields the panel never edits (…regexScripts/
   variables…)") corrected, plus the twin comment at `:90-91`. Shipping the tabs without the flip
   silently discards every edit on save; shipping the flip without the tabs is harmless but the two
   land TOGETHER for atomicity.

**Done:** edits to variables/regex survive a save round-trip (test: edit → `mergeOnSubmit` output
carries `edited.*`); tabs render; dialogs bind.

---

## 9 · Mockup ⇄ spec reconciliations (spec wins; reconciled toward the design summary)

1. **Lens chips:** the mockup renders `All · Normal · Continue · Swipe · Quiet` (4 of 6 types).
   SPEC: `All` + all six `GENERATION_TYPES` (`normal, continue, impersonate, swipe, regenerate,
   quiet` — `preset/index.ts:364-372`).
2. **Guided-action cards:** the mockup renders 4 cards + a "+ Swipe · Rewrite" footnote. SPEC: all
   six cards in the grid.
3. **Store path:** the summary cited `features/preset/state/preset-selection-store.ts`; the real
   file is `packages/client/src/state/preset-selection-store.ts` (central state tier). The
   extension edits the real path.
4. **P1 already landed:** the summary orders "FLIP the secondary comparator"; the working tree
   already has the ascending comparator + corrected comments (`injections.ts:150-153`,
   `preset/index.ts:51-54`). P1 reduces to VERIFY + the (still missing) ordering test.
5. **Line drift (informational):** `squash_system_messages` drop row is `:1164` (summary `:1163`);
   `group_nudge_prompt` is `:1155` (summary `:1154`); `advanced.squashSystemMessages` is `:181`
   (summary `:180`); `mergeOnSubmit` hardcoded assigns are `:103-104` (summary said "the two
   hardcoded assignments" unnumbered). Sections block is `:321-541` (summary "\~320-520").
6. **`form.moveValue`:** shorthand — the real API is `form.moveFieldValues(field, from, to)`
   (`@tanstack/form-core@1.33.0`).
7. **Mockup footer button** "Move below conversation" = the Move-to-zone action (label flips by the
   section's current zone).
8. **Mockup shows an unused `.make-active` style** — dead mockup CSS; there is NO per-row activation
   affordance (passive indicator + dropdown only).

---

## 10 · Build order, risk register, verification

Order: §1 (P1→P2→P3, server) → §2 (A) → §3 (B) → §4 (C) → §5 (D, needs P2) → §6 (E) → §7 (F) →
§8 (G). C/D/E are independent after B and may parallelize across builders with disjoint file sets.

| Risk | Mitigation |
| - | - |
| Form bridge (§2.3) — the only net-new machinery | own unit tests + fresh-context `verifier` pass before B integrates |
| Stale section id after delete/undo | bridge guard 3 + `clearPresetSection` on delete; test both |
| Variables/Regex without the merge flip | §8.4 same-commit rule; round-trip test |
| Rack drag vs clickable rows | `handle` mode (`sortable.tsx:52-57`); keyboard reorder ships free (`:6-14`) |
| Preview resolving macros against live data | forbidden — display-only chips (NEVER macro-resolve AI output / live data in preview) |

Every phase gate: `pnpm check` green + relevant tests; suites run `run_in_background` or
`timeout: 600000`, output read ONCE in full. UI phases (B, C, D, E, F) additionally take a
`side-eye` pass; server prereqs and the bridge take a `verifier` pass.
