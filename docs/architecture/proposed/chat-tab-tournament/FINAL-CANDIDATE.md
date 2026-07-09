# FINAL candidate — Chat tab: community-chat grammar over the built room system

```
kind: build-spec candidate (tournament winner, unified)   status: awaiting owner ratification
scope: the Chats RAIL section — LIST, LANDING, ROOM, CONTEXT, multi-human, dual-device. Supersedes the
       three tournament pitches; EXTENDS (never re-specs) FINAL-Chats-Landing-Room-and-Context-UX.md —
       where this doc is silent, FINAL-Chats is the law. NOT the Characters lane, NOT the immersive
       visual system or persona system (shipped FINALs), NOT rpg/crew/tool-use content (§16 seams).
provenance: chassis = pitch-discord.md (tournament winner); grafts = pitch-immersion.md (scene
       atmosphere, composing signal, dual-device spectate fix, solo→group growth seed) and
       pitch-greenfield.md (last-turn trace summary, guided-wire zod schema); three binding owner
       rulings folded in (§1 LAW 3 chat mode · §6.4 wand model · §1 LAW 4 atmosphere precedence).
       CRITIQUE.md findings are integrated, not re-litigated.
companions: FINAL-Chats-Landing-Room-and-Context-UX.md (the as-built baseline + FIX/CREATE ledger this
       doc consumes) · FINAL-Character-Library-and-Editor-UX.md (the sibling lane; §8.1 theme control
       cluster reused here) · docs/architecture/history/FINAL-Persona-and-Immersive-Chat-Visuals.md.
```

> **You are a cold, amnesiac agent.** Where this doc cites a `§` of the core UI docs or FINAL-Chats,
> that section is LAW and wins over your instinct. Read §1 (mental model), §2 (commit model), and §13
> (pain-points) before writing a line. Every code/verb claim below was verified on disk 2026-07-09;
> paths are load-bearing. **Extend; do not regenerate** — FINAL-Chats §12 DO-NOT-REBUILD binds this
> doc in full.

---

## 0. Build order (waves; what blocks on what)

1. **Wave 0 — transport/contract (server, thin; land green before any client wave):**
   FINAL-Chats FIX #1 (invite/membership cluster) · FIX #2 (capability probe) · FIX #3 (`ChatSummary`
   denorms) · FIX #4 (`listInvites` — service + router rows over the built persistence read,
   `domain/chat/persistence/invites.ts` L30) · FIX #5 (`undoContinue`/`revertContinue`) · the
   `chat.compact` router row (CREATE A) · the PD-30 lore trio router rows (CREATE C) · **the
   guided-wire zod schema** (§14 ask G1 — `guidedSteerSchema` replacing the `z.any()` guided/opening
   fields, `routers/chat.ts` L44/L64/L87–L89). All thin, independent rows.
2. **Wave 1 — the ledger amendments (owner action, no code):** ratify §15 amendment A (chat mode,
   `SECTION_PANEL_DEFAULTS`) and amendment B (D44 per-chat un-deferral for the scene atmosphere).
   A blocks the Wave-2 shell change only; B blocks R2 + every atmosphere client piece (Wave 4).
3. **Wave 2 — room/list client (small, parallel, disjoint files):** the chat-mode resolve-seam
   derivation (§1 LAW 3) · the wand gate drop (§6.4) · FINAL-Chats Wave-A polish (continue-on-empty,
   undo/redo-continue, LIST subtitle/avatars/fork badge/chips, options-menu Compact row) · the jump
   pill (§6.3) · the variant tray (§6.3) · the fork-humans confirm (§6.3) · the `@`-mention
   autocomplete (§6.4) · the solo→group growth seed (§6.1) · the spectator-ghost attribution wiring +
   its build checkpoint (§9.2). Blocks: FIX #3 for the LIST subtitle/avatars; FIX #5 for undo/redo;
   the amendment for chat mode; everything else blocks on nothing.
