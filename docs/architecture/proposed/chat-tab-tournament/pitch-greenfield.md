# Pitch — GREENFIELD (revised): the steering band + read-first context

```
author: Designer A (greenfield direction)   revision: 1 (post-adversarial-review)
scope: the Chats section — LIST · CONTENT · CONTEXT — redesigned from jobs-to-be-done, not from
       prior chat UIs. Buildable on the FINAL-Chats verb inventory except where §7 charges an ask.
reads-against: UI-Architecture-and-Layout §4.1/§4.2/§4.3/§5.1 · UI-Gates §11 · UI-Theming §12 ·
       FINAL-Chats (commit model §2, verb inventory, click economy §10) · BRIEF §4/§4b ·
       CRITIQUE.md §1 (every G-finding addressed inline, marked [G-*]) · neo-tavern group-config
       (/home/inktomi/inktomi-stack/development/neo-tavern/src/shared/settings/group-config.ts —
       the owner-designated group-controls reference)
```

---

## 1. Vision

Every RP chat app is a text box with a filing cabinet bolted to the side. The user's actual job is
not *managing a chat*; it is **steering a scene that talks back** — and doing it from whichever
device they're holding, alone or with other humans in the room. SillyTavern answered "more control"
with more panels. The current tab inherits the panel reflex: config lives in a drawer you visit,
edit, and leave, and the steering machinery Orbweaver *already built* — the typed `GuidedSteer`
channel riding every turn verb (`domain/chat/contract/params.ts` L56–74), the wand dispatch
(`use-guided-actions.ts`), speak-as, force-turn, per-message fork — is hidden behind a dropdown that
requires knowing the composer-text-becomes-steer trick.

The revised design is three moves, sized honestly:

1. **A steering band** — a transient, keyboard-first command surface (⌘.) that promotes the built
   guided substrate into one learnable grammar, plus per-seat menus on the (existing) cast strip and
   a per-message "Branch with a steer". Right-sized: this is a *promotion of verified capability*,
   not a second composer and not a flagship alone.
2. **The read/write split of CONTEXT** — the structural leg. CONTEXT at rest becomes a read-first
   **dossier** (cast · what the model saw last turn · the compaction checkpoint); config *editing*
   consolidates behind one door. The everyday case (glance) costs zero; the rare case (rewrite the
   system prompt) costs one.
3. **Simultaneous live view, made visible** — the §4b leg. Dual-device is LIVE VIEW, not handoff
   (BRIEF §4b): the same chat open on two devices already renders live state on BOTH — the
   per-chat SSE is member-scoped and carries the token deltas themselves
   (`ChatBusEvent {type:"delta"}`, `@orb/contracts/chat` L657), with late-attach ramp-up and
   reconnect replay built in (`replayStreamEvents`/`replayChatEvents`,
   `domain/chat/contract/service.ts` L157–163). That costs **nothing** — the continuity IS the
   bus; this pitch's §4f job is making it conflict-free, and its one charged ask (§7.1) covers the
   piece the bus does NOT give: awareness of rooms you *don't* have open (LIST live pinning,
   cast-strip presence).

Who it serves: the solo roleplayer steers without leaving the keyboard; the group host runs
turn-taking from the seats themselves instead of a tab treadmill; the world-keeper sees what the
model actually saw as an ambient read instead of a forgotten debug tab; the multi-human host and the
two-device user get first-class presence instead of a refresh habit. It beats the current tab by
removing a navigation mode (visit-the-drawer) for the actions done dozens of times an hour — while
leaving the two hardest built systems (the thread/ghost/stream machine, the draft/commit KEY
discipline) untouched.

---

## 2. The composed screen(s)

Four-region shell kept exactly (§4.1 — RAIL nav · LIST finds · CONTENT does · CONTEXT details). No
region added, removed, or merged. The greenfield is inside CONTENT's transient layers and CONTEXT's
composition.

### RAIL — unchanged

The `Chats` icon among the built sections (`rail-slots.ts`). Nothing to build.

### LIST — recency-first, presence-forward

Keeps the built mechanism (`chat-list-surface.tsx`: plain suspense `listChats`, client-filtered,
`useDeferredValue` search — FINAL-Chats §4 says keep it unpaged). Row rework per FINAL-Chats §4's own
CREATE-A list (adopted, not invented): `AvatarStack` (FIX #3 `participantAvatarHashes`; initials
fallback until then) · title · `lastMessagePreview` (FIX #3; server-side `toPlainText`, never raw
markdown) · mono relative time · quiet `GitFork` badge on fork rows (`parentChatId` is on the
summary) · Starred/Archived chips.

