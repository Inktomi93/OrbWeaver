# Pitch — DISCORD-LIKE: community-chat grammar over the built room system

```
kind: tournament-pitch (Designer B — DISCORD direction)   status: REVISED (round 2, final)
scope: the Chats section — LIST · CONTENT (landing/room) · CONTEXT — per BRIEF §5.
lens: community-chat idioms (unreads · member list · presence · hover-actions · jump-to-present)
      mapped onto Orbweaver's real domain (chats · casts · personas · characters-as-members · context
      curation), exploiting the familiarity where it FITS and adapting honestly where it doesn't.
revision: addresses CRITIQUE.md §2 (D-M1..M4, D-m1..m4) + §4.2 shared defects + BRIEF §4 (amended)
      and §4b (owner steers). Changes: the Members-panel keyboard interaction contract (D-M1); the
      dual-device design + reward-zone claim on the read-state ask (D-M4, §4b); an explicit steering
      position with two right-sized steals (D-M2, critique §4.3); the @-mention-in-canon paragraph
      (D-M3); the roster-size disclosure inventory (§4b); fork's multi-human confirm copy
      (FLAG[fork-humans]); gesture-symmetric click counts; accent-budget fix; listInvites framing
      corrected; the amendment-mechanism divergence named; FIX-wave blocking map.
grounding: every code/verb claim cites a path or a FINAL-Chats § (verified on disk 2026-07-09,
      re-verified against the critique's receipts before this revision).
```

