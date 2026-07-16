---
kind: spec
status: draft
updated: 2026-07-16
---

# Autosave-Form Doctrine — session-boundary identity (MINT → MIGRATE → SEAL)

> **Status: DRAFT, awaiting owner ratification.** Authored from the 2026-07-16 stickler merge-block
> review (`reports/stickler/2026-07-16-merge-block-28523122.md`) — both P0s were live-reproduced and
> their mechanics traced into TanStack form-core source; every claim below carries that evidence.
> On ratification: add the `INDEX.md` disposition row (FUTURE, this file, lanes L0–L4 below), mint
> the D-entry (§Ledger), and dispatch the lanes. ASSUMES the tactical preset patch
> (`lane-h-preset-p0s`) lands first — that patch makes the preset editor *correct*; this program
> makes the whole class *unspellable*.

## §0 The defect class this kills (evidence-grounded)

The autosave factory (`client/src/forms/create-autosave-entity-form.ts`) delegates its ONE
load-bearing job — entity identity — to an invisible consumer contract: "put a React `key` above
the component that calls the hook." The factory freezes its seed in a ref, passes the same identity
as `defaultValues` every render, and has no other reseed path; form-core's own reseed
(`FormApi.update` — reseeds only when `defaultValues` CHANGE and the form is untouched,
form-core@1.33.0 `FormApi.js:94`) can therefore never fire. Four consequences, all observed:

1. **Identity swap renders the previous entity** (stickler F1, live-reproduced): the preset editor
   put the key on the inner `<form>` element — below the hook — so switching presets rendered preset
   A's config under preset B's title; one keystroke would persist A's ENTIRE config into B.
2. **Reset-to-starter durably undone** (stickler F2, live-reproduced): the nonce-key remount fired
   the per-field unmount flush, whose guard (`isValid && !isDefaultValue`) is permanently true after
   any edit (the factory never re-baselines after save) → `preset.update` re-wrote the pre-reset
   config 22ms after `resetToDefault` resolved. UI said "Saved."
3. **The write-then-reseed race**: `mutateAsync` resolves before the invalidation refetch
   (`create-entity-mutation.ts` onSettled → `invalidation.ts` `void invalidateQueries`) — any flow
   that remounts-to-reseed after a write seeds from the STALE cache.
4. **The §7 array trap**: `listeners.onChange` never fires for structural array ops
   (push/remove/insert/move), so every array call site must remember a manual
   `form.handleSubmit()` flush — the same invisible-contract class, currently spelled at 7+ sites.

Root doctrine (mirrors D72): **a machine whose correctness depends on a remembered consumer
convention is an unsealed machine.** Identity, flush, baseline, and reseed move INSIDE the API.

## §1 The chosen shape: the factory returns a SESSION BOUNDARY component

`createAutosaveEntityForm<TValues>(config)` stops returning a hook. It returns a component; the
internal hook is module-private and unexported — **a consumer cannot mount an autosave form any way
except through the boundary that owns identity.** Wrong key placement is no longer a mistake you
can write.

```ts
// mint — packages/client/src/forms/create-autosave-entity-form.tsx
const PresetForm = createAutosaveEntityForm<PromptConfig>({ defaultValues: DEFAULT_PROMPT_CONFIG });

// consumer
<PresetForm entityId={presetId} serverValues={seedConfig(server)} save={save}>
  {(session) => <PresetEditorBody {...session} />}
</PresetForm>
```

```ts
interface AutosaveSession<TValues extends object> {
  readonly form: AutosaveForm<TValues>;           // same widened surface as today, `reset` type-removed
  readonly saveState: AutosaveSaveState;          // "saved" | "saving" | "error" — per SESSION
  readonly retrySave: () => void;                 // explicit user retry — submits current values
  /** Authoritative re-baseline: tear down the session WITHOUT flushing and remount seeded from
   *  `next` (a mutation-response row or a contract default). The ONE reset path. */
  readonly reseed: (next: TValues) => void;
}
```

Internals (Boundary → keyed Session):