**"Live" pinning — honestly powered \[G-M1], justified on live-view terms.** Rows where a scene is
in motion — a turn streaming, another member (or your other device) active — float into a thin
"Live" group at the top with a quiet streaming shimmer. The justification is the LIST's finder job
under simultaneous liveness: the room you have OPEN is already live for free (the per-chat SSE),
but a room you *don't* have open only reaches this device as a post-settle recency reorder (the
landed `chatsChanged` fan). "A scene is streaming right now in a room I'm a member of" is not
derivable — `UserBusEvent` is a coarse ownership fan with no actor or streaming state
(`packages/contracts/src/user-bus/index.ts` L41–55). **Charged as the §7.1 activity fan.** Solo
single-device users never see the group (nothing is ever live but them); zero chrome cost.

Selection paints via the `activeChatId` prop; the surface only writes `onSelect` (§5.1). Unchanged.

### CONTENT — the built room anatomy, plus two transient layers

**The CONTENT anatomy is the BUILT anatomy, kept:** `[ cast strip (committed group) | thread |
selection bar | composer ]` (`chat-room-surface.tsx`) \[G-M4 — the cast bar is now explicitly
accounted for; see below]. Greenfield adds **no standing band**: the previous revision's
between-thread-and-composer hint line is cut per \[G-m3] — a permanently reserved whisper is standing
chrome (rule 9). The steering band is **zero-height at rest**; its teach line lives in the composer
placeholder, which already teaches continue-on-empty ("Message… · ⌘. to steer").

- **The thread** — kept end-to-end (DO-NOT-REBUILD: `MessageRow` + skins, ghost isolation,
  edit-in-place, per-message actions, context-boundary divider, immersive takeover, render trust).
  Three additions, all composition:
  1. **Jump-to-present pill** (stolen from Pitch B per CRITIQUE §4.3 — credited): when scrolled into
     history, a floating quiet pill "↓ Back to now"; rides the built `isAtEnd`/`scrollToEnd`
     imperative handle on the `message-list` seal (`packages/ui/src/primitives/message-list/
     message-list.tsx` L80/L89 — whose own comment anticipates exactly this readout). Zero cost.
  2. **The variant tray** (stolen from Pitch C per CRITIQUE §4.3 — credited): hovering/focusing the
     tail swipe counter blooms a tray of that slot's variants (`listMessageVariants` — id+idx, no
     content bodies; D26), arrow-nav + Enter selects (`selectVariant`), and each row offers
     **Branch from this variant** — which is a *two-verb sequence*, stated so a builder doesn't ship
     the wrong pointer \[I-M3 inherited]: `selectVariant` first, then `forkChat({throughSeq})` (fork
     copies the *selected* variant pointer — `verbs/fork.ts` header). The tray is the mouse-first
     variant power path the steering band deliberately doesn't duplicate. The counter is a real
     button; the tray is a popover with arrow nav (keyboard-complete).
  3. **"Branch with a steer…"** — a named, visible row in the per-message action reveal (replacing
     rev-0's mystery-meat "⌥ from here" \[G-m5]), with full keyboard reach (the reveal is already
     `:focus-within`-parity per the built pattern). It composes `forkChat({throughSeq})` + a
     steered `generate` in the fork. Two facts stated in the confirm UI: **it navigates** (fork is a
     deep copy, D27 — you land in the new chat via the existing `onChatForked → selectChat` seam),
     and **in a multi-human room the fork is a private copy** — see the fork-humans copy rule in §4d.
- **The composer** — kept (`composer.tsx`: one pill, Send⇄Stop off `useTurnPhase`, IME guard,
  clear-on-commit, continue-on-empty per FINAL-Chats §6.4, SPEAK-AS select). The wand dropdown is
  **deleted** — its dispatch hook survives wholesale as the steering band's engine (§3). While a
  steered turn streams, a small dismissible chip in the pill's left cluster shows the active steer
  text (reads `useTurnPhase`, never `isPending` — pain-point 6).
- **The cast strip \[G-M4 resolved]** — `chat-cast-bar.tsx` is **evolved in place, not replaced**:
  same home (above the thread), same read (`ChatDetail.participants` off the warm `getChat` cache),
  same size-gate (renders `null` at roster ≤ 1 — its own header's D16 rule, which IS the §4b
  roster-disclosure rule for this surface), same trailing host-only `+` → the existing
  `AddMemberPopover`. What changes: each seat chip becomes a **focusable button that opens a
  per-seat Menu** (`@orb/ui/menu`) on click, Enter, Space, or the context-menu key — one interaction
  model for mouse, keyboard, and coarse pointer alike. **Hold-to-mute and drag-to-weight are CUT**
  (keyboard-dead, undiscoverable, collide with touch scroll — the critique is right). The seat menu
  carries: View character (cross-section jump) · Summon (steered — opens the band pre-filled with
  `@Name`) · Mute/Unmute (`setParticipantDisabled`) · Talkativeness (a commit-on-release slider row,
  `setParticipantTalkativeness`) · Force turn (`forceCharacterTurn`). Host-only rows render only for
  the host (§8.1 authority model — never a NOT\_FOUND affordance). After §8's People wave, **human
  seats** join the strip (presence dot from the §7.1 fan; crown on host) with their own menu rows:
  View profile · Kick (host, AlertDialog) · Hand off host (host) · Leave (self). Muted members stay
  visible, dimmed — mute is passive exclusion, the member is still in the room (built behavior).

