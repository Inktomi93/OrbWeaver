# SET-SEAMS — every settings section is self-owned

**Status:** DESIGN SPEC — **APPROVED TO BUILD (owner, 2026-08-01; §10 fully ruled, O3 amendment = D114)**. Nothing built. Owner-directed 2026-08-01 (the settings-registry migration lane's
two principled stops, superseded): *every settings section becomes SELF-OWNED, the autosave-welded panes
DECOMPOSE with designed per-section saves, features host their own sections at anchors, the settings shell
becomes a pure skimmer.* Includes the **O3 amendment** (client-architecture-lockdown §8 — tags/regex
re-home), which needs an owner ruling + a D-entry before its stage runs.

**Doctrine parent:** the workloads junk-drawer exit
(`reports/stickler/2026-07-25-workloads-junk-drawer-exit.md` §3) — *domains raise seams, the worker skims
them.* This is the same move on the client: **features raise settings sections, the settings shell skims
them.** The two specs rhyme deliberately: one open contribution contract in a shared home, one assembly at
the door, a host that knows nothing about any contributor, and a completeness pin so a half-migration is
structurally impossible rather than merely discouraged.

**Law it builds on:** `client-architecture-lockdown.md` §5 (the registry primitive), §6c (the contributor
seam), §8 (the settings host + pane registry, O3), D78 (`autosave-form-doctrine.md` — the session
boundary), D107 (knob-wire discipline), D41 (no silent degrade).

---

## 1. The ruling, restated as a test

The migration lane recorded the **contribution-eligibility test**: *does the section own its own READ and
its own WRITE?* YES → contributable at an anchor (`library.pageSize`, `21abdc42`). NO (welded into the
host pane's one `AutosaveSession`) → structurally non-contributable, because
`SettingsSectionContribution` homes in `#state` and both candidate homes (`state/`, `lib/`) are
dep-cruiser-barred from `forms/` with no type-only exemption — **a section can never carry a session
across the seam.**

SET-SEAMS does not weaken that wall. It makes every section PASS the test:

> **S0 — the seam law.** A settings section owns (a) its own read (`getUserSettings` /
> `getAppSettingsWithOverrides`, cache-first — never a second round-trip), (b) its own write (a
> **key-minimal** section patch), and (c) its own form session, mounted inside the section body in the
> OWNING feature. Nothing about a section crosses the contribution seam except its `nav`, its `anchor`,
> its `when`, its key claim, and its `body` thunk.

Sections that already pass today (the proof-of-shape roster, all built):
`memory-settings-section`, `world-info-settings-section`, `databank-settings-section`,
`imagery-templates-section` (chat-behavior anchor) · `memory-tuning-section`, `rate-limits-section`,
`system-tuning-section` (admin anchor) · `workloads-tuning-section` (workloads anchor) ·
`library-settings-section` (appearance anchor). **Nine sections, five owning features, zero settings
imports.** SET-SEAMS is not a new mechanism — it is finishing the one that already works.

---

## 2. The hard problem: N sections saving into ONE namespace without racing

This is where the migration stopped. It is solvable, and the mechanism is already in the tree.

### 2.1 The clobber vector, precisely

Today the appearance pane's ONE autosave form sends **the whole blob**:

```ts
// features/settings/surfaces/appearance-settings-surface.tsx (as-built)
const save = (values: AppearanceSettings) =>
  update.mutateAsync({ section: "appearance", patch: values as Record<string, unknown> });
```

The CT even documents it: *"fires `updateUserSettingsSection("appearance")` with the FULL patch"*
(`tests/client/features/settings/surfaces/appearance-settings-surface.ct.tsx`). That is harmless while ONE
form owns the namespace. **The instant two sections share a namespace it becomes a live lost-update bug:**
section A's debounce fires carrying its own stale copy of section B's keys and overwrites B's just-saved
value. Splitting the pane while keeping full-blob patches is exactly the "N racing full-blob patches" the
lane refused to ship.

### 2.2 The three physics that make per-section saves safe

1. **Server-side merge is per-key, not per-blob.** `updateUserSettingsSection`
   (`domain/settings/verbs/update-user-settings-section.ts`) does read → `deepMergePlain(existing, patch)`
   → write. `deepMergePlain` (`domain/settings/substrate/merge.ts`) recurses plain objects and skips
   `undefined`, so a patch that names only its own keys leaves every sibling key untouched.
2. **Writes are serialized per user.** The whole read-merge-write runs inside
   `ctx.serializeUserWrite(ownerId, …)` — the verb header says it: *"a concurrent patch of a SIBLING
   section can't clobber this one."* Disjoint patches therefore **commute**; interleaving is impossible.
3. **The read echo is structurally idempotent.** Every write emits `settingsChanged` → USER\_BUS →
   `getUserSettings` refetch. Each section's `serverValues` is a PURE PROJECTION of its own keys, and
   `createAutosaveEntityForm`'s clean-echo reseed compares with `formValuesEqual` (structural, not
   identity). A sibling's save produces an EQUAL projection for every other section ⇒ **no reseed, no
   re-render churn, no dirty-edit stomp.**