- **Boundary** holds `epoch` state + `pendingSeedRef` + `discardRef`; renders
  `<Session key={`${entityId}:${epoch}`}>`. Identity change or `reseed()` = key change = the
  React-guaranteed full teardown/remount of the form AND the consumer's body (tabs, scroll, local
  state reset with it — the behavior an entity switch wants; see §2 O2 for why this beats formId).
- **Session** owns the FormApi (private `useAppForm` call), `saveState`, `lastSavedRef`, the save
  driver (§3), and the teardown flush (§4). Seed order unchanged: defaults ⊕ serverValues ⊕
  surviving draft; `pendingSeedRef` (a `reseed` payload) wins outright.
- The draft crash-mirror (`config.draft`) contract is unchanged (mirror-on-change, clear-on-save,
  seed-on-mount).

## §2 Identity options evaluated (form-core@1.33.0 semantics, traced)

| option | verdict | evidence |
| - | - | - |
| **O1 boundary-key inside the seal** (chosen) | plain React `key` semantics, owned by the factory; also resets consumer body state on switch; gives the teardown seam (§4) for free | the character editor already proves the key mechanism live (`character-editor-surface.tsx` keys its body by `characterId`; live probe: JFC→Mara switches correctly) — O1 moves that key where it can't be forgotten |
| O2 `formId` swap | REJECTED | `useForm` does recreate the FormApi on `formId` change (`useForm.js:24-28`) and `useField` rebinds on form identity (`useField.js:17-24`) — but nothing unmounts: consumer-local UI state (tabs, drill-ins, scroll) survives with stale entity context, and there is NO teardown moment to hang the pending-edit flush on. Also couples identity to a young library surface |
| O3 live `defaultValues` + form-core reseed | REJECTED as identity; KEPT as the clean-echo reseed (§5) | `FormApi.update` reseeds only when `!isTouched` (`FormApi.js:94`) — a dirty form switching entities keeps the old values. This is the saved-factory's mechanism and is correct for its button-gated world, insufficient for identity |
| O4 documented key contract + gate | REJECTED | it IS the current design; it produced a P0 the first time a lane composed differently. A ts-morph gate cannot reliably prove "the hook-owning component is keyed by the same identity passed as `entityId`" — see §7 honesty table |

## §3 The save driver: store subscription, not `listeners.onChange` (kills the array trap)

The debounced-save pipeline moves from `listeners.onChange` to a Session-owned subscription on the
form store, filtered to `state.values` identity changes. Every mutation path — `setFieldValue` AND
`pushFieldValue`/`removeFieldValue`/`insertFieldValue`/`moveFieldValues` — routes through the store
(traced: array ops call `setFieldValue` internally), so **structural array edits autosave like any
keystroke and every manual `form.handleSubmit()` flush call site is deleted.** Driver contract:

- values identity change → mirror draft → debounce (500ms default, unchanged) → gate:
  `form.state.isValid && hasUnsavedEdits()` → `form.handleSubmit()`.
- `hasUnsavedEdits()` = structural inequality of `state.values` vs `lastSavedRef.current` — never
  `isDefaultValue` (see §4). Structural compare, not identity (mapper outputs are fresh objects
  every render). This is a real consumer for the D54 adopt-when `es-toolkit` (`isEqual`) trigger;
  a local deep-equal is equally acceptable — executor's call, ONE home in `#forms`.