### CONTEXT — the dossier (read-first) + one config door

The structural leg (the critique's "sharpest structural idea — fix its receipts, don't amputate").
CONTEXT splits by frequency of use:

**At rest — the dossier (read-only glance):**

1. **Cast** — the roster at a glance with presence (mirrors the strip; the dossier row adds
   last-active and the member/host role line).
2. **What the model saw last turn** — a compact digest of the *last completed turn's* assembly:
   which override source won, which world-info entries fired/dropped, the context-boundary seq, the
   token estimate. Sourced from the last turn's trace, NOT a live re-assemble — see §7.2 for the
   honest charge. Host sees the full digest; a member sees the boundary + token line only
   (`previewAssembly` is host-only — mirror the gate in render, FINAL-Chats §8.1).
3. **The memory checkpoint \[G-F2 fixed]** — rescoped to the truth: there is exactly **ONE**
   compaction checkpoint per chat, stored as `chats.compactSummary` + `chats.compactedAtSeq` and
   overwritten as it advances (`verbs/compaction.ts` header). The dossier shows that one checkpoint:
   the summary text (collapsed, expandable) + "compacted through message N" + a host-only
   "Compact now…" action (`chat.compact` — the verb is on the service; its thin router row is
   FINAL-Chats §12 CREATE-A work). This matches FINAL-Chats §6.1's own intent ("show the resulting
   checkpoint as the boundary divider's tooltip detail") promoted to a dossier band. **No
   timeline.** A checkpoint-*history* system is the owner-lukewarm separate idea (BRIEF §4b) — this
   pitch deliberately does not pitch it, and per §4b fork stays a per-message action, never
   conflated with checkpoints.

**One door — "Room config":** a single full-height CONTEXT surface hosting the config groups as
sections (not five hunt-through tabs). Every editor is the existing dual-mode PURE `(value, save)`
component re-housed (`RoomOverridesForm`, `InjectionsList`, `RosterPanel`, `GroupConfigForm` —
FINAL-Chats §1's source-agnostic corollary), so this is layout, not editor rework:

- **Cast & turn-taking** (the merged Roster+Group section) — **full inventory \[G-M5 fixed]**,
  audited against the owner-designated neo reference (`group-config.ts`) + the built Group tab
  (FINAL-Chats §7): per-member **mute** · **talkativeness** (commit-on-release) · **force turn** ·
  **add member** (the same `AddMemberPopover`) — then the generation behavior: **output**
  narrator⇄per-speaker (a discriminated-union **whole-object rebuild** on change, never a field
  patch — pain-point 10; the neo schema's `.strict()` narrator arm rejects a stray `cardScope`,
  which is why the rebuild rule exists) · **policy ×5** (natural / list / pooled / manual / smart —
  the 7a arbiter map, help text teaching human-typed `@Name` summoning in sent messages) ·
  **speakerTags** · **groupNudge** · an **Advanced** disclosure: **cardScope** (per-speaker arm
  only) · **member-card visibility** · **auto-mode** (`maxTurns` / `delayMs` /
  `allowSelfResponses`) with the explicit cost warning. Writes: roster rows fire their individual
  verbs; generation behavior fires `setGroupConfig`.
- **Overrides** — the 4-field host allowlist, autosave (`setRoomOverrides`); the author's-note field
  says out loud that it suppresses member `depthPrompt` notes (FINAL-Chats §7).
- **Injections** — per-row autosave, Add/Remove; "off" = delete, no soft-disable (pain-point 10).
- **Lore** — the PD-30 chat-books tab (CREATE-C verbs: `worldInfo.attachToChat`/`detachFromChat`/
  `listForChat` — built on the service, need router rows).

**The §4b roster-size disclosure rule, stated explicitly \[G-M5 / cross-defect 4]:** the **entire
Cast & turn-taking section is hidden at roster ≤ 1** (derived from `participants.length` /
`resolveIsGroupChat` — never an `isGroup` flag, D16), exactly as the built Roster/Group tabs are
host-AND->1-gated today. Same rule for: the cast strip (already size-gated `null` at ≤1 — built),
the steering band's `@` cast tokens (the token class doesn't exist at roster ≤ 1), and the seat
menus. A solo chat shows **no group machinery anywhere**: its Room config door contains Overrides ·
Injections · Lore only. Controls REVEAL as the roster grows past 1 — the section, the strip, and the
`@` tokens all appear together, driven by the same size check.

**Default + focus-mode honesty \[G-M2 fixed]:** the dossier's "ambient" claim requires CONTEXT to be
open, and the built default is `chats: { context: "collapsed" }` (`rail-slots.ts` L108). That is a
law surface (§4.1/§4.2 rule 3) — so this pitch **files the amendment** (§8.1) rather than assuming
it: CONTEXT docks when a chat is active, per the map header's own anticipated runtime seed. And in
**focus mode** (both panels collapsed — immersive-ST is first-class, FINAL-Chats §13) the dossier is
gone by design; it degrades gracefully: the context-boundary divider stays in-thread (built), the
checkpoint stays reachable as that divider's tooltip detail (FINAL-Chats §6.1), and the options-menu
"Room info" row reopens CONTEXT. Nothing in this design assumes a docked panel exists (the landing's
`showRecents` derivation is the model).

---

## 3. Guided interaction — the steering band

**What it is:** a transient command surface for the scene — invoked with **⌘.** or the composer's
quiet steer icon (the wand's replacement slot), rendered as a `@orb/ui/command` popover (cmdk seal:
native arrow-nav, Enter, filter) anchored above the composer. Zero height at rest \[G-m3]. Esc closes
(rule 6). It is a **presentation** of the guided substrate that already exists and verifies on disk:
`use-guided-actions.ts` + the typed `GuidedSteer` (`domain/chat/contract/params.ts` L56–74) + the
router-exposed `generate` / `swipe` / `continueTurn` / `impersonate` / `startChat(opening:"generate")`.

**The grammar — three token classes, every token backed by a real dispatch \[G-M3 fixed]:**

- **Verbs:** `respond` · `reroll` · `continue` · `impersonate` (committed) · `guide the opening`
  (draft — the wand's degenerate arm, `fireOpening`). **`narrate` is CUT** — no backing kind exists
  (`GUIDED_ACTION_KINDS` is `response · swipe · impersonate · rewrite · opening · continue`,
  `packages/contracts/src/preset/index.ts` L180–187, and no narrator-post verb exists; rpg's
  `postNarratorMessage` is an unbuilt future seam). Note for the door, not the grammar: `rewrite` is
  a *declared* kind with **no dispatch path in the domain today** (repo-swept) — when a carrier verb
  lands, it slots in as one more token; v1 does not ship it.
- **Cast:** typing `@` opens the roster as an inline picker (roster > 1 only — the §2 disclosure
  rule). **Mechanism corrected \[G-F1]:** the band resolves the picked seat **client-side** to a
  `CharacterId` and passes it as **`speakerCharacterId` to `chat.generate`** — the exact parameter
  SPEAK-AS already uses (`verbs/turn.ts` \~L886: `speakerCharacterId ?? primaryCharacterId(room)`).
  The band does **not** rely on server-side @mention parsing — `resolveMentionsVia` runs only in the
  **send** path over the stored human post (turn.ts L514), which the band never goes through.
  (Client-side resolution is also simply better here: picker-driven, no name-collision parse. The
  server-side @mention convention still works when typing `@Name` inside a real *sent message* —
  the composer's path, unchanged — and the Group section's policy help text teaches it.)
- **Free-text steer:** everything else is the `guided.input` string, carried on the fired verb's
  typed `GuidedSteer`.

**Steps (committed group chat):**

1. **⌘.** — the band opens; the composer draft is untouched (rule below).
2. `@` → cast picker → pick Aria → `respond` → type `colder, she's hiding something` → **Enter**.
3. Fires `chat.generate({ chatId, speakerCharacterId: <aria>, guided: { action: "response",
   input: "colder, she's hiding something" } })`. Band closes; focus returns to the composer; the
   steer chip shows in the pill until the turn settles (`useTurnPhase`).
4. `reroll — but funnier` → `chat.swipe` on the tail assistant slot (the hook's own
   `tailAssistantMessageId` resolution). `continue — …` → `chat.continueTurn`. `impersonate` →
   person submenu (1st/2nd/3rd) → `chat.impersonate`.

**The two-input rule, stated \[G-m4]:** the steering band **never reads and never clears the composer
draft** — its steer is its own field. This deliberately deletes the wand's composer-coupling (the
wand consumed the composer text as the steer and gated on a non-empty draft — `composer-wand.tsx`
header); that gate is retired with it. A non-empty composer draft when ⌘. fires simply stays put,
and focus returns to it after the band closes. One surface = speak (composer); the other = steer
(band); never both visible as text inputs at once (the band is a modal-layer popover).

**Solo degrades:** no `@` tokens, four verbs — exactly the wand's committed arms, now one keystroke
away and discoverable (the composer placeholder teaches ⌘.). **Draft degrades:** one verb, "Guide
the opening" (forces `opening:"generate"`, carrying the whole draft config atomically —
`resolveDraftCommit`, verified in `use-guided-actions.ts`). **The mouse path never dies** (rule 1):
the variant tray, the seat menus, and the per-message actions are the full pointer-first
equivalents.

