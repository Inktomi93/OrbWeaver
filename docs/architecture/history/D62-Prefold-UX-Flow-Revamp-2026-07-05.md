---
kind: history
status: superseded
updated: 2026-07-05
---

> **PRE-FOLD SNAPSHOT (D62).** This is the journeys + region map + parity map + lanes doc exactly as authored on 2026-07-05, BEFORE the
> D62 fold moved its law content into the core `UI-*.md` docs and re-headed the live copy. Kept for
> reference only — the LIVE program doc is `proposed/ux-flow-revamp.md`; the law is in core. Do not build from
> this file.

# UX / Layout / Flow Revamp — the exhaustive pass

**Audit date:** 2026-07-05 (main @ f133379). **Status:** proposed work program. Companion docs:
[`ui-polish-punchlist.md`](ui-polish-punchlist.md) (pixel/spacing/chrome fixes — this doc does NOT
repeat them) and [`design-enforcement.md`](design-enforcement.md) (how to lock all of it in). The
D-ledger and the `UI-*.md` core law win on any conflict; §0.2 lists the law lines this doc leans on.

## 0. Cold-read contract

### 0.1 What this doc is

Three things, in build order: (A) the **flow redesign** — every user journey, its current broken
shape, its target shape, and the exact steps/files/store-actions to get there; (B) the **NeoTavern
parity map** — every capability the predecessor product has that Orbweaver's client lacks, with its
decided layout home; (C) the **primitive/composition corrections** — where `@orb/ui` needs variant
work and where features composed the wrong primitive. If you are an agent picking up ONE lane, read
§0 fully, then only your lane's sections.

### 0.2 Law you must not violate while doing this work

These are already decided; do not re-open, do not "improve":

| Law | Where it's written | What it means for this doc |
| - | - | - |
| Four-region shell: `RAIL \| LIST \| CONTENT \| CONTEXT`; panels dock/overlay/collapse | `docs/architecture/core/UI-Architecture-and-Layout.md` §4.1 | Every surface lives in one of these regions or a modal. No new region kinds. |
| Mobile navigation — §4.1 recorded a TOP tab bar; ruling **P3** (2026-07-05, under Nate's delegation) re-decides it: **BOTTOM tab bar** | UI-Arch §4.1 `MOBILE:` block + `design-enforcement.md` §2 P3 | Mobile lanes build the bottom bar (J12); the §4.1 line gets its D-ledger amendment when that lane lands. |
| **Themes are color palettes ONLY — no structural modes** (Loom/Pocket as layouts are CUT) | UI-Arch §4.1 design-seed callout | The mockup is a VISUAL grammar reference (spacing/chrome/metrics/copy voice), never a structural spec. |
| CONTENT = header bar (active entity · scene chip · thread actions) + thread (prose 65–75ch cap) + pill composer with STOP | UI-Arch §4.1 `CONTENT` line | The chat target shape below is the law's own words — this revamp is *compliance*, not invention. |
| Single-route shell; leaf components WRITE store actions, the route is the one reactive reader | UI-Arch §5.1 | Every flow below is wired through `packages/client/src/state/` actions; never feature→feature imports. |
| `@media` only in app-shell; features use `@container`; density/touch are token-layer axes | UI-Arch §4b | Mobile/desktop flow differences land in `app-shell/surfaces/shell.css` only. |
| ST feature dispositions are CLOSED — every "should we add X" already has a row | `docs/architecture/core/Core-ST-Feature-Gap-Register.md` (D49) | §3's parity matrix maps NT *surfaces* to homes; it does not re-litigate whether a feature is wanted. |
| Welcome/landing screen is a COMMITTED client feature (`{kind:landing}`) | `docs/architecture/core/Core-BUILD-PLAN.md` Phase 6 item 3 | J1/J2 below are sanctioned work, not scope creep. |
| Compose-only: features assemble `@orb/ui` + layout kit; tokens only; variants in `@orb/ui` via tv() | UI-Gates §8 | Every visual change lands as a primitive variant or a token, never inline styling in a feature. |

### 0.3 Reference corpus (read the one you need, not all)

- Predecessor app (completeness reference): `reference/neo-tavern/src/client/` — file headers are
  dense spec prose; the header usually tells you the whole UX contract of a surface.
- Design mockup (visual grammar): `reference/design/neo-tavern/` (see punchlist §0 for how to run).
- Current client: `packages/client/src/` (features/app-shell · chat · character · settings; state/).
- Primitive fleet: `packages/ui/src/primitives/` — **57 primitives exist**; most "missing UI" below
  is a composition gap, not a primitive gap.
- Verify loop: `pnpm snap` (punchlist §0 has the idioms) + `tests/e2e/` (Playwright, webServer boots
  the stack per `playwright.config.ts`).

### 0.4 The one-paragraph diagnosis

The shell architecture is right and the primitive fleet is deep, but the app currently ships the
**skeleton of the architecture with none of its intended flesh**: the law's own CONTENT spec (entity
header, prose cap, pill composer) is unimplemented; the committed landing surface doesn't exist so
the app opens on a dead empty room; the primary CTA ("New chat") leads to a characterless draft
dead-end; three of five rail sections and three of four modals are identical placeholders; and the
features that ARE built composed generic primitives (`Card`, raw text) where purpose-built ones
exist (`ListRow`, `SettingRow`, `Command`, `AvatarStack`, `SelectionBar`). The revamp is therefore
mostly *wiring what exists to the shape already specified* — very little new invention is required.

---

## 1. Modern-UX doctrine — the ten rules this revamp applies

Stated as testable rules (enforcement mapping in `design-enforcement.md` §3). When a journey spec
below conflicts with your instinct, these rules win:

1. **No dead ends.** Every reachable state renders a next-step affordance. An empty list teaches
   how to fill it; an error offers retry; a draft offers a character. Test: walk every state in §2;
   each must contain ≥1 enabled action.
2. **Character-first entry.** The product's atom is a conversation *with someone*. Every "new chat"
   affordance leads through choosing (or confirming) a character, never into a characterless void.