> **Summary.** Orbweaver already built the two hardest pieces of a community-chat product — a
> **multi-human room system** (invites · host authority · membership lifecycle · a durable notification
> inbox, all domain-complete and transport-dark, FINAL-Chats §8) and a **presence strip + member panel**
> (the cast bar `chat-cast-bar.tsx` + the Roster tab `roster-panel.tsx`). Today they read as *config
> surfaces on a tool*. Discord's grammar is the cheapest way to make them read as *a place* — and the
> same grammar's read-state spine is the cheapest way to make **same-user-on-two-devices** feel
> first-class (BRIEF §4b's stated product goal). This pitch does not add a Discord skin; it finishes
> the community-chat product the server already is.

---

## 1. Vision (one page)

**Thesis: turn the Chats section from a document you operate into a room you re-enter.** The current tab
is excellent machinery — a bus-driven room, a state-machine turn lifecycle, a five-tab config panel — but
its *emotional* register is "editor." Discord's register is different: you *drop back into* a place that
kept living while you were gone, you see *who's here*, you notice *what you missed* — on whichever device
you pick up — and you *jump to the present*. Millions already have that muscle memory. We borrow the
muscle memory, not the chrome.

**Who it serves.** Three readers, one grammar:

- **The solo RP reader (Sam)** — 1:1 with a character. The DM register: quiet, avatar-led, the member
  panel stays away, the transcript is the whole world. **Solo chats show zero group machinery** (§2.5).
- **The group-chat host (Riley)** — a cast of characters + maybe a friend or two. The small-server
  register: a member list that shows who's muted / who's the host / who's generating, actionable rows,
  an invite link to share. This is where Orbweaver's built multi-human differentiator becomes *legible*.
- **The two-device user (Casey)** — reads on the phone over lunch, resumes at the desk. The register
  Discord nailed and no local-first RP app has: **read-state and recency that reconcile across devices**,
  because they live server-side, not in a device's localStorage (§4 flow F, §7).

**Why it beats the current tab.** The current tab is *correct* but *flat* — every chat in the LIST looks
equally recent, the member panel is buried behind a CONTEXT tab, presence is a read-only strip you can't
act from, and "what changed since I left" is answered only by a relative timestamp — *per device*.
Discord solved all four (unread state, visible members, actionable presence, jump-to-present) and taught
a generation to expect them. We map each solved idiom onto a real Orbweaver noun — **and we REFUSE the
idioms that fight our domain** (§6): guild/channel nesting (one world of facets, not servers), treating
AI characters as users (they're first-class *seats*, not principals until D60), presence-dots for
characters (no such data axis — we paint only the live states we truthfully have), and Discord's total
absence of a context-curation surface (our Preview tab has no Discord analog and stays front-and-center).

The wager: interaction cost holds or beats FINAL-Chats §10 (§5 proves it, gesture-symmetric), the house
laws hold (one-directional flow, the anti-chase reader taxonomy, @orb/ui primitives, the a11y bar —
including a fully specified keyboard model for the flagship, §3.1), and the room *feels inhabited and
continuous across devices* instead of *operated per device*.

---

## 2. The composed screen(s) — region by region

The shell is fixed law (`UI-Architecture-and-Layout.md` §4.1): **RAIL · LIST · CONTENT · CONTEXT**. I add
**zero regions** — Discord's own anatomy already maps onto the four (D62 §4.2 makes that mapping LAW).
The one structural move is a **defaults change** (CONTEXT for an active *group* chat opens to the member
panel), filed as a law amendment in §8. §2.5 carries the roster-size disclosure inventory (§4b).

### 2.1 RAIL — unchanged

The rail (`features/app-shell/lib/rail-slots.ts`) is Discord's server rail with different nouns: facets
of one world, not separate guilds (D62 §4.2). `Chats` is one icon among the five built sections
(`SECTION_IDS`, `state/shell-store.ts`). **I do not touch the rail** — a per-chat rail (Discord's guild
list) is exactly the cargo-cult I reject (§6). The one Discord-rail element I want lives at the
**topbar**: the notification **bell** (§4 flow D-4) — notifications are per-USER and cross-section, so
the topbar is its home, matching FINAL-Chats §8.4.

### 2.2 LIST — the channel sidebar, re-registered as an inbox

Built today (`chat-list-surface.tsx`): micro-caps "Chats" header + ghost `+` → search
(`useDeferredValue` over `filterChats`) → `ListRow`s (hue-seeded initials avatar · title · participant
names · mono relative time) + per-row kebab (`chat-list-row-menu.tsx`: rename/star/archive/delete). It
paints selection off the `activeChatId` prop and only writes `onSelect` — already §5.1-clean. **Keep the
plumbing; re-register the visual grammar to "inbox."**

The idioms that FIT our `ChatSummary` (`domain/chat/contract/views.ts` L47–71 — `parentChatId`,
`lastMessageAt`, `messageCount`, `participantNames`, `participantCharacterIds`):

- **Header row** — kept: micro-caps "CHATS" + persistent compact search + `+` → the built J2 picker.
- **Filter chip row** (FINAL-Chats §4 CREATE A): **All · Starred · Archived** — mirrors the character
  library's chips; `listChats({includeArchived:true})` exists. Archived collapses under a tail
  disclosure. No tag filter (chats have no tags — deliberate).
- **The row — the inbox register.** `@orb/ui/list-row`: leading = **`AvatarStack`** of the cast; title =
  `title` (participant-name fallback); **subtitle = the last-message preview**; trailing = mono relative
  time + a quiet `GitFork` micro-icon on fork rows (`parentChatId != null`). Preview + real avatars need
  **FIX #3** (`lastMessagePreview` + `participantAvatarHashes` — FINAL-Chats §12 FIX #3, a sanctioned
  denorm pass); until it lands, the built participant-name subtitle + initials stack stands. No
  fabrication.
- **Unread emphasis — the honest split** (kept from round 1; the critique's "model example of server-ask
  honesty," now claimed as a §4b asset rather than apologized for — see §7):
  - **Ships now, zero server cost:** *recency emphasis* — rows touched since the session opened render
    with a **title weight + foreground step** (not accent — fixing D-m1: N accent ticks on a busy inbox
    would breach the ≤10% accent rule, D62 §4.3 rule 9). The **single most-recent row alone** carries a
    small accent left-edge tick. Derived purely from `lastMessageAt` ordering.
  - **The reward-zone ask (§7):** *true unread* — a per-member `lastReadSeq` + `unreadCount` on the
    summary → the genuine unread pip, **reconciled across devices** (§4 flow F). I do NOT fake it
    client-side: a localStorage "last seen" lies across devices and violates the sync law
    (`UI-Theming-and-Content.md` §12.1) — and per the amended BRIEF §4, a server ask that serves
    dual-device is a *feature of the pitch*. This one is the tournament's most direct dual-device spine.

Deliberately **unpaged / client-filtered** — `listChats` returns the caller's whole membership (bounded,
FINAL-Chats §4). Plain suspense read, not `createCollectionSurface`.

### 2.3 CONTENT — the room, tuned to "you just walked in"

One composed pane, built today (`chat-room-surface.tsx`): `[ cast bar | thread | selection bar |
composer ]`, wrapped in the solo-chrome `ThemeScope` (true-solo → that character's theme takes the room;
any other composition keeps the viewer's — derived from roster composition, never `if(isGroup)`). Every
behavioral contract in FINAL-Chats §6 is kept; the re-registrations:

- **The identity header (topbar, `chat-header.tsx`)** — committed → `AvatarStack` + title + a
  **member-count chip** + the ⋯ options menu (`chat-options-menu.tsx`); draft → founding cast avatars +
  first character's name, no menu. The count chip becomes a *button* toggling the CONTEXT member panel —
  Discord's "show member list" toggle, mapped onto our closable CONTEXT. This is also the flagship's
  degradation path if the §8 amendment is rejected (1 click instead of 0).
- **The cast bar (`chat-cast-bar.tsx`)** — kept exactly: read-only glance chips (avatar + name, muted
  dimmed `opacity-50`), size-gated `null` at ≤1 character, host-only `+` → `AddMemberPopover`. The bar is
  the always-visible glance; the Members panel is the actionable detail — a deliberate two-surface split
  (glance vs act). Gains human chips after the People section lands (FINAL-Chats §8.3).
- **The thread** — built end-to-end (visuals = the immersive FINAL's law). The additions, all
  composition over built primitives:
  - **The unread divider** — a second quiet rule beside the built context-boundary divider
    (`resolveContextBoundaryMessageId`): **"New since you left"**, anchored at the viewer's
    `lastReadSeq` **snapshotted at room-entry** (a render derivation per `sessionKey` — the live value
    advances as you read, but the divider must not chase itself away mid-read; it recomputes on next
    entry, Discord's exact behavior). Renders only once the §7 read-state ask lands; until then it
    simply doesn't exist (no dead chrome).
  - **Jump-to-present** — a floating pill above the composer when the viewport isn't pinned to the tail,
    with an optional "N new" count. Pure consumption of the built seal handle: `isAtEnd()` +
    `getDistanceFromEnd()` + `scrollToEnd()` (`packages/ui/src/primitives/message-list/message-list.tsx`
    L78–90 — whose own comment anticipates exactly this "'N new messages' readout; the feature composes
    the copy, threshold, and badge/button"). Zero new state.
  - **Hover actions** — already built (`message-actions-row.tsx`: Edit · Hide-from-AI · Fork · Copy ·
    Delete; keyboard parity via `:focus-within`, always-on at coarse pointer). Kept; plus the FINAL-Chats
    §6.3 Undo/Redo-continue rows on eligible tails (needs the `undoContinue`/`revertContinue` exposure,
    §7). **Fork stays a PER-MESSAGE action** (§4b steer 1): it anchors to a row's `seq` and fires
    `chat.forkChat({throughSeq})` — I pitch no checkpoint system. **New (shared-defect fix): in a room
    with more than one HUMAN, Fork gets an AlertDialog confirm whose copy states the server's real
    semantics** — `verbs/fork.ts` L12 `FLAG[fork-humans]`: other human participants are NOT copied; the
    forker becomes sole host of a private copy. Copy: *"Fork from this message into a private copy?
    Other people in this room won't be carried over — you'll be the host."* Solo/characters-only rooms
    keep today's confirm-free fork (disclosure scales with what's at stake, §2.5).
  - **The variant tray (steal from the Immersion pitch, critique §4.3 — register-compatible: Discord
    users know hover galleries).** The tail swipe counter, on hover/focus/Enter, opens a small gallery
    tray of that message's variants — read via `listMessageVariants`, pick via `selectVariant` (both
    EXPOSED, `routers/chat.ts` L73–132). Per-variant **"Fork from this variant"** is the honest
    **two-verb sequence** the critique pinned (I-M3): `selectVariant` first, then
    `forkChat({throughSeq})` — fork copies the *selected* variant pointer (`verbs/fork.ts` header), so
    selecting is not optional. Same fork-humans confirm copy applies. One component, no new verbs.
  - **Membership events as system dividers** — FINAL-Chats §8.2/§13 already specs them ("X joined",
    quiet, sentence-case, never toasts-over-transcript). Kept verbatim — it is already this register.
- **The composer (`composer.tsx`)** — one pill: WAND (guided steer) + SPEAK-AS on the left, Send⇄Stop
  morph off `useTurnPhase` on the right. Kept. Plus:
  - **`@`-mention autocomplete** — typing `@` opens a roster Combobox (`@orb/ui/command` seal) that
    inserts the literal `@Name` the arbiter already hard-parses from HUMAN send text
    (`engine/select-speakers.ts`; FINAL-Chats §7 — longest-name-first, AI text never forces). No new
    verb; the invariant holds (the autocomplete only sugars human input; the server parse is unchanged).
  - **The @-token lives in canon — owned, not hidden (D-M3).** The inserted `@Name` is SENT and
    PERSISTED as message content (the parse runs server-side over the stored human post,
    `verbs/turn.ts` L514) — it lands in the transcript and in the assembled prompt, i.e. meta-text
    inside the fiction. The sent row renders it as **plain text** — a styled chip would make the
    rendered message diverge from the stored string (D26: one content home; the render must not lie
    about canon). The autocomplete's footer says it out loud: *"@Aria appears in your message."* A user
    who wants to summon *without* leaving a token in the fiction uses SPEAK-AS or the Members-panel
    "respond with direction" — both fire `generate`, which posts nothing (§3.3). Two tools, honestly
    labeled.

### 2.4 CONTEXT — the member panel + the config tabs

Built today (`chat-context-panel-surface.tsx` + the draft twin): tabs **Overrides · Roster · Group ·
Preview · Injections**, host/group-gated; the `contextTab` shell seam (a domain-agnostic
`string | null`) drives tab jumps. D62 §4.2 maps CONTEXT to Discord's Members panel — "detail + config
of CONTENT's active artifact. Closable; never navigation."

- **The member panel is the DEFAULT face of CONTEXT for an active *group* chat.** The Roster tab
  already IS a member list (`roster-panel.tsx`: mute · talkativeness · force-turn, host-gated), and
  FINAL-Chats §8.3 adds a **People** section (humans) above the character Cast in that same tab (one
  tab, two groups — both are "who's in the room"; the FINAL explicitly refuses splitting them). I
  **rename the tab "Members"** and make it the tab CONTEXT opens to when a group chat is active —
  the defaults change filed in §8. Full anatomy + the keyboard contract: §3.1.
- **Overrides · Group · Preview · Injections** — kept exactly (inline CONTEXT tabs, never a settings
  modal — FINAL-Chats §11.7). **Preview is the non-Discord superpower**: Discord has no "show me the
  assembled prompt" because Discord assembles no prompts. The `previewAssembly` trace (override
  sources · fired sections · world-info in/dropped · token estimate) stays first-class.
- **Lore (FINAL-Chats §12 CREATE C)** — chat-scoped world books, one new host-write/member-read tab.
  Needs the dark `worldInfo.attachToChat/detachFromChat/listForChat` exposure (§7).

**Density & hierarchy.** Chrome quiet, content loud (rule 9): the transcript is the hero (reading column
capped at `--width-shell-content`); accent ≤10% (Send + the context-boundary rule + speaker color own the
budget). The member panel uses `list-row` density, mono for counts/weights; the host crown and muted-dim
are the only loud marks. Focus mode (both panels collapsed) stays first-class — every room affordance
remains reachable with panels gone (FINAL-Chats §13).

### 2.5 Roster-size progressive disclosure — the full inventory (§4b, owner steer)

The rule, stated once and applied everywhere: **group machinery reveals only when the roster has more
than one member of the relevant kind, and hides for solo — derived from composition
(`resolveIsGroupChat`, `participants.length`), never an `if(isGroup)` flag** (D16; FINAL-Chats §11.2).
The inventory below audits every group control against the owner-designated neo-tavern reference
(`neo-tavern/src/shared/settings/group-config.ts`) + the built Group tab (FINAL-Chats §7), and says
where each lands in this design and when it reveals:

| Control (neo-tavern reference inventory) | Home in this design | Reveal rule |
| - | - | - |
| Output mode: narrator ⇄ per-speaker (whole-object DU rebuild) | Group tab (kept, `group-config-form.tsx`) | hidden at roster ≤1 character |
| Turn policy ×5 (`natural`/`list`/`pooled`/`manual`/`smart`) | Group tab | hidden at roster ≤1 character |
| `speakerTags` (default coupled to output) | Group tab | hidden at roster ≤1 character |
| `groupNudge` | Group tab | hidden at roster ≤1 character |
| `cardScope` merged/scoped + member-card visibility | Group tab → Advanced disclosure | hidden at roster ≤1; scoped-cards row additionally per-speaker-output-only |
| Auto-mode trio (`maxTurns`/`delayMs`/`allowSelfResponses`) + cost warning | Group tab → Advanced disclosure | hidden at roster ≤1 character |
| Per-member mute (passive arbitration exclusion) | Members panel row (menu + inline shortcut) | row exists only when the Cast section renders (≥2 characters) |
| Talkativeness (commit-on-release weight) | Members panel row menu → slider popover | same |
| Force-turn (works on muted — explicit host override) | Members panel row (menu + inline shortcut) | same |
| Add member / roster order | cast bar `+` → `AddMemberPopover` (host); order = roster order consumed by the `list`/`pooled` policies (no reorder control is built — none invented) | `+` host-only; bar itself `null` at ≤1 character |
| @mention summon | composer autocomplete (§2.3) | autocomplete offers rows only when ≥2 characters (a solo chat's one character always responds — the token would be noise) |
| Invite / kick / handoff / leave (humans) | Members panel People section + ⋯ options menu | multi-human installs only (feature-detect, FINAL-Chats §8.1); kick/handoff rows host-only |
| Members-panel default-open | §8 amendment | **group compositions only** — solo keeps CONTEXT collapsed (the DM register) |

**A solo chat therefore shows:** no cast bar, no Members default, no Roster/Group tabs (the built
host-AND->1 gates, `chat-context-panel-surface.tsx` L19–21), no @-autocomplete, no fork confirm — zero
group machinery. Exactly the §4b bar.

---

## 3. Guided interactions (the flagship patterns)

### 3.1 FLAGSHIP — the Members panel (actionable, default-open for groups)

**The bet in one screen.** In a group chat, CONTEXT opens by default to **Members** — a member list
where every row is actionable and shows live state, unifying the three places Orbweaver currently
scatters "who's in the room": the glance cast bar, the buried Roster tab, and the unbuilt People/invite
surface. This is where Discord familiarity does the most work and where the built-but-illegible
multi-human system finally reads.

**Anatomy (top to bottom; all over built verbs unless flagged):**

1. **People** (humans; FINAL-Chats §8.3) — avatar (persona-derived) · handle · **host crown** · "you"
   marker. Host actions per row: **Kick** (`chat.kick`), **Hand off host** (`nominateHostHandoff`, with
   a pending-nomination chip until accepted). A member sees only **Leave** on their own row
   (`selfLeave`; sole-host leave archives — the confirm says so). All dark → FIX #1 exposure (§7).
   Section header carries **"Invite people"** (host) → the mint dialog (§4 flow D). Hidden entirely on
   single-user installs (feature-detect, FIX #2).
2. **Cast** (characters) — avatar · name · a **"responding…" mark** on the character currently
   generating — derived from the turn lifecycle, NOT token deltas: `turnStarted` carries
   `speakerCharacterId` (`packages/contracts/src/chat/index.ts` L672–683), so this is a lifecycle-store
   read; the ghost row stays the ONLY token subscriber (FINAL-Chats §11.4). Actions per row: mute
   (`setParticipantDisabled`; muted dims `opacity-50`), talkativeness (`setParticipantTalkativeness`,
   commit-on-release), force-turn (`forceCharacterTurn`), **respond with direction** (§3.3), view
   character (the cross-section store-action jump, FINAL-Chats §9e). All EXPOSED today.
3. **Presence honesty.** Characters get no online/idle dots — that axis doesn't exist and I don't
   invent it. The only live marks are **responding** (turn phase) and **muted** (roster flag).

**The row interaction contract (D-M1 — the keyboard + coarse-pointer model, fully specified):**

- **One focusable unit per row; one tab stop per panel.** The Members list is a single tab stop with
  **roving tabindex**: ArrowUp/ArrowDown move row focus (crossing the People→Cast section boundary
  seamlessly), Home/End jump, typeahead-by-name. Tab leaves the panel. Each row's accessible name
  states identity + state: *"Aria — character, muted"* / *"Riley — host"* / *"you"*.
- **The per-row Menu is the CANONICAL action home** (rule 10 — same action, same home). **Enter, Space,
  the ContextMenu key, or the row's ⋯ trigger** opens an `@orb/ui/menu` (Base UI Menu: focus
  containment, typeahead, Esc-close for free) carrying ALL of that row's actions with their one
  canonical label + icon each: Mute/Unmute (checkbox item) · **Talkativeness…** (opens an anchored
  popover containing the labeled `@orb/ui/slider` — Base UI slider is arrow-key operable; the value
  commits on thumb release or Enter, preserving commit-on-release semantics) · Force turn · Respond
  with direction… (§3.3) · View character · — separator — · (People rows, host:) Hand off host… ·
  Kick… (destructive, AlertDialog). A member's own row: Leave….
- **Pointer shortcut, not a second home:** on `hover` and `:focus-within`, fine-pointer rows reveal a
  compact 2-action inline cluster (mute · force-turn — the two high-frequency verbs) that *duplicates*
  two Menu items with identical labels/icons (rule 10 compliant: shortcut, not fork). **At
  `pointer: coarse` the inline cluster never renders** — always-on clusters would bloat row height ×N
  members; the row tap opens the same Menu (which is also the ≥44px-floor-compliant touch path).
- **Post-destructive focus rule:** a kick removes the row on the bus echo (`chatUpdated`) — focus moves
  to the **next row** (previous if it was last; the section-header action — "Invite people" / the cast
  `+` — if the section empties). Self-leave navigates (`goToLanding`); the landing owns mount focus
  (gate `surface-a11y-focus`). The roving index clamps to the new list length so focus is never lost to
  `body`.
- **The "responding…" mark is not a live region.** Visual shimmer `aria-hidden`; the state rides the
  row's accessible description ("responding…"), re-read on focus — no `aria-live` chatter every turn.

**Why it's the flagship.** (a) It exploits Discord familiarity hardest — an actionable member list is
*the* Discord gesture; (b) it makes the built multi-human differentiator (invites, host authority,
kick/handoff) legible for the first time; (c) it unifies three scattered surfaces without inventing a
region; (d) it is almost entirely composition over built verbs — the net-new is the FIX #1/#2 exposures
(a sanctioned FIX wave) plus the planned CREATE-B client. **Build order, stated plainly (critique §4.4):
this flagship BLOCKS on FIX #1 (the invite/membership exposure) and FIX #2 (the capability probe); it
is merely *enhanced by* FIX #3 (list denorms), FIX #4 (`listInvites`), FIX #5 (continue verbs), and the
§7 read-state ask.** The Cast half of the panel (mute/weight/force/respond-with-direction) blocks on
nothing — it can ship first on today's router.

### 3.2 Onboarding into a chat — drop back into the room

Cold open → the **landing** (`chat-landing-surface.tsx`, the committed `{kind:"landing"}` handle — the
app never opens on an empty room). Kept verbatim (it already satisfies rule 1), with one tint: the
recent-chats list uses the inbox row (§2.2 — avatar stack + preview + recency emphasis) so "pick up
where you left off" reads like re-opening a DM — including cross-device: the phone session you closed at
lunch is the brightest row on the desktop landing (flow F). `showRecents=false` when the LIST is docked
stays (the docked panel IS the finder).

### 3.3 Steering — an explicit position (D-M2), and two right-sized steals

**Position: steering promotion is real signal — two rivals independently converged on the guided
substrate — but it is not my flagship, and I refuse to make it one.** My bet is membership legibility +
cross-device continuity; a second flagship would blur both. What my register *does* own about steering:
in a community chat you steer by **addressing members**, not by typing command grammar. So I take the
member-anchored slice of the steering value and leave the command-line slice on the table:

- **Steal A (right-sized, from the director convergence): "Respond with direction…"** — a per-member
  steer, entered from the Members-panel row Menu (§3.1) or the cast-bar chip's menu. Opens a small
  anchored popover with ONE labeled steer input; submit fires
  `chat.generate({ speakerCharacterId, guided: { action: "response", input } })` — one existing,
  EXPOSED verb call: `GenerateParams` carries `speakerCharacterId` AND `guided` together
  (`domain/chat/contract/params.ts` L214–218), and `generate` targets `speakerCharacterId ?? primary`
  with no arbitration (the critique's own G-F1 receipts). Posts no meta-text into canon — the clean
  counterpart to @-summon (§2.3). **Two-input rule, stated so a builder doesn't guess (the G-m4 class
  of bug): this popover's steer field is its own input and NEVER touches the composer draft** — unlike
  the wand, which deliberately consumes the composer text (`composer-wand.tsx` header). Two different
  tools: the wand steers *the next turn* using what you already typed; respond-with-direction steers
  *a specific member* from their row. The wand is kept unchanged.
- **Steal B: the variant tray** (§2.3) — the variants/branching story my round-1 pitch lacked, taken
  from the Immersion pitch with its sequencing corrected (selectVariant → forkChat) and the
  fork-humans copy attached.
- **Refused, with the reason on record:** an inline verb-token command grammar in the composer
  (the Greenfield direction-line shape). It is a second flagship's worth of structure (the two-input
  model, discoverability, grammar teaching), and my register's steering idiom is member-anchored
  addressing, not command entry. The `/`-prefix stays free for automation's future `/`-commands (§9).
  If the owner wants command grammar, the Greenfield pitch is where it lives coherently.

---

## 4. Flows (numbered; what the user sees · what verb fires)

Verbs cited are confirmed on `routers/chat.ts` (EXPOSED) or `domain/chat/contract/service.ts` (DARK →
needs the FIX #1 exposure, flagged). Verified 2026-07-09.

**(A) First-run / empty state.**

1. App opens on the **landing**. Hero + Recent chats + character quick-picks (or "Create your first
   character" on an empty library). Two suspense reads (`listChats`, `character.list` — EXPOSED).
2. Every affordance is a callback the route maps to store actions (§5.1 leaf-writer). No dead end.

**(B) Create chat.**

1. Any `+` / ⌘K / landing hero → the built J2 picker (`new-chat-picker-surface.tsx`).
2. Pick N characters (or Blank) → `startNewChat({characterIds})` + `setActiveSection("chats")` +
   `closeModal`. A **draft** mounts: greeting thread + draft CONTEXT twin. All edits are draft-store
   writes (no server row).
3. First **Send** → `chat.startChat` (EXPOSED) carries the whole draft config atomically →
   `commitDraft` promotes the handle **without changing `sessionKey`** (the room must NOT remount
   mid-first-turn — FINAL-Chats §9b/§11.5) → `clearDraftConfig`.

**(C) In-room messaging.**

- **Send** → `chat.send` (EXPOSED; promise spans the turn). Bus: `messageCommitted` (composer clears) →
  `turnStarted` → ghost streams → `turnCompleted`/`turnAborted`.
- **Regen** → tail chevron = `chat.swipe`; off-tip/left = `chat.selectVariant`; ArrowLeft/Right same
  handlers. **Variant tray** (§2.3): hover/focus/Enter on the counter → gallery → pick =
  `selectVariant`; "Fork from this variant" = `selectVariant` then `forkChat({throughSeq})` (+ the
  multi-human confirm, §2.3).
- **Edit** → external `message-edit-draft` store; save = `chat.editMessage` (EXPOSED).
- **Fork (per-message)** → row Fork → (multi-human room: the FLAG\[fork-humans] confirm) →
  `chat.forkChat({throughSeq})` (EXPOSED) → `selectChat(newId)`; user-bus `chatsChanged` covers list +
  new chat.
- **Continue-on-empty** → empty draft + assistant tail → Send morphs to "Continue" → `chat.continueTurn`
  (EXPOSED).
- **Steer a member** → Members row Menu → Respond with direction… → type → Enter →
  `chat.generate({speakerCharacterId, guided})` (EXPOSED).
- **Jump-to-present** → the pill (off `isAtEnd`/`getDistanceFromEnd`) → `scrollToEnd()`. No verb.

**(D) Multi-human — invite → join → host actions.**

1. **Mint** (host): ⋯ → "Invite people…" → Dialog (interrupt, not a tab): Share-link ⇄ Invite-by-handle,
   optional expiry/max-uses → `chat.createInvite` (**DARK** → FIX #1) → raw link shown ONCE + copy
   ("Anyone with this link can join until it expires"). Outstanding-invites list needs `listInvites` —
   see §7 (cheaper than round 1 claimed: the persistence read exists). Until then: mint-only dialog.
2. **Join**: `/join/:token` — a real route (the sanctioned deep-link, FINAL-Chats §8.2) →
   `chat.previewInvite` (**DARK**) preview (room name · host · member count — no roster, no history) →
   Accept = `chat.redeemInvite` (**DARK**) → `selectChat` + `setActiveSection("chats")`. Invalid token =
   one honest "This invite isn't valid" + Go home.
3. **Host actions** (Members panel, §3.1): Kick → AlertDialog → `chat.kick` (**DARK**); Leave → confirm
   (sole-host copy: "You're the host — leaving archives this chat for everyone") → `chat.selfLeave`
   (**DARK**); Hand off → `nominateHostHandoff` (**DARK**) → nominee's notification carries Accept →
   `acceptHostHandoff` (**DARK**; chrome re-derives from bus `chatUpdated`).
4. **Notifications**: topbar bell + unread badge → popover inbox (invite: Decline + "ask for the link"
   hint; handoff: Accept/Decline; kick: informational) + Mark all read. `notifications.list` seeds;
   `useNotificationsBus` (new, mirrors `useUserBus`) keeps live; per-row `markRead`/`dismiss`. New slice
   `features/notifications/` (not chat-owned). Feature-detected; single-user hides the bell.

**(E) Context-panel work.**

1. Open CONTEXT → **Members** default (group) or Overrides (solo/member). `contextTab` seam.
2. Overrides (host, autosave) → `chat.setRoomOverrides`. Injections (per-row autosave) →
   `chat.setChatInjection`/`deleteChatInjection`. Group (immediate whole-object DU rebuild) →
   `chat.setGroupConfig`. Preview (host, read-only) → `chat.previewAssembly`. Lore →
   `worldInfo.attachToChat`/`detachFromChat`/`listForChat` (**DARK** → CREATE C exposure). No save-bar
   anywhere (FINAL-Chats §2).

**(F) Same user, two devices (the §4b product goal — designed, not implied).**

The scenario: Casey reads on the phone at lunch (device A), resumes at the desk (device B). Both
devices are the same authenticated user; both mount `useUserBus` once at the route (`home-page.tsx`)
and attach the per-chat SSE only for their OPEN chat (`chat.streamMessages`).

1. **Live turn, both rooms open.** A sends in room X → the per-chat bus delivers
   `messageCommitted`/`turnStarted`/deltas/`turnCompleted` to EVERY attached member stream — B's thread
   streams the same ghost lifecycle in real time. **Built today**; this design claims and preserves it
   (nothing I add subscribes to token deltas — §3.1 presence reads lifecycle only).
2. **Activity elsewhere.** B is on the landing or another section → the user bus fans
   `chatsChanged {chatId}` (`packages/contracts/src/user-bus/index.ts` L41–55) → the ONE invalidation
   seam refreshes `listChats` (FINAL-Chats LAW 2's user-bus row) → B's LIST reorders and the recency
   emphasis moves. Built today.
3. **Read-state reconciliation (the §7 ask — the new piece).** A reads room X to the tail → the client
   fires `chat.markRead({chatId, seq})`, **debounced to at most once per turn settle**: it fires only
   when the viewport is pinned (`isAtEnd()`) AND the tail seq exceeds the last known `lastReadSeq` —
   room-open-at-tail, scroll-to-tail, and new-message-while-pinned all funnel through the same guard.
   The server stamps `chat_participants.lastReadSeq` and **fans the existing user-bus member
   `chatsChanged {chatId}`** (no new event type — the invalidation row that refreshes `listChats`
   already exists, so the client half is zero new wiring) → B's unread pip for room X clears within one
   bus round-trip, and B's "New since you left" divider (anchored to the seq snapshot taken at B's OWN
   room-entry, §2.3) is untouched mid-read — it reconciles on B's next entry.
4. **Notifications follow the user, not the device.** The inbox is per-user durable with resumable SSE
   (`routers/notifications.ts` — replay-from-`lastEventId`); accept a host-handoff on the phone → the
   desktop's room chrome re-derives from the bus `chatUpdated`. Server-built; my bell client (flow D-4)
   is deliberately a THIN view over it so the cross-device property is inherited, not re-implemented.

What this buys, concretely: the phone-lunch session leaves the desktop **already reconciled** — the
LIST shows what you read (pip cleared), what you didn't (pip lit), and where you left off (the divider)
— with zero per-device state. That is the §4b "same-user-on-two-devices feels first-class" bar, and
read-state is the only piece of it that wasn't already server-side.

---

## 5. Click economy (top tasks — today vs this design)

Baseline from FINAL-Chats §10. **Counting rule (shared-defect fix): gestures = clicks + keystroke
groups, counted identically in both columns; free-text typing is marked "+type" on BOTH sides and never
comped.** Nothing regresses; wins concentrate where the member panel and read-state land.

| Task | Today | This design | Note |
| - | - | - | - |
| Cold → resume last conversation | 1 | **1** | landing/LIST row; ⌘K — kept |
| New chat with a known character | 2 | **2** | `+` → pick — kept |
| Send → read the reply | 0 extra | **0 extra** | optimistic lifecycle — kept |
| Reroll the last reply | 1 | **1** | chevron / ArrowRight — kept |
| Pick a specific earlier variant | k (chevron-step k times) | **2** | tray: open (1) + pick (1) — steal B |
| Mute a group member | 2 (open Roster tab → toggle) | **1** pointer (inline shortcut) · **3** keys (row → Enter → item) | panel default-open removes the tab-open click; keyboard path counted honestly |
| See who's in the room + state | 1 (open Roster tab) | **0** (group) | default-open panel — glance |
| Summon a specific character | 2 (SPEAK-AS open + pick) + type msg | **2** (`@` + pick) + type msg | same gesture count; hands never leave the keyboard; token-in-canon tradeoff owned (§2.3) |
| Steer a SPECIFIC member's next reply | not directly available (wand steers the flow, not a target; SPEAK-AS targets without steer) | **2** + type (row Menu → item → type → Enter) | steal A — new capability, typing charged |
| Invite someone (host) | n/a (dark) | **3 gestures** | ⋯ → Invite… → Create+copy (FINAL target) |
| Accept an invite | n/a (dark) | **2** | open link → Accept |
| Jump to present | manual scroll | **1** | the pill (built `isAtEnd`) |
| Know what's unread across devices | not possible (per-device only) | **0** | the pip + divider, server-reconciled (flow F) |
| Stop a runaway generation | 1 | **1** | morphing Stop — kept |

---

## 6. Kept vs replaced (honest demolition inventory)

**KEPT AS-IS (verified on disk — extend, never rebuild):** the room composition
(`chat-room-surface.tsx`) · the thread + `MessageRow` + the 8-skin `MESSAGE_ROW_SKINS` table
(`lib/message-row-variants.ts`) · ghost row · swipe strip · edit-in-place · `message-actions-row.tsx` ·
the composer + WAND (unchanged, incl. its consume-the-draft steer model) + SPEAK-AS · the cast bar
(`chat-cast-bar.tsx`) + `AddMemberPopover` · the landing · the LIST plumbing + row kebab · the J2
picker · the ⋯ options menu · the CONTEXT panel + draft twin + all five tab editors (dual-mode) · the
active-chat store + KEY DISCIPLINE · the bus stack (`apply-chat-bus-event.ts`, `use-user-bus.ts`,
`invalidation.ts`, `chat-stream.ts`) · arbitration + @mention (`engine/select-speakers.ts`) · opening
policies (`verbs/start-chat.ts`). Every idiom I add is composition over this list.

**RESTYLED (re-register — CSS + copy + small composition, no new seals):**

- LIST rows → the inbox register (avatar stack · preview · weight-step recency emphasis with the accent
  tick capped to ONE row · fork micro-icon · filter chips). Preview/avatars ride FIX #3.
- The Roster tab → renamed **Members**, People section above Cast, default-open for groups (§8), the
  §3.1 row-Menu interaction contract, the "responding…" lifecycle mark.
- The thread → the unread divider ("New since you left") + the jump pill + the variant tray + the
  fork-humans confirm (multi-human rooms only) + the specced membership-event dividers.
- The composer → the `@`-mention Combobox (with the in-canon copy).

**NEW (net additions):**

- `features/notifications/` — bell + popover inbox + `useNotificationsBus` (FINAL-Chats §8.4 CREATE B —
  planned work my direction leans on).
- The invite dialog + `/join/:token` route + the People-section host actions (CREATE B).
- The respond-with-direction popover (steal A) · the variant tray (steal B) · the @-autocomplete · the
  jump pill · the unread divider — five small feature components.

**DELETED:** nothing structural — zero regions, zero tabs (one renamed), zero verbs. FINAL-Chats'
deliberate drops stay dropped. Explicitly **refused** Discord imports: the guild rail · channel nesting
· reactions (v1) · voice · presence-dots for characters · composer command grammar (§3.3 — on the
record with reasons).

---

## 7. Server asks

Framing per the AMENDED BRIEF §4: asks serving **dual-device or multi-human** are a feature of the
pitch; only frivolous asks are charged. Ordered by tier.

**Tier 0 — transport exposures (built verbs, dark; the sanctioned FIX wave — FINAL-Chats §12 FIX):**

- Invite/membership cluster: `createInvite` · `previewInvite` · `redeemInvite` · `revokeInvite` ·
  `declineInvite` · `kick` · `selfLeave` · `nominateHostHandoff` · `acceptHostHandoff`
  (`contract/service.ts` L268–293, DARK). **The flagship BLOCKS on this (FIX #1) + the capability probe
  (FIX #2).**
- `undoContinue` · `revertContinue` (L179–181, DARK) — FIX #5. `compact` (L185, DARK) — CREATE A.
- `worldInfo.attachToChat`/`detachFromChat`/`listForChat` (built on the world-info service, DARK) —
  CREATE C (the Lore tab).

**Tier 1 — REWARD ZONE (new server work that directly serves the §4b product goals — claimed, not
apologized for):**

- **Read-state: `chat_participants.lastReadSeq` + `chat.markRead({chatId, seq})` + `unreadCount` on
  `ChatSummary`.** THE dual-device spine of this pitch (flow F): server-side read-state is the only
  honest implementation (localStorage lies across devices — the sync law, `UI-Theming` §12.1), and it
  is precisely the class of ask the amended §4 rewards. Mechanics are fully specced in flow F-3: the
  debounced mark-read guard, the `chat_participants` stamp, the fan via the EXISTING user-bus
  `chatsChanged {chatId}` member (no new event type; the `listChats` invalidation row already exists —
  the freshness obligation FINAL-Chats FIX #3 models is satisfied by construction), and the
  divider-anchor snapshot rule. *Cost: one column + one write verb + one summary denorm + one emit
  site.* Degradation without it: recency emphasis carries the same-device signal; the pip and divider
  simply don't render. So the design survives its absence — but per §4b this ask is the pitch
  over-delivering, not hedging.
- **`chat.listInvites`** (host-only read → `InviteView[]`, tokens never re-derivable) — needed for the
  outstanding-invites list. **Corrected framing (D-m2): cheaper than round 1 claimed** — the
  persistence read already exists (`listInvitesForChat`,
  `packages/server/src/domain/chat/persistence/invites.ts` L30); the ask is a contract row + service
  row + router row over a built query. Multi-human-serving → reward zone. Degrade: mint-only dialog.
- **FIX #3 denorms** (`lastMessagePreview` + `participantAvatarHashes`) — already a planned FINAL-Chats
  FIX; shared cost, listed for the build-order map.

**Explicitly NOT asked for:** no new turn/lifecycle behavior, no arbitration changes, no assembly
changes, no presence axis for characters, no new bus event types. @-summon rides the existing mention
parse; respond-with-direction rides `generate`'s existing params; presence rides
`turnStarted.speakerCharacterId`; jump rides `isAtEnd`; the read-state fan rides `chatsChanged`.

---

## 8. Law-amendment asks

One amendment; everything else is within the law.

**AMENDMENT — CONTEXT default-open for active GROUP chats (composition-scoped).**

- **The ruling touched:** `SECTION_PANEL_DEFAULTS` (`features/app-shell/lib/rail-slots.ts` L107–113)
  sets `chats: { context: "collapsed" }`. The flagship wants the member panel visible by default in a
  group room.
- **Why it's barely an amendment:** D62 §4.1's own prose says CONTEXT "defaults collapsed **except
  Chats-with-active-chat**" — the documented intent already wants CONTEXT open for an active chat; the
  built default is stricter. This aligns the built default to the documented one, scoped *tighter* than
  the doc (groups only) to protect solo immersion — a solo chat keeps the collapsed DM register, which
  Discord itself uses (no member list in a DM).
- **Proposed mechanism — and the divergence from the code's own anticipation, named (D-m3):** the
  `SECTION_PANEL_DEFAULTS` header comment anticipates this change as a one-time **runtime seed** ("a
  later chat lane seeds that override via `setPanelMode` when a chat commits"). I propose the cleaner
  shape instead: a **composition-aware default at the existing resolve seam**
  (`use-shell-layout.ts`, `override ?? default`) — Chats CONTEXT resolves `docked` when the active
  chat's roster is a group (>1 character OR >1 human, from the same detail read the room already
  holds), `collapsed` otherwise. No phantom persisted override is minted, the user's explicit
  per-panel override still wins (§4.2 rule 3 untouched), and un-overridden users get the right default
  in every room forever, not just at first commit. **The ledger amendment should supersede the
  rail-slots header comment explicitly** so the two mechanisms don't coexist.
- **If rejected:** the header member-count chip (§2.3) toggles the panel — the flagship costs 1 click
  instead of 0. The amendment buys the last click; it is not load-bearing for correctness.

**No other amendments.** One-directional flow holds (cross-section jumps are store actions;
`home-page.tsx` is the composition reader; no feature→feature imports). The anti-chase taxonomy holds
(the member panel is a MIRROR reader — canonical pointer hook + Query, render-only; gate
`no-effect-on-shared-selection` stays green). @orb/ui primitives only (`list-row`, `menu`, `slider`,
`command`/Combobox, `avatar-stack`, `popover`, `dialog`, `tabs` — all built). Theming axes stay user
settings. The a11y bar holds — now with the flagship's concrete model (§3.1) instead of a cited
principle. Modals stay pickers/interrupts only.

---

## 9. Seams (where each in-the-wings set lands — one line each)

The three chat-owned registries (FINAL-Chats §14; DESIGN-REVIEW §7 #23–25 — wired at `main.tsx`,
unbuilt by design) absorb every set; my design adds no regions and keeps the member panel + thread +
composer registry-extensible.

- **crew** → `CHAT_CONTEXT_SLOTS` (a Crew tab: keeper/director/auditor status, host-only) +
  `CHAT_SURFACE_SLOTS.message-footer` (edit-proposal chips).
- **automation** → server-side in v1; the future `/`-command surface takes the composer's
  `composer-leading` slot — my §3.3 refusal deliberately leaves the `/` prefix free for it.
- **tool-use** → `TOOL_RENDERERS` (the `<details>` fallback block in the thread, T7).
- **expressions** → a `CHAT_SURFACE_SLOTS.thread-flank` sprite stage riding the `{type:"expression"}`
  bus arm; additive furniture, no fought idiom.
- **rpg** → the heaviest consumer: flank HUDs + composer-leading dice/GM affordances
  (`CHAT_SURFACE_SLOTS`) + game-panel tabs beside Members (`CHAT_CONTEXT_SLOTS`) + \~24 event chips
  (`TOOL_RENDERERS`); the GM seat and party read naturally in the Members panel's sections.
- **hub** → not a chat-tab concern — its own browse/import surface.
- **databank** → server-side `{{databank}}` GATHER slot; a chat-documents surface would be a
  `CHAT_CONTEXT_SLOTS` tab beside Lore if it ever gains one.
- **buddy-observer** → a per-user ambient stream; quips surface as topbar/rail affordances, never
  thread rows (buddy is not a room member).
- **agent-principal** → `chat.seatAgent` (already on `service.ts` L250, DARK) + the `agent` participant
  kind → **an agent seat renders as a Members-panel People row** (a real principal, crown-eligible);
  attribution is KIND-READY — the cleanest "a bot that's actually a member" mapping in the app.
- **saved-rosters** → the roster-preset picker rides the J2 new-chat picker ("start with a saved
  party") + an "Add party…" row in the Members panel; `applyToChat` drives existing roster verbs.

---

## 10. Risks & open questions

1. **The read-state ask is now my §4b asset, but it's still schedule risk.** If the owner defers the
   column+verb, the dual-device story (flow F) loses its step 3 — steps 1/2/4 (live rooms, list
   recency, notifications) are already server-side and still tell a credible two-device story, but the
   pip/divider are the memorable half. Mitigation: the ask is small (one column, one verb, one denorm,
   one emit through an existing event) and the fan reuses existing invalidation wiring — scoped to be
   the cheapest possible version of itself.
2. **The Members-panel Menu as canonical home trades one click for coherence.** Keyboard/touch users
   pay Menu-open for every action (3 gestures for mute vs the pointer shortcut's 1). I judge that
   correct (one home, rule 10; coarse-pointer density solved) — but if playtest says the mute toggle
   specifically needs a faster keyboard path, a single-key accelerator on the focused row (M = mute) is
   an additive fix that doesn't disturb the model.
3. **Default-open member panel vs solo immersion** — resolved by scoping (groups only; solo keeps the
   DM register) and by the 1-click degradation if the §8 amendment is rejected. Residual risk: a
   2-character room where the user *wanted* immersion; the per-panel override wins permanently after
   one collapse, which I judge sufficient.
4. **@-token in canon** — now owned explicitly (§2.3): plain-text render, honest copy, and a no-token
   alternative (respond-with-direction) beside it. Residual risk: users who never open the Members
   panel only discover the no-token path via the cast-bar chip menu; acceptable — the token path is not
   harmful, just visible.
5. **"Responding…" presence** — reads `turnStarted.speakerCharacterId` (a lifecycle transition), never
   token deltas; the ghost row stays the sole token subscriber. If even per-turn lifecycle reads prove
   too chatty for the panel, the mark degrades to the tail ghost row only — no new subscriber either
   way.
6. **"Members" as a noun** — size-gated so it only surfaces when there are members to manage; if
   playtest reads it wrong for all-character groups, "Roster"/"Cast" is a one-string change.
7. **Open question — does the variant tray overlap the swipe strip confusingly?** The strip is the
   step-one-at-a-time path; the tray is the see-them-all path (open on the same counter). One control,
   two depths. If it muddies, the tray can demote to the row's ⋯ menu ("Browse variants…") — same
   verbs, one fewer hover affordance.