**Sizing honesty (the cross-pitch verdict, owned):** the band alone is a promotion, not a flagship —
which is why this pitch pairs it with the CONTEXT split (§2) and the live-view story (§4f + the
§7.1 awareness fan). Together: steer without leaving the keyboard, see what the scene knows without
visiting a tab, and watch the same scene live from every device you own.

---

## 4. Flows

**(a) First run / landing.** Unchanged as-built (`chat-landing-surface.tsx`): committed
`{kind:landing}` handle, welcome hero, recents (≤8, dropped when the LIST is docked — the route
derivation), quick-picks. No verb until an affordance fires a store action (§5.1).

**(b) Create.** `+`/⌘K/landing → J2 picker → pick N (or explicit Blank) →
`startNewChat({characterIds})`. Draft mounts: greeting thread, draft CONTEXT twin (the dossier reads
the draft-config store; the Room config door writes `setDraft*` actions — the same dual-mode
editors), character-first topbar. Nothing is server-side yet; every edit is a draft-store write
carried atomically into `startChat` (commit-model law §2).

**(c) First send.** Send → `chat.startChat` (whole draft config atomic; opening by cast size, or
forced-`generate` when the band's "Guide the opening" fired) → `commitDraft` promotes the handle
**without changing `sessionKey`** (KEY DISCIPLINE — no remount mid-first-turn) → `clearDraftConfig`.

**(d) In-room messaging.**

- **Send:** `chat.send`; bus lifecycle `messageCommitted → turnStarted → ghost → turnCompleted`.
- **Reroll:** swipe chevron/ArrowRight → `chat.swipe`; variant browse → the tray →
  `chat.selectVariant`. Steered: ⌘. `reroll — …`.
- **Edit:** in-place, external `message-edit-draft` store; Enter saves `chat.editMessage`.
- **Branch:** per-message Fork → `chat.forkChat({throughSeq})` → `onChatForked → selectChat`
  (fork is PER-MESSAGE, anchored to a specific message — §4b steer 1, no checkpoint conflation).
  Steered branch: "Branch with a steer…" (§2). Branch-at-a-variant: `selectVariant` → `forkChat`
  (the two-verb sequence, §2). **Fork confirm copy in a multi-human room \[cross-defect 3]:**
  `FLAG[fork-humans]` (`verbs/fork.ts`) — other human participants are NOT copied; the forker
  becomes sole host of a private copy. The confirm says: *"Branches into a private copy from this
  message. Other people aren't carried over — you'll be the host."* Solo rooms show the short form
  ("Branch from this message into a new chat").

**(e) Multi-human (invite → join → host).** Verbs domain-complete + transport-dark; FIX #1 exposes.

1. **Invite:** ⋯ → "Invite people…" (host) → Dialog: share-link ⇄ by-handle, expiry/max-uses →
   `chat.createInvite` → raw link ONCE + copy. Outstanding list rides FIX #4 `chat.listInvites`
   (mint-only until it lands).
2. **Join:** `/join/:token` (sanctioned route #4) → `chat.previewInvite` (name/host/count only) →
   Accept → `chat.redeemInvite` → seated, transcript from `joinSeq`. Invalid = honest leak-free
   state + "Go home".
3. **In the room:** human seats appear on the cast strip (presence dot via §7.1; crown on host);
   host actions live on the seat menu (Kick → `chat.kick`, AlertDialog; Hand off →
   `nominateHostHandoff` → nominee's notification Accept → `acceptHostHandoff`; Leave →
   `selfLeave`, sole-host copy warns it archives). The bell (new `features/notifications/` slice,
   `useNotificationsBus`) carries invite/kick/handoff; the whole surface feature-detects away on
   single-user installs (FIX #2 probe — FINAL-Chats §8.1 law).

**(f) Dual-device = simultaneous LIVE VIEW (BRIEF §4b — not handoff).** Same user, same chat open
on two devices: **both render live state, always.** No pick-up ceremony, no transfer flow, no sync
button anywhere — the continuity IS the bus. What device B looks like *during a stream started on
device A*, and why each piece is free on the built substrate:

1. **The stream renders on both.** B has the room open ⇒ B holds its own member-scoped SSE
   subscription (`chat.streamMessages`), which carries the token deltas themselves
   (`ChatBusEvent {type:"delta"}` wrapping `ChatDeltaEvent` — `@orb/contracts/chat` L592/L657).
   B's chat-stream machine runs the identical lifecycle (`turnStarted → delta → turnCompleted`),
   so B's ghost row streams the same tokens A's does. **Zero new anything.**
2. **Mid-turn open catches up.** If B opens the room mid-stream, the token log replays from a
   cursor (`replayStreamEvents` — "late-subscriber ramp-up", `contract/service.ts` L157) and the
   durable bus log covers reconnects (`replayChatEvents` L163 + `refetchOnReconnect: true`, the
   §6.1 QueryClient defaults). B lands inside the live turn, not on a stale snapshot.
3. **Sends and edits fan both ways.** Any write from either device is an immediate verb emitting a
   bus event (`messageCommitted`/`messageEdited`/…) that both subscriptions receive — LAW 2. Stop
   works from either device: `abort` is turn-owner-gated and both devices are the same principal.
4. **Conflict-free by construction (the design work the zone actually needs):**
   - **Scroll independence:** the `message-list` seal sticks to the tail only when the viewer is at
     the tail (`followOnAppend`/`isAtEnd` — per-device local state); B reading history while A's
     stream lands is never yanked, and the §2 jump pill is the way back.
   - **Composer independence:** drafts are device-local by design (Zustand-persist, §12.1
     persistence law) — two composers never fight; both sends serialize server-side through the
     canon like any two members' sends.
   - **Edit collisions:** edit-in-place drafts are device-local (`message-edit-draft` store);
     saves are server-authoritative immediate verbs, so a concurrent edit is last-write-wins and
     the losing device *sees it immediately* (the bus-refreshed row replaces its view). No locks,
     no merge UI — the collision window is one row and self-announcing. Deliberately not specced
     further; a lock protocol is machinery this direction doesn't need.
5. **Awareness across rooms** (the only charged piece, §7.1): rooms NOT open on this device
   surface in the LIST's Live group while a scene is in motion elsewhere. Cross-device
   *read-state* (the unread pip clearing when the other device reads) is Pitch B's `lastReadSeq`
   ask — complementary, not claimed here.

**(g) Context work.** Glance = the dossier (docked by the §8.1 amendment; 1 click to reopen in focus
mode). Edit = the Room config door: roster/turn-taking writes fire their individual verbs;
generation behavior = `setGroupConfig` whole-object rebuild; overrides/injections autosave; Lore =
the PD-30 trio. Compact = the dossier's host-only "Compact now…" (`chat.compact` + AlertDialog
explaining the checkpoint advance).

---

## 5. Click economy

Gesture-symmetric counting \[G-m1 / cross-defect 5]: typing is charged in BOTH columns; a "gesture" =
click or keystroke-chord. Baseline = FINAL-Chats §10 + the built wand path.

| Task | Today | This design | Notes |
| - | - | - | - |
| Resume last conversation | 1 | 1 | unchanged |
| New chat w/ known character | 2 | 2 | unchanged |
| Send → read reply | 0 extra | 0 extra | unchanged |
| Reroll last reply (unsteered) | 1 | 1 | chevron/ArrowRight, unchanged |
| Reroll **with a steer** | type steer in composer + 2 clicks (wand → item) — and you must *know the trick* | ⌘. + type + Enter (2 keystrokes + typing) | \~even on count; the honest win is keyboard-only + discoverable (placeholder teaches ⌘.), no composer-consumption trick |
| **Steered summon of a specific member** | not possible (force-turn = 2 clicks, unsteered) | ⌘. `@` pick, verb, type, Enter | new capability composition, zero new verbs |
| Browse/select an older variant | n chevron steps | 1 hover/focus + arrows + Enter (tray) | stolen from Pitch C, credited |
| Mute a group member | 2 (CONTEXT Roster → mute) | 2 (seat → menu Mute) | count unchanged; saves the tab visit + works in focus mode |
| See what the model saw last turn | 2 (open CONTEXT → Preview tab) | 0 docked / 1 in focus mode | honest post-\[G-M2] scoring; needs the §8.1 amendment |
| Return to the live tail from history | scroll | 1 (jump pill) | stolen from Pitch B, credited |
| Invite someone (host) | 3 gestures | 3 gestures | unchanged |
| Stop a runaway generation | 1 | 1 | unchanged (Esc ≠ stop, rule 6) |

No FINAL-Chats §10 core-loop target regresses; the wins concentrate in steering, variant work, and
context visibility — plus the steered summon, a capability with no "today" column. Dual-device has
no row at all, deliberately: live view is 0 gestures on both devices by construction (§4f) — there
is no task to count.

---

## 6. Kept vs replaced

**KEPT AS-BUILT (FINAL-Chats §12 DO-NOT-REBUILD):** the room anatomy incl. **`chat-cast-bar.tsx`
and `AddMemberPopover`** \[G-M4 — now explicitly inventoried], the thread stack (rows/skins/ghost/
swipes/edit/actions/divider/trust), the composer core + SPEAK-AS + continue-on-empty, the draft
system + KEY discipline, the bus stack + invalidation seam + chat-stream machine, the LANDING, ⌘K,
the J2 picker, arbitration + @mention-in-send, opening policies, the whole server domain (54+ verbs
incl. the dark invite/membership/notifications surface), and `use-guided-actions.ts` — the band's
engine, reused wholesale.

**EVOLVED IN PLACE:**

- **Cast bar → cast strip:** chips become focusable buttons with per-seat menus (one new menu
  composition; the bar's read, home, and size-gate unchanged). Human seats + presence dots land
  with the multi-human wave + §7.1.
- **CONTEXT:** the five tabs re-house — read halves (roster glance, assembly trace, checkpoint)
  into the dossier; write halves into the Room config door's sections. The five editors are already
  dual-mode pure components (FINAL-Chats §1 corollary) — composition, not editor rework.
- **LIST row:** the FINAL's own CREATE-A rework + the Live group (§7.1-gated).

**DELETED:**

- **The composer wand dropdown** (`composer-wand.tsx`) — replaced by the band; its hook survives.
  The wand's composer-text-consumption model and its non-empty-draft gate are deliberately retired
  with it \[G-m4].
- Rev-0's standing "Direction line" hint band — cut per \[G-m3]; nothing reserves height at rest.

**NET-NEW (client):** the steering band (`components/steering-band.tsx` over `@orb/ui/command` +
the existing hook) · the dossier surface (`components/room-dossier.tsx`) · the Room config door
surface (composing the four existing editors) · the seat menu (`components/cast-seat-menu.tsx`) ·
the variant tray (`components/variant-tray.tsx`) · the jump pill · "Branch with a steer…" ·
`features/notifications/` (inherited CREATE-B scope) · the Live group + presence chips (§7.1-gated).

**Demolition risk stays contained:** the correctness spine (thread/ghost/stream, draft/commit KEY)
is untouched; the largest structural change (CONTEXT re-housing) moves already-pure components.

**FIX-row dependencies (CRITIQUE §4.4 — the real build order, stated):** the steering band and the
variant tray block on **nothing** (every verb router-exposed today; `listMessageVariants`/
`selectVariant`/the guided quartet verified). The dossier blocks on the §7.2 trace-summary ask
(degrades: host runs the existing on-demand Preview read until it lands) and `chat.compact`'s thin
router row (CREATE-A). The LIST rework blocks on FIX #3. Multi-human blocks on FIX #1/#2/#4
(inherited Wave B). The LIST Live group + presence dots block on §7.1; the §4f dual-device live
view blocks on **nothing** — it is the built bus, verified.

---

## 7. Server asks

Post-§4b posture: the two asks below are the pitch's *investment* in the stated product goal
(dual-device + multi-human), not apologized for. Nothing else is asked — every steering/config/
variant interaction runs on router-exposed verbs verified on disk.

**7.1 The activity fan on the user bus (S–M — re-scoped to live-view terms; \[G-M1]+\[G-M6]).**
First, what is deliberately NOT asked: nothing for the same-chat-on-two-devices case — the built
per-chat SSE already delivers full simultaneous live view (§4f steps 1–3), and no "open elsewhere"
header chip is added (with live view, both devices render identically; a chip saying so is
decoration — cut). The ask covers only what the bus cannot reach: **rooms not open on this
device.** One new user-bus event family through the existing `emitUserEvent` chokepoint:
`{ type: "chatActivity"; chatId; kind: "turnStarted" | "turnSettled" | "viewerActive" }` (exact
shape at build; the union + coverage-ratchet pattern exists — `USER_BUS_EVENT_TYPES` +
`user-bus-coverage` gate; no deviceScope field — activity is activity, whoever's device it is).
Emit sites: the turn lifecycle already emits chat-bus events at exactly these moments (compose the
user-fan beside them); `viewerActive` rides the per-chat SSE subscription's own attach lifecycle,
debounced. Powers: the LIST Live group + streaming shimmer (a scene in motion in a room you're a
member of but don't have open — multi-human AND your-other-device alike) · cast-strip human
presence dots (who's watching the room now — multi-human). Fan-out bounded by present members (the
`chatsChanged` fan's precedent). Degrade: without it, the Live group and presence dots don't
render; **nothing else in the pitch depends on it** — the §4f live view is free either way.

**7.2 The last-turn trace summary (S).** The dossier's "what the model saw" digest should read the
*last completed turn's* trace instead of re-assembling per render (`previewAssembly` assembles on
demand — fine as a debug read, wrong as an ambient one). Ask: carry a compact
`AssembleTraceSummary` (winning override source · fired/dropped WI names · boundary seq · token
estimate) at turn completion — either a field on the existing `turnCompleted` bus payload or a small
host-gated read keyed by chat. Degrade: the dossier shows the boundary + checkpoint (both free
today) plus a "Preview next turn" action running the existing on-demand read.

**Consumed from the already-sanctioned FINAL-Chats ledger (not new asks):** FIX #1
(invite/membership exposure) · FIX #2 (capability probe) · FIX #3 (LIST denorms) · FIX #4
(`listInvites`) · FIX #5 (`undoContinue`/`revertContinue`) · CREATE-A's `chat.compact` router row ·
CREATE-C (the PD-30 lore trio).

**Hardening note, reframed \[G-m2]:** the guided wire is `z.any()` on the router (`routers/chat.ts`
L64/89/96…) while the domain contract is already the closed, typed `GuidedSteer` (params.ts L56–74).
The band makes the steer a headline surface, so this pitch **asks for the zod wire schema** (XS —
`guidedSteerSchema` from the existing `guidedActionKindSchema` + placement/person) rather than
fearing a tightening. The type exists; the wire should match it.

---

## 8. Law-amendment asks

**8.1 `SECTION_PANEL_DEFAULTS` — Chats CONTEXT docks when a chat is active \[G-M2].** The map
(`rail-slots.ts` L107–113) sets `chats: { context: "collapsed" }`, and its own header anticipates
exactly this change: *"docked for Chats-with-active-chat (§4.1) is a runtime rule … a later chat
lane seeds that override via `setPanelMode` when a chat commits."* Ask: ratify that seed (CONTEXT →
docked on chat activation; the user's persisted per-panel override wins thereafter, §4.2 physics 3;
the focus-mode toggle unaffected). This is the same law surface Pitch B amends — if the owner
prefers their composition-aware *derivation* over the header's *seed*, this design is agnostic
between mechanisms; its need is only "CONTEXT open by default when a chat is active." Without the
amendment, the §5 dossier row scores 1 and the design still stands.

**Nothing else.** The band is transient chrome over the composer inside CONTENT (modals stay
pickers/interrupts — no section content in a dialog); the dossier and the config door are CONTEXT
(detail + config on the artifact, never navigation — §4.2); commit-model law holds everywhere (no
save-bar; immediate/autosave/draft-store only); the reader taxonomy holds (route composes, surfaces
receive props, mirror readers use the canonical pointer hooks; no effect on shared selection —
gate `no-effect-on-shared-selection`); theming axes untouched; every interactive addition (seat
menus, tray, band, pill) is keyboard-operable and coarse-pointer-clean by construction (the
Menu/command/Popover seals + the explicit interaction models in §2/§3).

---

## 9. Seams

Graft mechanism = the three chat-owned registries (`CHAT_SURFACE_SLOTS` · `CHAT_CONTEXT_SLOTS` ·
`TOOL_RENDERERS`, DESIGN-REVIEW §7 #23–25, wired at `main.tsx`):

- **Crew** (CW7/U5): the `message-footer` slot under stage rows; crew's persistent guides ≠ the
  band's one-turn steers — guides surface as a quiet dossier line ("who's shaping this scene").
- **Automation** (A8): `/`-commands and `transform_draft` join the band grammar as a fourth token
  class when automation lands — the command surface is the natural host; deliberately not built now.
- **Tool-use** (T7): the `<details>` tool block via `TOOL_RENDERERS`, a thread-render arm.
- **Expressions** (E5): sprite stage on `thread-flanks`; `{type:"expression"}` is a bus-reducer arm.
- **RPG** (R11): HUD on `thread-flanks`/`above-composer`; the game panel is a `CHAT_CONTEXT_SLOTS`
  tab beside the dossier; GM verbs are future band tokens.
- **Hub** (H6): the J2 picker's import path; not a room concern.
- **Databank** (DB6): its `{{databank}}` contribution appears in the dossier's fired-sources digest.
- **Buddy-observer / agent principals** (D60 AP3): an agent seat is one more cast-strip chip
  (`chat.seatAgent`; attribution KIND-READY); the seat menu and the `@` token address it identically.

---

## 10. Risks & open questions

1. **The two-input model** — still #1, now with the rule specified (§3: the band never touches the
   composer; the wand's consumption model retired). Residual risk: users who *learned* the wand's
   type-then-wand flow lose it; the placeholder teach line and the band's own steer field are the
   mitigation. Needs a side-eye pass + a playtest; the fallback (make the band louder /
   explicit-invoke-only) is already the design, so the blast radius is presentation.
2. **Discoverability of ⌘.** — the composer placeholder + the steer icon in the wand's old slot are
   the teaches; whether that suffices without a first-run coach-mark (which FINAL-Chats §5 forbids
   without an owner ruling) is open.
3. **The presence fan's noise/cost** — attach/detach events could flap (backgrounded tabs, mobile).
   Design-level mitigation: the Live derivation uses streaming state + a short activity window, not
   raw attach events; fan-out is bounded to present members. Exact debounce is a build decision; the
   risk is chrome flicker, not correctness.
4. **CONTEXT re-housing unfamiliarity** — the door's sections map 1:1 to the old tabs except the
   Roster+Group merge; if directors want them separate, the reversal is two sections instead of one
   (cheap). The §2 inventory keeps every control accounted for so nothing is lost in the move.
5. **The dossier below `md` widths** — on narrow viewports CONTEXT is a sheet; an "ambient" read in
   a sheet is not ambient. Mobile gets the dossier one tap away (the shell's existing sheet model);
   the design accepts that and leans on the in-thread boundary divider there.
6. **Amendment interplay** — §8.1 touches the same defaults map as Pitch B's amendment, and Pitch
   C's stage posture collapses CONTEXT at the same moment. The owner will rule once for all three;
   this design's need is stated minimally ("open by default when a chat is active") so it survives
   any of the three mechanisms.

Least sure of: risk 1 (playtest-dependent) and risk 3 (the one place this pitch trades a known
server cost for UX — the §4b bet that presence is worth an event family).