3. **One primary action per view.** Exactly one `intent="primary"` control visible per region at
   rest (the composer's Send counts for CONTENT). Everything else is secondary/ghost.
4. **Progressive disclosure.** Rest state shows the reading surface; management chrome
   (per-message actions, roster tools, config) appears on hover/focus-within or lives one
   deliberate click away (context panel tab, options menu). Never five always-on buttons per item.
5. **The list is for finding; the content is for doing.** LIST panels always compose:
   header row (title + create affordance) → search/filter → rows. Rows are `ListRow` (leading
   avatar/icon · title · subtitle · trailing meta/actions).
6. **Keyboard is a first-class path.** ⌘K reaches every section, every recent chat, every create
   action. Esc closes the top-most layer. Focus is visible everywhere and lands correctly on open
   (dialog → first field; palette → search input).
7. **Perceived performance over raw speed.** Optimistic send, shape-matched skeletons, streaming
   text as the arrival animation. Never a centered spinner; never a layout shift on data arrival.
8. **Empty, loading, error are designed states**, not fallbacks — each surface ships all three
   (the `QueryBoundary` battery already forces the slots to exist; this revamp makes them worth
   looking at).
9. **Chrome is quiet; content is loud.** Section labels are micro-caps muted; data accents are
   mono; the accent color appears in ≤10% of any viewport (DESIGN.md's ration). If a screenshot's
   loudest element is chrome (today: the New-chat slab), the hierarchy is inverted.
10. **Same action, same home, everywhere.** An action reachable from two places routes through the
    same store action / verb (already law §5.1); its label + icon are identical in both (icon map
    lives in the registry, e.g. `rail-slots.ts`).

---

## 2. The journeys — current → target → steps

Each journey: **\[state now] → \[target] → \[steps] → \[verify]**. Steps name exact files. Store
actions cited from `packages/client/src/state/` (`setActiveSection` · `startNewChat(seed?)` ·
`selectChat` · `commitDraft` · `openModal`/`closeModal` · `togglePanel` · `toggleFocus` are all
built). Order within §2 = recommended build order; J1–J4 are the flow-critical spine.

### J1 · App open → landing (the committed `{kind:landing}` surface)

**Now:** opens on Chats section with an empty `ChatRoomSurface` draft: "No messages yet." + a
composer that sends to nobody. Worst possible first impression; also the state every returning
user sees before clicking a row.

**Target:** opening the app lands on the **landing surface** in CONTENT (Chats section active):
a welcome block (Weave glyph · "Pick up a thread" · one-line product voice) above **Recent chats**
(up to \~8 `ListRow`s from `chat.listChats`, newest-first — avatar, title, participants, relative
time) and a **Start a chat** row of character quick-picks (first \~6 characters + "All characters →"
routing to the Characters section). Selecting anything runs `selectChat`/`startNewChat` — the
landing is pure read + write-intent, per §5.1. NT precedent:
`reference/neo-tavern/src/client/features/chat/surfaces/home-landing-surface.tsx` (center pane is a
discriminated `landing | chat`) and `.../components/welcome-assistant-hero.tsx`.

**Steps:**

1. Extend `packages/client/src/state/active-chat-store.ts`: the initial `ChatHandle` state becomes
   a third discriminant `{kind:"landing"}` (ruling P4 — the NT-proven shape; it keeps
   `ChatRoomSurface` unmounted at rest).
   `startNewChat`/`selectChat` already transition out of it. Add `goToLanding()` for the topbar
   brand/home affordance and the "Close chat" action (J6).
2. New `packages/client/src/features/chat/surfaces/chat-landing-surface.tsx`: composes
   `EmptyState`-style hero (post §4.3 upgrade) + `ListRow` recents (reads `chat.listChats` via
   `QueryBoundary`) + character quick-picks (reads `character.list` first page). Writers only.
3. `packages/client/src/routes/home-page.tsx`: render `ChatLandingSurface` as `chats.content` when
   the handle is `landing`, else `ChatRoomSurface` (the route is already the single reader).
4. Empty-DB variant (rule 1): no chats + no characters → the hero grows a primary "Create your
   first character" action (→ `setActiveSection("characters")`); with zero personas it ALSO shows
   an inline "what should characters call you?" name field (the first-run persona ask — decided
   fold, §3 personas row; writes through the persona domain when that lane exists, else defer the
   field with the row's teaching copy).

**Verify:** `pnpm snap / --wide --out j1-landing` shows hero + recents; clicking a recent row
(`--click` on its testid) shows the chat. E2E: extend `tests/e2e/start-chat-with-character.spec.ts`
pattern with a landing → recent-chat → thread assertion.

### J2 · Start a new chat (kill the characterless dead-end)

**Now:** "New chat" (giant slab) → `startNewChat()` → empty draft room; the composer would start a
solo chat with no character. The Characters section separately supports card → start chat.

**Target:** every "new chat" affordance opens the **character picker** first. Reuse the ⌘K palette
surface (J4) opened in "characters mode", or NT's dedicated dialog
(`reference/neo-tavern/src/client/features/chat/anchors/new-chat-dialog.tsx` +
`surfaces/new-chat-surface.tsx`: search + rows + Enter-to-start). Picking a character calls
`startNewChat({characterIds: [id]})` → draft room whose header/hero shows the chosen character
(greeting flow arrives with the server's greeting support; until then the composer placeholder
names them, punchlist UIP-306). The characterless draft remains reachable ONLY as an explicit "Blank chat"
row at the bottom of the picker (assistant-style chats are legitimate; they just can't be the
default trapdoor).

**Steps:**

1. `DraftSeed` is HOMED in `packages/client/src/state/active-chat-store.ts` (use-send-message.ts
   only re-exports it) and its field is ALREADY plural — `characterIds?: readonly CharacterId[]`;
   `character-library-surface.tsx` already calls `startNewChat({ characterIds: [id] })`. Reuse
   exactly that shape; nothing to widen.
2. New anchor `packages/client/src/features/chat/anchors/new-chat-picker.tsx`: a `Dialog` composing
   `@orb/ui` `Command` (`packages/ui/src/primitives/command/`) with `character.list` rows (avatar +
   name + tagline) + trailing "Blank chat" item. On select: `startNewChat({characterIds: [id]})`,
   `closeModal()`.
3. Register the `newChat` modal id — three touches, in this order:
   (a) add `"newChat"` to `MODAL_SLOT_IDS` in `packages/client/src/state/shell-store.ts` (the
   union's ONE home — `tsc` then forces the rest);
   (b) add the body entry in `packages/client/src/features/app-shell/lib/modal-slots.tsx` (the
   `Record<ModalSlotId, …>` type errors until you do);
   (c) the trigger is NOT a rail slot — do NOT append to `RAIL_ACTIONS` (that paints a spurious
   rail-footer button). Export a standalone `NEW_CHAT_ACTION` constant in `rail-slots.ts` (the
   `COMMAND_ACTION` precedent) and add it to the pairing test's reachable-trigger set
   (`tests/client/features/app-shell/lib/rail-slots.test.ts` — its "no orphan modal" assertion
   fails otherwise). Chat-list "+" (UIP-302), landing overflow, and ⌘K all call
   `openModal("newChat")` directly. Chat-list "+" (punchlist
   UIP-302), the landing quick-pick overflow, and ⌘K "New chat" all `openModal("newChat")`.
4. Draft room header (J3 step 2) renders the seeded character's identity so the draft no longer
   looks like a void.

**Verify:** snap the picker open (`--click "[aria-label='New chat']"`), pick a row, assert the
draft header shows the character name; e2e: picker → send first message → `chat.startChat` commits
(the existing spec covers the commit half).

### J3 · Reading + writing in a chat (implement the law's CONTENT anatomy)

**Now:** no chat identity anywhere (topbar says "Chats"); transcript spans full width; actions
always-on under every message; composer is a bare full-width strip.

**Target (this is UI-Arch §4.1's own spec):** HEADER bar = participant avatar(s) (`AvatarStack`
for groups) · chat title (click-to-rename, J6) · scene/participants chip · thread action cluster
(⋯ options menu, J6) — composed by the route into `ShellTopbar`'s existing `header` slot.
THREAD = centered 65–75ch column (punchlist UIP-304), speaker-attributed rows, hover-reveal
actions (UIP-305), swipe strip on tail. COMPOSER = pill container with wand · speak-as · textarea ·
continue affordance when tail is user's (`continueEligible` logic exists) · Send⇄Stop (UIP-306).

**Steps:** punchlist UIP-202/304/305/306 are the specs; the one NEW piece is the header:

1. New `packages/client/src/features/chat/components/chat-header.tsx`: reads nothing itself —
   props from the route (`chatDetail` is already in cache via `chat.getChat`; add a
   `ChatHeaderSurface` with its own `QueryBoundary` reading the same key, the shared-cache pattern
   `chat-room-surface.tsx` already documents for the composer tail).
2. Route passes it to `AppShell` → `ShellTopbar header={…}` (prop exists, unused today).
3. Draft variant: seeded character avatar + name + "New thread" chip; landing variant: none
   (topbar falls back to section title).

**Verify:** populated-chat snap shows identity header; `--text` ARIA tree shows
`banner → heading(chat title)`.

### J4 · Jump anywhere (⌘K becomes real)

**Now:** `command` modal renders a placeholder sparkle ("⌘K quick-jump lands with the command
feature").

**Target:** the `@orb/ui` `Command` primitive (cmdk seal — already built, exports
Command/Input/List/Empty/Group/Item/Separator/Loading) composed into the palette the mockup specs
(`reference/design/neo-tavern/nt-app.jsx` `CommandPalette`): groups **Threads** (recent chats →
`selectChat`) · **Go to** (rail sections → `setActiveSection`) · **Create** (New chat →
`openModal("newChat")`; New character → `setActiveSection("characters")` + its create affordance)
· later **Theme** (J8). Footer kbd hints. This is pure composition; zero new server reads
(`chat.listChats` is cached).

**Steps:** the shell stays domain-agnostic (§5.1: "app-shell … zero ChatHandle/Character
knowledge"), so the palette surface must NOT live in app-shell — a chat-listing surface there
would put domain knowledge in the one directory every paint gate exempts (the §11.0 rot pattern).
Home: **`packages/client/src/features/chat/surfaces/command-palette-surface.tsx`** — it is
chat-led (recent threads are its primary group); its non-chat rows are pure `#state` writes
(`setActiveSection`/`openModal`), which is the sanctioned leaf-writer shape, and any future
cross-domain rows read via `trpc.*` (§11.0: the tRPC router IS the cross-feature contract — a
trpc read is not a feature import). The ROUTE composes it: `home-page.tsx` passes
`modals={{command: <CommandPaletteSurface/>}}` — exactly the live `settings` slot pattern
(`packages/client/src/routes/home-page.tsx`). `modal-slots.tsx` keeps only the placeholder
default; do not edit bodies there.

**Verify:** snap `--click "[aria-label='Command menu']"`, type into the input (`--fill`), assert
grouped results; keyboard e2e: ⌘K → arrows → Enter lands in the chat.

### J5 · Find a conversation (list = finding)

**Now:** unsearchable chat list; blank-looking rows (Card, no avatar/time); selected state barely
visible; no unread/pin/archive affordances.

**Target:** LIST panel per rule 5: header row ("Chats" micro-caps · `+` icon-button) → search field
→ `ListRow`s (avatar · title · participants-or-lastline · relative time), `selected` prop wired,
hover shows a per-row kebab (Rename · Star · Archive · Delete). **Server truth:** the four verbs
exist on the `ChatService` contract and are implemented in
`packages/server/src/domain/chat/verbs/chat-lifecycle.ts` (host-only), but the tRPC router
(`packages/server/src/transport/trpc/routers/chat.ts`) exposes NONE of them yet — this lane's
FIRST step is adding the four thin procedures there (schema + delegate, same shape as the existing
`deleteMessages`). It is a transport pass-through, not a domain change — in scope for a UI lane.
Star/archive filters as quiet toggle chips under the search field (NT's recent-chats settings
precedent).

**Steps:** punchlist UIP-301/302/303 + swap `Card` → `ListRow`
(`packages/ui/src/primitives/list-row/` — it already has leading/title/subtitle/actions/selected/
clickable). Add the kebab via `@orb/ui` `Menu`. New testids in
`packages/client/src/lib/test-ids.ts` (`chatListRow`, `chatListRowMenu`).

**Verify:** populated snap; `--press` the kebab (hover-revealed) shows the menu.

### J6 · Manage the active chat (the missing options menu)

**Now:** no chat-level actions exist anywhere in the UI (no rename, no delete, no close; fork is
per-message only). NT's options menu
(`reference/neo-tavern/src/client/features/chat/components/chat-options-menu.tsx`) carries: New
chat (same character) · Continue last message · Regenerate · Impersonate (1st/2nd/3rd) · per-chat
Persona · Group… · **Select messages…** (bulk mode) · Manage chats… · Find similar chats… ·
Persistent guides… · Preview request… · Chat overrides… · Close chat · Delete chat….

**Target:** a ⋯ menu in the J3 chat header. Phase-now items (verbs/UI exist): Continue ·
Regenerate (wand hooks `use-guided-actions.ts` + swipe machinery already dispatch these) ·
Impersonate (wand) · Select messages… (see below) · Preview request / Chat overrides / Injections
(focus the context panel tab — `togglePanel("context")` + a tab-select seam) · Close chat
(`goToLanding()`, J1) · Delete chat (AlertDialog → the delete procedure J5's router addition
exposes — same lane dependency, same router file). Phase-later items enter as their features land
(persona switch, similar chats, guides) — the menu is registry-shaped data so additions are rows,
not rework.

**Select messages / bulk ops:** `@orb/ui` `selection-bar` primitive exists; NT's
`message-selection-bar.tsx` is the interaction spec (enter mode → checkboxes on rows → count +
Delete/Cancel bar pinned above composer). Wire to `chat.deleteMessages` (exists — the actions row
already calls it single-message).

**Steps:** `chat-header.tsx` (J3) hosts the `Menu`. Both new stores go in
`packages/client/src/state/` — NEVER a feature dir: §2.1 is law ("state/ — ALL gated Zustand
stores, FLAT") and the `state-files` gate only scans that directory, so a feature-homed store
silently escapes the discipline. Concretely: the "context panel: open tab X" seam is a
`contextTab` field on `state/shell-store.ts` (it's shell-panel state); bulk-selection mode is a
new `state/message-selection-store.ts` beside `state/message-edit-draft.ts` — the exact precedent:
external store keyed by message id, because windowed rows lose local state (PD-119).

**Verify:** menu snap; bulk-select e2e: enter mode, select 2, delete, rows gone.

### J7 · Group chat flows (cast, roster, add member)

**Now:** cast bar (glance strip) + context Roster tab exist for committed group chats; there is NO
way to CREATE a group or add a member from the UI.

**Target:** (a) J2's picker gets multi-select (compose it OVER the `Command` primitive — cmdk has
no native multi-select mode: keep the palette open on select, toggle a trailing check per row, and
add a "Start with N characters" confirm item; NT `group-chat-create-dialog.tsx` is the flow
precedent) → `startNewChat` seed carries N characters —
**verified viable end-to-end:** `packages/server/src/domain/chat/verbs/start-chat.ts` founds on
`characterIds: readonly CharacterId[]` AND the client `DraftSeed`
(`state/active-chat-store.ts`) is already plural — the ONLY new work is the picker's multi-select
UI. Opening policy rides the picker (NT
`chat/components/group-generate-opening-controls.tsx`): greetings vs a generated intro with a
user steer + speaker pick (a member or auto-arbitration) — give the confirm step that choice
when the group path is taken. (b) Cast bar gains a trailing `+` opening an
add-character picker → the roster add verb (`.../verbs/roster.ts` `createRoster` owns roster
mutations; confirm the add-participant member's router name). Cast bar composes `avatar-stack`
(`packages/ui/src/primitives/avatar-stack/`).

**Verify:** group snap with cast bar `+`; roster tab shows the added member.

### J8 · Theme switching (honest picker over what exists)

Punchlist UIP-402 body: mockup `ThemePopover` grammar over however many palettes exist (likely
one). The D44 theme editor is later work; the picker ships now so the modal stops being a sparkle.
Wire: `packages/client/src/features/settings/` owns the surface (appearance blob already syncs);
route composes it into the `theme` modal slot.

### J9 · Character library → detail (CONTENT half of the section)

**Now:** LIST = search + rows (real); CONTENT = static "Choose a character" EmptyState.

**Target (interim, pre-editor):** selecting a row shows a **character detail card** in CONTENT —
avatar hero, name, creator notes, tagline, tags, "Start chat" primary + "Add to current chat"
(when a committed chat is active) — a read-only surface over `character.get`. The full EDITOR
(NT: `character-editor-surface.tsx` + shell/save-bar/tag-editor/advanced surfaces) is its own
later lane (§3 matrix row); do not block the detail card on it. Selection state: a
`selectedCharacterId` field — **not** in the chat stores; add
`packages/client/src/state/character-selection-store.ts` (gated store, §5 rules), route reads it.

**Verify:** click row → detail card snap; "Start chat" lands in J2's draft with seed.

### J10 · Corpus / Refinery / Analytics placeholders → previews (pre-feature honesty)

Punchlist §5 (distinct copy + Weave) is the floor. Corpus additionally: the search field renders
NOW and searches chats client-side (`chat.listChats` titles/participants) with an honest "full
corpus search lands with the corpus engine" footer — a real, useful surface using zero new server
work, and it seeds the section's final layout (search-first, results left). Refinery/Analytics
stay teaching placeholders (their engines are absent).

### J11 · Settings (the Discord-overlay split — Nate's call, 2026-07-05)

**Now:** one Appearance pane in a smallish modal (works, ugly — punchlist UIP-404).

**The governing split (fixes ST's everything-drawer):** anything that CONFIGURES GENERATION is
NOT settings — it lives in the Presets section (§3 row) as authoring work, with per-chat
deviations in the chat CONTEXT Overrides tab. Settings holds only user/app preferences.

**Target:** the `settings` modal slot renders a **full-bleed overlay** (Discord user-settings
pattern; NT precedent for the presentation:
`reference/neo-tavern/src/client/features/app-shell/surfaces/top-nav-panel-surface.tsx`'s
`variant="full"` arm): a left category nav (\~220px — category rows grouped under two micro-caps
labels) + one scrolling content column (\~`--container-cq-lg` cap), a settings-search field above
the nav, Esc/X closes. Categories:

- **USER** — Account (identity, sign-out; §3 auth row) · Personas (manage/default; §3 personas
  row — this is the same surface the account modal's Personas tab was slated for; when J11 lands,
  personas live HERE and the rail-avatar `account` modal shrinks to a quick card linking in) ·
  Appearance (exists today — migrates as-is) · Chat behavior (NT
  `app-shell/surfaces/preferences-surface.tsx` chat-handling knobs).
- **APP** — Connections (credentials — §3 row) · Automation (later, D46) · System
  (workloads/engines/storage — §3 workloads row lands here) · Admin (multi-user only; links
  `/admin`).

Composition rules: every row is `packages/ui/src/primitives/setting-row/`; ONE column per category
(never NT/ST's two-up cramming); categories are lazy panes (only the active one mounts); the
category nav uses the same selected-row grammar as LIST panels. Empty/deferred categories render
teaching placeholders (§5 rules), not blank panes.

**Steps:** (1) Dialog primitive gains the `full` presentation variant (rides UIP-401's width-
variant work — a full-bleed overlay is a Dialog variant, not new shell machinery; the modal-slot
wiring is untouched). (2) New `packages/client/src/features/settings/surfaces/settings-shell.tsx`
— the nav + pane host; `AppearanceSettingsSurface` becomes its first pane. (3) Route keeps
composing via `modals={{settings: …}}` (`home-page.tsx`, the live pattern). (4) Categories land
with their features (Connections with credentials lane, etc.) — the shell ships with USER group +
placeholders so the geography exists from day one.

**Verify:** `pnpm snap / --wide --click "[aria-label=Settings]" --out j11-settings` — full-bleed
overlay, left nav with two group labels, Appearance pane active.

### J12 · Mobile pass (bottom tab bar — ruling P3)

**Now:** rail reflows to a top strip (the pre-P3 shape); the default mobile state opens the LIST
sheet over CONTENT (you land on a menu, not your conversation); sheets have no visible dismiss
affordance (scrim tap only); the composer/keyboard interplay is untested.

**Target (P3, `design-enforcement.md` §2):** a **bottom tab bar** — Chats · Characters · Corpus ·
**You** (21px icons + 10px labels, active = primary, `env(safe-area-inset-bottom)`); "You" opens a
sheet holding account/settings/theme plus the overflow sections (World Info · Presets · Refinery ·
Analytics — full grid reachable there and via ⌘K). Land on CONTENT (landing or last chat);
LIST/CONTEXT open as sheets from in-content affordances (the chat header's back-chevron opens the
Chats list; the ⋯/roster affordances open CONTEXT) with a slide motion + visible close; composer
respects `interactive-widget=resizes-content` (check `packages/client/index.html` viewport meta —
§4b axis 4 says it must be set) and safe-area padding (audit all four `env()` insets); every
hover-reveal from J5/UIP-305 has its coarse-pointer always-visible fallback (axis 3). All in
`shell.css` (grid-row flips: content row 1, tab bar row 2) + the token layer; zero feature edits.
Ship the §4.1 `MOBILE:` D-ledger amendment in the same lane.

**Verify:** `pnpm snap / --viewport 390x844` series: landing, chat, list-sheet, context-sheet, You
sheet; axis-3 check: actions visible without hover at coarse pointer (Playwright `hasTouch`
context).

---

## 2b. The region map — what lives where (the Discord mapping)

The shell is Discord's anatomy with different nouns. Fix this mapping in your head before touching
any lane:

| Discord | Orbweaver | Owns |
| - | - | - |
| Server rail (left icon strip) | RAIL | *which facet of the app* — sections + theme/settings/account at the foot |
| Channel sidebar | LIST | *the active section's collection*: header row (micro-caps title + create `+`) → search → `ListRow`s. Finding things. |
| Chat pane | CONTENT | *the artifact you're in*: its identity header + the working surface. Doing things. |
| Members/thread panel | CONTEXT | *detail + config of CONTENT's active artifact*. Closable; never navigation. |
| ⌘K quick switcher | `command` modal (J4) | jump to any thread/section/action |
| User settings overlay (full-screen, left category nav) | `settings` modal — full-bleed variant (J11) | USER group (Account · Personas · Appearance · Chat behavior) + APP group (Connections · Automation · System · Admin). Generation config is NOT here — it's the Presets section. |
| Avatar (bottom-left) | rail-foot avatar → `account` modal | identity; Personas tab when built |

The difference from Discord that matters: rail items are **facets of one world** (Chats,
Characters, World Info…), not separate servers — so cross-section jumps (character card → start
chat) are common and MUST route through store actions (`setActiveSection` + seed), never leave the
user stranded in the wrong section.

### 2b.1 The per-section grid (end-state; ✎ = exists today, needs rework · ✚ = new)

| Section | LIST shows | CONTENT — nothing selected | CONTENT — selected | CONTEXT shows |
| - | - | - | - | - |
| **Chats** | ✎ conversation rows (avatar · title · participants/last-line · time), search, star/archive chips, `+` → new-chat picker | ✚ **landing** (J1: hero + recents + quick-picks) | ✎ chat room: identity header · thread · composer (J3) | ✎ tabs: Overrides · Preview · Injections · Roster(group) — later + token panel, world-info activation |
| **Characters** | ✎ character rows, search, `+` → create/import | ✎ "pick someone" teaching state | ✚ detail card (J9) → full editor (later lane) | ✚ activity: recent chats with them ("Chat history"), start-chat/add-to-chat actions; later gallery/stats |
| **World Info** ✚ | book rows (name · entry count), search, `+` new book | teaching state (what lorebooks do) | selected book: entries table + entry editor | book config: activation scope (global/per-chat pointers), budget/stats |
| **Presets** ✚ | preset rows (name · api/model badge · default ★), `+` new/import | teaching state | tabbed editor: Sampling · Output · Quality · Reasoning · Templates · Post-process · Compaction · **Prompt** (= prompt-manager order editor, `sortable`) | usage: which chats/defaults bind it; import/export. Default-collapsed. |
| **Corpus** | recent searches / saved lenses (later) — **defaults collapsed** | search-first hub (J10 interim → full hub) | results stay in CONTENT (left results · right graph, mockup `CorpusView`) | selected result's dossier (NT `corpus/surfaces/character-dossier-surface.tsx` precedent) |
| **Refinery** | past refinery sessions per character (later) — defaults collapsed | pick-a-character teaching state | the pipeline surface (stage stepper · assay · issues · compare — mockup `RefineryView` + law §4.1's named sub-parts) | collapsed (compare/guidance live in CONTENT per mockup) |
| **Analytics** | defaults collapsed | dashboard (charts over `--chart-*`) | drill-in stays in CONTENT | dimension detail (later) |

### 2b.2 Panel-interaction physics (the rules that make it feel like one app)

1. **LIST selection drives CONTENT; CONTEXT follows CONTENT.** Clicking a LIST row updates the
   section's selection store; the route re-renders CONTENT; CONTEXT always describes CONTENT's
   active artifact. CONTEXT contains *actions on* the artifact but never *navigates* (writer-only,
   §5.1).
2. **Per-section selection is remembered.** Rail-switching away and back restores the section
   exactly (selection stores persist per section; pair with `<Activity>` pane-keeping, law §4a).
   Discord behavior: leaving #general for another server and returning lands you in #general.
3. **Per-section panel DEFAULTS, user override wins.** Chats/Characters/World Info/Presets default
   LIST docked; Corpus/Refinery/Analytics default LIST collapsed (they're content-first hubs).
   CONTEXT defaults collapsed everywhere except Chats-with-active-chat. Implement as a
   `SECTION_PANEL_DEFAULTS` map beside `RAIL_SECTIONS` (`rail-slots.ts`) consumed by the shell
   store on first visit; the user's explicit toggle persists over the default thereafter (the
   per-panel persisted mode already exists — this only sets the *initial* value per section).
4. **Cross-section actions carry their subject.** "Start chat" from a character = seed + section
   switch in ONE action path (`startNewChat({characterId})` + `setActiveSection("chats")`) — the
   user lands ready-to-type, never on an unrelated landing.
5. **Modals are for interrupts and pickers only** (new-chat picker, add-member, theme, settings,
   account, ⌘K). Section content NEVER lives in a modal — if it feels like it needs one, it's a
   CONTEXT tab or a CONTENT state. (NT put world-info/persona in top-nav modals; we deliberately
   give them sections/CONTEXT homes instead — the four-region shell is the upgrade.)
6. **Focus mode collapses both side panels** (exists: `toggleFocus`) — the immersive-ST reading
   posture; the topbar reopen affordances are the way back (law §4.1).

## 3. NeoTavern parity map — what's missing and where it goes

Dispositions come from `Core-ST-Feature-Gap-Register.md` / the Phase-7 build plan; this table adds
the **client home + shape** so no future lane invents geography. "Home" uses the region grammar
(§0.2). Rows marked ◐ have partial Orbweaver support today.

| Capability (NT precedent path under `reference/neo-tavern/src/client/features/`) | Orbweaver today | Home when built | Shape / notes |
| - | - | - | - |
| Landing + welcome hero (`chat/surfaces/home-landing-surface.tsx`, `chat/components/welcome-assistant-hero.tsx`) | ✗ | CONTENT (chats) | J1. Committed Phase-6 item. |
| New-chat character picker (`chat/anchors/new-chat-dialog.tsx`) | ✗ (dead-end draft) | Modal | J2. |
| Chat options menu (`chat/components/chat-options-menu.tsx`) | ✗ | CONTENT header ⋯ | J6; registry-shaped items. |
| Bulk message ops (`chat/components/message-selection-bar.tsx`) | ✗ (primitive exists: `selection-bar`) | CONTENT, pinned above composer | J6. |
| Chat rename/star/archive/delete row ops (`chat/components/chat-history-row.tsx`, recent-chats kebab) | ✗ (domain verbs exist, tRPC procedures do NOT — J5's router addition is the unblock) | LIST row kebab | J5. |
| Per-character chat history (`chat/surfaces/chat-history-surface.tsx`, `anchors/chat-history-dialog.tsx`) | ✗ | Character detail card action → modal | After J9. |
| Similar chats (`chat/anchors/similar-chats-dialog.tsx`) | ✗ (needs embeddings lens) | Options menu → modal | Phase-7 databank/search adjacency. |
| Group create + add member (`chat/anchors/group-chat-create-dialog.tsx`, `components/add-character-picker.tsx`) | ◐ (roster manage exists; create/add absent) | Picker modal + cast-bar `+` | J7. |
| Group config (output strategy, speaker tags) (`chat/components/group-config-form.tsx`) | ◐ (overrides tab has room config; check field coverage vs NT) | CONTEXT Roster tab, collapsed-advanced | Audit field parity when touching roster. |
| Persistent guides (`chat/anchors/persistent-guides-dialog.tsx`) | ✗ (injections tab covers the storage seam) | Options menu → CONTEXT Injections tab | Likely a preset over injections; confirm against `chat_injections` schema. |
| Impersonate / guided verbs (`chat/components/composer-guided-row.tsx`) | ✓ (composer wand) | — | Keep; expose also in options menu (J6). |
| Reasoning block (`chat/components/reasoning-block.tsx`) | ✓ (`packages/client/src/features/chat/components/reasoning-block.tsx`) | — | Committed: add the effort picker (build plan item) to composer trailing cluster. |
| Character EDITOR (`character/surfaces/character-editor-surface.tsx` + editor-shell/save-bar/tag editor/advanced) | ✗ (browse only) | CONTENT (characters) — detail card (J9) upgrades to editor | Big lane: `createSavedEntityForm` factory + `save-bar` primitive exist; NT's shell shows section anatomy (core fields · advanced · creator notes · tags · export). Satellite dialogs ride the same lane: **alt-greetings** (`character/anchors/alt-greetings-dialog.tsx` — greetings add/edit/reorder, pairs with J2's greeting note) · **connected personas** (`…/character-connected-personas-dialog.tsx`) · **convert→persona** (`…/character-convert-to-persona-dialog.tsx`) · **per-character render-policy / external-media override** (`character/components/character-ext-media-toggle.tsx` — ACUTE: our render-trust resolver already consumes the server-resolved `override ?? global`, but NO surface sets the override today). |
| Character import PNG/JSON + avatar (`character/…` import bits) | ✗ UI (server import exists — `imported_from` cols) | Characters LIST header (import icon) + `file-dropzone` primitive | Check `character.import*` verbs first. |
| Character bulk ops / folders / filter chips (`character/components/character-bulk-bar.tsx`, `-folder-strip.tsx`, `-filter-chips.tsx`) | ✗ | Characters LIST | Later; tags feature dependency. |
| HotSwap strip (favorites quick-switch) (`character/surfaces/character-hot-swap-surface.tsx`) | ✗ | Landing quick-picks (J1) cover the need | Do NOT clone the drawer-header strip; landing is our home. |
| Personas manage/edit (`persona/surfaces/personas-surface.tsx`, `-editor-`, `-list-`) | ✗ (feature dir is .gitkeep; speak-as exists in composer) | **Settings overlay → USER → Personas** (J11); the rail-avatar `account` modal stays a quick identity card linking there | Per-chat persona pin lives in options menu (NT parity). First-run persona ask (`persona/components/first-run-persona-wizard.tsx` precedent) — **DECIDED: fold into the J1 landing hero** (an inline "what should characters call you?" name field on the zero-personas landing; no interrupting dialog), keeping NT's onboarding latch semantics. |
| Presets: selector + editor panes (sampling/output/quality/reasoning/**templates**/post-process/compaction) (`preset/surfaces/*` incl. `preset-templates-surface.tsx` — 13 format/guided knobs) | ✗ (server domain exists) | **New rail SECTION `presets`** (P6 ruling): LIST = preset list + selector CRUD toolbar; CONTENT = tabbed editor panes | `rail-slots.ts` addition; prompt-manager rides along (below). Per-chat preset binding surfaces in CONTEXT Overrides tab, consuming via the injected seam (never bound-to-chat config — memory/law). |
| Prompt manager (section order editor) (`prompt-manager/surfaces/prompt-sections-surface.tsx`, `section-edit-surface.tsx`) | ✗ | Presets CONTENT, "Prompt" tab | `sortable` primitive (dnd seal) exists for reorder. |
| World info (books + entries editor + FOUR activation sources) (`world-info/surfaces/world-info-surface.tsx`) | ✗ (server domain exists) | **New rail SECTION `world-info`** (P6 ruling): LIST = books; CONTENT = entry table/editor. Activation homes: **global** = section's defaults panel (`world-info/components/globally-active-books-picker.tsx` precedent) · **per-chat** = chat CONTEXT tab · **character-linked + chat-lore** = character editor dialogs (`character/anchors/character-world-books-dialog.tsx`, `…/character-chat-lore-dialog.tsx`) · **persona-linked** = persona editor section (`persona/components/persona-world-books-section.tsx`) | NT's surface is the density spec; entries table uses `table` + `list-row`. |
| Connections / credentials (`credentials/surfaces/connections-surface.tsx`) | ✗ (server domain exists) | Settings modal, **Connections** section (J11) | Add/edit via form factory; `status-chip` for health. |
| Corpus hub (search/browse/insights/stats/dossier) (`corpus/surfaces/*`) | ✗ (placeholder) | Corpus rail section: LIST = saved lenses/filters (later); CONTENT = search-first hub (J10 seeds layout) | Mockup `CorpusView` = visual spec; NT surfaces = capability spec. |
| Workloads (background jobs) (`workloads/`) | ✗ | **Settings → APP → System** (J11 taxonomy; decided 2026-07-05) | Low priority; observability surface. |
| User admin (`user-admin/`) | ◐ (`/admin` route exists) | Keep `/admin`; link from Settings when multi-user | Matches NT's settings-absorbs-admin posture. |
| Auth / login (`auth/surfaces/login-surface.tsx` mode-dispatcher + `login-local-` / `login-oidc-` / `login-single-user-` / `login-forward-header-` surfaces, `anchors/login-shell.tsx`, `components/auth-error-banner.tsx`) | ✗ (`routes/login-page.tsx` is a "auth isn't wired yet" stub; ties to task #50) | The `/login` ROUTE — outside the four-region shell: a centered mode-dispatched card | Signed-in account row + sign-out land in Settings→Account (J11); NT `auth/surfaces/account-surface.tsx` is the precedent. |
| Library-wide tag management (`character/anchors/library-tag-management-dialog.tsx`, `components/library-tag-row.tsx` — create/delete, drag-reorder, promote-to-folder) | ✗ (`features/tag/` is a .gitkeep awaiting exactly this) | Modal from the Characters LIST toolbar | UNBLOCKS the bulk/folders/filter-chips row above — build it first in any tags lane. |
| Gallery / media grid (ST-map committed; `media-grid` primitive built) | ✗ | Character detail card tab + message media lightbox (exists) | Rides imagery domain (Phase 7 built server-side). |
| Token counter panel (build-plan committed) | ✗ | CONTEXT panel tab (chat) — quiet mono stats | Over `@orb/kit/tokens`; pure client. |
| `/imagine` command surface (build-plan committed) | ✗ | Composer wand item | Rides D46 automation actions. |

**Rail end-state** (when the above lands): Chats · Characters · World Info · Presets · Corpus ·
Refinery · Analytics — seven sections, grouped on the rail with `--spacing-section` dividers
(primary: Chats/Characters/Corpus · authoring: World Info/Presets/Refinery · insight: Analytics).
**This amends law:** UI-Arch §4.1 enumerates FIVE sections (no World Info, no Presets) — the
seven-section end-state is ruling **P6** in `design-enforcement.md` §2 (DECIDED 2026-07-05); the
§4.1 enumeration gets its D-ledger amendment when the first new section lands. Seven is the
ceiling; anything further goes to modals/settings. Add
sections ONLY via `rail-slots.ts` (the pairing test enforces the modal side).

---

## 4. Primitive verdict — the kit does NOT suck; it's under-composed and under-tuned

57 primitives exist over Base UI with tv() variants and token-only skins. Three classes of work:

### 4.1 Composition corrections (features using the wrong/lesser primitive — free wins)

| Where | Now | Should be |
| - | - | - |
| `packages/client/src/features/chat/surfaces/chat-list-surface.tsx` rows | `Card interactive` | `ListRow` (leading/title/subtitle/actions/selected are its native slots) |
| `packages/client/src/features/settings/…appearance` rows | hand-rolled `Stack`s | `SettingRow` |
| ⌘K modal body | placeholder | `Command*` family (J4) |
| Cast bar avatars | (verify) individual Avatars | `AvatarStack` |
| Bulk-delete (when built) | — | `SelectionBar` |
| Character editor save (when built) | — | `SaveBar` |
| Refinery compare (when built) | — | `CompareBlocks` + `@orb/ui/diff` |
| `chat-context-panel-surface.tsx` retry | raw `<button>` | `Button intent="ghost"` (also a compose-only violation — see `design-enforcement.md` §3.2) |

### 4.2 Variant/value tuning (in `@orb/ui` only; token work first — punchlist §1)

- **Button** (`primitives/button/variants.ts`): heights ride `control-*` tokens → resolved by the
  P1 ruling (pointer-conditional; UIP-102 does the token work, this file only inherits). **P5
  RULED: retune `secondary` to bordered** (1px `--color-border`, hover fills `--accent`); do NOT
  add an `outline` intent. Ghost buttons default to `text-muted-foreground` (mockup) not
  `text-foreground`.
- **Avatar** (`primitives/avatar/`): (a) decouple sizes from control tokens — avatars-as-DISPLAY
  are not touch targets; add `size` values riding a new `avatar-sm/md/lg` token trio (24/32/40px).
  CAVEAT (P1 ruling): an avatar that IS a button (the rail-footer account trigger) keeps the
  coarse-pointer ≥44px hit area (visual box = hit box on fine pointers);
  (b) deterministic per-entity hue for fallback initials (hash name → the chart-token hue set;
  pure function in the primitive; the mockup's `Avatar hue` is the spec) — chat attribution keeps
  using ThemeScope where it already threads tokens.
- **Text** (`primitives/text/variants.ts`): add `size="micro"` (10.5px/1.2, weight 600,
  `tracking-[.08em]` → needs a `--text-micro` + `--tracking-micro` token pair, no arbitrary
  values) + `transform="caps"` variant. This is UIP-103's dependency.
- **Skeleton**: add the shimmer treatment (UIP-309) behind `prefers-reduced-motion`.
- **Dialog**: width variants (`sm|md|lg` clamps) PLUS a `full` presentation variant (full-bleed
  overlay — J11's settings shell; NT's `variant="full"` top-nav panel is the precedent),
  popover-grade chrome + scrim blur + 160ms pop (UIP-401) — one place, every modal inherits.
- **Tabs**: primary-underline `TabsIndicator` skin (UIP-307).
- **EmptyState**: add optional `action` (ReactNode slot rendered under description) + `decoration`
  (replaces icon for the Weave glyph moments). Rule-1 depends on `action`.
- **Toast**: verify variants for success/undo (rule: undo-toast over confirm-dialog for
  reversible deletes — DESIGN.md §9).

### 4.3 Missing primitives (small, build once)

- **`Kbd`** (`primitives/kbd/`): mono micro chip (`--accent` bg, 4px radius). Consumers: topbar ⌘K
  chip, palette footer, tooltip shortcut hints.
- ~~`SectionLabel`~~ — **RULED: Text `micro`+`caps` variants only** (§4.2); no wrapper primitive.
- **`WeaveGlyph`** — exists in app-shell (`packages/client/src/features/app-shell/components/weave-glyph.tsx`);
  PROMOTE to `@orb/ui` content/ (it's brand, domain-agnostic, needed by EmptyState decorations
  across features) with the silk-shimmer `anim` prop (mockup `shell.jsx WeaveGlyph`).

Everything else needed by §2/§3 already exists. Do NOT add primitives beyond these without a
matching row here or in the punchlist.

---

## 5. Build lanes (dependency-ordered; each is one agent-sized brief)

| Lane | Contents | Depends on |
| - | - | - |
| **L0 tokens** | punchlist §1 (palette P2 · pointer-conditional density P1 · micro/type tokens · avatar size trio) | none — P1/P2 decided (design-enforcement §2); L0 is dispatchable NOW |
| **L1 primitives** | §4.2 + §4.3 + punchlist UIP-401 dialog chrome | L0 |
| **L2 shell chrome** | punchlist §2 (rail/topbar/panel headers) + J3 header slot wiring | L1 |
| **L3 flow spine** | J1 landing · J2 picker · J4 palette · J5 list | L1–L2 |
| **L4 chat room** | UIP-304/305/306 + J6 options/bulk + J7 group affordances | L3 |
| **L5 sections & modals** | J8 theme · J9 character detail · J10 placeholders · J11 settings | L1 |
| **L6 mobile** | J12 | L2–L4 |
| **L7 parity growth** | §3 rows in product-priority order (Presets → World Info → Character editor → Connections → Corpus…) | each feature's server domain |

Every lane brief MUST: cite its §2/§3/§4 rows; end with the verify snaps; update the golden
baselines (`design-enforcement.md` §3.4) in the same commit; and touch NOTHING outside its row's
files without flagging. Dev-DB gotcha (punchlist §0) applies to every lane that needs populated
screens.
