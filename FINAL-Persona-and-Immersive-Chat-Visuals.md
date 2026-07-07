# FINAL — Persona build-out + the Moonlit-Echoes steal-and-improve list (immersive chat visuals)

```
kind: build-spec   status: authoritative capture (2026-07-07)   author: design session synthesis
scope: (A) the persona system + its UI home · (B) the message-row/avatar/immersive-mode visual system
       distilled from SillyTavern "Moonlit Echoes" (reference/upstream/moonlit-echoes) + the neo mockup.
companion: FINAL-Character-Library-and-Editor-UX.md (character side) · docs …/UI-Theming-and-Content.md §12.
```

> Cold-read capture written under low context to preserve a long design session. Everything below is a
> DECIDED direction unless marked "open". Moonlit's *implementations* are hacky (SillyTavern-extension debt);
> we steal the **concepts** and rebuild clean in our token-driven / compose-only system — which removes every
> one of their blockers (see §B.6).

---

## THE KEYSTONE DEPENDENCY (read first): #67 — the client asset-URL resolver + upload flow

Nothing in the app renders an **uploaded image** yet — character avatars, persona avatars, and the theme
`background` asset arm ALL fall back (initials / seeded / external URL) because there's no client asset-URL
resolver/upload flow. This is **#67 / PD-131**, and it's the single highest-leverage piece: it unblocks
avatars, persona images, AND background images at once. Everything visual below that involves a user-uploaded
image is gated on it. Build it first.

---

## PART A — The Persona system

> **READ THIS PART SLOWLY. It is the one area agents (and humans) reliably get wrong.** The confusion is
> always the same: treating the four persona pointers as one "current persona", or treating the two `{{user}}`
> resolution contexts as one. They are not. This section is written to make that impossible to misread. When
> you touch persona code, the terms below are LAW — use these exact names, never invent synonyms like
> "selected persona" or "the persona" unqualified.

### A.0 The four persona pointers (memorize this table; every persona bug is a confusion between two rows)

A user has MANY personas (saved identities: name + description + avatar). At any moment, **four independent
pointers** select *which* persona applies *where*. They are stored in four different places and mean four
different things:

| # | Name (use this term) | What it means, in one sentence | Scope | Orb column | Built? |
|---|---|---|---|---|---|
| 1 | **Default persona** | Your "home" identity — the star. A pure SEED for new chats; it *drives nothing live*. | Global, per-user | `seeds.defaultPersonaId` (`contracts/settings/index.ts:335`, in `user_settings.config`) | ✅ |
| 2 | **Current persona** | Who you are playing as *right now, globally*. CAN be any persona — **not necessarily your Default**. Seeds new chats; changing it never touches an existing chat. | Global, per-user, live | **`seeds.currentPersonaId` — MUST ADD** (next to #1) | ❌ (one field) |
| 3 | **Chat persona** | The live `{{user}}` for *this human's lines in THIS chat*. An explicit per-chat override. | Per-chat participant | `chat_participants.activePersonaId` (`db/schema/chat.ts:329`) | ✅ |
| 4 | **Anchor persona** (the "pin") | The persona that **character-card text** resolves `{{user}}` against — frozen to who opened the chat. | Per-chat | `chats.anchorPersonaId` (`db/schema/chat.ts:132`) | ✅ |

(There is also a per-*message* stamp, `messages.personaId` (`db/schema/chat.ts:202`) — it records who authored
each past user line so history stays correct after a swap. It is a *consequence*, not a control you set.)

### A.1 THE CENTRAL LAW — `{{user}}` resolves in THREE SEPARATE CONTEXTS

This is the whole thing. `{{user}}` does **not** have one value. It resolves differently depending on **which
kind of text** it appears in:

- **CARD `{{user}}`** — `{{user}}` written into **character-authored fields** (description, personality,
  scenario, greetings/first-message, example dialogue, and character-sourced lorebook) → resolves to the
  **Anchor persona (#4)**. "Who the *character* thinks you are." Frozen at chat-open; does **not** change when
  you swap who you're playing as.
- **PROMPT `{{user}}`** — `{{user}}` in the **live generation**: your current turn, generation config, system
  prompt, injected instructions → resolves to the **Chat persona (#3)** (your current active persona for this
  chat). "Who is *speaking right now*."
- **HISTORY `{{user}}`** — `{{user}}` (and the name + avatar attribution) of **every message ALREADY in the
  chat** → resolves to **that row's OWN `messages.personaId` stamp**, NOT your current persona. A line authored
  as Nate stays Nate's *forever*, even after you swap to Steve. This is the **attribution axis** — it makes
  past history correct per-line after any switch.

> **One-line test for any agent:** *"Where is this `{{user}}`?"* → **character-author's text** = Anchor (#4);
> **the live turn being generated** = Chat persona (#3); **a message already in the log** = that row's own
> `personaId` stamp. Those three questions resolve every persona case correctly.

**All three are ALREADY WIRED and canon-correct — do not rebuild:**
- Card vs Prompt: `AssembleContext` carries both `pinnedPersona` (= Anchor) and `activePersona` (= Chat
  persona) (`contracts/chat/index.ts:281-283`); `assemble.ts` feeds card-derived sections `pinnedPersona` and
  user-authored sections `activePersona` (`context.ts:389-390`).
- History: **storage is RAW, resolved at consumption** (`kit/macro/row-macros.ts` §0 — *"storage is RAW,
  never mutated; resolution happens at CONSUMPTION"*). `resolveRowMacros` (`row-macros.ts:76-97`) resolves
  each row's `{{user}}`/`{{char}}`/`{{persona}}` against **its own** `characterId`/`personaId` stamp; the
  row's stamp wins, the current persona is only the null-stamp fallback (`:86-87`). The **SAME atom** is
  called by server-assemble AND client-display, so what you see == what the model gets.
- Canon writes: send stamps `messages.personaId` = explicit ?? the acting participant's active persona
  (PD-100, `turn.ts:317,498`); avatars on old rows follow the frozen stamp too (`roster-avatars.ts:9`).
  **Swapping current/anchor never rewrites history.** The ONLY deliberate history-restamp is
  `reattributePersona` (`edit.ts:638`, author-or-host per-row) — the escape hatch.

This is exactly the neo-tavern behavior; all three contexts are wired and correct. The persona lane's job is
the CLIENT UI + the small gaps (A.5/A.6b), NOT reimplementing resolution.

### A.2 The canonical worked example (this is the acceptance test — build to it)

> Default persona (#1) = **Nate**. You open a chat with the character **Mary**, whose card description contains
> *"`{{user}}` is my brother."* You start the chat as Nate, so the **Anchor (#4)** is stamped **Nate** and the
> **Chat persona (#3)** is **Nate**.
>
> - Right now: Mary's CARD `{{user}}` = **Nate** ("Nate is my brother"); PROMPT `{{user}}` = **Nate**.
>
> Mid-story you kill off Nate and swap to a new persona, **Steve**. You change your **Current persona (#2)**
> to Steve and set this chat's **Chat persona (#3)** to Steve.
>
> - Now: Mary's CARD `{{user}}` is **STILL Nate** (Anchor unchanged — "Nate is my brother" remains the
>   established fact; Mary is not told "Steve is my brother"). PROMPT `{{user}}` = **Steve** (your live turns
>   are Steve). **Nate is still your Default (#1).** Past messages that were authored as Nate **stay Nate**
>   (their `messages.personaId` is frozen) — swapping never rewrites canon.
>
> The point of the Anchor: Mary keeps *knowing you as* Nate, while Steve is *the one currently speaking*. The
> system holds those as two distinct identities on purpose. Steve is never made to masquerade as Nate.

### A.3 Precedence — a SEED chain resolved ONCE at chat-open (not a live fallback)

When a chat is created, orb resolves the initial pointers ONE TIME:

```
Anchor (#4) / Chat persona (#3) at chat-open  =  explicit choice  ??  character-connected persona  ??  Current (#2)  ??  Default (#1)
```

(`start-chat.ts:406-414`; today the tail is `?? Default` — extend it to `?? Current ?? Default` when #2 lands.)

After chat-open, the chat holds its **own concrete** Anchor and Chat-persona ids. **This is why changing your
global Current (#2) or Default (#1) later never disturbs an already-open chat** — the chat already froze its
own pointers. Per-chat changes (setting Chat persona #3, re-pinning Anchor #4) happen inside that chat and
affect only it.

### A.4 The traps — "these are NOT the same thing" (each bullet is a real past confusion)

- **Current persona (#2) ≠ Default persona (#1).** Your Default is your star/home; your Current is who you're
  playing as this moment. You can play as Steve while Nate stays your Default. Do not collapse them.
- **Current persona (#2, global) ≠ Chat persona (#3, per-chat).** The rail-foot chip sets your *global* Current.
  The *in-chat* picker sets *this chat's* Chat persona. Switching the global chip must **not** silently mutate
  an open chat's Chat persona.
- **Anchor (#4) ≠ Chat persona (#3).** Anchor drives **card** `{{user}}` (frozen); Chat persona drives
  **prompt** `{{user}}` (live). A mid-chat swap changes Chat persona but leaves Anchor alone.
- **Anchor (#4) is orb's invention** (from Nate's `SillyTavern-PersonaPin` extension — see
  `reference/upstream/SillyTavern-PersonaPin`). Base SillyTavern has **no** card-vs-prompt split — one persona
  drives all `{{user}}`. Do not "simplify" orb to match ST; the split is deliberate and load-bearing.
- **Do NOT copy PersonaPin's implementation.** PersonaPin is a SillyTavern *extension*, so it had to hack the
  DOM: back up the character object, string-replace `{{user}}` in it before each generation, and restore it
  after (`reference/upstream/SillyTavern-PersonaPin/src/index.ts:93-175`). That jank exists **only** because
  an extension can't touch prompt assembly. Orb **owns** assembly and resolves card `{{user}}` → Anchor
  cleanly at build time, mutating nothing. Port the *concept*, never the mechanism.

### A.5 What's already built vs. the real gaps

**Already built server-side (~90% — do NOT rebuild, verified in code):**
- The two-context split (A.1) — `assemble.ts` / `context.ts:389-390`.
- Pointers #1/#3/#4 + the message stamp (table in A.0).
- The chat-open seed chain (A.3, `start-chat.ts`).
- `reattributePersona` verb — **already built** (`chat.ts:375`, `edit.ts:638-727`): re-stamps past user
  messages' authorship to a chosen persona. *(The doc `Chat-Macro-Resolution.md:87-89` calls it "to build" —
  that line is STALE; fix it.)*
- All 10 persona tRPC verbs (`transport/trpc/routers/persona.ts`), incl. `setActivePersona(chatId,
  targetUserId, personaId)` (host-or-self gated), `connect/disconnectFromCharacter`, `createFromCharacter`.
- `PersonaDetail` view already joins `avatarHash` — so persona avatars render via `blobUrl` the instant #67
  lands.

**The gaps to build:**
1. **DATA (tiny): add the Current persona field (#2)** — `seeds.currentPersonaId` in `seedsSchema`
   (`contracts/settings/index.ts:332-341`), same lenient `z.string().nullable().catch(null).default(null)`;
   it rides `user_settings.config` + the settings-lift machinery for free. Extend the seed chain (A.3).
2. **VERB (small): a host/manual re-pin for the Anchor (#4).** Today Anchor is set at chat-open and by presets.
   Nate wants to **manually change it mid-chat**, and in a **multi-human group the HOST picks the Anchor and
   can freely change it** (`humanCount > 1` — a roster derivation, never `if(isGroup)`, D16). Confirm whether a
   user-facing `setChatAnchorPersona` verb exists; if not, add one (host-gated, mirroring `setActivePersona`'s
   author-or-host gate).
3. **CLIENT (the bulk): the entire persona UI** — `features/persona/` is an empty `.gitkeep`. Build the
   rail-foot switcher, the Settings→Personas manage pane, and the in-chat persona picker (A.6).

### A.6 The switcher UX — the rail-foot chip (make it FUCK; the mockup had the bones, not the wiring)

Three surfaces, each owning exactly one scope so nothing is ambiguous:

- **Rail-foot chip (`app-shell/components/rail.tsx:70-77`, registry-render via `rail-slots.ts:122` — replace
  the static `CircleUser`/placeholder `account` modal).** This chip owns your **GLOBAL identity**, nothing
  per-chat.
  - **Rest:** your **Current persona (#2)** avatar (real, via `avatarHash`) + name + a quiet "playing as" line.
    If Current (#2) ≠ Default (#1), show a subtle star-off hint so *"you're on Steve, home is Nate"* reads at a
    glance.
  - **Click → compact POPOVER** (not a modal — Discord account-switcher energy): an avatar grid/list of your
    personas; the Current one checked, the Default one star-badged. Click a tile → sets **Current (#2)** (a
    settings patch). **This changes what NEW chats seed as; it does NOT mutate any open chat.** Row secondary
    action = **star** → set that persona as **Default (#1)**. Footer: **"Manage personas"** → the editor (next
    bullet). Only when a chat is open, an **explicit** secondary item *"Use in this chat"* may set the open
    chat's **Chat persona (#3)** — never the default behavior of the click.
- **Settings → USER → Personas** (`settings-nav.ts:70`, currently `built:false`) — the **manage/editor** home
  (per `proposed/ux-flow-revamp.md:341-343`; the rail chip is a *quick card that links here*, not the full
  editor). Port the mockup's `PersonaDialog` master-detail layout (`reference/design/` — list + detail: name,
  description + token count, insertion position + depth → `PersonaMetadata.descriptionPosition`/`inject{depth,
  role}`, a **Default toggle** wired to `defaultPersonaId`, connected lorebooks) — **but WIRE the controls the
  mockup left dead** (it hardcoded `"Aldric"`, wrote only local `useState`, and every handler was a no-op).
  Uses `createSavedEntityForm` + the Phase-1 avatar-upload field.
- **In-chat persona picker** (composer / chat options menu) — sets **this chat's Chat persona (#3)** via
  `setActivePersona`. This is the ONLY control that changes an open chat's live `{{user}}`. Anchor (#4) is
  surfaced here too but mostly **read-only** ("card sees you as: Nate") with an advanced **re-anchor** action
  (the host control in groups). A **"reattribute past messages"** action wires to the built `reattributePersona`
  verb.

### A.6b COMPLETENESS MANDATE — surface EVERY field, option, setting, and action (do not abandon any)

The persona editor is held to the full cold-read bar: **every** field in the persona contract, **every** depth/
insertion option, **every** relevant global persona setting, and **every** persona action from SillyTavern's
persona window (and actual-neo's) must have a clean, deliberate home. A builder that ships name+avatar+description
and drops the rest has built it WRONG. Non-negotiable specifics:
- **All contract fields** (`contracts/persona/index.ts` — `createPersonaSchema`/`updatePersonaSchema`/
  `personaMetadataSchema`): `name`, `title` (display subtitle, never prompt-injected), `description`, `starred`,
  `avatarAssetId`, and the metadata block below. Nothing stored is left uneditable/unshown.
- **The depth / insertion options (the ones most often dropped):** `descriptionPosition`
  (`PERSONA_DESCRIPTION_POSITIONS` from `@orb/kit/persona` — every member gets a labelled Select option) and
  `inject = {depth, role}` (a depth number field + a role Select). These control WHERE and HOW DEEP the persona
  description injects. They are first-class editor controls, not hidden advanced cruft.
- **Global persona settings** (e.g. `seeds.defaultPersonaId`, the new `seeds.currentPersonaId`, plus any
  ST-parity globals worth porting) get a home in Settings→Personas alongside the list.
- **Every persona action** from ST's persona window + actual-neo's (create/duplicate/rename/delete, set-default,
  connect-to-character, reattribute, set/change avatar, import/export, sort/search, …) maps to an orb verb
  (most already exist) and a control in one of the three surfaces (A.6). Actions with no backing verb are flagged
  gaps, not silently skipped.

> **PORT REFERENCE — actual-neo already has a full persona UI.** `reference/neo-tavern/src/client/features/
> persona/` contains a working persona feature: `persona-list-surface.tsx` (search/sort/grid-list/pagination),
> `persona-editor-surface.tsx` (rename/describe/star/avatar/delete/duplicate), `persona-description-placement.tsx`
> (position + depth + role controls), `persona-world-books-section.tsx`, `create-persona-dialog.tsx`,
> `character-convert-to-persona-dialog.tsx`, `character-connected-personas-dialog.tsx`, and hooks
> `use-default-persona.ts` / `use-persona-backup.ts` / `use-persona-reattribute.ts` /
> `persona-usage-stats-dialog.tsx`. **Study neo's persona feature first — it's our predecessor's real
> implementation of most of this.** Port its structure to orb's 4-region shell + primitives; do not re-derive.

#### The exhaustive inventory (Phase-2 must check off EVERY row — ship nothing until each has a home)

**Contract fields** (`contracts/persona/index.ts`) — all editable/shown:

| Field | Control | Home | Backing |
|---|---|---|---|
| `name` (req), `title` (nullable, **never prompt-injected**), `description` (≤100k) | text · text · textarea+token-count | EDITOR | `persona.update` ✓ |
| `starred` | switch | EDITOR + inline list toggle | `persona.update` ✓ |
| `avatarAssetId` | avatar-upload | EDITOR | `persona.update` + Phase-1 upload field |
| `metadata.descriptionPosition` | select (3 members, below) | EDITOR "Prompt injection" | `persona.update` — **assembler UNWIRED (gap #1)** |
| `metadata.inject.depth` / `.role` | number · select (system/user/assistant) | EDITOR (disabled unless `at_depth`) | `persona.update` — **assembler UNWIRED (gap #1)** |
| `metadata.sourceCharacterId` / `swapMacros` | read-only "Provenance" chip (card-minted only) | EDITOR | view-only from `PersonaDetail` |
| `id`/`avatarHash`/`createdAt`/`updatedAt`/`ownerId` | not user-facing | — | derived; never surface `ownerId` |

**The depth options (the ones NOT to drop):**
- `PERSONA_DESCRIPTION_POSITIONS = ["none","in_prompt","at_depth"]` (`kit/persona/index.ts:24`). `in_prompt`
  (default) = preset persona slot; `at_depth` = splice into history at `{depth,role}`; `none` = not injected.
  **NOTE (already-decided reduction, informational):** orb deliberately dropped ST's `TOP_AN`/`BOTTOM_AN`
  (5→3) — AN-anchoring is subsumed by `at_depth` (kit comment `:12-15`). Not a UI omission.
- `inject = {depth, role}` (`kit/injection/index.ts:30-33`): `role` ∈ system/user/assistant (default system);
  `depth` = messages-back from history end (default 2). **WRITE GUARD to mirror in UI:** `role="assistant" +
  depth=0` is rejected (prefill) — disable/warn, don't submit.

**Global persona settings:**
| Setting | Verdict | Home |
|---|---|---|
| `seeds.defaultPersonaId` (✓ exists) | surface it (crown/star) | EDITOR header + SWITCHER |
| `seeds.currentPersonaId` (MUST-ADD #2) | the rail-foot chip's pointer | SWITCHER |
| `persona_show_notifications` (ST) | **port** (generic toggle) — new UserSettings field | EDITOR global footer |
| `persona_sort_order` (ST) | **port** (trivial) — client pref or field | EDITOR list sort |
| `persona_auto_lock` (ST) | **maybe** — needs a per-chat-persist design call | EDITOR global footer |
| `persona_allow_multi_connections` (ST) | **skip** — ST cruft (ambiguous-connection popup); orb junction is unconditional M:N | — |

**The 3 UI surfaces:** **[EDITOR]** Settings→USER→Personas master-detail (`settings-nav.ts:70`, build it) ·
**[SWITCHER]** rail-foot popover (new rail slot) · **[PICKER]** in-chat per-chat picker (`chat-options-menu.tsx:3`
flags it unbuilt).

**Actions (ST∪neo union) → orb verb:** create/remove/update/rename/star (✓ verbs), createFromCharacter (✓,
has swapMacros), connect/disconnect/listConnectedToCharacter (✓), setActivePersona (✓, per-chat #3, `null`
clears), reattribute (✓ `chat.reattributePersona`), usage-stats (✓ `stats.personaUsage`), default (✓ settings
write). Client-only: search/sort/grid-list/pagination.

**THE 6 BUILD GAPS (no backing yet — build them, don't skip):**
1. **Assembler wiring for `descriptionPosition`/`inject`** — HIGHEST IMPACT. The fields are stored+editable but
   `resolvePersonaDescriptionPlacement` (`kit/persona/index.ts:53`) is never called; `AssemblePersona` carries
   only `{name,description}` (`contracts/chat/index.ts:142-145`), and `assembly/context.ts:389-390` ignores
   placement. The depth options are INERT until this is wired. **Must build for the depth options to mean
   anything.**
2. `persona.duplicate` verb (neo has the UX; orb has no verb).
3. `persona.export` / `persona.import` (backup/restore) verbs.
4. Persona↔lorebook link verb (persona-bound world books).
5. Persona description token-count (verb or client estimator).
6. New UserSettings: `persona_show_notifications` (+ optionally `persona_sort_order`, `persona_auto_lock`).

### A.7 Build order
1. **#67** (Phase 1, images) — prerequisite for any persona/character avatar `src`.
2. `seeds.currentPersonaId` field (#2) + seed-chain extension; the `setChatAnchorPersona` verb if missing.
3. `features/persona/` client slice — rail-foot switcher popover + Settings→Personas editor. Reuse
   character-editor patterns; consume the Phase-1 avatar-upload field.
4. In-chat persona picker (Chat persona #3) + read-only Anchor display + re-anchor/reattribute actions.
5. Wire message-row `Avatar` `src` for character AND persona rows (auto-unblocked by #67).
6. (Later/optional) per-persona theme override; the mirrored-right user-message layout (§B.3).

---

## PART B — The Moonlit steal-and-improve list (message row + avatars + immersive modes)

### B.1 Message-row redesign (DECIDED — ST/Discord-standard, verified against real ST + Moonlit)
- **Avatar-LEFT**, a sibling flex item *outside* the bubble (intrinsic width) + a content column (`flex:1`).
  Never nest name/actions inside the avatar column.
- **Name + per-message actions on ONE row** at the top of the content column: `justify-content: space-between`
  — name-group left (name + optional timestamp, `align-items:baseline`), actions right. Reuse for bubble+flat.
- **Avatars-off is trivially clean:** because name+actions live in the content column (not the avatar column),
  hiding the avatar is a one-line `display:none` with ZERO reflow. (This is Nate's work-safe case + the
  existing `showInChatAvatars` pref, which already exists in the appearance schema + settings UI.)
- **Actions: dim-always → brighten-on-hover** (`opacity ~0.4 → 1` on hover/focus), NOT `display:none`-until-hover
  (avoids layout shift, more discoverable) + a **`drop-shadow` on the icons** so they stay legible over glass /
  a background photo. ← this is the fix for "actions invisible over glass."
- **Mirror your own messages right** — we ALREADY do this (`alignFor(role)`: user→`items-end`). With avatar-left,
  the character's avatar sits left of their (left) bubble, YOUR avatar sits right of your (right) bubble.

### B.2 chatStyle skins — expand from bubble/flat/document to include immersive modes (DONE CLEAN)
`chatStyle` is an exhaustive `Record<ChatStyle, RowSkin>` (`chat/lib/message-row-variants.ts`) — adding a mode
= a skin entry + one union member (`tsc`-forced). Immersive + clean modes COEXIST as user picks. For an RP app
pre-launch, immersive presence modes are the vibe, not a nice-to-have.

| Mode (Moonlit) | Concept | Clean orbweaver build | Verdict |
| - | - | - | - |
| **Echo** | character portrait **bled into the bubble edge** as faded background art | avatar URL as an inline CSS var on the bubble at render (we control render — NO MutationObserver needed) + `background-size:cover` + a token-driven `mask-image` edge-feather. Legible via our scrim. | **BUILD** |
| **Ripple** | **VN sticky tall portrait** — `position:sticky;top:0` avatar, 2:3 aspect, stays pinned while a long gen scrolls | `position:sticky` avatar + the portrait aspect variant (§B.4). Add `object-fit:cover` (Moonlit forgets this and *stretches* — we're better). Documented shape-override: VN portrait ignores the global round/square pref. NOT the D49-cut `waifuMode` (that's full-screen expression sprites — different, still out). | **BUILD** |
| **Whisper** | faded avatar **banner** across the top + accent stripe | Echo variant; low priority | adapt later |
| **Hush** | flat + a theme-color accent stripe as the speaker indicator | a "flat but color-coded" option | adapt (minor) |
| **Tide** | per-`<p>` bubble "trains" (iMessage) | real render change; long RP prose stacks messily | **cautious / opt-in only** |

### B.3 Avatar versatility (add these to make ours a real system)
Today: `avatarSize` sm/md/lg + `avatarShape` round/square (appearance prefs). ADD:
- **Shape:** + `rounded` (rounded-rect).
- **Aspect:** + **`portrait` (2:3)** — the presence lever the immersive modes need.
- **Border/ring:** a border on/off + an **accent-ring** painted from the character's theme color (reuse for a
  persona picker / active-speaker highlight; Moonlit's `is_fav`/`selected` accent `drop-shadow`).
- **Per-chatStyle avatar behavior** (sticky / bled / banner / hidden) lives in the SKIN, not a user pref.

### B.4 The sharp image pipeline (the "coordinate with sharp" answer — concrete)
Current: `infra/image` is **width-only** (`resize({width, withoutEnlargement})` over `BLOB_WIDTHS =
[48,64,96,128,240,400]`, `domain/assets/substrate/variant-policy.ts`) — no crop, preserves source aspect.
- **KEEP** the width ladder for round/square icons AND for the Echo bled-portrait (CSS `background-size:cover`
  handles any source aspect for free — zero pipeline burden).
- **ADD a 2:3 portrait smart-cropped variant** for the fixed-box `<img>` modes (Ripple/VN): `sharp().resize({
  width, height, fit:'cover', position:'attention' })` — **smart/entropy crop, NOT center** (avatars are
  face-centric; naive center-crop DECAPITATES). ~400×600. Standardize on **2:3**. Add it as a variant *kind*,
  don't replace the square ladder. This is strictly better than Moonlit (which just stretches / requires users
  to pre-upload 864×1280 portraits). Two-tier delivery: thumb for small icons, original/portrait-variant for
  big portraits.

### B.5 NEW config concepts mined from the Moonlit theme presets (the JSON, not just CSS)
Cross-referenced: most Moonlit knobs already have orbweaver equivalents (metadata chips, prose colors —
dialogue/narration/body, chatWidth, fontScale, hideChatAvatars, expand-actions, reduced-motion, shadows,
per-role bubble tints, tags-as-folders, hot-swap favorites). The **genuine deltas to add**:
1. **Background-image BLUR** (`customCSS-bg-blur`) — SEPARATE from the scrim/`backgroundDim`. Blur the *photo
   itself* for a soft, atmospheric, non-distracting backdrop. Add a `backgroundBlur` appearance axis (blur +
   dim compose). **Steal.**
2. **The "last-in-context" boundary marker** (`customlastInContext`) — a subtle accent line marking the last
   message INSIDE the AI's context window (you can *see* where the model's memory cuts off). Genuinely great
   RP/LLM-native concept. **Steal** — a quiet divider at the context boundary in the thread.
3. **Per-mode avatar sizing** — each immersive mode carries its own avatar geometry (Echo 20%×300px, Whisper
   50%+align, Ripple 180/100px). Our immersive skins each define their avatar dims (tokens/defaults, maybe
   per-mode adjustable).
4. **Granular message typography** — Moonlit exposes per-message `line-height`, `letter-spacing`, paragraph
   spacing (top/bottom), and name/body font sizes (`charNameFontSize`/`messageTextFontSize`/`messageLineHeight`/
   `messageTextLetterSpacing`/`mesParagraphSpacing*`). We only have global `fontScale` — add a **reading-typography**
   set; RP reading comfort is worth it. **Steal.**
5. Minor: `compact_input_area` (denser composer), `zoomed_avatar_magnification` (click-avatar-to-enlarge),
   `enableThemeColorization` (tint the whole UI from the accent), blur-strength as a user knob, and a batch of
   Moonlit **mobile-fine knobs** (inline metadata on mobile, separate mobile blur strength, mobile input spacing) —
   mostly covered by our adaptive shell, but "inline metadata on mobile" is a real consideration. (Full knob
   inventory verified against `reference/upstream/moonlit-echoes/src/config/theme-settings.js` — nothing else new.)

### B.5b Polish worth stealing (portable, token-clean)
- **Chat-list edge fade** via `mask-image` gradient (`#chat { mask-image: linear-gradient(...) }`) — softly
  dissolves the top/bottom of the scroll under the header/composer instead of hard-clipping. Pairs great with
  glass. **Steal.**
- **Composer escalation** — quiet-at-rest → hover → focus progressively prominent. Do it with a **border/ring +
  bg-alpha step, NOT `opacity`** (opacity dims the text/placeholder contrast too). **Adapt.**
- **Hairline avatar border (~1.25px, theme-tinted)** — keeps avatars from dissolving into a blurred/photo
  background (auto-on when a background image is active). **Steal.**
- Data point: Moonlit's "polished" feel is 100% state-transition timing (`transition`), **zero `@keyframes`** —
  consistent with our token/compose philosophy.

### B.6 What NOT to port (Moonlit's blockers — all vanish in our architecture)
- **JS `MutationObserver` injecting `--mes-avatar-url` per DOM node** → we render each row ourselves; put the
  URL in an inline CSS var at render time. Gone.
- **`!important` sprawl** → we own 100% of our CSS, nothing to fight. Gone.
- **Hardcoded px/% magic numbers, per-mode duplicated overrides** → tokens, parameterized once. Gone.
- Plus we get theme-awareness, contrast-safe foregrounds, the scrim/reading-surface, and mobile-adaptivity
  for free — so the same effects render legible over any background, which Moonlit's don't.

---

## PART C — Dependency order (highest leverage first)
1. **#67 — asset-URL resolver + upload** (unblocks ALL images: character avatars, persona avatars, backgrounds).
2. **Sharp 2:3 portrait smart-crop variant** (for VN/portrait avatar modes).
3. **Persona client slice** (rail-foot switcher + editor).
4. Then: the message-row redesign (avatar-left + name/actions row + dim-brighten+drop-shadow actions), the
   immersive chatStyle skins (Echo, Ripple), the avatar versatility prefs, the background-blur axis, the
   context-boundary marker, the polish (edge fade, composer escalation, hairline border).

## PART D — Session state (context for whoever picks this up)
- **DONE + verified live:** background-image → appearance move (D63); the specificity fix (`:where()` on the
  elevation-ramp rules so glass + bg-transparent win — the "nothing renders" bug); glass now works on
  panels/context/composer/bubbles over a background photo; topbar stays opaque chrome; a legibility halo for
  text floating over the photo; the dropdown z-fix (`--z-popover` above `--z-modal`).
- **DONE:** the cascade-contract computed-style test suite — PROVEN to catch the elevation-vs-glass regression
  (hand-reverted the fix → the two flagship tests went red → restored). `pnpm check` green.
- **IN FLIGHT (agent):** updating 3 primitive CT z-index assertions (`select`/`autocomplete`/`combobox`) from
  `40`→`65` (the z-popover rename consequence).
- **Character side captured in:** `FINAL-Character-Library-and-Editor-UX.md` (elevatorPitch/distill blurb,
  dual-purpose chat button, branch-aware Activity tab, cursor gotchas, EXTEND-don't-rebuild the 236-line
  surface).
- **Open threads not yet built:** settings search (#5), Presets→settings IA (#6, needs a ledger amendment),
  the character-editor lane, the immersive/persona work in this doc.
