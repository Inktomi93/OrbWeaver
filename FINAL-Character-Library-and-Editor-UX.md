# FINAL — Character Library, Editor & Detail Panel (the Characters section UX)

```
kind: build-spec (implementable)   status: authoritative for this lane   authored: 2026-07-07
scope: the Characters RAIL section ONLY — its LIST, CONTENT, CONTEXT + the handoff jump into a chat.
       NOT the whole-app UX, NOT the Chats LANDING, NOT the chat room, NOT other rail sections.
```

> **You are a cold, amnesiac agent.** This document is the whole design — every panel, every field, every
> wire. Build exactly what it says. Where it cites a `§`, that section of the core UI docs is LAW and wins
> over your instinct (`docs/architecture/core/UI-Architecture-and-Layout.md` §4/§4.1/§4.2/§4.3/§5.1 ·
> `UI-Theming-and-Content.md` §12 · `UI-Primitives-and-Reuse.md` §13). Read §11 (Pain-points) and §2
> (Commit model) before you write a line — they are the two ways this lane gets built wrong.

---

## 0. Build order (do these in sequence)

1. **Contract fixes first** (§12 BUILD LEDGER → FIX) — the three server/contract additions. Land them
   green before the client, so the client codes against real reads.
2. **The LIST** (§4) — the library. It's the entry point and needs the fewest new parts.
3. **The CONTENT editor** (§6) — hero band + Presence/Craft tabs + save-bar.
4. **The CONTEXT panel** (§7) — Activity / Appearance+Trust / Relations / Actions / History.
5. **Wire the per-character theming** (§8) — the one thing to get exactly right; render side is already built.
6. **Verify against §10 (click economy) and §11 (pain-points).**

---

## 1. The mental model — 4 regions + ONE organizing principle