- `onFieldUnmount` is DELETED. Its job (don't lose a pending edit when a field unmounts) was always
  covered by the form-level debounce — the FormApi and its timer outlive any field. Its actual
  effect was the F2 write-back vector.

## §4 Baseline + the teardown-flush contract (kills the write-back)

- **Re-baseline on every successful save:** `onSubmit` sets `lastSavedRef.current` to the submitted
  values snapshot after `save` resolves. All guards compare against last-saved, so a clean-since-save
  form is genuinely clean. (The permanently-false-`isDefaultValue` defect dies; `isDefaultValue` is
  no longer consulted anywhere.)
- **ONE teardown flush, discard-aware:** Session's own unmount cleanup — which fires exactly on
  entity switch, `reseed()`, and boundary unmount — flushes `hasUnsavedEdits()` values to the
  CURRENT session's `save`, **unless `discardRef` is set** (the `reseed` path sets it). This is the
  precise "field left the DOM within a session" vs "the session is being torn down" split: within a
  session, nothing flushes on field unmount (the debounce carries it); at teardown, one flush,
  correctly targeted, skippable by the one API that means "discard."
- `saveState` lives in Session → it resets per entity (fixes the latent cross-entity stale-`error`
  bleed of the current hook-resident state).

## §5 The authoritative-seed story (kills the race)

**Ruling: reseed takes explicit next-values — a mutation-RESPONSE row or a contract default — never
a cache read after invalidation.** `reseed(next)` is synchronous and deterministic:

```ts
const row = await reset.mutateAsync({ id: presetId });   // verbs return the fresh row (live-verified)
session.reseed(seedConfig(row.config));                   // discard-flagged teardown → remount on `next`
```

- await-refetch REJECTED: invalidation is fire-and-forget BY DESIGN app-wide (bus-driven freshness,
  D54 `staleTime: Infinity` doctrine); making one mutation await its refetch forks that discipline
  and still races other writers.
- seed-from-contract-default REJECTED as the general rule (server transforms would be lost) but
  legal as a `reseed` argument where the contract default IS the truth. A consumer whose reset verb
  doesn't return the row widens the verb at migration (preset's already does).
- **Clean server-echo reseed (two-device freshness), inside the seal:** when the `serverValues`
  prop changes STRUCTURALLY (deep-compare vs the last-seen server snapshot — identity compare is
  the mapper-fresh-object trap) and `!hasUnsavedEdits()` and no save is in flight → re-baseline to
  the new server values. With unsaved edits → keep editing; the next save wins (unchanged
  last-writer-wins posture). This is O3's mechanism, correctly scoped to the clean case.

## §6 The status contract (AutosaveStatus)

- Vocabulary unchanged (D66 A4 / north-star §7): `Saved` / `Saving…` / `Save failed — Retry`.
  Event-driven: `saving` on submit start, `saved` on resolve, `error` on reject; `retrySave`
  submits current values unconditionally. The ≤debounce "Saved-while-typing" window is accepted
  (recording it here so nobody minted a fourth state for it).
- **`AutosaveStatus` gains `caption?: string`, rendered ONLY in the `saved` state.** The settings
  panes move "Synced across your devices." / the system-pane explainer into `caption` and delete
  the sibling `Text` — "Save failed — Retry · Synced across your devices." becomes unrepresentable
  (stickler side-note, fixed structurally).
- Every boundary consumer renders `AutosaveStatus` fed by its session — already the A4 rollout
  rule; not re-gated here.

## §7 SEAL — honest split: what the API makes unspellable vs what needs a gate

| failure mode | closed by |
| - | - |
| key placed below / correlated wrong / forgotten | **API** — the hook is unexported; the boundary owns the key. Unspellable |
| reset via remount re-seeding from stale cache | **API** — `reseed(next)` is the only reset path and takes explicit values |
| teardown flush writing back over a reset | **API** — `reseed` is discard-flagged; the flush is Session-owned |
| array ops silently unsaved (§7 trap) | **API** — store-subscription driver |
| permanently-dirty baseline | **API** — `lastSavedRef` re-baseline |
| `form.reset()` on a live autosave draft | existing `no-form-reset-in-autosave` gate + the type-level `reset` removal (unchanged) |
| raw `useForm`/`createFormHook` in features | existing `no-direct-useform` (unchanged) |
| ≥3-field editors dodging the factories | existing `form-factory-for-multifield` (unchanged) |
| leftover/new manual flushes | **NEW gate G-A**, below |

