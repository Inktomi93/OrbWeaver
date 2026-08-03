# Stickler design review — THEME DOORS + the card-embeddable appearance partition (Lane TD design pass)

Date: 2026-08-03 · Reviewer: stickler (fresh context) · Charge: DESIGN (actor-state-review form — inventory → judgment → R-program → owner forks). Read-only; no code touched. Tree at review: `main`, clean except `reports/snaps/tracker-kit-trackers-tab.png` (unrelated snap churn). No diff under review ⇒ no gate battery run; every claim below is receipted against files read IN FULL this session.

GROUND (owner rulings, not re-opened): (1) character themes LEAVE the global picker — card-only via override; picker back to curated real themes. (2) Two doors ordered: **save-as-theme** (promote a card's override into a real picker theme) and **save a card override WITHOUT minting a theme** (custom-values arm). (3) Design the `embeddable-by-card` appearance-key partition (SW precedent: density/chatStyle deliberately NOT card-forced; takeover gate single-human-room per the BG lane's law).

---

## §1 INVENTORY — what is actually on the tree (receipts)

### 1.1 The board's FIRST question: is `themeOverride` values-or-theme-ref today? → **VALUES.**
- `packages/db/src/schema/character.ts:70-74` — `theme_override` / `background_override` are nullable JSON blobs typed `ThemeOverride` / `ThemeBackground`. No FK to `themes`, anywhere.
- `packages/contracts/src/character/index.ts:188-192` — the update input carries `themeOverrideSchema.nullable().optional()` (values) + the BG-C twin.
- `packages/contracts/src/chat/roster.ts:184-198` — `ParticipantView.themeOverride`/`backgroundOverride` thread the RAW value blob to every member ("threaded unmerged — chat assembly never reads the `themes` table").
- Consequence: a theme-REF design would have to cross the owner boundary on the roster wire (themes are single-owned, `themes.ownerId`, `db/schema/settings.ts:57-82`; members cannot read the host's theme row). Values-on-the-card is the only shape compatible with D18/D21/D22 membership physics. **The first question is settled by the tree: values.**

### 1.2 The cascade homes + takeover gates (as-built)
- **Background (BG-C), ONE home:** `@orb/contracts/chat` `resolveCarriedBackground` (`roster.ts:259-275`) — outer gate `isSingleHumanRoom` (widened per the 08-03 owner ruling, header at `roster.ts:223-227` states the widening + the permanent two-human INERT); cascade **chat-set > card-carried**; the card arm additionally `soleTrueSoloCharacter` (true-solo only, BY RULING — "no non-arbitrary pick among two cards' backgrounds"). Both the app-shell paint (`app-shell/lib/resolve-theme-background.ts:67-72`) and the panel echo (`chat/components/room-overrides-tab.tsx:65-88`, the honest-provenance gloss) call the ONE resolver.
- **Theme takeover:** `client/features/chat/lib/attribution.ts:149-166` `resolveRoomTheme` — TRUE-SOLO only, card arm only (no chat-set theme field exists: `contracts/chat/metadata.ts` carries `background?` only, line 204). Applied at `chat-room-surface.tsx:98-100` + `:139` `<ThemeScope tokens={roomTheme ?? {}}>`, gated on committed (`isCommitted` → `roomChatId` — a DRAFT room shows the viewer theme BY DESIGN, SW's pinned lesson).
- **Per-speaker plane (any room, all viewers):** `attribution.ts:104-125` — an assistant row's tokens = `participant.themeOverride ?? colorForCharacter(id)`; merged-narrator via `speakerThemesByName` (`:170-182`). This plane is NOT takeover-gated — bubble/prose colors on a character's OWN rows apply in group rooms too (in-room public face, same floor class as name/avatar).
- **Viewer's global theme:** `app-shell/lib/resolve-theme-scope-tokens.ts` — seed themes pass an EMPTY override (D71 clause 2); custom themes flow their override + density. `use-selected-theme.ts` degrades a stale/deleted `selectedThemeId` to `null` → Hearth (never blank).

### 1.3 Consumption topology — which override axes are actually LIVE (the SW-precedent ground truth)
- `chatStyle`: the row skin is chosen by `useChatStyle()` (`chat/hooks/use-chat-style.ts:20-24`) which reads **`UserSettings.appearance.chatStyle` ONLY**. `ThemeScope` stamps `data-chat-style` (`ui/content/theme-scope/theme-scope.tsx:26`) but **zero selectors/readers consume it** (repo-wide sweep: the only `data-chat-style` hit is theme-scope.tsx itself). ⇒ card chatStyle: DEAD. Theme chatStyle: DEAD.
- `density`: the only `[data-density]` selector is `.shell-grid[data-density="compact"]` (`app-shell/surfaces/shell.css:70`), fed by `app-shell.tsx:193` from `resolveThemeScopeTokens(...).density` (custom-theme density ?? appearance pref). A nested scope's `data-density` matches nothing. ⇒ card density: DEAD. **Theme density: LIVE** (a custom global theme the viewer selected).
- So the SW precedent ("density/chatStyle deliberately NOT card-forced") is enforced today by **consumption topology only** — the schema (`contracts/theme/override.ts:52-53`), the card editor (`character-appearance-tab.tsx:270-271`, Message style + Density selects), and the theme editor (`theme-editor.tsx:116` + model) all still SPELL and PERSIST the dead axes. See findings F-1.

### 1.4 The theme entity + picker state
- `themes` table: TypeID PK, nullable `ownerId` (NULL = seed, non-deletable/non-editable by `fetchOwned` physics), `unique(ownerId, name)` (typed-conflict surface; NULLs distinct so seeds are seeder-guarded). `isSeed` DERIVES at projection from NULL owner (`contracts/theme/index.ts:43-50`) — never stored.
- **The 13-theme picker is STILL LIVE on the tree** (ruling (1) is unbuilt — TD is the build): 12 value-set jsons in `ui/src/tokens/themes/` (mocha, light + the 10 character palettes: birdie, calamity, charlotte, elias, hana, jfc, kohaku, morgatha, niko, sabine) + Hearth-as-base; `seed-themes.ts` upserts all 13 at fixed sentinel ids, header: "Palettes 4–13 are the default-character pack's own palettes… published here as an installable app theme".
- Enforcement already in place that the migration will lean on: `tests/server/domain/settings/seed-theme-pairing.suite.test.ts` (byte-equal + registry set-equality BOTH ways vs `SEED_THEME_VALUE_SETS`, generated `ui/src/tokens/themes.gen.ts`); the tokens freshness gate; `css-structure` (hand-authored `[data-theme]` block = RED); `palette-contrast` (derived from the generated registry, auto-covers/auto-shrinks); `tests/server/domain/character/seeder/cards.contract.test.ts` (pins card overrides byte-equal to the ui value-sets — this pin DIES with the value-sets, see M1).
- Picker lifecycle (`settings/surfaces/theme-picker-surface.tsx`): select · new (create→editor) · customize-a-seed (duplicate→editor) · edit/delete owned · reset-to-Hearth. Known rider: the **zero-edit duplicate fork** (owner saw live; board ~1511: pick built-in → Customize → change nothing → back → a copy exists; "address if adjacent work touches theme-picker" — TD touches it).

### 1.5 Name-collision landscape (for the promote door)
- `preset`: `uniquePresetName` — **mint-time numeric de-collision at the WRITE** (`domain/preset/substrate/names.ts`, used by create + update).
- `theme.createTheme` (`verbs/create-theme.ts`): insert-optimistically, classify the constraint → **typed `DomainConflictError`** (explicit-name editor path; TOCTOU-safe, the `tag.create` precedent).
- `theme.duplicateTheme` (`verbs/duplicate-theme.ts`): **mint-time de-collision** via local `freeThemeName` ("<base>", "<base> 2", …) + typed conflict only on the race. `freeThemeName` is currently PRIVATE to duplicate-theme.ts.

### 1.6 The viewer plane + the settings partition idiom
- `AppearanceSettings` (`contracts/settings/index.ts:729-816`): ~35 flat keys — chatWidthPct, fontScale, avatar quartet + showInChatAvatars, density, elevation, chatStyle, 7 diagnostic `show*` toggles + messageActions, autoFixMarkdown, colorQuotedSpeech, blurSurfaces/blurStrength/shadowEffects/surfaceTexture, reducedMotion, the background sextet + library + fit/dim/blur, 5 reading-* keys + justifyBodyText, enableThemeColorization, showLLMReasoningIcon.
- The D120 owns-partition idiom (the enforcement shape to mirror): per-section `*_KEYS` tuples (e.g. `APPEARANCE_MESSAGE_STYLE_KEYS`, `chat/lib/appearance-message-style-model.ts:29`) + `owns` claims + `assertSettingsKeyPartition` at the door (zero cited gaps). Tuples + a door assert — **not DDL**.
- `ThemeBackground` (`contracts/theme/background.ts`) already rules its own partition slice in the header: **source carried, fit/dim/blur NEVER carried** (ST `/lockbg` semantics); `BACKGROUND_IMAGE_KINDS` homed in theme, settings re-exports (the one-direction vocabulary precedent TD's tuple should copy).
- Law bearing directly: UI-Theming §12.1 — "Appearance settings are **display-only** … they're user/AppSettings-level, **not per-character**." The card-carriable plane is deliberately NOT appearance: it is the two carried twins (`ThemeOverride`, `ThemeBackground`). The partition is therefore already half-structural: **a key not spellable in a carried schema cannot ride a card** (resolver physics). Core-0 §6 has no theme/appearance row — no drifted prior ruling; the partition question is genuinely new territory (checked before treating as new, per charge).
- Serde: `server/kit/serde/theme/` exists (theme export/import — the bundle arm the promote door does NOT need to build). Card serde (`serde/card/`) carries **no** themeOverride/backgroundOverride — the presentation plane does not survive card export today (inventory fact, out of TD scope).

### 1.7 D-law bearing (read this session)
D44 (two trust tiers; token-override via `<ThemeScope>` clamp; resolution character > global > default) · D62 (shipped theme set Hearth · Mocha · Light; settings IA) · D63 (background image = appearance, base surface COLOR = theme token) · D71 (all four clauses; seed value-sets generated-not-authored; seed renders from block only; clamp derives color-scheme) · D107 (dead-switch class; DOORWAY/DEFERRED registries) · D114 (a section homes with its READER) · D120 (SET-SEAMS; owns tuples + door assert) · **D121-D** (lifecycle chrome anatomy: band = Import · kebab = Export · ZERO lifecycle chrome in editors/rooms) · D121-F (`promoteActor` — the promote-verb precedent) · D122 (presentation-surface consent via present membership). Plus the BG-C header law and the 08-03 single-human widening ruling (board lines 745-756, built `47562f44`).

---

## §2 JUDGMENT — the two doors

### 2.1 Door 1 — "Save as theme" (promote)

**Promote COPIES VALUES; re-ref is rejected.** Four independent reasons, each sufficient:
1. The override IS values today (§1.1); there is no ref to preserve.
2. The roster wire threads values to every member; a theme-ref cannot cross the single-owner boundary (`themes.ownerId` + `fetchOwned`) without inventing cross-owner theme reads.
3. Deleting a theme must never strip N cards (no FK, no cascade surprise); `duplicateTheme`'s deep-copy is the standing precedent ("duplicate-to-customize", seeds never edited in place).
4. Card portability: card serde drops presentation; a ref would dangle on any future export/import arm.
One-home check: the card's look and a picker theme are two CONCEPTS (a character's authored identity vs the user's app-wide palette library entry); a one-time copy at a door is the `duplicateTheme` pattern, not a doubling. Post-promote edits deliberately do NOT sync either way.

**Fidelity is exact BY CONSTRUCTION** — this is the payoff of the picker reversal: a promoted theme is an OWNED row, so it renders through `clampThemeTokens` — the SAME derivation the room takeover uses on the card values. (The old 3→13 approach rendered seeds from hand-tuned generated blocks; promote under that regime could never be byte-faithful. Under this design it is, with zero pipeline work.)

**Payload = the card-embeddable subset only** (`cardEmbeddableSubset(themeOverride)`, §3): colors + font + radius + background + borderColor. Explicitly NOT copied:
- `chatStyle`/`density` — a promoted theme must not smuggle a viewer-ergonomics force the card itself could not exert (theme density is LIVE when selected, §1.3 — copying a card's stale `density:"comfortable"` would silently pin the promoting user's shell density).
- `backgroundOverride` — a theme has no image slot BY LAW (D63: the photo is appearance/carried-twin territory; the base surface COLOR is already in the override). Not a gap; the ruled shape.
- `css: null` — cards have no CSS tier (Tier-B is per-character trust, not theme CSS).

**Verb: `settings.promoteTheme`** (domain/settings, the themes owner — new verb beside createTheme):
- Input `{name, override}` — same boundary clamp as createTheme (`themeOverrideSchema.parse`); the CLIENT supplies the values it already holds via `character.get` (the appearance tab's own query). No settings→character server edge: zero security gain from a server-side read (the caller can already `createTheme` arbitrary values; the clamp is identical), and the cake stays clean.
- **Name policy: mint-time de-collision** (the `uniquePresetName` / `duplicateTheme` precedent) — default name = the character's display name; `freeThemeName` HOISTED from duplicate-theme.ts to a shared substrate home (one home, two callers); the constraint-race still classifies to the typed conflict. Rationale for de-collide-not-reject: promote is a mint the user did not type a name into — "Charlotte 2" is the honest outcome; the typed-conflict UX stays correct for `createTheme`'s explicit-name editor path. Two policies, two doors, each matching its input mode — this is the standing split on the tree already (§1.5).
- Audits `theme.promote`, emits `themesChanged`, returns `ThemeView`. New tRPC proc → the new-router PROBED/EXEMPT sweep classification (one probed mutation).
- Never writes `ownerId: NULL` — promote can never mint a seed (isSeed derives from NULL owner; D71's two-row-kind split holds by construction).

**Placement (D121-D):** promote is a DOMAIN verb (the D121-F `promoteActor` class), **not lifecycle chrome** — the band/kebab anatomy governs Import/Export serialization doors, and "zero lifecycle chrome in editors" bans those, not in-domain verbs. Home: **the character Appearance tab's Theme cluster header row** — a ghost `Save as theme…` button beside "Reset to global" (`character-appearance-tab.tsx:227-238`), enabled iff the override is non-null (the same `form.Subscribe` emptiness selector already there). Both-ends honest: the door sits where the values are authored and live. Rejected placements: the library row kebab (that slot is Export's ruled home, and the kebab can't see the tab's unsaved-latest session) and a picker-side "New from character…" (backwards — the source is the card, and it would re-couple the picker to the character domain). On success: toast + picker refresh via `themesChanged`; do NOT auto-select the new theme (selecting is the picker's one applying act, per its header contract).

### 2.2 Door 2 — save a card override WITHOUT minting a theme (the custom-values arm)

**This door is BUILT — the design confirms it as the sanctioned arm rather than building it twice.** Receipts: the whole character Appearance tab is an immediate-commit autosave riding `character.update` (`character-appearance-tab.tsx` + `use-character-theme-form.ts`, D78 boundary, 300ms debounce, per-field Inherit semantics, "Reset to global"); values one-homed on the card row; the BG-C background control is its sibling. Nothing new to persist, no new verb.

Build residue that IS this door's to close:
- **Strike the two dead selects** (Message style, Density) from the card tab — the partition's R3 (findings F-1; D107 dead-switch class: they write fields no consumer reads).
- **The reversal opens a real UX hole: "make this card look like Mocha" is now hand-copying colors** (character themes left the picker; no path copies theme→card). Recommend the small inverse door: `Start from a theme…` on the same cluster row — pick any picker theme, copy `cardEmbeddableSubset(theme.override)` into the form fields (a one-time seed of form values through the SAME projection, no linkage, autosave persists as ordinary values). Fork O-6.

---

## §3 The EMBEDDABLE-BY-CARD key partition (the explicit table)

**The principle (one line):** a card may carry **IDENTITY & ATMOSPHERE** — what the character looks like (colors, type family, corner language, backdrop SOURCE); the viewer owns **ERGONOMICS, ACCESSIBILITY, COST, and TREATMENT** — how big, how dense, how dim, how expensive, which diagnostics. Tie-break test for any future key: *would card-forcing it change how comfortably or expensively the VIEWER reads, or only what the room looks like?* Comfort/cost ⇒ viewer-sacred.

**Reach column:** `own-rows` = the per-speaker plane, applies in ANY room to that character's rows (all viewers — D122 presentation-surface consent class); `takeover` = the room-chrome plane, applies ONLY inside the takeover gate (single-human room; card arm true-solo). Viewer-sacred keys apply NOWHERE from a card — including inside the gate.

### 3a Carried-schema keys (spellable on a card today)

| Key (ThemeOverride) | Verdict | Reach | Reason |
| - | - | - | - |
| `accent` | **card-embeddable** | takeover | identity color; clamped (`isSafeColor`); fg auto-derived for contrast |
| `userBubble` | **card-embeddable** | takeover | room atmosphere; fg derived, never picked — AA by construction |
| `aiBubble` | **card-embeddable** | own-rows + takeover | the character's own bubble — the core per-speaker identity |
| `systemBubble` | **card-embeddable** | takeover | room atmosphere |
| `speaker` | **card-embeddable** | own-rows + takeover | name color = identity |
| `dialogueColor` / `narrationColor` / `bodyColor` | **card-embeddable** | own-rows + takeover | RP prose semantics = the card's voice |
| `font` | **card-embeddable** | takeover | atmosphere; ALLOWLIST-clamped (7 sane families) — family is identity, SIZE (fontScale) stays viewer |
| `radius` | **card-embeddable** | takeover | corner language = atmosphere; snaps to token scale |
| `background` (surface COLOR) | **card-embeddable** | takeover | the ramp seed; polarity + AA derived by the clamp (D71-4) |
| `borderColor` | **card-embeddable** | takeover | ST parity; wins over derived hairline |
| `chatStyle` | **VIEWER-SACRED** | — | layout mechanics (row anatomy, avatar geometry, reading flow) = ergonomics; SW precedent; already consumption-dead from cards AND themes (§1.3) |
| `density` | **VIEWER-SACRED on cards** (theme-live) | — | control sizing / touch targets / info density = ergonomics. On a TIER-A THEME it stays live: selecting a theme is the viewer's own consented choice — the consent chain, not the key, is what differs |

| Key (ThemeBackground — one source unit) | Verdict | Reach | Reason |
| - | - | - | - |
| `kind`+`seededId`+`assetId`+`assetHash`+`mime`+`provenanceUrl` | **card-embeddable** (BUILT, BG-C) | takeover (card arm true-solo) | backdrop SOURCE = atmosphere; external never persists paintable (CSP + materialize invariant); `canonicalBackgroundSource` blocks asset-ref smuggling |

### 3b Viewer-plane keys (AppearanceSettings — NOT spellable on a card; the partition keeps them so)

| Key group | Verdict | Reason |
| - | - | - |
| `chatWidthPct`, `fontScale`, `readingLineHeight`, `readingLetterSpacing`, `readingParagraphSpacing`, `readingNameScale`, `readingBodyScale`, `justifyBodyText` | VIEWER-SACRED | reading ergonomics — a11y-adjacent; a card that shrinks your text is an accessibility regression |
| `reducedMotion` | VIEWER-SACRED (hard) | accessibility, non-negotiable (D42 baseline) |
| `density`, `chatStyle`, `elevation`, `messageActions` | VIEWER-SACRED | chrome ergonomics / interaction mechanics |
| `avatarSize` / `avatarShape` / `avatarAspect` / `avatarRing`, `showInChatAvatars` | VIEWER-SACRED | viewer layout prefs; the card's face already rides the avatar asset itself |
| `blurSurfaces`, `blurStrength`, `shadowEffects`, `surfaceTexture` | VIEWER-SACRED | device/GPU COST + chrome taste — a card must not spend the viewer's frame budget |
| `showTimestamps`, `showGenerationTimer`, `showGenerationCost`, `showTokenCount`, `showMessageId`, `showModelIcon`, `showLLMReasoningIcon` | VIEWER-SACRED | diagnostic chrome; `showGenerationCost` literally fires PAID upstream calls — a card-forced money switch is unthinkable |
| `autoFixMarkdown`, `colorQuotedSpeech`, `enableThemeColorization` | VIEWER-SACRED | display-processing opt-in/outs OVER card-supplied colors — the card supplies the color, the viewer decides whether it paints |
| `backgroundImageKind/SeededId/AssetId/AssetHash/AssetMime`, `backgroundLibrary` | VIEWER-SACRED | the viewer's OWN backdrop + library; the card's door is the carried twin, never these fields |
| `backgroundFit`, `backgroundDim`, `backgroundBlur` | VIEWER-SACRED (already ruled) | TREATMENT of a carried source — ST `/lockbg` semantics, `background.ts` header law |

### 3c Enforcement shape (the settings owns-partition idiom, NOT a DB column)

The owner's musing said "column"; the honest artifact is **tuples + a door assert** — viewer-sacred keys are schema keys, not rows, so there is nothing for DDL to attach to, and the D120 idiom (`*_KEYS` tuples + `assertSettingsKeyPartition`) is the house shape for exactly this. Three layers:

1. **Physics (exists, keep):** a card can only spell keys the two carried schemas contain. Anything in §3b is UNREPRESENTABLE on a card. The partition's first wall is the schema split itself.
2. **The projection function (new, ONE home):** `CARD_EMBEDDABLE_THEME_KEYS` tuple + `cardEmbeddableSubset(override)` in `@orb/contracts/theme` (the `BACKGROUND_IMAGE_KINDS` homing precedent — theme is below settings, both sides import down). Callers: `resolveRoomTheme`, `speakerThemesByName`, the promote verb's boundary, the Start-from-theme seed. The strip stops the takeover stamping dead `data-*` attrs from card scopes and makes future wiring of a viewer-sacred key from a card impossible at every consumption site at once.
3. **The partition suite (new):** `tests/contracts/theme/card-embeddable-partition.suite.test.ts` — (a) `CARD_EMBEDDABLE_THEME_KEYS ∪ VIEWER_SACRED_THEME_KEYS` = exactly `keyof ThemeOverride`, disjoint (type-level via `Expect<Equals<…>>` + runtime set check, so a NEW ThemeOverride field is RED until classified); (b) `keyof AppearanceSettings ∩ keyof ThemeOverride` = exactly the cited overlap set (today `{chatStyle, density}`, shrinking to `{density}` under O-4) — the two deliberate vocabulary shares, each carrying its verdict cite; (c) the ThemeBackground side pins fit/dim/blur ∉ carried schema. Two-sided and self-cleaning, the knob-wire-coverage discipline: a key that gains a card wire REDs its sacred row; a row whose key vanished REDs stale.

No `scripts/check` gate initially — this is a contracts-shape invariant, the pairing-suite family; promote to a gate only if drift recurs.

### 3d Takeover-gate interaction

The partition changes WHAT can ride a card; it never touches WHEN it paints. Gates stay exactly as ruled: outer `isSingleHumanRoom` (permanent two-human INERT — the red-first pin stays load-bearing); background cascade chat-set > card-carried with the card arm `soleTrueSoloCharacter`-only; theme takeover = card arm only, true-solo. Card-embeddable keys apply only inside their reach column; viewer-sacred keys apply from a card nowhere, gate or no gate. TD adds NO chat-set THEME arm (not ordered; doorway if ever asked: a `chatMetadata` twin field + a `resolveCarriedTheme` in contracts/chat mirroring `resolveCarriedBackground` — the homes are obvious, which is why deferring costs nothing). One repair TD SHOULD ride: re-home `resolveRoomTheme`'s gate onto the contracts `soleTrueSoloCharacter` (finding F-2 — the roster.ts comment already claims this and it is not true).

---

## §4 Migration (existing overrides + the picker reversal)

**M1 — picker curation (ruling (1)'s build):**
- Delete the 10 character value-set jsons → `pnpm --filter @orb/ui tokens:build` (themes.gen + theme.css blocks regenerate away). This IS the D71-compliant direction — generated-not-authored means removal is also json-side only; never touch theme.css by hand (`css-structure` RED). The freshness gate forces the regen into the same commit.
- `seed-themes.ts`: drop the 10 upserts + add a **DELETE arm** at the 10 fixed sentinel ids (the seeder is upsert-only today; without the delete, every existing install keeps 10 orphan picker rows forever). Keep the header's "overwrite can never clobber user data" truth: the delete targets only the sentinel ids, and **owned duplicates of character themes survive untouched** (they are the user's rows — correct under duplicate-to-customize).
- **Heal `selectedThemeId`:** any user_settings whose `theme.selectedThemeId` ∈ the 10 sentinel ids → `null` (Hearth), only-if-set (the DEMO_CHAT_PACK heal precedent). The client already degrades a dangling id gracefully (`use-selected-theme` → null → Hearth), so the heal is for settings-blob honesty + picker active-row display, not crash safety.
- Tests self-adjust by derivation (seed-theme-pairing + palette-contrast both derive from `SEED_THEME_VALUE_SETS` — the D71 both-ways set-equality forces jsons and seeder to shrink TOGETHER). One pin dies honestly: `cards.contract.test.ts`'s byte-equal card↔value-set pairing loses its ui side — re-pin the card overrides as self-contained contract fixtures (the pack is frozen-source; any card edit rides the MIG pack-version stamp discipline).
- **NO DDL anywhere in TD** — no new columns, no baseline concern (the 0000-squash rule is not triggered; flagging because no gate catches a stray 0001).

**M2 — existing card override blobs:** untouched. Lenient parse strips at every read seam (zod strips unknown keys; the client clamp `safeParse` is the render wall), so if O-4 deletes `chatStyle` from the schema, stale blobs simply stop carrying it at parse — no rewrite pass (derive-don't-migrate), no version bump (the carried twin is not a versioned-config tier, per the background.ts precedent). Seeded cards' `chatStyle:"bubble"/density:"comfortable"` (all 10, `seeder/cards.ts`) drop from the pack source in the same wave, riding the pack-version stamp.

**M3 — users mid-flight:** covered by M1's heal + the built graceful degradations. Members of rooms whose host's card carried dead axes: no observable change (the axes were already dead, §1.3).

---

## §5 Staging (the R-program)

- **R0** — this review (inventory + rulings receipted). DONE with this file.
- **R1 — picker curation + heal** (M1 whole): jsons → tokens:build → seeder delete arm + selectedThemeId heal → test re-pins. Gate floor: freshness + css-structure + seed-theme-pairing + palette-contrast + the seeder int tests.
- **R2 — the partition substrate**: `CARD_EMBEDDABLE_THEME_KEYS` + `VIEWER_SACRED_THEME_KEYS` + `cardEmbeddableSubset` in contracts/theme; the partition suite (§3c-3); re-home `resolveRoomTheme` onto `soleTrueSoloCharacter` + the subset projection (F-2 fix); `speakerThemesByName` through the same projection; strike the card tab's two dead selects (F-1a) and the theme editor's Message-style select (F-1b, per O-4/O-5); update the roster.ts + override.ts headers to match.
- **R3 — the doors**: `settings.promoteTheme` (verb + hoisted `freeThemeName` + audit + event + int tests incl. the collision-numbering and the subset-projection assertions) → the Appearance-tab `Save as theme…` button (+ CT: enabled-iff-override, success lands in picker, no auto-select) → (per O-6) `Start from a theme…` seeding. Rider: the zero-edit duplicate fork fix (O-8) while the picker is open.
- **R4 — close-out**: D-entry mint (D123+; the partition table + both door shapes + the copy-not-ref ruling + the name-policy split); UI-Theming §12.1 amendment (the "not per-character" sentence gains the carried-twin partition pointer); board strike.
Sequencing note: R1 ∥ R2 are independent; R3 depends on R2 (the subset projection is promote's boundary).

---

## §6 Owner forks (each with a recommended arm)

- **O-1 promote door placement** — (a) character Appearance tab Theme-cluster button ★REC (values live there; D121-D untouched — promote is a domain verb, the promoteActor class, not lifecycle chrome) · (b) library row kebab (rejected: Export's ruled slot; blind to the live session) · (c) picker-side "from character" (rejected: both-ends backwards).
- **O-2 promote name policy** — (a) mint-time numeric de-collision, default = character name, `freeThemeName` hoisted to one home ★REC (uniquePresetName/duplicateTheme precedent; promote is a nameless mint) · (b) typed-conflict + rename dialog (rejected for this door; STAYS for createTheme's explicit-name path — two doors, two input modes, the tree's standing split).
- **O-3 promote payload** — (a) `cardEmbeddableSubset` only; no chatStyle/density; no background; css null ★REC (no viewer-force smuggling; D63 says themes have no image slot) · (b) whole-override copy (rejected: silently pins the promoter's shell density).
- **O-4 `chatStyle` field fate on ThemeOverride** — (a) DELETE the field from the schema + both editors; the `THEME_CHAT_STYLES` tuple stays (it is appearance's vocabulary home) ★REC (dead everywhere, §1.3 — the D107 dead-switch class, `rateLimits.general` deletion precedent; lenient parse makes old blobs a non-event) · (b) keep + cite-dormant as a DOORWAY (if the owner intends a future "theme forces skin" — nothing today suggests it).
- **O-5 `density` exposure** — ★REC: field STAYS on the schema (theme-live); the CARD tab's Density select is struck (card-dead + viewer-sacred); the THEME editor's Density select stays (live, consented).
- **O-6 the inverse door `Start from a theme…`** — (a) build the small seeding control (copy subset → form values, no linkage) ★REC (the reversal orphaned "make this card look like Mocha"; it is the same projection function run backwards, ~one select) · (b) defer (accept hand-copying).
- **O-7 chat-set THEME arm** (host-picked room theme mirroring the background cascade) — ★REC: DEFER, doorway named (§3d). Not ordered; adds a metadata field + resolver + panel row for a want nobody has voiced.
- **O-8 zero-edit duplicate fork** (rider) — (a) auto-delete the copy on Back-with-zero-edits ★REC (cheapest honest arm; single-flight guard) · (b) defer-create until first edit (cleaner but reworks the editor session boundary) · (c) leave (owner already said "technically fine").
- **O-9 the curated picker set** — ★REC: Hearth · Mocha · Light (the D62 shipped set verbatim). Any character palette the owner misses re-enters as ONE json (D71: a new theme = a json) — a taste call with a one-file cost, decidable any time.
- **O-10 partition enforcement artifact** — (a) contracts tuples + partition suite ★REC (the D120 idiom; a contracts-shape invariant belongs to the pairing-suite family) · (b) a scripts/check gate (defer unless drift recurs) · (c) a DB column (rejected: nothing to attach to — the sacred keys are schema keys, not rows).

---

## §7 D71 pipeline flags (the generated-not-authored invariant)

1. R1's removal path is json-deletion + regen ONLY — the invariant holds in both directions; hand-editing theme.css/globals.css is RED by the existing gates.
2. **Promote must never mint a seed or a block**: owned row, renders via the clamp, `ownerId` NOT NULL always; "promote to built-in" would be a different program (json + build + seeder) and is not this door.
3. The seeder gains a DELETE arm — semantics change to "converge to the shipped set" (upsert survivors + delete retired sentinels). Keep the never-clobbers-user-data header truthful: sentinel-id-scoped only.
4. The both-ways set-equality in seed-theme-pairing is the migration's safety net, not an obstacle — jsons, generated registry, and seeder rows can only move together.

---

## §8 Findings (current-tree defects surfaced while inventorying — design inputs, not P0s)

- **F-1 (dead switches, D107 class):** `character-appearance-tab.tsx:270-271` (Message style + Density selects) and `theme-editor.tsx:116` (Message style select) persist fields with ZERO live consumers. Evidence: `useChatStyle` reads only `appearance.chatStyle` (`use-chat-style.ts:20-24`); repo-wide, the only `data-chat-style` occurrence is its producer (`theme-scope.tsx:26`); the only `[data-density]` selector is `.shell-grid[data-density]` (`shell.css:70`), unreachable from nested scopes; the only live `override.density` read is `resolveThemeScopeTokens` (global theme). Cost: users set a control that governs nothing (the F-02 lying-affordance class). Fix rides R2.
- **F-2 (one-home comment drift):** `contracts/chat/roster.ts:200-204` states `soleTrueSoloCharacter` is "the shared home so the per-speaker THEME takeover (`resolveRoomTheme` …) and the CARD-CARRIED arm of the background takeover can never drift" — but `resolveRoomTheme` (`attribution.ts:149-166`) re-spells the true-solo count locally and does not import it. The exact drift the comment claims impossible is one edit away (and the two spellings already sit at different gate widths post-08-03, legitimately for now). Fix rides R2.
- **F-3 (board-vs-tree, expected):** rulings (1)/(2) are UNBUILT — 13 seed themes live in picker/seeder/jsons. Not a defect; it is TD's mandate. Recorded so the next cold agent doesn't read the ground rulings as describing the tree.

## §9 Verified clean / coverage of my silence

- Read IN FULL: agent-doctrine, AGENTS.md, Core-Laws-and-Precedents, UI-Theming-and-Content, contracts `theme/override.ts` + `theme/background.ts` + `chat/roster.ts`, `db/schema/settings.ts`, clamp.ts + theme-scope.tsx, resolve-theme-scope-tokens.ts, resolve-theme-background.ts, attribution.ts, use-chat-style.ts, use-selected-theme.ts, use-character-theme-form.ts, character-appearance-tab.tsx, room-overrides-tab.tsx, theme-picker-surface.tsx, create-theme.ts, duplicate-theme.ts, appearance-message-style-model.ts. Read in relevant part: Core-Path-Registry (D1–D122 sweep for bearing entries; D120/D121/D122 in full), retro-workboard (the TD/SW/BG threads, lines ~700-835 + 1400-1520), contracts/settings appearance block (:700-850), seed-themes.ts head, seeder/cards.ts (two cards + presentation blocks), app-shell.tsx (:150-210), chat-room-surface.tsx (:80-160), theme contract views, chat router BG-C procs, serde inventory.
- Swept (Grep/glob, live-hit-verified): `resolveRoomTheme` / `resolveCarriedBackground` / `clampThemeTokens` all consumers; `data-chat-style` + `data-density` all occurrences; `override.chatStyle` all reads; `uniquePresetName` all call sites; `themeOverride`/`backgroundOverride` across packages + serde + tests; Core-0 §6 theme/appearance rows (none).
- NOT read (bounded): theme-editor.tsx full body beyond the density/chatStyle rows; theme-row-menu.tsx; the theme serde bodies; the settings tRPC router; seed-theme-pairing test body; the remaining 8 seeder cards (presentation shape spot-checked ×2 + grep-confirmed ×10 for the dead axes). None bear on a §2–§6 ruling; all are R-program build-time reading.
- Not run: `pnpm check` / test battery — no diff under review (design charge; tree clean but for an unrelated snap png).

## §10 Unconfirmed suspicions (low priority, one line each)

- The theme editor's live preview may not strip dead axes either — irrelevant once O-4 lands; not traced.
- `enableThemeColorization`'s consumer was not traced (classified viewer-sacred on its settings-tier home alone).
- Whether `speakerThemesByName` scopes re-deriving the full surface ramp inside a single row has a measured style-recalc cost in long group transcripts — no evidence gathered; only relevant if the subset projection debate reopens.