The shell is fixed (§4.1): **RAIL** (nav) · **LIST** (finds) · **CONTENT** (does — a **single** hero, never
two things at once) · **CONTEXT** (detail + config + actions ON content's artifact; **never navigation**).

**THE ORGANIZING PRINCIPLE — the save-model seam (memorize this; it resolves every "where does X go?"):**

> **Draft-then-Save card CONTENT lives wholly in CONTENT, under ONE save-bar.
> Immediate-commit config lives wholly in CONTEXT (or as a header gesture), and NEVER touches that save-bar.**

Every placement decision below follows from that seam. If a field is authored card content you deliberately
save → CONTENT. If it's a flag/config that applies the instant you flip it → CONTEXT or the hero header.

---

## 2. The commit-model law (THE correctness spine — do NOT get this wrong)

Two commit models. The classification is **not a UX taste call** — it is the server's own, in
`packages/server/src/domain/character/substrate/card-merge.ts`. `flagEdits()` (L47–64) enumerates the
fields the server treats as **identity edits, NOT card content**. Obey it exactly.

| Field(s) | Commit model | Home | Wire |
|---|---|---|---|
| `name`, `description`, `personality`, `scenario`, `greetings[]`, `exampleMessages`, `systemPrompt`, `postHistoryInstructions`, `depthPrompt`, `creatorNotes`, `creator`, `cardVersion`, `regexScripts[]`, `extensions`, `residualData` | **DRAFT → Save** (the card form) | **CONTENT** (Presence/Craft tabs) | `character.update({...changed})`, gated by the save-bar |
| `starred`, `archived`, `forbidExternalMedia`, `trustHtml`, `themeOverride` | **IMMEDIATE** (these are the 5 `flagEdits` identity fields) | header gesture (star/archive) or **CONTEXT** (theme/trust) | `character.update({field})` fired on change, **no save-bar, no dirty pill** |
| `avatarAssetId` | **IMMEDIATE** (UX rule: upload-completes = commit) | hero portrait | `character.update({avatarAssetId})` on upload complete, outside the draft form |
| `tags` (junction) | **IMMEDIATE** (tag-domain CRUD) | hero chip row | tag verbs (attach/detach), not the card form |
| `refinery` (`{score, analysis}`) | **DERIVED — never authored** | Craft tab, read-only meter | not in `create`/`update`; display only |
| `handle` | identity slug (set at create, default `slugify(name)`, rarely edited) | hero, muted secondary line | `character.update({handle})`; identity column, not card content |

**The `update` wire discipline (LOAD-BEARING — `card-merge.ts` `keep()`):** send **only changed keys**.
`undefined`/omitted = "leave unchanged"; **`null` = "clear this field"** (distinct meanings — never send
`undefined` to mean clear). For the always-a-list columns `greetings`/`regexScripts`, `null` clears to `[]`.
The form factory's `!== isDefaultValue` diff already does this; do not hand-roll a full-object PUT.

**Why this matters:** the single most common way this lane is built wrong is routing `themeOverride`/
`trustHtml` through the CONTENT draft save-bar. Then the live theme preview shows the change applied yet
demands a "Save" click, and "reset to global" becomes a staged draft edit. **They are `flagEdits` —
immediate-commit — full stop.**

Contract source of truth: `packages/contracts/src/character/index.ts` (`characterCardSchema` L87–118,
`updateCharacterSchema` L153–164). `CharacterDetail` (the owner read `get`/`update`/`duplicate`/`restore`
return) is in `packages/server/src/domain/character/contract/views.ts` L16–41 — it carries the full card +
`starred/archived/forbidExternalMedia/trustHtml/themeOverride/avatarHash/tags`.

---

## 3. RAIL

The `Characters` icon among the seven end-state sections (§4.1). **No character content lives in RAIL** —
it is facets-of-one-world navigation only. Nothing to build here beyond the existing rail slot.

---

## 4. LIST — the character library (finds)

Built on `createCollectionSurface` (§13.1) over `listCharacters` (returns `CharacterSummary[]`), rendered
with `@orb/ui/list-row`. Top-to-bottom:

**4.1 Header row** — micro-caps "CHARACTERS" title + a **persistent** (not toggle-hidden) compact search
input (a returning user just starts typing — rule 6) + a `+` **split-button: "New" · "Import card"**. The
`+` opens the **create/import picker modal** (legal per rule 5 — two mutually-exclusive entry choices; a
picker, not section content). "New" → a minimal create form (`handle` auto-derived from `name`; `create`
requires `handle` + `name` + `description`). "Import card" → the PNG/JSON dropzone (server import exists).

**4.2 Favorites pinned row** (top, collapsible) — starred characters as a dense avatar strip
(`@orb/ui/avatar-stack`), the analog of Discord's pinned DMs. Purely `characters.filter(c => c.starred)`,
no separate store. **Click = SELECT (open editor) ONLY.** Start-chat is NOT wired to this click — it is a
separate explicit hover-CTA (§4.4). One representation of a character = one meaning (rule 10).

**4.3 View mode — flat ⇄ categorized** (a per-device toggle; `groupBy`, never an `if` on a fold flag):
- **Flat scan (DEFAULT)** — every character as one `ListRow`, sorted by the §4.5 sort. Built for "I know who
  I want."
- **Categorized** — tags become **collapsible category headers** (Discord channel-category chevrons); an
  "Uncategorized" bucket catches untagged. Built for a big unfamiliar library (scales 5→500). Rules:
  (a) a character with 2+ tags appears under each — but **selection is by character id, not row instance**:
  clicking any instance selects the character, all instances highlight, nothing collapses.
  (b) categorized is **opt-in**; flat is default → the common case never pays the repeated-avatar cost.
  (c) the toggle persists **device-local** (a Zustand `persist` UI store — the §12.1-sanctioned home for
  device-local view prefs); id-based selection survives a flat⇄categorized flip untouched.

**4.4 Row anatomy** (one shape both modes):
- **leading** = avatar big enough to read a face (via `avatarHash`, present on the summary today).
- **title** = `name`.
- **subtitle** = a one-line **`descriptionSnippet`** — the "who they are" vibe line (**needs a new summary
  field — §12 FIX #2**; until it lands, fall back to `handle`). The raw metadata (handle · `tokenSize`) is
  the hover/`:focus-within` reveal (progressive disclosure).
- **trailing** = a star chip (immediate toggle) + a small **accent dot** painted with the character's
  `themeOverride.accent` (present on the summary today → **works now**), falling back to the global accent —
  a glance-level "what they feel like."
- **hover / `:focus-within` (rule 4, keyboard parity; always-visible at `pointer:coarse`)** = a quiet
  **"Start chat"** affordance → the 1-click core loop (§9c). Kept OFF the row's main click so selecting
  never cascades (§5.1).

**4.5 Sort + filters** — default sort **most-recently-talked-with** (`lastChattedAt`, **needs a new summary
field — §12 FIX #2**, sourced via stats; until then fall back to A–Z). A sort toggle (Recent / A–Z /
Starred-first) sits in the search row. Filter chips under search: Favorites-only · Archived (opt-in, hidden
by default) · tag multi-select (AND-semantics). Archived rows collapse under a "show archived" disclosure at
the list tail.

**4.6 Bulk mode** — a pencil icon toggles selection mode: row checkboxes + `@orb/ui/selection-bar` at the
bottom for tag / archive / delete-many (verbs `bulkAddCardTag`/`bulkArchive`/`bulkRemove` exist).

---

## 5. CONTENT — nothing selected (the teaching state)

Not a blank card, and **not a gallery that duplicates LIST**. A single quiet teaching hero: one line
("Pick someone from the list, or make someone new") + the create/import tile as the enabled next step
(rule 1 — no dead ends). If the library is genuinely empty, the same component shows just the create/import
tile — data-driven, **no `if(empty)` branch** into a different layout. (Recents/quick-picks browsing is the
Chats LANDING's job, out of scope.)

---

## 6. CONTENT — a character selected (the editor — the singular hero)

ONE continuous editor for ONE character. Always-editing bound form (`createSavedEntityForm`, §13.4 — no
read/edit toggle). Structure: a **pinned hero band** + a **2-tab body (Presence / Craft)**, ALL bound to one
form instance, ALL under one CONTENT save-bar. Tabbed CONTENT is explicitly legal (§4.2 — the Presets row is
a tabbed CONTENT editor; two tabs for a character is the same physics: progressive disclosure within a
single artifact, never two artifacts).

**6.1 Hero band** (pinned above the tabs). The visual centerpiece — a face and a voice, not a form:
- **Portrait** — `avatarAssetId`, click-to-replace. **Immediate-commit** (upload complete = commit), outside
  the draft form. A soft portrait-ring pulse confirms the write (no toast spamming the surface).
- **Name** — inline-editable text. **DRAFT** (it is card content, NOT a `flagEdits` flag — do not build a
  rename modal). `handle` shows muted beside it.
- **Star / Archive** chips — **immediate-commit** identity toggles.
- **Accent swatch** — a read-only preview of the resolved `themeOverride` + a **jump-link** that switches
  CONTEXT to the Appearance tab. (It is a preview + shortcut, NOT a second editing control — that keeps the
  theme editor single-homed in CONTEXT and avoids a two-region form.)
- **Primary CTA "Start chat"** (`intent="primary"` — the one primary action in this region, rule 3).
- **The live-themed greeting bubble** — `greetings[0]` rendered through `@orb/ui/markdown` inside a
  `<ThemeScope theme={draftThemeOverride}>` so it shows in **this character's own** `aiBubble`/
  `dialogueColor`/`narrationColor`. Editing the first message OR the theme updates it live — "a face saying
  their first words." If `greetings.length > 1`, alternates render as **in-bubble pill-tabs**
  ("Opening 1 / 2 / 3…") — NOT a dialog (§11 pain-point 1). Pure composition over built primitives (`avatar`,
  `markdown`, `theme-scope`); no new seal.

**6.2 Tags row** — chip row pinned under the hero (present in both tabs); "manage tags" opens the tag
**picker modal** (legal). Immediate junction writes.

**6.3 Presence tab (default — the immersion-loud card content; DRAFT):**
`description` · `personality` · `scenario` · `exampleMessages` (render collapsed as a formatted
mini-transcript = a read-only Streamdown render of the parsed `<START>`-delimited blocks, with "expand to
edit" swapping to the raw `MacroTextarea` on the same field — **the stored string is never reformatted**;
save round-trips the raw text byte-identical) · `creatorNotes`. Macro-aware textareas with a below-field
mono token counter. This is "who they are."

**6.4 Craft tab (the quiet clerical card content; SAME form, SAME save-bar; DRAFT):**
- **Prompt overrides** — `systemPrompt` · `postHistoryInstructions`.
- **Note @ depth** — `depthPrompt` = `{prompt, depth, role?}` (`@orb/kit/injection` directive): a
  `MacroTextarea` for `.prompt` + a number field for `.depth` + a `Select` for `.role`
  (`system|user|assistant`). `null` when the text is cleared. **Surface the write guard**: `assistant` role
  at `depth 0` is rejected (prefill — `cardDepthPromptWriteSchema`, `character/index.ts` L61) — show that
  validation message, do not silently drop.
- **Regex scripts** — `regexScripts[]`: a `list-row`-per-script + add. (Use direct `form.Field`, not a bound
  macro field — TanStack Form array-field constraint.)
- **Provenance** — `creator` · `cardVersion` (read-mostly; typed columns, editable text).
- **Unrecognized data** — `extensions` · `residualData`: a collapsed read-only JSON viewer (hygiene-only
  round-trip fields).
- **Refinery** — `refinery {score, analysis}`: DERIVED, never authored → a `@orb/ui/meter`/`stat-figure`
  readout, **not a form field**.

**6.5 Save/dirty model** — ONE `createSavedEntityForm` per character (`key={characterId}` full remount on
switch, §13.4/§13.6). `!isDefaultValue` drives the dirty pill. `@orb/ui/save-bar` sticky at the **top** of
CONTENT (visible from either tab so "Save" is never lost): `<Name>` · token count · dirty dot · Discard /
Save. It governs **exactly** the Presence + Craft draft fields. The immediate-commit surfaces (hero
gestures, CONTEXT Appearance/Trust) are outside its scope **by construction** — that is the legibility
guarantee (a user never changes an accent and watches the dirty pill stay dark). The editor's unsaved-draft
guard on a section switch is the **hand-rolled in-app guard** off view-state (`useBlocker` will NOT fire on
a reducer/section change — §6.1 trap).

---

## 7. CONTEXT — the relationship ledger + config + actions

Closable tabs; **never navigation**. **Nothing here is governed by CONTENT's save-bar** — every control is
immediate-commit or a picker.

- **Activity (default)** — "your history with them": the chats you've had with this character (each row →
  `selectChat(chatId)` + `setActiveSection("chats")`), plus last-played time / chat count. A pinned **"Start
  new chat"** primary at the top → `startNewChat({characterIds:[id]})` + `setActiveSection("chats")`.
  **Needs the chats-by-character read — §12 FIX #1.** Until it lands, the tab degrades to just the "Start new
  chat" button (never a dead end).
- **Appearance** — the per-character **theme control** (full wiring in §8) + a **Trust** section below it:
  `forbidExternalMedia` (tri-state select: inherit/forbid/allow) + `trustHtml` (tri-state:
  inherit/trusted/untrusted, §12.0). **Both immediate-commit** (`flagEdits`). The Trust control fills a
  **known-acute hole** — the render-trust resolver already consumes `override ?? global` but no surface set
  the override before this. The tri-states are already in `updateCharacterSchema` — UI-only, no contract work.
- **Relations** — Linked World Books (`worldInfo.attachToCharacter`/`detachFromCharacter`/`listForCharacter`
  — built) + Connected Personas (`persona.connectToCharacter`/`disconnectFromCharacter`/
  `listConnectedToCharacter` — built), each an inline summary list + a **picker modal** (legal). Immediate,
  never save-bar-gated.
- **Actions** (a persistent options menu above the tabs; secondary chrome, rule 4): Duplicate (→ AlertDialog
  confirm) · **Export card** (an `<a href>` to `GET /api/export/character/:characterId` — **shipped, no
  build**) · Convert to persona (`persona.createFromCharacter` — built) · Set as welcome greeter
  (`settings.welcomeAssistantCharacterId` — built marker) · Delete (→ AlertDialog confirm — a legal
  INTERRUPT, never a plain Dialog, §13.8 R4).
- **History** — the `character_snapshots` log (`listSnapshots`/`snapshot`/`restore` — all built): a
  reverse-chron `{label, createdAt}` list + a "Snapshot now" button + per-row "Restore" (confirm; restore
  auto-snapshots current state first, so it's reversible). **Ship label/timestamp + restore only** unless you
  also land the optional diff-read (§12 FIX #3) — a deliberate build-time choice, "no backend change implied."

---

## 8. Per-character theming — the FULL wiring (get this exactly right)

The render side is **already built**. The only net-new work is the **control UI** + a **live preview
composition**. No new primitive, no new contract field — `themeOverride` is already on the wire
(`updateCharacterSchema` L163), in both read views, and validated.

### 8.1 The control (author side) — CONTEXT → Appearance tab

Render one control per `ThemeOverride` field (schema: `packages/contracts/src/theme/override.ts` L80–106),
**reusing the same control cluster the global theme editor uses (WS2)**, bound to `character.themeOverride`
instead of a `themes` row:

| Field | Control | Notes |
|---|---|---|
| `accent` | `color-field` | |
| `userBubble{bg,fg}`, `aiBubble{bg,fg}`, `systemBubble{bg,fg}` | 2 `color-field`s each | |
| `speaker`, `dialogueColor`, `narrationColor`, `bodyColor` | `color-field` | the RP prose semantics |
| `font` | `select` | options = `THEME_FONT_ALLOWLIST` |
| `radius` | `select` | options = `THEME_RADII` (`base`/`control`/`card`/`full`) |
| `background` | `color-field` | the base surface color the neutral ramp derives from |
| `backgroundImage` | seeded/external picker | **seeded + external only** — the `asset` arm is UI-unreachable today (#67); do NOT surface it |
| `backgroundFit` | `select` | `cover` (default) / `contain` |
| `backgroundDim` | `slider` 0–1 | the mandatory scrim; client default ~0.45 when an image is set |
| `borderColor` | `color-field` | when set it wins; unset → derived from `background` |
| `chatStyle` | `select` | `bubble`/`flat`/`document` |
| `density` | `select` | `comfortable`/`compact` |

**Commit model: IMMEDIATE.** `themeOverride` is a `flagEdits` identity field. A control change fires
`character.update({ themeOverride: <mergedOverride> })` via `createEntityMutation` (optimistic). **No draft
form, no Save button, no dirty pill.** Debounce color-drags so you don't storm writes. Mechanically this is
an immediate/autosave surface over the single `themeOverride` blob — it must NOT be wired into the CONTENT
card save-bar.

**Clearing:** "Reset to global" → send `themeOverride: null` (clears → inherit the user's global selected
theme). Per-field clear: empty that control → the merged override omits the field → that one token inherits
the parent scope. (Per-field failures already degrade to `undefined` via the schema's `.catch` — never a
whole-blob reject.)

**Live preview:** a `<ThemeScope theme={currentOverride}>` wrapping a sample message pair (an ai bubble + a
narration line) rendered in the tab. It updates instantly and truthfully **because the value IS applied**
(immediate-commit) — the preview never lies about what's committed.

### 8.2 Resolution model (§12.1) — pure CSS cascade, NO merge logic

Resolution is **character > global > default**, and it is **not a server/data concern**. The override is
carried **RAW and unmerged** on the wire (`CharacterDetail.themeOverride` / `CharacterSummary.themeOverride`).
Merging happens purely by **`<ThemeScope>` nesting**:

- The ui-local `<ThemeScope>` clamp (`packages/ui/src/content/theme-scope/clamp.ts`) emits **only the fields
  that are present** as scoped CSS custom properties. Any unset field is simply not emitted → it **inherits
  from the parent scope**.
- So nesting a character's `<ThemeScope>` **inside** the user's global `<ThemeScope>` yields
  character > global > default automatically — **do not write merge code.**
- `background` = the base surface COLOR the neutral ramp derives from (`oklch(from background …)`).
  `backgroundImage`/`backgroundFit`/`backgroundDim` are a **separate** decorative layer + mandatory scrim —
  never conflated with the surface color. `borderColor` when set wins, else derives.

### 8.3 The render path (ALREADY BUILT — consume, do not rebuild)

- **1:1 room:** wrap that character's message bubbles/prose in
  `<ThemeScope theme={resolve(characterId)}>` → their `aiBubble`/`dialogueColor`/`narrationColor` apply.
- **Merged-narrator group room:** the stored body carries inline `<speaker>NAME</speaker>` markers
  (`@orb/kit/speaker-label`); the client narrator render splits on them and wraps **each span in its own**
  `<ThemeScope theme={resolve(thatSpeaker)}>` → per-speaker dialogue/narration colors within one bubble
  (§12.4). This is built (kit + assembly side) — feed it the resolved per-character override; don't
  re-invent the split.
- **The chrome takeover** (a sole-character chat recoloring the room chrome) and **the viewer's own global
  theme** are separate theme-engine concerns (already built). **The character editor's only job is to WRITE
  the override** (the §8.1 control); the chat render CONSUMES it. The editor is NOT responsible for chrome.

### 8.4 What's built vs net-new (so you don't rebuild)

- **BUILT:** `<ThemeScope>` + clamp · the write path (`character.update({themeOverride})` with the lenient
  per-field parse/validator) · the render consumers (message wrapping + per-speaker split) · the WS2 global
  theme-editor control cluster you're reusing.
- **NET-NEW (this lane):** only the Appearance-tab control UI (compose the WS2 cluster bound to
  `character.themeOverride`) + the live-preview composition (`<ThemeScope theme={values}>` around a sample
  bubble). **No new primitive. No new contract field.**

---

## 9. Interaction flows

- **(a) Select a character.** LIST row click → **one** store write (the shell per-section selection store
  records the id). CONTENT renders that character's editor; CONTEXT resets to its Activity tab. **Nothing
  else reacts** — no chat jump, no panel chasing (§5.1). This is the anti-cascade rule; a chat open in
  another `<Activity>` slot is untouched.
- **(b) Edit + save.** Presence/Craft fields write the one form → save-bar dirty pill → Save fires
  `character.update` with only changed keys (`null` = clear) → `reset(saved)` clears the pill. Identity
  fields (avatar/star/archive/theme/trust) never touch this pill.
- **(c) "Chat with them."** Hero "Start chat" CTA (or the LIST row hover CTA) →
  `startNewChat({characterIds:[id]})` + `setActiveSection("chats")` — the ONE sanctioned cross-section path
  (§4.2 rule 4), seeded with the character's first message as the opening turn. Optional immersion polish: a
  hand-rolled `document.startViewTransition()` morphing the hero portrait → chat-header avatar
  (`characterId`-derived, `useId`-safe `view-transition-name`; `prefers-reduced-motion` → plain cut).
- **(d) Group-chat roster (D16-clean).** This is the **Chats** section's CONTEXT (its Roster tab), rendered
  only when `participants.length > 1` — a **size check, never `if(isGroup)`, never a `participantCount`
  field** (it's `ChatDetail.participants.length`). Rows = portrait + name + the existing
  mute/talkativeness/kick chat-domain verbs. Each row's "View character" performs the SAME cross-section
  jump as (c) in reverse (`setActiveSection("characters")` + select) — one mechanism, not a nested in-panel
  editor drill-down.
- **(e) Theme edit → render.** §8.1 control → `character.update({themeOverride})` immediate → every consumer
  re-resolves on next render (hero greeting preview, Appearance preview, the character's message bubbles in
  any open chat, and per-speaker spans in merged-narrator mode) — no "apply" step.

---

## 10. Click-economy targets (verify the build against these)

Counts are clicks OR keystrokes; ⌘K = the command palette (rule 6), always available.

| Journey | Target | How |
|---|---|---|
| Cold → reach a character | 1 click | Characters rail icon; or ⌘K → name → Enter |
| **Pick → start a chat (core loop)** | **1 click** | LIST row hover "Start chat" CTA, or ⌘K "Start chat with X"; from an open editor, the hero CTA |
| Pick → edit | 1 click | selecting a row IS opening the editor (no "edit" mode) |
| Edit → tweak theme → SEE it | ~2 gestures | CONTEXT Appearance tab (1) → adjust a control (1); WYSIWYG, no Save, no preview trip |
| Chat ⇄ edit ⇄ back | 1 click each way | per-section selection is remembered (§4.2 physics 2); `<Activity>` keeps both panes mounted → zero state loss |

If any core loop exceeds ~2 gestures, the build is wrong — restructure.

---

## 11. Pain-points to AVOID (explicit anti-patterns — each is a way this lane gets built wrong)

1. **NO section content in a modal** (rule 5). Advanced/prompt fields are CONTENT tabs; alternate greetings
   are in-bubble pill-tabs. The ONLY modals are **pickers** (create/import chooser, tags, world-books,
   personas) and **destructive confirms** (delete/duplicate → `AlertDialog`). Never an "Advanced Definitions"
   dialog.
2. **NO selection → side-effect cascade** (§5.1). Selecting a character writes one id and renders its editor.
   It must NOT also start a chat, prefetch-and-chase, or make another panel react. No `this_chid`-chasing.
3. **NO `if(isGroup)`** (D16). Group cases derive from `participants.length > 1`. Never branch on a flag.
4. **Do NOT draft-gate identity fields.** `starred`/`archived`/`forbidExternalMedia`/`trustHtml`/
   `themeOverride` (+ avatar) commit **immediately**, outside the card form, never under the save-bar. (The
   #1 mistake — see §2.)
5. **Do NOT put card content in CONTEXT.** `systemPrompt`/`personality`/`regexScripts`/etc. are
   `characterCardSchema` content → CONTENT (Presence/Craft). CONTEXT holds only immediate config, relations,
   activity, actions.
6. **NO two-region form.** The draft `createSavedEntityForm` + save-bar are wholly in CONTENT. CONTEXT config
   is immediate-commit and never shares that form's dirty state.
7. **Favorites strip click = SELECT only.** Start-chat is a separate hover-CTA. One representation = one
   meaning (rule 10).
8. **Respect the `update` wire:** send only changed keys; `null` = clear, omitted = unchanged;
   `greetings`/`regexScripts` `null` clears to `[]`.
9. **`EditorMaximize`** (if you add a field zoom) is a **transient focus overlay** of a field you're already
   editing — NOT a content home; the inline CONTENT textarea stays canonical.
10. **PNG export is SHIPPED** — do not build an export route; link the href.
11. **No centered spinners, no layout shift** (rule 7): optimistic writes, shape-matched skeletons, streaming
    text as the arrival motion. Every surface ships empty/loading/error as designed states (`QueryBoundary`).

---

## 12. BUILD LEDGER — CREATE, FIX, and DO-NOT-REBUILD

### FIX (contract/server gaps identified — with context)

1. **Chats-by-character read** (blocks CONTEXT Activity). Today `ListChatsParams`
   (`packages/server/src/domain/chat/contract/params.ts`) has ONLY `includeArchived` — no character filter —
   and `ChatSummary` (`.../chat/contract/views.ts` L39–53) exposes `participantNames` (**strings, not ids**),
   so "which chats include character X" can't be answered reliably (name collisions/renames). **Fix (pick
   one):** (a) add `participantCharacterIds: readonly CharacterId[]` to `ChatSummary` (client filters; also
   reusable) — **recommended**; or (b) add `characterId?: CharacterId` to `ListChatsParams` + a
   `chat_participants`-indexed query. Net-new either way. Degrade: Activity shows just "Start new chat" until
   it lands.
2. **`CharacterSummary` denorms** (the LIST vibe subtitle + recency sort). Today `CharacterSummary`
   (`.../character/contract/views.ts` L44–61) has `id/handle/name/starred/archived/forbidExternalMedia/
   trustHtml/themeOverride/avatarHash/tags/tokenSize` — but **no free-text and no chat-activity**. **Fix:**
   add `descriptionSnippet: string | null` (server-truncated at read, in the summary projection) +
   `lastChattedAt: number | null`. Source `lastChattedAt` through the **stats seam** (PD-40/PD-22,
   `character_stats`), NOT an N-per-row chat scan. Degrade: subtitle → `handle`, sort → A–Z. (Note:
   `themeOverride` + `avatarHash` + `tags` are ALREADY on the summary → the accent dot, avatar, and tag
   filter all work today.)
3. **(Optional) Snapshot content read** for a diff-before-restore. Today `listSnapshots` returns
   `{id,label,createdAt}`; the blob is read only inside `restore` (blind restore, reversible via its own
   auto-snapshot). If you want compare-before-restore, add a `getSnapshot(snapshotId)` read verb. Otherwise
   ship History as label/timestamp + restore-with-confirm. Deliberate build-time choice.

### CREATE (client feature slice — `packages/client/src/features/character/`, per §2.1 shape)

Some stubs already exist (`character-library-surface`, `character-detail-surface`, `character-detail-card`,
`character-card`, `character-library-welcome`, `filter-characters`, `initials`, `character-library-anchor`) —
reconcile them to this spec; the spec wins.

- `surfaces/character-library-surface.tsx` — the LIST (§4): `createCollectionSurface` over `listCharacters`;
  header + favorites strip + flat/categorized + rows + filters + bulk.
- `surfaces/character-editor-surface.tsx` — CONTENT selected (§6): hero band + Presence/Craft tabs +
  save-bar; one `createSavedEntityForm` over the card fields.
- `surfaces/character-empty-surface.tsx` — CONTENT teaching state (§5).
- `components/character-list-row.tsx` — the §4.4 row.
- `components/character-hero-band.tsx` — §6.1 portrait/name/star/archive/accent-swatch/Start-chat/greeting
  preview.
- `components/character-appearance-tab.tsx` — **§8.1** theme control + Trust (the per-character theming
  control).
- `components/character-activity-tab.tsx` · `character-relations-tab.tsx` · `character-actions-menu.tsx` ·
  `character-history-tab.tsx` — the §7 CONTEXT tabs.
- `hooks/use-character-form.ts` — the `createSavedEntityForm` wiring (card draft fields only).
- `hooks/use-character-theme-override.ts` — the immediate-commit `themeOverride` mutation (§8.1).
- `lib/` — filter/sort/group helpers (group-by-tag for categorized, sort-by-recency).
- `anchors/` — containment providers (`container-type` wrappers per §4).
- Wire the section into the shell via the store seam (§5.1): a leaf writes `selectCharacter(id)` /
  `startNewChat(...)`; the ROUTE (`home-page.tsx`) is the single reactive reader that renders these into the
  `AppShell` LIST/CONTENT/CONTEXT slots. **No feature→feature imports.**

### DO NOT REBUILD (already built/shipped — verified)

PNG export (`entry/http/export.ts` → `GET /api/export/character/:characterId`) · per-character theme render +
write (`<ThemeScope>` + clamp + the `themeOverride` write path) · snapshot verbs
(`snapshot`/`listSnapshots`/`restore`) · all pickers/actions (`persona.createFromCharacter`,
`persona.connectToCharacter`/`disconnect`/`listConnected`, `worldInfo.attachToCharacter`/`detach`/
`listForCharacter`, `settings.welcomeAssistantCharacterId`) · trust tri-states (already in
`updateCharacterSchema`) · character CRUD (`create`/`get`/`list`/`update`/`remove`/`duplicate`/`bulk*`/
`getCard`) · every `@orb/ui` primitive (`list-row`, `save-bar`, `selection-bar`, `command`, `color-field`,
`select`, `switch`, `slider`, `avatar`/`avatar-stack`, `markdown`, `theme-scope`, `meter`/`stat-figure`) ·
the data/forms factories (`createSavedEntityForm`, `createAutosaveEntityForm`, `createCollectionSurface`,
`createEntityMutation`, `useGatedQuery`, `QueryBoundary`). **`proposedTags`, a `v3`/version counter, and
per-character CSS are deliberate drops — do not add them** (proposed = a tag STATUS; history = snapshots;
per-character CSS = the structured `themeOverride`).

---

## 13. Visual & aesthetic direction (so it's actually appealing)

- **Chrome quiet, content loud** (rule 9). Micro-caps muted section labels; **mono** for data accents
  (counts, timestamps, `tokenSize`, kbd); the accent color on **≤10%** of any viewport. If the loudest thing
  on screen is chrome, the hierarchy is inverted.
- **The character is the hero.** CONTENT leads with the portrait + the greeting rendered in the character's
  **own resolved theme colors** (the live-themed greeting bubble, §6.1) — give it real size and breathing
  room. A screenshot of this section should be a face and a voice, not form labels.
- **LIST rows read as people:** a face-sized avatar, a name, a one-line vibe subtitle, a small accent dot —
  glance-level identity before you click.
- **Progressive disclosure** (rule 4): rest state shows the reading surface; management chrome (row actions,
  field toolbars) appears on hover AND `:focus-within` (keyboard parity), always-visible at `pointer:coarse`.
- **Motion = meaning:** optimistic writes, shape-matched skeletons, streaming text as the arrival motion;
  **no centered spinners, no layout shift** on data arrival. The portrait→chat-avatar View Transition (§9c)
  makes "start chat" feel like walking into the room. Respect `prefers-reduced-motion` everywhere.
- **Empty / loading / error are designed states** on every surface (`QueryBoundary` battery), never a bare
  spinner. Voice: sentence-case labels; micro-caps section labels; the Weave glyph at most once per screen.
- **Baseline:** WCAG 2.2 AA — 4.5:1 body contrast, visible focus, keyboard-operable, persistent labels (much
  is free from Base UI). The per-character theme's contrast-safe foreground derivation already guards against
  an illegible override.

---

## 14. Future-proofing seams (per-character only — one-entry adds, never a re-org)

Two seams absorb any genuinely per-character expansion:
- **The CONTENT tab strip (Presence / Craft)** — a new per-character **authoring** concern = one new tab
  (e.g. **expressions** — per-character emotion→sprite sets, `proposed/expressions.md`: a new "Expression"
  CONTENT tab for authoring the sprite map; the runtime sprite render is a chat-room concern, not the editor).
- **The CONTEXT tab list (Activity / Appearance / Relations / History)** — a new per-character **config /
  relationship** = one new tab (e.g. a per-character **databank** knowledge slice, if it ever gains one, →
  a Relations-style entry; **agent-principal** promotion → a Relations/Actions toggle, it's a capability
  flip).
- **Rail-level, NOT character-editor concerns:** gallery, automation, tool-use, corpus/discovery — each is
  its own rail section. Do not build them into the character editor.
```
```
```
```
```
Test: authored content the user writes → a CONTENT tab. Config/relation/derived-data ABOUT the character →
a CONTEXT tab. An identity capability flip → the Actions menu. A new concern is a one-line list add, never a
restructure — the doors are already in the right walls.
```