**G-A `no-manual-autosave-flush`** (ts-morph): RED when a `features/**` function body contains BOTH
a structural array op (`pushFieldValue` / `removeFieldValue` / `insertFieldValue` /
`moveFieldValues`) and a `handleSubmit` call — post-migration that pattern is at best a redundant
double-submit and at worst a resurrection of the call-site-flush convention. Full gate ritual per
D72 (Core-Enforcement row + count bump, `__g_` fixture or check-gates arm, scanRoot proven).

```ts
mustFlag: [{ files: { "packages/client/src/features/x/lib/x.ts":
  "export function onAdd(form: F): void { form.pushFieldValue('items', v); void form.handleSubmit(); }" },
  why: "the retired §7-trap call-site flush — the factory's store driver owns persistence now" }],
mustPass: [
  { files: { "packages/client/src/features/x/lib/x.ts":
    "export function onAdd(form: F): void { form.pushFieldValue('items', v); }" },
    why: "structural op alone — the driver persists it" },
  { files: { "packages/client/src/features/x/lib/x.ts":
    "export function onSubmit(form: F, e: E): void { e.preventDefault(); void form.handleSubmit(); }" },
    why: "an explicit submit handler with no array op — legal (saved-entity forms, retry affordances)" }],
```

NOT proposed (and why): an "autosave boundary adoption" gate — unnecessary, the old hook export is
DELETED in the same wave (resolver physics; imports won't resolve); a "key-correlates-to-entityId"
gate — the API makes it moot, and ts-morph cannot soundly prove key↔identity correlation anyway
(the honesty the house prefers over a lying gate).

## §8 Consumer matrix (every site verified against current main, 2026-07-16)

Exposure legend: **EXPOSED** = identity can change while the hook-owning component stays mounted
(the F1 class, structurally verified) · safe-by-key = a parent key currently carries identity
(the invisible contract) · safe-constant = identity never changes.

| consumer (hook owner) | identity | today | lane | effort |
| - | - | - | - | - |
| preset editor (`preset-editor-surface.tsx` PresetEditor) | presetId | F1/F2 site; tactical patch pending (lane-h) | L1: boundary + `reseed(row.config)` for reset; delete nonce machinery + 7 manual flushes (inspector ⋯ delete/duplicate/move, structure-tabs add, regex/variables add+remove, rack reorder) | M |
| character editor (`character-editor-surface.tsx` CharacterEditorBody) | characterId | safe-by-key (`key={characterId}`) — the contract this program retires | L2: boundary; delete the parent key + inner `<form key>` | M |
| character theme (`character-appearance-tab.tsx` ThemeControls) | characterId | **EXPOSED** — mounted by the Options CONTEXT tab (`characters-section.tsx`), which `ContextTabsPanel` keys by TAB ID only; switching characters with Options open keeps the FormApi | L2 | S |
| room-overrides (`room-overrides-form.tsx`, committed + draft arms) | chatId / draftKey | **EXPOSED** — same context-host shape (`chats-section.tsx` Overrides tab) | L3 | S |
| group-config (`group-config-form.tsx`, committed + draft arms) | chatId / draftKey | **EXPOSED** — same shape (Group tab) | L3 | S |
| injection rows (`injections-manager.tsx` InjectionRow) | injection.id | safe-by-key by construction (the list `.map` key IS the entity id) | L3: boundary (the list key stays as list identity; harmless) | S |
| persona editor (`persona-editor.tsx`) | persona.id | safe (one instance per row Collapsible; identity fixed per instance) | L4 | S |
| settings panes ×4 (appearance / system / regex / connections) + `appearance-reading-section` | constants | safe-constant | L4: boundary + `caption` migration (§6) | S each |

Out of scope, recorded: the **saved**-entity factory consumers (world-info `use-entry-form`,
settings `use-theme-form`) run a different machine with live `defaultValues` + a reseed guard —
correct for button-gated editors. If a future wave unifies them onto a session boundary, it is a
separate decision; nothing here touches them. (Note for that wave: the saved factory's reseed guard
compares `serverValues` by IDENTITY against fresh mapper outputs — same §5 structural-compare trap.)

## §9 The program: MINT → MIGRATE → SEAL (atomic per D72)

- [ ] **L0 MINT** — rebuild `create-autosave-entity-form` as the session boundary (§1–§6): store
      driver, lastSaved baseline, teardown flush, `reseed`, per-session status;
      `AutosaveStatus.caption`; delete `onFieldUnmount` + the misleading "id change remounts +
      reseeds" mountKey doc-comment; factory CTs = the canonical scenarios (§10 CT-1..6). The OLD
      return shape dies here — L0 does not land without L1–L4 in the same wave (no half-migration).
- [ ] **L1 MIGRATE preset** — supersedes the lane-h tactical patch shape (keep its CT pins, port
      them onto the boundary); reset flow = `reseed(seedConfig(row.config))`.
- [ ] **L2 MIGRATE character** — editor + theme controls (closes the Options-tab EXPOSED hole).
- [ ] **L3 MIGRATE per-chat forms** — room-overrides, group-config, injections (closes both
      EXPOSED holes; committed + draft arms).
- [ ] **L4 MIGRATE settings + persona** — boundary + caption; delete the sibling caption `Text`s.
- [ ] **SEAL** — G-A `no-manual-autosave-flush` (full ritual); verify `no-form-reset-in-autosave`
      and `no-direct-useform` still bite the new surface (probe, don't assume); Core-Enforcement
      row + count bump.

Lane order is dependency order (L0 blocks all; L1–L4 parallelizable across disjoint file sets).
Each migration lane: adopt boundary → delete manual keys/flushes → its CTs → `pnpm check` +
targeted `test:ct` green.

## §10 CT contract — the live repros become the canonical regressions

Factory-level CTs (mount the real boundary over a save spy; the F1/F2 reproductions verbatim):

- **CT-1 identity switch:** mount entity A with distinct values → flip `entityId` to B with
  different `serverValues` → fields show B's values (F1: the preset editor showed A under B).
- **CT-2 reseed discards:** edit → `reseed(starter)` → fields show starter AND the spy received NO
  save carrying pre-reseed values after the reseed (F2: the 22ms write-back), save-count pinned.
- **CT-3 teardown flush:** edit → flip `entityId` within the debounce window → spy received exactly
  ONE save, for the OLD entity, carrying the edit.
- **CT-4 array ops persist with zero call-site flushes:** push AND remove reach the spy (the
  existing regex/variables §7-trap CTs, re-pinned minus the manual flush).
- **CT-5 status:** failing save → `error` + Retry → success → `saved`; `caption` renders in `saved`
  only.
- **CT-6 clean echo:** `serverValues` change (fresh object, changed content) while clean → values
  re-baseline; same change while dirty → edits kept.

Per-consumer lanes re-pin their existing behavior CTs on the boundary (preset section-kebab
delete/duplicate persistence, character greeting add/remove wire payloads, etc. — no assertion may
weaken in the migration).

## §Ledger — candidate rulings + registry rows

- **D-entry candidate (mint at ratification, next free number):** *Autosave entity forms mount ONLY
  through the factory's session boundary — the factory owns identity (keyed session), reseed
  (explicit next-values: mutation response or contract default, never a post-invalidation cache
  read), the teardown flush (discard-aware; the only flush), the baseline (last-saved values, never
  `isDefaultValue`), and the save driver (store-level subscription — structural array ops
  included). The internal hook is unexported; `reseed` is the one reset path. Enforcers: the
  unexported hook (resolver physics) · G-A `no-manual-autosave-flush` · the existing
  `no-form-reset-in-autosave` / `no-direct-useform` / `form-factory-for-multifield`.*
- **PD row to mint:** the EXPOSED consumers (character-theme Options tab, room-overrides,
  group-config — §8) carry the F1 class TODAY, pre-migration; the row tracks them until L2/L3 land
  (closes with this program). The preset P0s themselves are the lane-h tactical patch's record.
- **North-star §7 amendment on close:** the TRAP paragraph (array ops must flush manually) is
  RETIRED — replaced by one line: the factory's driver persists structural edits; call-site flushes
  are gate-RED (G-A).