So the whole design reduces to one rule, and one pin that makes it unbreakable:

> **S1 — patch minimality.** A section's patch contains ONLY the keys that section owns. Never the
> namespace blob, never a spread of the server read. The mutation input is
> `{ section, patch }` where `Object.keys(patch) ⊆ section.owns.keys`.
>
> **S2 — key partition.** Within one `UserSettingsSection` namespace, the leaf-key → section map is a
> PARTITION: every key claimed by exactly one section, no key claimed twice, no key unclaimed.

S2 is what turns S1 from a convention into a proof. It also gives, for free, the D107 property on the
client side: **an unclaimed key is a knob with no editor** — the settings-side twin of a dead switch.

### 2.3 Enforcing S2 (the partition pin)

Keys are runtime-enumerable from `DEFAULT_USER_SETTINGS[namespace]`, so the check is a plain assertion at
door-assembly time — the same posture as `createContributorRegistry`'s duplicate-id throw:

```ts
// state/settings-pane-registry.ts (addition, beside resolveSettingsSections)
/** What a section claims to WRITE. Absent = the section persists nothing through the settings tiers
 *  (a CRUD surface like tags/personas), and is exempt from the partition. */
type SettingsKeyClaim =
  | { readonly tier: "user"; readonly section: UserSettingsSection; readonly keys: readonly string[] }
  | { readonly tier: "app"; readonly keys: readonly (keyof AppSettings)[] };

/** THROWS on overlap (two sections write one key → clobber) or gap (a knob with no editor → D107).
 *  Run once at the door, over the whole settings-section registry, against the contract defaults. */
function assertSettingsKeyPartition(
  registry: ContributorRegistry<SettingsSectionContribution>,
  defaults: UserSettings,
): void;
```

- **Gap arm exemptions** ride an `UNCLAIMED_SETTINGS_KEYS` module const with a cited reason per key (the
  D50 bus-coverage DEFERRED discipline: self-cleaning in both directions — a key that GAINS a section REDs
  its stale entry). Server-side wiring stays `knob-wire-coverage`'s job (D107); this const covers only
  "has a client editor". They are deliberately two registries of two different facts — see §10 Q5.
- Nested namespaces (`databank.retrieval.k`, `routing.roleDefaults.chat`) claim at the TOP-level key of
  the namespace (`retrieval`, `roleDefaults`); nesting below a claimed key is the claiming section's
  business. Rationale: `deepMergePlain` recurses, so top-level disjointness already guarantees
  commutativity, and deeper claims would encode form-internals in the contribution.

### 2.4 Optimistic state — there isn't any, deliberately

The form IS the optimistic layer: the user's keystrokes live in the `AutosaveSession`, the server confirms,
`busDriven: true` refetches. **No section may write the `getUserSettings` cache** (`setQueryData` /
cache surgery) — a section that patched the shared cache would hand every sibling a mutated `serverValues`
and re-open the churn the projection-equality property closes. This is already gate-backed
(`client-cache-surgery-only-in-data`, `no-inline-optimistic-in-surface`); the spec restates it because it
is now load-bearing for correctness, not just for style.

**Cross-device semantics are unchanged and improve:** a dirty section keeps its edit and wins on next save
(last-writer-wins), but the blast radius shrinks from "the whole namespace" to "the keys this section
owns" — two devices editing two sections of one pane now both land.

---

## 3. Save status: report per section, render per pane