4. **Wave 3 — the multi-human client (after Wave 0's FIX #1/#2/#4):** invite dialog · `/join/:token`
   route · the Members panel rework (§7.1 — rename, People section, the row interaction contract) ·
   `features/notifications/` (bell + inbox) ·
   cast-bar human chips · the Lore tab.
5. **Wave 4 — reward-zone server asks + their clients (each severable from the others):**
   read-state (§14 ask R1 → the LIST pip + the thread unread divider + §9.3) · scene atmosphere
   (§14 ask R2 → the CONTEXT Scene tab + the room ThemeScope layer + the member opt-out) · the
   last-turn trace summary (§14 ask G2 → the Preview-tab digest).
6. **Wave 5 — severable:** the composing signal (§14 ask S1 → cast-bar chip indicator + composer cue).

Verify every wave against §11 (click economy) and §13 (pain-points).

---

## 1. The mental model — one section, four laws

The shell is fixed (UI-Arch §4.1): RAIL (nav) · LIST (finds) · CONTENT (does: landing OR room) ·
CONTEXT (config/detail tabs). FINAL-Chats §1's two laws carry unchanged; this doc adds two.

**LAW 1 — the handle discriminant** (FINAL-Chats §1 LAW 1, verbatim): the active chat is
`landing | draft | committed` (`state/chat-handle.ts`, read via `state/active-chat-store.ts`); every
read, subscription, and verb call gates on the discriminant.

**LAW 2 — the bus is the ONE freshness driver** (FINAL-Chats §1 LAW 2, verbatim): every chat verb is
immediate-commit server-side and emits a `ChatBusEvent` or a user-bus `chatsChanged` fan; mutations are
`busDriven`; `data/invalidation.ts` is the one event→queryFilter seam.

**LAW 3 — CHAT MODE (owner ruling, tournament-binding).** On chat open — ANY composition, solo or
group — the shell enters chat mode: **LIST → `overlay`** (edge-reachable slide-over via the §11.1
clamp; zero width closed) and **CONTEXT → `collapsed`**. The landing (no chat open) keeps the boot map
(`chats: { list: "docked", context: "collapsed" }`, `features/app-shell/lib/rail-slots.ts` L107–113).
The user's per-panel toggle wins permanently thereafter (§4.2 rule 3 untouched — the rule changes only
the un-overridden default). **Mechanism — the tier boundary, stated exactly (app-shell is
domain-agnostic and may NOT read the chat handle, UI-Arch §5.1 property 1; this is why the
rail-slots header once anticipated a `setPanelMode` seed):** the handle read lives in the ROUTE.
`home-page.tsx` (the composition reader — it already composes from the active-chat handle) derives a
domain-agnostic runtime default — `landing` ⇒ nothing; `draft | committed` ⇒
`{ list: "overlay", context: "collapsed" }` — and passes it INTO the shell as a generic per-section
runtime-default input (e.g. a `sectionDefaultOverrides` prop/param on the shell layout; shape:
`Partial<Record<SectionId, PanelModes>>` — no `ChatHandle` type crosses the boundary). The resolve
seam (`features/app-shell/hooks/use-shell-layout.ts`) then computes `override ?? runtimeDefault ??
bootDefault`. No runtime seed, no phantom persisted override, no effect (a render derivation; gate
`no-effect-on-shared-selection` stays green), and `features/app-shell/**` imports nothing from
`features/chat/**`. **Mobile is out of scope for this law:** on a mobile viewport the shell already
renders LIST/CONTEXT as transient sheets (`use-shell-layout.ts` mobile fork — "docked is a desktop
concept a full-width sheet must never inherit"); chat mode is a desktop-resolve concern only, the
mobile behavior is unchanged (land on CONTENT, sheets closed). Ledger amendment: §15. Consequences
a builder must honor:

- The room is the immersive default for every composition; the transcript fills the frame at rest.
- CONTEXT surfaces are reached by the **topbar member-count chip** (§6.1 — 1 click) or the existing
  reopen affordances (§4.2 physics 6); nothing in the room may assume a docked panel exists
  (FINAL-Chats §13 focus-mode rule, now the default posture).
- The landing's `showRecents` derivation (`listMode !== "docked"`) is untouched — on the landing the
  boot map still docks the LIST, so the landing still drops its own recents.

**LAW 4 — atmosphere precedence: character wins (owner ruling).** `<ThemeScope>` nesting order, outer
to inner: **global → chat atmosphere (§7.3) → character**. Most specific on top; resolution is pure
CSS-cascade nesting exactly as FINAL-Character §8.2 — **zero merge code**. In a true-solo room the
built character chrome takeover (FINAL-Chats §6) therefore sits ABOVE the atmosphere; the atmosphere
earns its keep in group/multi-human rooms, where no single character owns the chrome. **Ledger
dependency, stated:** per-chat theming is currently DEFERRED by D44 decision (1)
(`Core-Path-Registry-D44-D52.md` — scopes = global + per-character, order `character > global >
default` "built to accept" more later). The atmosphere (§7.3/R2) is therefore gated on **§15
amendment B**, which supersedes that deferral (owner-ruled 2026-07-09 — the precedence adjudication
above IS the ruling; the ledger row makes it law). Build nothing atmosphere-shaped before amendment
B lands.

**The source-agnostic editor corollary** (FINAL-Chats §1) carries: every CONTEXT editor is a pure
`(value, save)` component; committed passes the verb, draft passes the `setDraft*` store action.

---

## 2. The commit-model law

No save-bar anywhere in the section (FINAL-Chats §2 — the full table there is law). Rows this doc adds
or amends:

| Surface | Write | Verb (authority) | Freshness |
| - | - | - | - |
| Wand (guided actions) | immediate | `chat.generate`/`swipe`/`continueTurn`/`impersonate` with `guided` — **composer text = the steer; empty composer ⇒ `guided.input` absent** (§6.4) | bus (turn events) |
| Wand Guided response with a target (groups) | immediate | `chat.generate({speakerCharacterId, guided})` (`GenerateParams` carries both — `domain/chat/contract/params.ts` L214–218) — steer = composer text, target = the wand's submenu pick (§6.4; Q1 RESOLVED, §15) | bus (turn events) |
| Scene atmosphere | immediate | `chat.setChatTheme` (host; §14 ask R2) | bus: `chatUpdated` |
| Mark-read | immediate, debounced | `chat.markRead({chatId, seq})` (member; §14 ask R1) | user bus: `chatsChanged {chatId}` |
| Composing signal | ephemeral (never persisted) | `chat.signalComposing` (member, throttled; §14 ask S1) | bus: ephemeral `composing` member |
| Atmosphere opt-out (member) | device-local view pref | Zustand-persist store field (registered in `DEVICE_LOCAL_REGISTRY`) | none (device-local by design) |

The turn lifecycle stays a state machine (`state/chat-stream.ts`: `idle → pending → streaming →
stopping → terminal`); Send⇄Stop, wand busy, swipe visibility, and the §7.1 "responding…" mark ALL
read `useTurnPhase` — never a mutation's `isPending`.

---

## 3. RAIL

Unchanged (FINAL-Chats §3). One topbar addition (not rail): the notifications **bell** (§8.4 of
FINAL-Chats; built here in Wave 3) — notifications are per-USER and cross-section, so the topbar is
its home. Feature-detected; single-user installs render no bell. **This doc adds ZERO rail
sections** (the seven-section ceiling, D62, is untouched; the World Info/Presets additions stay
PENDING their own owner re-decision) — do not home the inbox or any chat surface in the rail.

## 4. LIST — the conversation rows (finds)

Built (`chat-list-surface.tsx`) + FINAL-Chats §4 CREATE-A rework (subtitle preview, avatar stack, fork
badge, Starred/Archived chips — all consumed as specced there, on FIX #3). This doc adds the inbox
register:

- **Recency emphasis (ships with Wave 2, zero server cost):** rows whose `lastMessageAt` advanced
  since the session opened render with a **title-weight + foreground step** (never per-row accent — N
  accent ticks breach the ≤10% accent rule, §4.3 rule 9). The single most-recent row alone carries a
  small accent left-edge tick.
- **The unread pip (Wave 4, on ask R1):** `unreadCount > 0` renders the mono unread count chip.
  Server-side read-state only — a localStorage "last seen" lies across devices and violates the sync
  law (UI-Theming §12.1). Until R1 lands the pip does not render (no dead chrome).
- Kept deliberately: unpaged, client-filtered, plain suspense read (FINAL-Chats §4).

## 5. CONTENT — the LANDING

Unchanged (FINAL-Chats §5). The recent-chats rows adopt the §4 inbox row (avatar stack + preview +
recency emphasis) — composition only. The boot map keeps the LIST docked here (LAW 3 applies only when
a chat is open), so `showRecents` still derives false when docked.

## 6. CONTENT — the ROOM

The composed pane (`chat-room-surface.tsx`: `[cast bar | thread | selection bar | composer]`) and
every FINAL-Chats §6 behavioral contract carry. Changes and additions:

### 6.1 The identity header (topbar)

Built (`chat-header.tsx`). Additions:

- **The member-count chip becomes a button** toggling the CONTEXT panel (writes `setPanelMode` for the
  active section — a §5.1 leaf writer). Under LAW 3 this is the canonical way into the Members panel
  (1 click). Accessible name: "Members — N".
- **The ⋯ options menu** (`chat-options-menu.tsx`) gains, beside the FINAL-Chats §6.1 rows:
  **Add character…** (host, ANY roster size — the solo→group growth seed, from pitch-immersion §2.5:
  at roster = 1 the cast bar and Roster tab are both hidden, so a solo room otherwise has NO path to
  become a group; verified — the menu has no such row today and the cast bar's `+` is inside the
  ≤1-gated bar). The row opens the same picker body `add-member-popover.tsx` uses, presented as a
  Dialog when no cast bar exists to anchor it; fires `addCharacterToChat` (EXPOSED,
  `routers/chat.ts` L417).

### 6.2 The cast bar

Kept exactly (`chat-cast-bar.tsx`: glance chips, muted dimmed, size-gated `null` at ≤1 character,
host-only `+` → `AddMemberPopover`). Gains human chips after Wave 3 (FINAL-Chats §8.3). The bar stays
presence-only; controls live in the Members panel (§7.1). The two-surface split (glance vs act) is
deliberate.

### 6.3 The thread

Built end-to-end; FINAL-Chats §6.3 contracts carry (one `MessageRow` + `MESSAGE_ROW_SKINS`, ghost
isolation, swipes, edit-in-place via the external `message-edit-draft` store, per-message actions,
context-boundary divider, bulk select, draft greeting rows). Additions, all composition:

- **The unread divider** (Wave 4, on ask R1): a second quiet rule beside the context-boundary divider
  — micro-caps "New since you left", anchored at the viewer's `lastReadSeq` **snapshotted at
  room-entry** (a render derivation per `sessionKey`; the live value advances as the viewer reads, but
  the divider must not chase itself away mid-read — it recomputes on next entry). Without R1 it does
  not render.
- **Jump-to-present**: a floating quiet pill above the composer when the viewport is not pinned to the
  tail, optional "N new" count; rides the `message-list` seal's imperative handle — `isAtEnd()` ·
  `getDistanceFromEnd()` · `scrollToEnd()` (`packages/ui/src/primitives/message-list/message-list.tsx`
  L78–90; the seal's own comment anticipates exactly this readout). Zero new state.
- **The variant tray**: the tail swipe counter (`swipe-strip.tsx`) becomes a real button; on
  hover/focus/Enter it opens an anchored popover listing the slot's variants via
  `chat.listMessageVariants` (EXPOSED, `routers/chat.ts` L337–340). Rows: opening line (plain text) +
  Select (`chat.selectVariant`, EXPOSED — pointer move, zero copy) + **Branch from this variant** —
  a **two-verb sequence**: `selectVariant(variantId)` first (await the `variantSelected` bus confirm),
  THEN `forkChat({throughSeq})` — fork remaps the copy's pointer to the copied *selected* variant
  (`domain/chat/verbs/fork.ts` header), so the pre-select is load-bearing. Stated side effect: the
  pre-select also steps the SOURCE chat's pointer (visible in the strip, reversible). Keyboard: the
  tray is a listbox — ArrowUp/Down traverse, Enter = Select, per-row menu carries Branch; coarse
  pointers get always-visible row actions. Gated on `variantCount > 1`; reads `useTurnPhase` in render
  only.
- **Fork stays PER-MESSAGE** (owner steer; no checkpoint system anywhere in this doc). **In a room
  with >1 human** (derived from the participants' human count, never a flag), Fork and
  Branch-from-variant gain an AlertDialog confirm carrying the `FLAG[fork-humans]` semantics
  (`verbs/fork.ts` L12 — other human participants are NOT copied; the forker becomes sole host):
  *"Fork from this message into a private copy? Other people in this room won't be carried over —
  you'll be the host."* Solo/characters-only rooms keep today's confirm-free fork.
- **Membership events as system dividers** — FINAL-Chats §8.2/§13, kept verbatim.
- Wave-A additions consumed as specced in FINAL-Chats: Undo/Redo-continue rows on eligible tails
  (FIX #5), the options-menu Compact row (the D25 single checkpoint —
  `chats.compactSummary`/`compactedAtSeq`, `domain/chat/verbs/compaction.ts` header; there is exactly
  ONE checkpoint, overwritten as it advances — never render a "timeline").

### 6.4 The composer

Built (`composer.tsx`); FINAL-Chats §6.4 carries (one pill, WAND + SPEAK-AS left, Send⇄Stop morph off
`useTurnPhase`, IME guard, clear-on-commit, continue-on-empty). Changes:

- **The wand stays composer-as-steer (owner ruling).** The model is today's, kept verbatim: the
  composer's current draft text becomes the `guided.input`, the item fires, the composer clears
  (`composer-wand.tsx` header). Labels kept byte-identical: `Guided response` · `Guided swipe` ·
  `Guided continue` · `Impersonate ▸` (1st/2nd/3rd) · draft-mode `Guide the opening`. **The ONE fix:
  drop the trigger's non-empty-draft gate** (the header's "gates on a non-empty draft" line). Rationale
  and semantics: `GuidedSteer.input` is optional (`params.ts` L66) — "guided, no particular direction"
  is a valid call. Empty composer ⇒ the item fires with `guided.input` ABSENT (the steer is simply not
  supplied); non-empty ⇒ today's consume-and-clear. The mid-flight gate (a live turn) stays. Builder
  note: verify the kit's guided template no-ops on an absent `input` (the `{{guided_instruction}}`
  placement must inject nothing rather than an empty scaffold); if it doesn't, add the one-line kit
  guard and a test. Delete the gate's caveat from the wand header when this lands.
- **Guided response gains a TARGET submenu at roster > 1 (Q1 resolved — neo parity).** The
  neo-tavern reference threaded its Speak-As selection into Guided Response ONLY
  (`composer-guided-row.tsx` L98: `forcedCharacterId: speakAs`); swipe/continue/impersonate stayed
  member-agnostic. This spec ports that shape: the wand's **Guided response** item, at ≥2
  characters, opens a member submenu (Auto · each character seat) — pick fires
  `chat.generate({speakerCharacterId, guided})` with the steer from the composer text as ever
  (both params on the one exposed verb, `params.ts` L214–218; `generate` runs no arbitration and
  targets `speakerCharacterId ?? primary`). The other wand items thread NO target (neo parity —
  they operate on the tail). The built SPEAK-AS control is unchanged (it stays the fire-immediate
  unsteered targeted generate, `speak-as-select.tsx` L79–80). No own-input steer surface exists
  anywhere — the composer is the only steer source (owner ruling; §13 pain-point 13).
- **`@`-mention autocomplete**: typing `@` opens a roster Combobox (`@orb/ui/command` seal) inserting
  the literal `@Name` the arbiter hard-parses from HUMAN send text (`engine/select-speakers.ts`;
  FINAL-Chats §7 — longest-name-first, AI text never forces). Offered only at ≥2 characters (§12).
  **The token lives in canon, owned:** the inserted `@Name` is SENT and PERSISTED as message content
  (the parse runs server-side over the stored human post, `verbs/turn.ts` L514) — it appears in the
  transcript and the assembled prompt. The sent row renders it as plain text (a styled chip would make
  the render diverge from the stored string — D26). Autocomplete footer copy: *"@Aria appears in your
  message."* The no-token alternatives (SPEAK-AS; the wand's guided-response target, below) post
  nothing.
- Deliberately absent (FINAL-Chats §6.4 drops carry): attach button, `/`-commands (automation's lane —
  the prefix stays free), composer persona switcher.

### 6.5 The atmosphere layer (Wave 4, ask R2)

When the chat row carries a non-null atmosphere override, the room chrome wraps in one additional
`<ThemeScope theme={chatAtmosphere}>` at the LAW-4 nesting position (inside global, outside
character). One nesting level; no merge code; the clamp is the SAME `ThemeOverride` Zod clamp (values
cannot select/execute/exfiltrate — UI-Theming §12.1). A member with the device-local opt-out set
renders the room without this layer (their own theme stands). Because the `ThemeOverride` subset
includes `chatStyle`/density (§12.1), a host-set atmosphere natively provides a per-room chat style —
no second mechanism; under LAW 4 a solo character's own `chatStyle` override still wins.

---

## 7. CONTEXT — the room's config tabs

Built (`chat-context-panel-surface.tsx` + the draft twin); host/group gates and the `contextTab` seam
carry (FINAL-Chats §7). Under LAW 3 CONTEXT rests collapsed; the member-count chip (§6.1) and the
options-menu tab jumps open it. Tab set after this doc: **Members · Overrides · Group · Scene ·
Preview · Injections · Lore**. **Default tab when opened — the ONE rule (all cases):** Members if
the Members tab renders AND the room is a group composition; else Overrides. The Members tab renders
when either of its sections is non-empty (People: multi-human install with >1 human; Cast: ≥2
characters) and is hidden when both would be empty — so a solo chat on a single-user install opens
to Overrides. Chat-feature-internal (`contextTab: null` default) — no shell change.

### 7.1 Members (the Roster tab renamed + reworked; Wave 3)

One tab, two groups — humans and characters are both "who's in the room" (FINAL-Chats §8.3 refuses a
split). Renders the People section only on multi-human installs (FIX #2 probe) and the Cast section
only at ≥2 characters (§12).

- **People** (humans): avatar (persona-derived) · handle · host crown · "you" marker. Host row
  actions: Kick (`chat.kick`) · Hand off host (`nominateHostHandoff`; pending-nomination chip until
  accepted). Own row: Leave (`chat.selfLeave`; sole-host confirm copy: "You're the host — leaving
  archives this chat for everyone"). Section header: "Invite people" (host) → the mint dialog (§8).
  All on Wave 0's FIX #1.
- **Cast** (characters): avatar · name · a **"responding…" mark** on the currently-generating
  character — a lifecycle read: `turnStarted` carries `speakerCharacterId`
  (`packages/contracts/src/chat/index.ts` L672–683); NEVER a token subscriber (the ghost row stays the
  only one — FINAL-Chats §11.4). Row actions: Mute (`setParticipantDisabled`) · Talkativeness
  (`setParticipantTalkativeness`, commit-on-release) · Force turn (`forceCharacterTurn`) · **Respond
  with direction…** (below) · View character (cross-section store action, FINAL-Chats §9e). All
  EXPOSED today — the Cast half blocks on nothing.
- **Presence honesty:** no online/idle dots for characters (no such data axis). The only live marks:
  responding (turn phase) and muted (roster flag).
- **Q1 RESOLVED (owner ruling: neo parity — no own-input steer anywhere).** The
  respond-with-direction popover is NOT built. The Members row's targeting action is **Force turn**
  (unsteered, works on muted — the neo reference's per-row ⚡, `group-roster-panel.tsx` L192–210).
  Steering a SPECIFIC member = the composer path: type the steer in the composer → wand → Guided
  response → pick the target from its submenu (§6.4) — neo's exact Speak-As-into-Guided-Response
  shape. Posts no meta-text into canon.

**The row interaction contract (binding — build exactly this):**

- One focusable unit per row; one tab stop per panel. Roving tabindex: ArrowUp/ArrowDown across rows
  (crossing the People→Cast boundary), Home/End, typeahead-by-name. Tab exits. Accessible name =
  identity + state ("Aria — character, muted" · "Riley — host" · "you").
- **The per-row Menu is the canonical action home** (rule 10). Enter, Space, the ContextMenu key, or
  the row's ⋯ trigger opens an `@orb/ui/menu` carrying ALL the row's actions, one canonical label +
  icon each. Talkativeness… opens an anchored popover with the labeled `@orb/ui/slider` (arrow-key
  operable; commits on thumb release or Enter). Destructive rows (Kick…, Leave…) sit last, behind an
  AlertDialog.
- Fine-pointer rows reveal a 2-action inline shortcut cluster (mute · force-turn) on
  hover/`:focus-within`, duplicating two Menu items with identical labels/icons. **At
  `pointer: coarse` the inline cluster never renders** — row tap opens the Menu (the ≥44px-floor
  touch path; no ×N row-height bloat).
- Post-destructive focus: a kick removes the row on the bus echo — focus moves to the next row
  (previous if last; the section-header action if the section empties). Self-leave navigates
  (`goToLanding`; the landing owns mount focus — gate `surface-a11y-focus`). The roving index clamps
  so focus never falls to `body`.
- The "responding…" mark: visual shimmer `aria-hidden`; state rides the row's accessible description —
  no `aria-live` (no per-turn SR chatter).

### 7.2 Overrides · Group · Preview · Injections · Lore

All per FINAL-Chats §7, kept: Overrides (4-field host autosave; author's-note suppression copy) ·
Group (whole-object DU rebuild; policy help teaches human-typed `@Name`) · Injections (per-row
autosave; "off" is delete) · Lore (Wave 3; the PD-30 trio, host-write/member-read). One addition:

- **Preview gains a "Last turn" digest** (Wave 4, ask G2 — from pitch-greenfield §7.2, rescoped to a
  tab enhancement): above the existing on-demand next-turn assemble, a compact digest of the last
  COMPLETED turn's trace — winning override source · fired/dropped world-info names · the
  context-boundary seq · the token estimate — sourced from the carried `AssembleTraceSummary` (ask
  G2), not a per-render re-assemble (`previewAssembly` assembles on demand — right for a debug read,
  wrong for an ambient one). Host-only, like the tab. Degrade without G2: the tab is unchanged
  (on-demand only).

### 7.3 Scene (Wave 4, ask R2 — from pitch-immersion §4.4/§7.1, with LAW 4 baked)

A new CONTEXT tab, host-write / member-read: the FINAL-Character §8.1 token-control cluster (the WS2
reuse) bound to the CHAT row's atmosphere override. Immediate-commit: a control change fires
`chat.setChatTheme` (host) → `chatUpdated` on the bus → every member's room chrome re-renders in the
staged look, and the same user's other devices follow (the override is server truth on the chat row,
not a device pref). "Reset" sends `null`. Members see a read-only swatch summary + the device-local
**"Use my own theme in this room"** opt-out toggle. **Why device-local (the registry rationale,
stated here because a builder cannot invent it):** the opt-out is a per-device VIEWING CONDITION,
not a durable appearance preference — the same user may keep the host's staging on the desktop and
opt out on a small phone screen, exactly the class of state panel modes occupy; it does not ride the
synced `UserSettings` blob (UI-Theming §12.1 reserves device-local for precisely this). Register the
field with that rationale in the `persistence-boundary` gate's `DEVICE_LOCAL_REGISTRY`. Values are
clamped by the shared `ThemeOverride` Zod clamp — a hostile host can at worst be ugly. v1 is
committed-only (the draft twin omits Scene; carrying an atmosphere in draft-config into `startChat` is
a future one-line add, not built now). Precedence: LAW 4 (character wins; zero merge code).

---

## 8. The MULTI-HUMAN room

FINAL-Chats §8 is the law for the invite lifecycle, membership, authority model, and notifications —
consumed as specced there (mint dialog with mode toggle + raw-link-shown-once; `/join/:token`
preview-then-confirm; kick/leave/handoff; the bell + `features/notifications/` slice; the capability
probe hiding all multi-human chrome on single-user installs). This doc's deltas:

- The People section and host actions live in the **Members panel** (§7.1) — the FINAL's Roster-tab
  People section, renamed and given the binding interaction contract.
- The outstanding-invites list inside the mint dialog lands with FIX #4 (`listInvites`); mint-only
  until then.
- **The composing signal** (Wave 5, ask S1 — from pitch-immersion §7.2, severable): while another
  human in the room is typing, their cast-bar chip carries a subtle composing indicator and a one-line
  cue sits above the composer ("Kestrel is writing…"; text-only, `aria-live="polite"`; "N people are
  writing…" past 2). Ephemeral — never persisted, never in the transcript. Nothing else depends on it.
- **The atmosphere is shared staging** (§7.3): the host sets the scene every member renders — the
  multi-human half of ask R2's justification. The `previewInvite` atmosphere rider is owner question
  Q2 (§15) — not built until ruled.

## 9. DUAL-DEVICE — one section, three pieces

Same authenticated user, two devices (A = phone, B = desktop). Both mount `useUserBus` once at the
route (`home-page.tsx`); each attaches the per-chat SSE only for its OPEN chat.

### 9.1 Live turn streaming — BUILT; claim and preserve

The per-chat stream carries the whole turn lifecycle INCLUDING token deltas: `ChatBusEvent` has a
`{type:"delta"}` member wrapping `ChatDeltaEvent` (`packages/contracts/src/chat/index.ts` L592/L657),
`chat.streamMessages` yields to every subscribed member with a per-yield membership gate — verified:
the router header states the DRAFT-TOLERANT gate "runs on EVERY live yield so a kicked member's
stream stops within the kick tx" (`routers/chat.ts` header L4–12; subscription at L480), and late
attach / reconnect are covered by `replayStreamEvents` ("late-subscriber
ramp-up") + `replayChatEvents` (`domain/chat/contract/service.ts` L156–163). So a second device with
the room open streams the in-flight turn live — `turnStarted → delta → turnCompleted` — on its own
ghost row (the ghost-is-the-only-token-subscriber rule is per-client). Stop is honest from either
device: `useTurnPhase` derives from the same bus events; the slot closes on the shared terminal.
Conflict-free by construction (from pitch-greenfield §4f, carried as build guidance): scroll
independence is per-device seal state (`followOnAppend`/`isAtEnd`); composer + edit drafts are
device-local by design (§12.1 persistence law), so two composers never fight; concurrent edits are
last-write-wins server-authoritative and the losing device sees the bus-refreshed row immediately —
no locks, no merge UI.

### 9.2 Spectator-ghost attribution — the ONE client fix (Wave 2; from pitch-immersion §4.5)

`ghost-message-row.tsx`'s own header: `renderContext` "is undefined until a caller wires the room's
roster/persona names down to the ghost," and `attribution === undefined` degrades to an anonymous
ghost. For a non-initiating viewer, wire the room's roster/persona names + the speaker from
`turnStarted.speakerCharacterId` (contracts L672–683) down to the ghost so a spectating device shows
WHO is speaking. **Build checkpoint (mandatory, stated):** verify on a second live session that the
spectator ghost renders mid-turn with attribution — the transport claim is wiring-verified, not
run-verified; if late attach needs the stream machine seeded from in-flight state on subscribe, that
fix is client-side and lands with this item.

### 9.3 Read-state reconciliation (Wave 4, ask R1 — the piece that wasn't already server-side)

1. A reads room X to the tail → the client fires `chat.markRead({chatId, seq})`, debounced to at most
   once per turn settle: fires only when `isAtEnd()` AND the tail seq exceeds the last known
   `lastReadSeq` (room-open-at-tail, scroll-to-tail, and new-message-while-pinned all funnel through
   the same guard).
2. The server stamps `chat_participants.lastReadSeq` and fans the EXISTING user-bus member
   `chatsChanged {chatId}` (`packages/contracts/src/user-bus/index.ts` L41–55) — no new event type;
   the invalidation row refreshing `listChats` already exists, so the client half is zero new wiring.
3. B's unread pip for room X clears within one bus round-trip. B's "New since you left" divider is
   anchored to the snapshot taken at B's OWN room-entry (§6.3) — untouched mid-read; reconciles on B's
   next entry.
4. Notifications are already per-user durable with resumable SSE (`routers/notifications.ts` —
   replay-from-`lastEventId`): accept a handoff on the phone, the desktop's chrome re-derives from the
   bus. The bell client is a thin view over it — the cross-device property is inherited, not
   re-implemented.

Net: the phone session leaves the desktop already reconciled — pip cleared for what you read, lit for
what you didn't, the divider where you left off — with zero per-device state.

---

## 10. Interaction flows (the load-bearing sequences)

- **(a) New chat** — FINAL-Chats §9a verbatim (J2 picker → `startNewChat` → draft mounts). Chat mode
  (LAW 3) applies on the draft open: LIST slides to overlay, CONTEXT collapsed.
- **(b) First send / directed opening.** Send → `startChat` carrying the whole draft config atomically
  → `commitDraft` WITHOUT changing `sessionKey` (no remount mid-first-turn — THE KEY DISCIPLINE) →
  `clearDraftConfig` (FINAL-Chats §9b). Directed opening, composer-as-steer: type the direction in the
  composer → wand → `Guide the opening` → `startChat` with `opening:"generate"` forced +
  `guided:{action:"opening", input}` (`use-guided-actions.ts` `fireOpening`; `openingPolicySchema`,
  contracts L896). Empty composer + `Guide the opening` ⇒ an unsteered generated opening (§6.4).
- **(c) The turn** — FINAL-Chats §9c verbatim (bus lifecycle; ghost; Stop = `markStopping` + `abort`).
- **(d) Fork-nav** — FINAL-Chats §9d verbatim, plus the >1-human confirm copy (§6.3).
- **(e) Cross-section jumps** — FINAL-Chats §9e verbatim (store actions only).
- **(f) Join** — FINAL-Chats §9f verbatim (`/join/:token` → preview → accept → seated at `joinSeq`).
- **(g) Steer a specific member** — type the steer into the composer → wand → Guided response ▸
  pick the target → `generate({speakerCharacterId, guided})` (§6.4; Q1 resolved). Unsteered
  targeting: the Members row's Force turn, or SPEAK-AS.
- **(h) Stage the room** — CONTEXT → Scene (host) → adjust a control → `setChatTheme` immediate →
  every member + every own device re-renders (bus `chatUpdated`).
- **(i) Two devices** — §9 end-to-end; no user-facing ceremony exists or is built (no sync button, no
  handoff flow).

## 11. Click-economy targets (gesture-symmetric; verify the build against these)

Counting rule: gestures = clicks + keystroke chords, identical in both columns; free-text typing is
"+type" on BOTH sides. Baseline = FINAL-Chats §10 + the built wand path.

| Journey | Baseline | This spec |
| - | - | - |
| Cold → resume last conversation | 1 | 1 |
| New chat with a known character | 2 | 2 |
| Send → reading the reply | 0 extra | 0 extra |
| Reroll the last reply | 1 | 1 |
| Reroll with a steer | type-in-composer + 2 (wand → item) | same — composer-as-steer kept (owner ruling); the gate drop additionally makes the UNSTEERED wand path work at 2 |
| Pick a specific earlier variant | k chevron steps | 2 (tray open + pick) |
| Mute a group member | 2 (open Roster tab → toggle) | 2 (chip → Members is open-to; inline mute) · keys: chip, row, Enter, item |
| See who's in the room + state | 1 (open Roster tab) | 1 (member-count chip; opens to Members) |
| Summon a specific character | 2 (SPEAK-AS open + pick) + type msg | 2 (`@` + pick) + type msg — hands stay on the keyboard; token-in-canon owned (§6.4) |
| Steer a SPECIFIC member's reply | not directly available | type steer + 2 (wand → Guided response ▸ target) — Q1 resolved, neo parity |
| Invite someone (host) | 3 gestures (FINAL target) | 3 |
| Accept an invite | 2 | 2 |
| Jump to present after scrolling up | manual scroll | 1 (pill) |
| Know what's unread across devices | not possible | 0 (pip + divider, on R1) |
| Stop a runaway generation | 1 | 1 (either device) |

If any core loop exceeds these, the build is wrong — restructure.

## 12. Roster-size progressive disclosure — the inventory (owner steer; binding)

The rule: **group machinery reveals only when the roster has more than one member of the relevant
kind, hidden for solo — derived from composition (`resolveIsGroupChat`, `participants.length`), never
an `if(isGroup)` flag** (D16). Audited against the owner-designated neo-tavern reference
(`neo-tavern/src/shared/settings/group-config.ts`) + the built gates:

| Control | Home | Reveal rule |
| - | - | - |
| Output narrator⇄per-speaker (DU whole-object rebuild) | Group tab | hidden at ≤1 character (built gate) |
| Turn policy ×5 · speakerTags · groupNudge | Group tab | hidden at ≤1 character |
| cardScope + member-card visibility · auto-mode trio (maxTurns/delayMs/allowSelfResponses) + cost warning | Group tab → Advanced | hidden at ≤1; scoped-cards additionally per-speaker-output-only |
| Mute · talkativeness · force-turn | Members panel Cast rows | Cast section renders at ≥2 characters |
| Guided-response target submenu | wand (composer) | ≥2 characters (Auto-only ⇒ no submenu at ≤1) |
| Cast bar (+ host `+`) | CONTENT | `null` at ≤1 character (built, `chat-cast-bar.tsx`) |
| SPEAK-AS | composer | size-gated >1 character (built) |
| `@`-autocomplete | composer | offers rows only at ≥2 characters |
| Fork confirm (fork-humans copy) | thread actions | only at >1 HUMAN |
| Add character… (growth seed) | ⋯ options menu (host) | **ANY roster size** — the disclosure rule's missing half: controls reveal as the roster grows only if a solo room can grow |
| People section · invite · kick · handoff · bell | Members panel / topbar | multi-human installs only (FIX #2 probe); host rows host-only |
| Scene tab | CONTEXT | any composition (an atmosphere is meaningful solo too — LAW 4 just ranks it under the character there); host-write always, so members see read-only |
| Composing cue | composer/cast bar | >1 human present |

A solo chat shows: no cast bar, no Cast/People machinery, no Roster/Group tabs, no @-autocomplete, no
fork confirm — zero group machinery. The Members tab itself is hidden when BOTH sections would be
empty (solo, single-user install); the default CONTEXT tab is then Overrides.

## 13. Pain-points to AVOID

FINAL-Chats §11's twelve carry in full (no effect on the active-chat pointer · no `if(isGroup)` · no
optimistic cache surgery · no second token subscriber · no remount on draft→commit · no ambient
lifecycle booleans · modals are pickers/interrupts only · destructive = AlertDialog · never parse
attribution/mentions/trust from AI text · no injection soft-disable · members never see host-only
affordances · don't re-spec shipped systems). This spec adds:

13. **One steer model — the composer is the ONLY steer input in the app** (owner ruling; Q1
    resolved to neo parity). No guide action, row action, popover, or panel gets its own steer
    field. Targeting is a pick (the wand's guided-response submenu, SPEAK-AS, Force turn); the
    direction text always comes from the composer.
14. **The unread divider anchors to the entry snapshot, never the live `lastReadSeq`** — a divider
    that chases the live value disappears while the user reads.
15. **No presence invention.** Characters get no online/idle state; the only live marks are
    turn-lifecycle-derived. The "responding…" mark reads `turnStarted.speakerCharacterId`, never
    deltas.
16. **The atmosphere layer is nesting-only.** No merge code, no resolution engine, no server-side
    theme math — one `<ThemeScope>` at the LAW-4 position, values through the existing clamp.
17. **Mark-read is debounced through ONE guard** (§9.3). A markRead-per-scroll-event storms the bus
    and re-renders every LIST reader.
18. **The variant tray's Branch is two verbs in order** (select → fork). A single-verb branch ships
    the wrong pointer.

## 14. BUILD LEDGER — server asks (consolidated, tiered)

### Tier 0 — FIX-wave exposures (built verbs, dark; thin router/contract rows)

All FINAL-Chats §12 FIX/CREATE rows, consumed: FIX #1 invite/membership cluster
(`contract/service.ts` L268–293) · FIX #2 capability probe · FIX #3 `ChatSummary` denorms
(`lastMessagePreview` + `participantAvatarHashes`) · FIX #4 `listInvites` (contract + service + router
rows over `listInvitesForChat`, `persistence/invites.ts` L30) · FIX #5 `undoContinue`/`revertContinue`
(L179–181) · `compact` (L185) · the PD-30 lore trio. Plus:

- **G1 — the guided-wire zod schema (XS; from pitch-greenfield).** The guided/opening router fields
  are `z.any()` (`routers/chat.ts` L44/L64/L87–L89) while the domain contract is the closed typed
  `GuidedSteer` (`params.ts` L56–74). Add `guidedSteerSchema` (derive the kind enum from the existing
  `GUIDED_ACTION_KINDS` tuple / `GuidedActionKind` type, `packages/contracts/src/preset/index.ts`
  L180–187, + placement/person) and
  replace every `z.any()` guided/opening field. The type exists; the wire should match it.

### Tier 1 — REWARD ZONE (new server work serving the dual-device / multi-human product goals)

- **R1 — read-state.** `chat_participants.lastReadSeq` column + `chat.markRead({chatId, seq})`
  (member-scoped) + `unreadCount` on `ChatSummary`. Emits the existing user-bus `chatsChanged
  {chatId}` on stamp — no new event type; the `listChats` invalidation row already exists (freshness
  obligation satisfied by construction). Client: §4 pip, §6.3 divider, §9.3 reconciliation. Cost:
  one column + one verb + one denorm + one emit site. Degrade: recency emphasis stands; pip + divider
  don't render.
- **R2 — scene atmosphere (from pitch-immersion). BLOCKS on §15 amendment B (the D44 per-chat
  un-deferral) — build nothing here before that ledger row lands.** One nullable
  clamped-`ThemeOverride` field on the chat row + `chat.setChatTheme` (host, immediate,
  `requireHost`) + carry on `ChatDetail`; the `chatUpdated` fan is free. Client: §6.5 layer + §7.3
  Scene tab + the device-local opt-out. LAW 4
  fixes the precedence (character wins). Cost: S–M — no new clamp, no resolution engine. The
  `previewInvite` rider is owner question Q2 — not built until ruled.
- **G2 — the last-turn trace summary (S; from pitch-greenfield).** Carry a compact
  `AssembleTraceSummary` (winning override source · fired/dropped WI names · boundary seq · token
  estimate — a projection of `AssembleTrace`, `packages/contracts/src/chat/index.ts` L234) at turn
  completion: a field on the `turnCompleted` bus payload OR a small host-gated read keyed by chat
  (build decision — pick one). Client: the §7.2 Preview "Last turn" digest. Degrade: Preview stays
  on-demand-only.

### Tier 2 — severable

- **S1 — the composing signal (S; from pitch-immersion).** A `{type:"composing", chatId, userId}`
  ephemeral `ChatBusEvent` member (the declared `{type:"expression"}` union member — schema landed,
  emit site deliberately deferred to expressions E3 per its own comment
  (`contracts/chat/index.ts` L707–712) — is the exact shape precedent: same replay-guard posture,
  never persisted) + a rate-limited `chat.signalComposing`
  mutation called throttled (leading edge + \~4s repeat while typing continues). Client: §8's cue.
  Nothing else depends on it; drop it and nothing regresses.

### CREATE (client) — see §0 waves.

### DO-NOT-REBUILD (this slice is NOT greenfield)

FINAL-Chats §12's verified-built list binds in full, drops included. Additionally — this spec
MODIFIES the following built files; each is **extend/rework in place, never regenerate** (the
landmine that torches working code):

| Built file | This spec's change | Everything else in it |
| - | - | - |
| `composer-wand.tsx` | drop the non-empty-draft gate; add the Guided-response target submenu | labels, dispatch wiring, item set — KEPT (dispatch hook `use-guided-actions.ts` reused wholesale) |
| `swipe-strip.tsx` | the counter becomes a button opening the variant tray | chevron stepping, ArrowLeft/Right, tail gating — KEPT |
| `chat-header.tsx` | member-count chip becomes the CONTEXT toggle button | committed/draft faces, AvatarStack, ⋯ menu — KEPT |
| `chat-options-menu.tsx` | add "Invite people…" (host) + "Add character…" (growth seed) rows | existing rows — KEPT |
| `chat-context-panel-surface.tsx` (+ draft twin) | Roster tab renamed Members + People section + row contract; Scene + Lore tabs added | the five dual-mode editors, host/group gates, `contextTab` seam — KEPT |
| `chat-cast-bar.tsx` | human chips (Wave 3) | glance chips, size gate, host `+`/`AddMemberPopover` — KEPT |
| `ghost-message-row.tsx` | wire the speaker attribution props its header anticipates | ghost isolation (the ONLY token subscriber) — KEPT |
| `chat-list-surface.tsx` | inbox register styling + filter chips + recency emphasis | plumbing (suspense read, client filter, kebab, `onSelect`-only writes) — KEPT |
| `message-list` seal (@orb/ui) | CONSUMED only (`isAtEnd`/`scrollToEnd` for the jump pill) | never modified |

### PARKED (recorded, not built)

The `pitch-*`/`CRITIQUE` siblings are historical tournament artifacts — this doc is self-contained,
and the pitch names below are provenance only. Each dead concept is described so the name is not
load-bearing:

- **The ⌘. steering band** (greenfield) — a transient keyboard-first command popover unifying steer
  verbs + cast targeting + free-text direction. Owner ruled composer-as-steer; the command-surface
  slot is also the natural future home of automation's `/`-commands, whose lane it stays.
- **The CONTEXT dossier / config-door restructure** (greenfield) — CONTEXT split into an
  always-visible read-only glance face plus one consolidated config surface replacing the tabs. Chat
  mode collapses CONTEXT at rest, killing the ambient-read premise; the tab structure + the Members
  face stays. Its best piece survives as the G2 Preview digest.
- **The user-bus activity fan / LIST "Live" group** (greenfield) — a new user-bus event family
  (turn-started/settled/viewer-active) powering a LIST group pinning rooms with a scene in motion +
  presence dots. Not asked for; revisit when a presence need materializes.
- **The checkpoint-history system** — multiple compaction checkpoints as a browsable timeline. Owner
  lukewarm; fork stays per-message; the ONE D25 checkpoint renders per FINAL-Chats §6.1 (divider
  tooltip + Compact row).
- **The Guide popover** (immersion — the wand rebuilt as a popover with its own steer input) and
  **the Members default-open amendment** (discord — CONTEXT opening docked-to-Members for group
  chats) — both dead under rulings 2 and 1 respectively; recorded here so no future lane resurrects
  them without a ruling.

## 15. The law amendments + open owner questions

**AMENDMENT A — `SECTION_PANEL_DEFAULTS`: chat mode.** Current law:
`chats: { list: "docked", context: "collapsed" }` (`rail-slots.ts` L107–113) as the **boot default**
— the map sets ONLY the boot value, merged `override ?? default` at the `use-shell-layout.ts`
resolve seam (the map's own header says so; nothing is "applied unconditionally"); that header
anticipates a runtime `setPanelMode` seed for state-dependent behavior. Amendment (owner-ruled,
supersedes the two tournament amendments — the discord pitch's CONTEXT-docked-for-groups and the
immersion pitch's solo-focus seed): **the Chats section's un-overridden panel default is
handle-dependent — no chat open (landing) ⇒ the boot map (`list: docked, context: collapsed`); chat
open (draft or committed), ANY composition ⇒ `list: overlay, context: collapsed`.** Mechanism per
LAW 3 (binding — the tier boundary): the ROUTE derives the runtime default from the handle and
passes a domain-agnostic per-section default into the shell; the resolve computes `override ??
runtimeDefault ?? bootDefault`; desktop-only (the mobile sheet fork is untouched); not a runtime
seed — no phantom persisted override; the user's explicit per-panel toggle wins permanently (§4.2
rule 3 untouched). **The ledger amendment explicitly supersedes the `rail-slots.ts` header comment's
anticipated `setPanelMode`-on-commit seed** so the two mechanisms never coexist; update that header
when the amendment lands.

**AMENDMENT B — D44 decision (1): un-defer per-chat theming for the scene atmosphere.** Current law
(`Core-Path-Registry-D44-D52.md`, D44 decision 1): theming scopes = global + per-character;
per-persona/**per-chat DEFERRED**; resolution order `character > global > default` "built to accept
them later." Amendment (owner-ruled 2026-07-09 — the LAW 4 precedence adjudication): **per-chat
gains ONE scope instance, the host-set scene atmosphere (§7.3/R2), slotted UNDER character:
`character > chat atmosphere > global > default`** — exactly the "accepts them later without
rework" seam the deferral reserved. Per-persona stays deferred; no other per-chat theming surface is
sanctioned by this amendment. R2 (the `setChatTheme` ask) and every atmosphere-shaped client piece
block on this row landing in the ledger.

**Open owner questions (decide before or during Wave 3/4; each has a designed default):**

- **Q1 — RESOLVED (owner ruling 2026-07-09: default to the neo-tavern model).** Neo had NO
  own-input steer anywhere: per-member row = unsteered Force (`group-roster-panel.tsx` L192–210);
  steer text = the composer, with the Speak-As selection threaded into Guided Response ONLY
  (`composer-guided-row.tsx` L98). Adopted: the respond-with-direction popover is NOT built; the
  wand's Guided response gains the target submenu (§6.4); the composer is the app's only steer
  input (§13 pain-point 13).
- **Q2 — the `previewInvite` atmosphere rider (§8; immersion §8 item C).** Should the invite preview
  render inside the room's clamped atmosphere (host-authored room chrome, not identity), or stay
  atmosphere-free? Not built until ruled; either answer leaves R2 intact.
- **Q3 — default `appearance.chatStyle` for fresh installs (immersion §8 item B, carried as a
  record).** Theming-axis defaults are owner territory (UI-Theming §12.1). Default answer: no change
  (`bubble`, `use-chat-style.ts`).

## 16. Future-proofing seams (assume; do not build)

The three chat-owned registries (FINAL-Chats §14: `CHAT_SURFACE_SLOTS` · `CHAT_CONTEXT_SLOTS` ·
`TOOL_RENDERERS`, wired at `main.tsx`, land with their first consumer) absorb every wing set:

- **crew** → a `CHAT_CONTEXT_SLOTS` tab (keeper/director/auditor status, host-only) +
  `message-footer` proposal chips.
- **automation** → server-side v1; `/`-commands take the `composer-leading` slot (the prefix is kept
  free).
- **tool-use** → `TOOL_RENDERERS` `<details>` fallback block (T7).
- **expressions** → a `thread-flank` sprite stage riding the declared `{type:"expression"}` ephemeral
  member (schema landed, not yet emitted — the same precedent S1 reuses).
- **rpg** → flank HUDs + composer-leading dice/GM affordances + game-panel `CHAT_CONTEXT_SLOTS` tabs
  beside Members + \~24 `TOOL_RENDERERS` chips; the GM seat reads in the Members panel.
- **hub** → not a chat-tab concern (own browse/import surface).
- **databank** → `{{databank}}` is assembly-side; a chat-documents surface would be a CONTEXT tab
  beside Lore.
- **buddy-observer** → per-user ambient stream; topbar/rail affordances, never thread rows.
- **agent-principal** → `chat.seatAgent` (on the service, L250, dark) + the `agent` kind → an agent
  seat renders as a Members People row (crown-eligible); attribution KIND-READY.
- **saved-rosters** → the preset picker rides the J2 picker + an "Add party…" Members row;
  `applyToChat` drives existing roster verbs.

## 17. Risks & open items

1. **Chat mode changes the default posture for every user** — the LIST is no longer docked beside an
   open chat. Mitigations are structural: the overlay is edge-reachable (the clamp), per-panel
   overrides persist per §4.2 rule 3 (one toggle restores a docked LIST forever), and the landing keeps
   the docked finder. Verify with a side-eye pass that the overlay affordance is discoverable at both
   pointer types.
2. **R1 deferral** costs the pip/divider and §9.3; recency emphasis + §9.1/§9.2 still deliver a
   credible dual-device story. The ask is scoped to its cheapest shape (one column, one verb, one
   denorm, one emit through an existing event).
3. **The Members Menu-as-canonical-home** costs keyboard users an open per action (3 gestures for
   mute). Accepted for one-home coherence + coarse-pointer density; the named escape hatch is a
   single-key accelerator on the focused row (M = mute) if playtest demands it.
4. **Atmosphere vs member autonomy** — a host staging another member's reading surface. Shipped
   mitigations: the clamp (no injection surface), display-only tokens, the device-local opt-out, and
   LAW 4 (a solo character's look is never overridden).
5. **The spectator-ghost checkpoint** (§9.2) is mandatory — the live-spectate claim is
   wiring-verified, not run-verified; the named late-attach seed fix is client-side if needed.
6. **The wand gate drop** assumes the kit guided template no-ops on absent `input` — verify (one test)
   before deleting the gate; add the kit guard if not.
7. **@-token in canon** — owned (§6.4): plain-text render, honest copy, no-token alternatives beside
   it. Residual: discoverability of the no-token path; acceptable (the token path is visible, not
   harmful).
8. **The variant tray vs the swipe strip** — one control, two depths (step vs browse). If playtest
   muddies, demote the tray to the row ⋯ menu ("Browse variants…") — same verbs.
9. **Composing-signal noise in big rooms** — throttled, capped copy ("N people are writing…"), and
   severable by design.