Every contributed section today renders its own `<AutosaveStatus>` footer (see
`workloads-tuning-section.tsx`). Eight of those stacked down a decomposed appearance pane is visual smear;
deleting them entirely regresses the one honest "Saved · Synced across your devices" affordance the owner
sees today. Ruling:

> **S3 — status is REPORTED by the section and RENDERED once by the host; RETRY stays local.**

- A new `#forms` seam: `useReportSaveStatus(id, saveState)` — the section reports its
  `AutosaveSaveState` (`saved`/`saving`/`error`) into a device-transient store
  (`state/settings-save-status-store.ts`, minted through `createGatedStore`, cleared on unmount). It stores
  three enum values per section id — never callbacks, never a session.
- The settings shell renders ONE aggregate footer: `error` if any section errored, else `saving` if any is
  saving, else `saved`. The aggregate is READ-ONLY.
- **An errored section is locatable**: it renders its own inline `<AutosaveStatus state="error"
  onRetry={retrySave}>` at its anchor (only in the error state), and its nav row carries an error marker.
  The aggregate footer offers "jump to the section that failed", never a retry-all — retry belongs to the
  session that owns the edit, and a broadcast retry would need callbacks in a store (D41: surface the
  failure where it happened, don't aggregate it into a lie).
- **Degrade path:** a section mounted with no status host (a pane not yet migrated, a CT story) renders its
  own inline `AutosaveStatus` in every state. One shared `<SectionSaveStatus session={…}/>` component in
  `#forms` implements both arms, so a section body never branches on hosting.

Tier check: `#forms` is tier 3; both the settings shell and every contributing feature are tier 5, so both
may import it. The status store holds plain enums in `#state`, so nothing crosses `state → forms`.

---

## 4. The AppSettings / system-pane arm — decompose, no exception

**Judgment: the system pane decomposes on the same rules. No principled exception is needed.** The delta-diff
session is not a blocker; it is a per-section concern once the keys are partitioned.

- `updateAppSettings` (`domain/settings/verbs/app-settings.ts`) is **already serialized** by a process-wide
  `writeChain` — its own comment: *"two concurrent admin PATCHes would each merge against the same base and
  last-write-wins would drop one; the chain serializes the critical section."* `deepMergeAppSettings` merges
  per key and treats `null` as "clear this override". Sparse disjoint deltas therefore commute exactly as
  user-settings patches do.
- The pane-wide `originalRef`/`lastSavedRef` baselines (`diffSystemPatch`) become **per-section** baselines
  over each section's own subset. Each section diffs only its own keys, so "only the fields you moved
  become overrides" is preserved per section instead of per pane.
- The decomposition is a strict UPGRADE on honesty: today's system surface admits it shows only the resolved
  config and *"a per-field 'set by environment' annotation is deferred — the pane shows a footnote instead"*.
  The `admin`-anchored sections already solved this — `system-tuning-section.tsx` reads
  `getAppSettingsWithOverrides` and renders `AdminOverrideField` (floor vs override + per-field reset).
  **Every decomposed system section adopts that pattern**, and the footnote dies.
- Permission stays where it is: transport admin-gating + the verb's `requireAdmin`/`requireOwner`. The
  owner-gated governance fields (`allowNonOwnerLocalCompute`, `nonOwnerLocalComputeBudget`,
  `allowNonOwnerMaxProSub`, `localMultiUser`) must land in ONE section together, so the owner-only disabled
  state is one predicate in one place (`Shared access` + `Multi-user` merge, or both take the same viewer
  prop). This is the only place where section boundaries are constrained by permission rather than by reader.

The one genuine open item on this arm is IA, not mechanism: `system` and `admin` are both APP-tier
admin-gated panes now hosting the same class of knobs — see §10 Q2.

---

## 5. Contract evolution — what `SettingsSectionContribution` must carry

```ts
export interface SettingsSectionContribution {
  readonly id: string;                       // registry key + React key (dupes throw at the door)
  readonly anchor: SettingsCategoryId;       // WAS SettingsSectionAnchor — every pane is a host now
  readonly nav: SettingsSubcategory;         // nav row + search leaves (unchanged shape)
  /** NEW — viewer gating with pane parity: ONE predicate, three consumers (nav, search, render). */
  readonly when?: (viewer: SettingsViewerView) => boolean;
  /** NEW — the write claim (§2.3). Absent = persists nothing through the settings tiers. */
  readonly owns?: SettingsKeyClaim;
  readonly body: () => ReactNode;            // anchored at settingsAnchorId(anchor, nav.id)
}
```

Four structural changes ride with it:

1. **`SETTINGS_SECTION_ANCHORS` retires.** The anchor tuple (`shell-store.ts:44`, currently
   `["chat-behavior","admin","workloads","appearance"]`) exists only because three panes were not yet
   hosts. End-state: `anchor: SettingsCategoryId` and `groupByAnchor` keys over `SETTINGS_CATEGORY_IDS`,
   which stays total by construction.
2. **ONE settings-section registry, not one per anchor.** `main.tsx` currently assembles four
   (`chat-behavior-settings-sections`, `admin-…`, `workloads-…`, `appearance-…`, lines 188–215) and threads
   each into a `make<X>Pane(…)` factory. End-state: one `createContributorRegistry<SettingsSectionContribution>("settings-sections", […])`
   delivered by a `createRegistryContext` mint (the sanctioned mint — `registry-context-via-mint` G26), read
   by the shell. `resolveSettingsSections(registry, anchor)` already groups by anchor, so the pane factories
   and their prop threading DELETE. Adding a section becomes a one-line door edit.
3. **`SettingsPaneDefinition.body` becomes an honest union:**
   ```ts
   readonly body:
     | { readonly kind: "sections" }               // pure skimmer: the host renders the anchor's sections
     | { readonly kind: "surface"; readonly render: () => ReactNode } // a genuinely non-knob pane
     | { readonly placeholder: true };
   ```
   A `sections` pane has NO own body and NO own `subcategories` — nav DERIVES from the contributions at its
   anchor. `surface` survives for panes that are a CRUD/table surface rather than a knob stack (tags,
   personas, connections, backup, regex) — those still host contributed sections below their surface.
4. **Door order IS render order.** With per-anchor registries gone, the single door array's order decides
   section order within each pane. State it in the door comment and pin it with the existing "contributed
   section renders LAST / in declared order" CT, generalized.

---

## 6. The anchor map end-state

Ownership rule (from the workloads doctrine, applied): **the owner of a section is the feature that READS
its knobs.** A knob read by the shell or by ≥2 features homes with the shell painter (`app-shell`) or stays
settings-owned; a knob read by exactly one feature homes there.

Appearance's split is evidence-backed (repo sweep of `config.appearance.*` consumers):

| Pane / anchor | Section | Owning feature | Evidence (reader) |
| - | - | - | - |
| appearance | Message style (chatStyle, autoFixMarkdown) | chat | `chat/hooks/use-chat-style.ts`, `use-message-appearance.ts` |
| appearance | Avatars (showInChatAvatars, avatarSize/Shape/Aspect/Ring) | chat | `use-message-appearance.ts` |
| appearance | Message details + actions (show\*, messageActions) | chat | `use-message-appearance.ts` |
| appearance | Sizing + Motion + density/elevation | app-shell | `app-shell.tsx` (chatWidthPct, fontScale, density, elevation, reducedMotion) |
| appearance | Reading (reading\*, justifyBodyText) | app-shell | `app-shell.tsx` |
| appearance | Effects (blurStrength/Surfaces, shadowEffects, surfaceTexture, enableThemeColorization) | app-shell | `app-shell.tsx` |
| appearance | Background (backgroundImageKind/Fit/Dim/Blur, background*Asset*, backgroundLibrary) | app-shell | `app-shell.tsx` + `lib/resolve-theme-background.ts`; `components/background-source-field.tsx` is tier-2 shared |
| appearance | Library (pageSize) | character | BUILT `21abdc42` |
| chat-behavior | Message handling + Streaming (`chat` namespace) | chat | the composer/ghost read them |
| chat-behavior | memory · world-info · databank · imagery sections | chat / world-info | BUILT |
| workloads | Analysis tuning | workloads | BUILT |
| admin | memory tuning · rate limits · system tuning | user-admin | BUILT |
| admin | Users · Engines · Ops | user-admin | already user-admin components; become sections |
| system | Media & trust | chat (trustHtml/forbidExternalMedia are content-render gates) | §10 Q2 may merge this pane into admin |
| system | Compute (vllm\*Concurrency) | workloads | runner concurrency |
| system | Shared access + Multi-user (owner-gated set) | user-admin | one section, one owner predicate (§4) |
| system | Operations (corpusAutoindex, logLevel) | workloads (autoindex) / user-admin (logLevel) | split or keep one user-admin section |
| personas | the persona list surface | persona | already feature-owned |
| connections | connections/credentials | credentials | already feature-owned |
| backup | import/export/bundles | workloads (O3, as ratified) | already feature-owned |
| tags | tag management surface | **O3 amendment — §10 Q1** | no reader-feature; recommend a new `features/tag` |
| regex | script library surface | **O3 amendment — §10 Q1** | recommend a new `features/regex` |
| theme | theme picker/editor | settings (the theme model is settings-domain serde) | keep |

**What `features/settings` keeps at the end:** the shell (nav, fuzzy search, scroll-spy, deep-link), the
generic section renderer, the pane placeholder, the settings + theme modals, the theme pane, and
`settings-search.ts`. Everything else is a section in a feature that reads it. The `feature-owns-definition`
gate is satisfied throughout (settings still owns the settings + theme modals and the theme pane).

### 6.1 The O3 amendment text (proposed — needs the owner ruling in §10 Q1 + a D-entry)

> **O3 as amended (SET-SEAMS, 2026-08-0x).** The original ruling — *"`features/settings` KEEPS the
> genuinely settings-domain panes: appearance, system, tags, regex, theme, chat-behavior"* — is superseded
> for four of the six. Under SET-SEAMS a pane is not owned by whoever names it; a SECTION is owned by the
> feature that READS its knobs, and the settings feature owns only the SHELL that skims them. `appearance`
> and `system` decompose to `chat`/`app-shell`/`workloads`/`user-admin` sections at their anchors;
> `chat-behavior` decomposes to `chat`. `tags` and `regex` re-home to their own features (`features/tag`,
> `features/regex`) which own their panes in `surface` mode. `theme` stays settings-owned (the theme model
> and its serde ARE settings-domain). The settings feature keeps the shell, the section renderer, the
> modals, and the theme pane — nothing else.

---

## 7. Search / nav / deep-link invariants (the non-negotiables per stage)

Every stage must hold these BEFORE it ships. They are the parity contract that makes a stage "shippable".

1. **Anchor ids are stable across a move.** `settingsAnchorId(category, subId)` keys on the ANCHOR pane and
   the sub id, never on the owning feature. A section that changes feature homes keeps its `(category,
   subId)` pair byte-identical (the `21abdc42` precedent kept `settings-anchor-appearance-library`).
2. **Search keywords travel with the section.** The `SettingsSubcategory` (label + keywords + `settings`
   leaves) moves as ONE object into the owning feature's `*-nav.ts` — split from the section body so neither
   imports the other (the `library-settings-nav.ts` precedent).
3. **`when` gates nav, search, and render together** — one predicate, three consumers. A section hidden from
   a viewer must not appear in the search index (otherwise the fuzzy jump scrolls to nothing).
4. **The deep link is unchanged**: `openSettingsTo(categoryId)`; the shell's target/scroll-spy machinery is
   untouched. A sub-level deep link (`openSettingsTo(category, subId)`) is NOT part of this program —
   §10 Q4.
5. **The scroll-spy still sees every section**: `settings-section-anchored` (the gate) currently scans
   `*-settings-surface.tsx` only. As sections move into `components/*-section.tsx` files the gate's
   `scanRoot` must follow, or it goes silently GREEN on the exact files it exists to police
   (`gate-scanroot-vs-getfilepath` class). **This is a required gate edit, not optional.**
6. **Zero contributions ⇒ byte-identical pane** stays true at every intermediate stage (the empty-door CT).

---

## 8. Migration sequence — pane by pane, each stage shippable

Every stage ends green on: scoped `pnpm vitest`/CT for the touched files, the geometry CT, the per-section
save pins (§9), and a live drive of the pane. Stages are ordered so the mechanism lands before any section
moves — the opposite order is how you ship N racing patches.

| Stage | Scope | Ships |
| - | - | - |
| **0 — mechanism** | ONE settings-section registry + context mint; `anchor: SettingsCategoryId`; `when` on contributions; `owns` + `assertSettingsKeyPartition`; the `body` union; the save-status seam (§3); the `settings-section-anchored` scanRoot fix | zero sections move; every existing pane byte-identical; the 9 built sections adopt the status seam + declare `owns` |
| **1 — appearance** | the 8-way split of §6; each section key-minimal; `AppearanceForm` deleted | the biggest weld gone; proves S1+S2+S3 on the hardest pane |
| **2 — chat-behavior** | own two sections → `chat`; pane becomes `{kind:"sections"}` | settings stops owning chat knobs |
| **3 — workloads + admin** | admin's own sections (users/engines/ops) become contributions; both panes → `sections` mode | small, mostly moves |
| **4 — system (AppSettings)** | §4: per-section baselines, `getAppSettingsWithOverrides` + `AdminOverrideField` everywhere, owner-gated set kept whole | the footnote dies; resolve §10 Q2 first |
| **5 — O3 amendment** | `features/tag`, `features/regex` mint + pane move (after the owner ruling + D-entry) | settings stops owning foreign domains |
| **6 — seal** | delete `SETTINGS_SECTION_ANCHORS`, the `make*Pane` factories, the emptied `*-settings-surface.tsx` shells, `OWN_SUBCATEGORIES` consts; gates updated | the shell is a pure skimmer; no half-migration left (banned: "leave the old map beside the new") |

**Serialization posture:** stages 1–4 all touch `main.tsx` and `state/settings-pane-registry.ts`. Run them
SERIALLY on main, or worktree-isolate (\[\[concurrent-main-lanes-gate-thrash]],
\[\[worktree-isolate-concurrent-lanes]]). Stage 0 is a hard barrier — nothing else starts until it is merged.

---

## 9. Test plan

**The render-parity harness (per stage).** The existing appearance geometry CT is the model
(`tests/client/features/settings/surfaces/appearance-settings-surface.ct.tsx`, "subcategory sections are a
single column, stacked in registry order"): every `[id^="settings-anchor-<pane>-"]` box shares one left
edge, one column width, and strictly increasing tops, count ≥ N. Generalize it to a shared CT kit run per
migrated pane, before and after the stage — a decomposition that changes the pixels is a defect
(`done ≠ rendered`).

**The per-section save pins (the new class — these are what the stop was about).**

| Pin | Asserts | Shape |
| - | - | - |
| **P1 patch minimality** | editing section A sends EXACTLY `{section, patch:{…A's keys}}` — no sibling key present | CT + `TrpcRecorder`, `toStrictEqual` on the input (\[\[assert-the-mutation-fired]]) |
| **P2 sibling isolation** | a dirty edit in section B survives A's save + the `settingsChanged` refetch (no reseed, no value reset) | CT: type in B, change A, replay `getUserSettings`, assert B's DOM value + that B fired no mutation |
| **P3 partition** | overlap throws; gap throws unless cited in `UNCLAIMED_SETTINGS_KEYS` | unit test on `assertSettingsKeyPartition` (both arms + the self-cleaning stale-cite arm) |
| **P4 status aggregation** | one footer, aggregate precedence error > saving > saved; an errored section renders its own inline retry + nav marker; the no-host degrade renders inline | CT with a failing `updateUserSettingsSection` responder (`trpcError`) |
| **P5 nav/search parity** | every moved subId still appears in search, and the jump scrolls + flashes its anchor | CT on the shell (the `21abdc42` shell CT, extended per stage) |
| **P6 `when` parity** | a hidden section is absent from nav AND search AND the render | CT with a non-admin viewer stub |
| **P7 server commutativity** | two disjoint sibling-section patches both persist (user tier), and two disjoint sparse `updateAppSettings` deltas both persist (app tier) | server `.int` tests against the real serializers |

**Standing gates to re-run after each stage:** `settings-pane-completeness`, `settings-section-anchored`
(with its fixed scanRoot), `knob-wire-coverage`, `feature-owns-definition`, `no-parallel-section-map`,
`registry-assembly-at-door-only`, `form-factory-for-multifield`, `client-features-no-cross`.

**Live drive (not optional):** each stage ends with `pnpm snap` on the settings modal at the migrated pane
plus a real edit round-trip on `:5173` — the pane's own claim is that a knob GOVERNS something, and a green
CT with a stubbed tRPC cannot prove that (\[\[ct-stub-lie-live-drive-catches]], \[\[live-client-port-5173]]).

---

## 10. Owner decisions — genuinely-owner forks, not mine to close

> **RULED (owner, 2026-08-01) — ALL RESOLVED; the program is build-ready:**
> **Q1:** mint `features/tag` + `features/regex`, each owning its pane in `surface` mode ("they are probably
> going into their own features. i dont like that they are in settings") — the §6.1 O3 amendment is RATIFIED
> and minted as **D114** (`Core-Path-Registry.md`). **Q2:** `system` MERGES into `admin` at stage 4 (system's
> sections become the first group; deep links re-pointed). **Q3:** aggregate footer + inline error at the
> failing section, as specced (side-eye on stage 1 checks it). **Q4:** sub-level deep links
> (`openSettingsTo(category, subId)`) land IN THE PROGRAM (stage 0/1, while the anchor machinery is open).
> **Q5:** the two knob registries stay separate. **Q6:** app-shell owns its five appearance sections.

**Q1 — the O3 amendment homes for `tags` and `regex` (blocks stage 5).** Neither has a reader-feature: tags
label characters, chats, presets and world-info; regex scripts are owner-global and applied in the chat
pipeline, and `regex-editor-dialog` already lives at tier 2 shared by character + settings.
*Recommendation:* mint `features/tag` and `features/regex`, each owning its pane in `surface` mode (the
`feature-owns-definition` bar is met by owning the pane). *Alternatives:* fold tags into `features/character`
(wrong — tags span four entity types) or leave both in settings (the status quo O3 ruled, which SET-SEAMS
otherwise contradicts). **Needs the ruling + a D-ledger entry before any code moves.**

**Q2 — do `system` and `admin` merge?** Both are APP-group, both admin-gated, and after stage 4 both hold
admin-tier knob sections owned by the same features (`user-admin`, `workloads`). Keeping two panes means
users hunt for which admin knob lives where; merging is a visible IA change and a `SETTINGS_CATEGORY_IDS`
edit (deep links to `system` must be re-pointed). *Recommendation:* merge into `admin` at stage 4, with
`system`'s sections becoming the first group. **Owner IA call.**

**Q3 — the status UX (§3).** The spec decides "one aggregate footer + inline error at the failing section".
The alternative is N per-section footers (today's contributed-section behavior, honest but noisy). This is
owner-visible; a side-eye pass on stage 1 is the check. **Flagging, not blocking.**

**Q4 — sub-level deep links.** `openSettingsTo(category, subId)` would let any feature link straight to a
section (e.g. "configure memory" from a chat surface). The machinery is 90% there (the shell's
`scrollToAnchor` + MutationObserver). Out of scope as specced. **Want it in this program, or its own
ticket?**

**Q5 — one knob registry or two?** `UNCLAIMED_SETTINGS_KEYS` (no client editor) vs D107's
DOORWAY/DEFERRED registries (no server wiring) record adjacent facts. *Recommendation:* keep them separate —
they fail for different reasons and are checked at different tiers (door assembly vs `knob-wire-coverage`
gate) — but a single cite string per key that BOTH consult is the alternative if the duplication grates.

**Q6 — `app-shell` as a settings-section owner.** Stage 1 hands app-shell five appearance sections. app-shell
is the shell painter tier and already owns chrome definitions, so this is legal and evidence-correct (it is
the reader). The alternative is minting `features/appearance` purely to hold them. *Recommendation:*
app-shell. **Low-stakes; flagging because it grows the shell feature.**

---

## 11. Coupled sites for one section move (the cost, honestly)

After stage 0, moving a section costs: ① the section body → the owning feature's `components/` (fragment;
containment + focus stay with the host pane) · ② its `SettingsSubcategory` → the feature's `lib/*-nav.ts` ·
③ its contribution def → the feature's `lib/*-settings-section.tsx` + front door · ④ one line in the door
array (`main.tsx`) · ⑤ the `owns` claim (tsc + the partition assertion force it) · ⑥ its CT moves to the
mirror path (\[\[ct-mirror-path-vs-surface-gates]]) · ⑦ delete the section's markup + subcategory from the old
pane surface in the SAME commit. **Seven sites, three of them tsc/assert-forced, and the knob's editor lives
with the code that reads it.** Down from "edit the settings god-feature and hope the nav agrees".
