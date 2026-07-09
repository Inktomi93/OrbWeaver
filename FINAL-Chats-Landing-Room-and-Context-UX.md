# FINAL — Chats (LANDING · LIST · ROOM · CONTEXT — the Chats section UX)

```
kind: build-spec (implementable)   status: authoritative for this lane   authored: 2026-07-09
scope: the Chats RAIL section — its LIST, the LANDING, the ROOM (header · thread · composer), the
       CONTEXT tabs, and the MULTI-HUMAN room lifecycle (invites · membership · notifications).
       NOT the Characters lane (FINAL-Character-Library-and-Editor-UX.md), NOT the persona panel or the
       immersive visual system (both SHIPPED — docs/architecture/history/FINAL-Persona-and-Immersive-
       Chat-Visuals.md), NOT rpg/crew/tool-use content (they GRAFT via the §14 registries).
companions: FINAL-Chat-Tab-Redesign-UX.md (repo root — the 2026-07-09 tournament-won REDESIGN wave
       that EXTENDS this doc: chat-mode posture, Members panel, dual-device read-state, scene
       atmosphere; where the two conflict on a NEW surface, the redesign doc wins; this doc stays the
       as-built baseline + verb inventory) · FINAL-Character-Library-and-Editor-UX.md (the sibling
       lane; its §7 Activity tab consumes this lane's reads) · ux-flow-revamp.md J1–J8/J12 (the
       journey record this doc SUPERSEDES for the chat section — its J-lanes are as-built history
       now, not the spec) · DESIGN-REVIEW-2026-07-01.md §7 (the cross-set chat obligations — §14 here
       restates the client-registry rows as law).
```

> **You are a cold, amnesiac agent.** This document is the whole design — every panel, every verb, every
> wire. Build exactly what it says. Where it cites a `§`, that section of the core UI docs is LAW and
> wins over your instinct (`docs/architecture/core/UI-Architecture-and-Layout.md` §4.1/§4.2/§4.3/§4a/§5.1
> · `UI-Gates-and-Lessons.md` §11 · `UI-Theming-and-Content.md` §12). Read §2 (commit/freshness law) and
> §11 (pain-points) before you write a line — they are the two ways this lane gets built wrong.
>
> **The chat section is FAR more built than any other lane.** Most of what this doc describes EXISTS and
> is verified on disk (re-censused 2026-07-09, including the in-flight #27/#28 lanes). The net-new work
> is concentrated in §12's FIX/CREATE ledger: the multi-human client (§8), a handful of transport
> exposures for already-built domain verbs, and a short polish list. **Extend; do not regenerate.**

---

## 0. Build order (do these in sequence)

1. **Transport exposures first** (§12 FIX #1–#4) — the invite/membership/notifications wire + the small
   reads. All domain code exists; these are thin router rows. Land them green before any client work so
   the client codes against real endpoints.
2. **The room-polish wave** (§12 CREATE A) — continue-on-empty wiring, undo/redo-continue actions, the
   LIST subtitle preview, fork badges. Small, independent, high-parity-value.
3. **The multi-human client** (§12 CREATE B) — the §8 flows: invite mint/share, `/join/:token`, the
   Roster tab's People section, kick/leave/handoff, the notifications inbox. The differentiator wave.
4. **Chat lore** (§12 CREATE C) — the PD-30 Lore tab (chat-scoped world books).
5. **Verify against §10 (click economy) and §11 (pain-points).**

Waves 2–4 are independent of each other once wave 1 lands; they can run as parallel lanes with disjoint
file sets (2 = room/list components · 3 = new surfaces + roster tab · 4 = one new tab + verbs).

---

## 1. The mental model — one section, three CONTENT states, two laws

The shell is fixed (§4.1): **RAIL** (nav) · **LIST** (finds: the conversation rows) · **CONTENT** (does:
landing OR room) · **CONTEXT** (config/detail tabs on the active chat). What makes the chat section
different from every other lane is that its CONTENT is **stateful about the active chat in exactly one
place** — the `ChatHandle` — and **fresh in exactly one way** — the bus.

**LAW 1 — the handle discriminant.** The active chat is `landing | draft | committed`
(`state/chat-handle.ts`, read via `state/active-chat-store.ts`). Every read, subscription, and verb call
gates on the discriminant — never an `isOptimistic`/`isDraft` boolean, never a `castId("")` sentinel:

- `landing` — nothing selected. CONTENT = the landing surface (§5). No chat reads mount.
- `draft` — a pre-commit room: a `draftKey`, a founding-cast `DraftSeed`, and a `draft-config` store
  partition holding every pre-send edit. **No server row exists**; nothing fetches chat data, the
  greeting thread renders from the founding cards, and the CONTEXT twin writes to the store.
- `committed` — a real `ChatId`. Reads mount, the SSE subscription attaches, verbs fire.

**LAW 2 — the bus is the ONE freshness driver.** Every chat verb is immediate-commit server-side and
emits a `ChatBusEvent` (per-chat stream, `chat.streamMessages`) or a user-bus `chatsChanged` fan
(cross-device / new-chat / fork). The client's mutations are `busDriven` — **no mutation-side
invalidation, no optimistic cache surgery, no manual `setQueryData`** (`data/invalidation.ts` is the one
event→queryFilter seam; UI-Gates §11.1). A mutation that also invalidates the bus's own keys
double-refetches (the observed 4–5×/send storm — already fixed; do not reintroduce). The recency fan is
LANDED: `chatsChanged` fans to ALL PRESENT MEMBERS (kicked/deleted members via `extraUserIds`), and
invalidation is single-driver — chat-bus → the open chat's detail reads, user-bus → `listChats` +
`character.list`.

**The source-agnostic editor corollary (LAW 1 × LAW 2):** every CONTEXT editor is a PURE component fed
`(value, save)` — a committed chat passes the verb, a draft passes the `setDraft*` store action. Same
editor, same look, only the seam differs. This is built (`RoomOverridesForm`, `InjectionsList`,
`RosterPanel`, `GroupConfigForm` are all dual-mode); never fork a "draft mode" UI.

---

## 2. The commit-model law (THE correctness spine)

**There is no save-bar anywhere in the Chats section.** Unlike the character editor (a draft-then-save
card form), everything here is either an **immediate verb**, an **autosave form** (writes-on-settle,
§13.4), or a **draft-store write** that the first send carries into `chat.startChat` atomically. The
full wire inventory is `packages/server/src/transport/trpc/routers/chat.ts`; the full domain surface
(including the not-yet-exposed verbs §12 FIX lists) is
`packages/server/src/domain/chat/contract/service.ts` — read both before adding any verb call.

| Surface | Write | Verb (authority) | Freshness |
| - | - | - | - |
| Composer Send | immediate | `chat.send` (participant) — the promise stays open for the WHOLE turn | bus: `messageCommitted` + `turnCompleted` |
| Swipe / step | immediate | `chat.swipe` / `chat.selectVariant` (author-or-host) | bus: `turnCompleted` / `variantSelected` |
| Guided actions | immediate | `chat.generate`/`swipe`/`continueTurn`/`impersonate` (+`guided` steer) | bus (turn events) |
| Edit-in-place | immediate | `chat.editMessage` (author-or-host; server re-runs edit-tier regex) | bus: `messageEdited` |
| Hide-from-AI / delete | immediate | `chat.setMessageHidden` / `chat.deleteMessages` (author-or-host) | bus: `messageHidden` / `messagesDeleted` |
| Fork | immediate | `chat.forkChat({throughSeq})` (member; D27 deep copy) | user bus: `chatsChanged` (new id) |
| Row lifecycle (rename/star/archive/delete) | immediate | `chat.updateTitle`/`star`/`archive`/`delete` (host) | bus: `chatUpdated`/`chatDeleted` |
| Room overrides | autosave form | `chat.setRoomOverrides` (host; 4-field allowlist) | bus: `chatUpdated` |
| Injections | per-row autosave | `chat.setChatInjection`/`deleteChatInjection` (host) | bus: `chatUpdated` |
| Group config | immediate (whole-object DU rebuild) | `chat.setGroupConfig` (host) | bus: `chatUpdated` |
| Roster (mute/weight/add/force) | immediate | `setParticipantDisabled`/`setParticipantTalkativeness`/`addCharacterToChat`/`forceCharacterTurn` (host) | bus: `chatUpdated` / turn events |
| Anchor re-pin | immediate | `chat.setChatAnchorPersona` (host; FINAL-Persona §A.0 #4) | bus: `chatUpdated` |
| Persona reattribute | immediate | `chat.reattributePersona` (author-or-host per row) | bus: `messageEdited`-family |
| **A DRAFT's everything** | store write | `state/draft-config-store.ts` (keyed `draftKey`) | none — carried into `startChat` (greetings · rosterOverrides · groupConfig · roomOverrides · injections · addedCharacterIds) as ONE atomic creation, then `clearDraftConfig` |

**The turn lifecycle is a state machine, not a pending flag** (`state/chat-stream.ts`):
`idle → pending → streaming → stopping → terminal`. The composer's Send⇄Stop, the ghost row, the wand's
busy gate, and swipe visibility ALL read `useTurnPhase` — never a mutation's `isPending` (the `send`
promise spans the whole turn, so `isPending` is the wrong signal for "streaming").

---

## 3. RAIL

The `Chats` icon among the end-state sections (§4.1). Nothing to build. The section's modal slots
(`newChat`, `command`) are already registry-paired.

## 4. LIST — the conversation rows (finds)

**Built** (`chat-list-surface.tsx`): micro-caps "Chats" header + ghost `+` (→ the J2 picker) → search
(`useDeferredValue`, client-side `filterChats` over title+participants) → `ListRow`s (initials avatar
hue-seeded by chat id · title · participant names · mono relative time) + per-row kebab
(rename/star/archive/delete — `chat-list-row-menu.tsx`). Selection paints via the `activeChatId` prop;
the surface only WRITES `onSelect` out (§5.1 — it never reads the active-chat store).

**Rework this lane owes it (§12 CREATE A):**

- **A real subtitle.** `ChatSummary` (`domain/chat/contract/views.ts` L48–70) still has no last-message
  preview — the participant-name subtitle is the honest fallback both row components already document as
  a `TODO(server)`. FIX #3 adds `lastMessagePreview: string | null` (plain text via the ONE
  `toPlainText` seal server-side, truncated; NEVER raw markdown) and the rows switch to
  preview-with-names-fallback.
- **Real avatars.** `participantCharacterIds` LANDED on the summary (L67 — deliberately including
  departed seats; it backs the character lane's reverse read). The list row can now render a real
  `AvatarStack` by joining ids → the already-cached character list, BUT a cold cache would N+1 —
  **do it server-side instead**: FIX #3's same pass adds `participantAvatarHashes: readonly (string |
  null)[]` (present roster order, capped at 3) next to `participantNames`. Until it lands the initials
  fallback stands (it is a first-class avatar — owner ruling 2026-07-09).
- **Fork badge.** `parentChatId` is already on the summary — render a quiet `GitFork` micro-icon before
  the timestamp on fork rows (glance-level "this is a branch"), tooltip "Forked chat". No tree UI in the
  LIST (the character editor's Activity tab owns per-character trees; a chat-side lineage view is
  DEFERRED — §12 FIX #6 flags the read exposure it would need).
- **Filter chips** (§4.2): Starred-only · Archived (opt-in; `listChats({includeArchived:true})` exists).
  Mirror the character library's chip row; archived rows collapse under a "show archived" disclosure at
  the tail. No tag filter (chats have no tags — deliberate; labels are a character/library concern).

**Deliberately unpaged, client-filtered.** `listChats` returns the caller's whole membership list —
bounded by "chats a human belongs to", not a library-scale collection. Keep the plain suspense read (NOT
`createCollectionSurface`); flag server paging/search only if a real inbox exceeds \~1k rows (record the
observation before building it).

## 5. CONTENT — the LANDING (nothing selected)

**Built** (`chat-landing-surface.tsx`, the committed `{kind:"landing"}` handle — the app NEVER opens on
an empty room): welcome hero (Weave glyph + "Pick up a thread" + ONE primary — "New chat", or "Create
your first character" on an empty library) → "Recent chats" (≤8) → "Start a chat" character quick-picks
(≤6) + "All characters →". Two parallel suspense reads; every affordance is a callback the route maps to
store actions (§5.1 leaf-writer).

**The one rule to preserve:** `showRecents` is `false` when the Chats LIST is DOCKED — the docked panel
IS the recents finder (§4.3 rule 5), so the landing dropping its own list kills the duplicate. The route
owns that derivation (`shellLayout.listMode !== "docked"`); never re-derive it inside the surface.

**First-run persona ask:** the old J1 note deferred it on "persona is a `.gitkeep` stub" — that is STALE
(persona SHIPPED). Still **deliberately OUT of the landing**: identity setup lives in the rail-foot
persona panel + Settings→Personas; the landing teaches the chat loop, not account setup. Do not add an
onboarding wizard here without an owner ruling.

## 6. CONTENT — the ROOM (a draft or committed chat)

One composed pane (`chat-room-surface.tsx`): `[ cast bar (committed group) | thread | selection bar |
composer ]`, wrapped in the Layer-2 solo-chrome `ThemeScope` (true-solo = exactly one human + one
character → that character's `themeOverride` takes over the room chrome; ANY other composition keeps the
viewer's theme — derived from roster composition, never `if(isGroup)`).

### 6.1 The identity header (shell TOPBAR, route-composed)

Built (`chat-header.tsx`): committed → avatar/`AvatarStack` + title + honest participant-count chip + the
⋯ options menu; draft → the founding cast's avatars + first character's name ("New chat" fallback), no
menu. Non-suspense reads (a topbar never suspends). There is NO scene/description field in the data
model — never fabricate one.

**The ⋯ options menu** (`chat-options-menu.tsx`) is the chat-level action registry — rows, not rework:
New chat with same cast · Continue/Regenerate/Impersonate (the guided verbs with an empty steer, tail-
gated) · Select messages… · Chat overrides…/Preview request…(host)/Injections… (CONTEXT tab jumps via the
`contextTab` seam + dock) · Rename (single-input Dialog) · Close chat (`goToLanding`) · Delete
(AlertDialog → `goToLanding`). §8 adds: **Invite people…** (host) · **Leave chat** (member) · **Hand off
host…** (host). §12 CREATE A adds: **Compact history…** (host — the D25 manual lever, `chat.compact`;
show the resulting checkpoint as the §6.3 boundary divider's tooltip detail).

### 6.2 The cast bar (committed, group-only)

Built (`chat-cast-bar.tsx`): read-only glance chips (avatar+name; muted members dimmed at `opacity-50`),
size-gated `null` at ≤1 character, host-only trailing `+` → `AddMemberPopover` (an anchored popover
picker — NOT a modal; stays open for multi-add). Controls live in CONTEXT Roster; the bar is presence
only. §8 extends the same bar with HUMAN member chips (see there).

### 6.3 The thread

Built end-to-end; the visual system is the immersive FINAL's law — this doc only pins the behavioral
contracts:

- **One canonical `MessageRow`**, skinned by the exhaustive `MESSAGE_ROW_SKINS` table (8 chatStyles).
  Attribution resolves ONLY from server-stamped ids against the roster + macro-name producers (never
  body text); a null `characterId` in a multi-character room is "Narrator", never `participants[0]`.
  Render trust is resolved per row (`resolveRowRenderPolicy` — untrusted by default; own-input or
  opted-in character only). KIND-READY for the D60 `agent` arm.
- **The ghost row is the ONLY token subscriber** (ghost-isolation, §11.1): the list re-renders on
  lifecycle transitions only. The ghost wears the full immersive decoration mid-stream and swaps to the
  byte-identical canonical row on settle.
- **Swipes**: tail assistant row only, hidden mid-stream/edit. Right chevron at the tip = `swipe` (new
  generation); off-tip and left chevron = `selectVariant` pointer moves resolved through
  `listMessageVariants` (a cold load mid-slot still steps correctly). ArrowLeft/Right drive the same
  handlers (editable-target guarded). In-place ghosting over the tip for a regenerating swipe is the
  known deferred polish (#19 note in `use-ghost-stream.ts`) — an appended ghost is the current behavior.
- **Edit-in-place**: the mode flag + draft text live in the EXTERNAL `message-edit-draft` store (a
  windowed row unmounts on scroll — component-local state silently drops, PD-119). Enter saves, Esc
  cancels, Shift+Enter newline. The same textarea serves draft greetings via the pluggable `onSave`.
- **Per-message actions**: Edit · Hide-from-AI (dims the row `opacity-50`; assembly holds it out, the
  reader keeps it) · Fork (at this message's `seq`) · Copy · Delete(confirm). Dim-at-rest → brighten on
  hover/focus-within, always-on at coarse pointer. §12 CREATE A adds **Undo continue / Redo continue**
  on the tail assistant row when its variant carries a continue snapshot (`chat.undoContinue`/
  `revertContinue` — FIX #5 exposes them).
- **The context-boundary divider**: the quiet "In context from here" rule above the earliest message the
  most recent generation actually saw (`resolveContextBoundaryMessageId` — newest non-null stamp wins).
- **Bulk select** (J6): options-menu entry → row checkboxes + the pinned selection bar (array
  `deleteMessages` + confirm). The bar's clear/Esc exits the mode.
- **The draft thread**: each founding character's greeting as a NORMAL, fully-editable row
  (`synthGreetingRow` — deterministic synthetic ids), greet-all order; Edit/Swipe route to the
  draft-config store (`greeting` binding); a greeting-less cast shows "Say hello to X to begin the
  scene." — never a dead end.

### 6.4 The composer

Built (`composer.tsx`): ONE pill (container owns border+ring; borderless growing textarea inside,
\~8-row cap; quiet→hover→focus escalation via border+bg-alpha, never opacity) · left cluster = the WAND
(guided steer over the draft text: response/swipe/continue/impersonate committed; "Guide the opening"
draft) + SPEAK-AS (summon a character via `generate({speakerCharacterId})`; size-gated) · right = the
circular Send⇄Stop morph off `useTurnPhase`. IME `isComposing` guard. Clear-on-commit: the draft clears
only when the bus confirms the user's own row committed — a failed send keeps the text with zero restore
logic.

**Wire continue-on-empty (§12 CREATE A — the note in `lib/continue-on-empty.ts` is STALE):**
`chat.continueTurn` IS on the router now (`routers/chat.ts` — the #27 exposure). Empty draft + assistant
tail → the Send button becomes "Continue" (`isContinueEligible` already computes eligibility, the
placeholder already teaches it); fire `continueTurn` against the tail id (the wand's own gate/target
resolution in `use-guided-actions.ts` is the pattern). Delete the missing-API caveats from both file
headers when this lands.

**Deliberately absent:** an attach/upload button (unbuilt capability — no placeholder chrome);
`/`-commands (automation's lane); a persona switcher IN the composer (the rail-foot panel owns persona,
FINAL-Persona §A.5). `chat.generateImage` is wired server-side and reachable via automation `/imagine`
later — a composer image affordance is imagery-design I5's client wave, not this lane.

## 7. CONTEXT — the room's config tabs

Built (`chat-context-panel-surface.tsx` + the draft twin): **Overrides · Roster · Group · Preview ·
Injections**, host/group-gated (Roster+Group = host AND >1 character; Preview = host; a member gets
read-only Overrides + Injections). The `contextTab` shell seam drives tab jumps from the options menu; a
stale/hidden request falls back to Overrides. The draft twin is identical minus Preview (no server
assembly pre-commit) with the viewer always host.

- **Overrides** — the 4-field host allowlist (main prompt · post-history · scenario · author's note),
  autosave, empty = inherit. The room author's note is now a REAL depth injection: a non-empty
  `roomOverrides.authorsNote` OVERRIDES AND SUPPRESSES the per-member card `depthPrompt` notes (the
  host's room note is the room's single author's-note authority — task #18 ruling, landed in
  `assembly/context.ts` `authorsNoteCandidates`); unset ⇒ member notes flow, cast-order stacked. The
  Preview tab's `overrideSources` line shows which won ("room override" vs the contributor names) — the
  Overrides tab's author's-note field description should say this out loud ("Replaces every character's
  own note-at-depth for this chat").
- **Roster** — per-member mute (passive arbitration exclusion — cards/lore still contribute; say so in
  the control copy, it's built) · talkativeness (commit-on-release slider) · force-turn (works on muted
  members — an explicit host override). §8 adds the People section.
- **Group** — the generation-behavior editor: output narrator⇄per-speaker (a discriminated-union
  whole-object rebuild — never field-patch the stored blob), speaker tags (default coupled to output),
  group nudge, and the Advanced disclosure (policy · scoped cards (per-speaker only) · member-card
  visibility · auto-mode with max-turns/delay/self-replies + an explicit cost warning). Policies map to
  the 7a arbiter (`engine/select-speakers.ts`): `natural` = talkativeness-weighted (Efraimidis-Spirakis),
  `list` = roster order, `pooled` = round-robin via ban-last, `manual` = only forced/@mention speaks,
  `smart` = the 7b side-LLM (degrades to natural until wired). **@mention works today**: a HUMAN-typed
  `@Name` in the send text hard-overrides arbitration (longest-name-first, AI text never forces) — the
  Group tab's policy help text should teach it ("Type @Name to summon someone regardless of policy").
- **Preview** (host) — the assembled next-turn prompt + `AssembleTrace` (override sources · fired
  sections · world-info in/dropped · matched keys · cache busters · flags) + the advisory QuadChars
  token estimate. Read-only. The member-scoped `previewSection` affordance stays DEFERRED (#28 flag).
- **Injections** — persisted positional context rows (position ×4 · depth (in\_chat) · role · content),
  per-row autosave + Add/Remove. **No enabled toggle — "off" is delete** (deliberate neo divergence; do
  not add soft-disable). The coming #22 injection-placement ruling widens depth+role to ALL injectables
  via the ONE `injectionDirectiveSchema` — a contract change that REDS this tab's form types when it
  lands; build nothing speculative for it now.
- **Lore (NEW — §12 CREATE C, the PD-30 homing).** Chat-scoped world books — neo's "Chat lore" — are
  THIS lane's concern (the character FINAL explicitly keeps them out of the character editor). One new
  CONTEXT tab `Lore`, host-write/member-read, mirroring the character editor's Relations pattern: an
  inline summary list of attached books + a picker modal (legal), immediate junction writes. The
  `chatBooks` table exists; the `worldInfo.attachToChat`/`detachFromChat`/`listForChat` verbs are the
  deferred-ready PD-30 trio — landing them is part of CREATE C. The chat WI pool read already models the
  `chat` scope (`WorldInfoPoolEntry.scope: "chat"`, `contract/views.ts` L202).

**Every tab assumes the slot registry.** When `CHAT_CONTEXT_SLOTS` lands (§14), each tab above becomes
chat's own registered entries and rpg/crew graft theirs beside them — the surface already renders as
bounded sections, so this is a mechanical re-home, not a rework. Do NOT hardcode new tabs after that
registry exists.

---

## 8. The MULTI-HUMAN room — the differentiator (design law for the unbuilt client)

Everything in this section is **domain-complete and transport-dark**: the invite lifecycle, membership
verbs, and the notifications inbox are fully built server-side
(`domain/chat/verbs/invites.ts`, the membership slice of `contract/service.ts` L266–289,
`domain/notifications` + `routers/notifications.ts`) but the chat router exposes NONE of it and no
client surface exists. This section is the UX law for that build (§12 FIX #1/#2 + CREATE B).

### 8.1 The authority model (understand before building — it shapes every affordance)

- **Membership-scoped, not owner-scoped (D18):** there is no `chats.ownerId`. Every verb resolves
  `requireParticipant`/`requireHost`. The HOST is the one authority + funding source; everyone else is a
  `member`. `ChatDetail` already carries `viewerIsHost`/`viewerUserId`/`viewerActivePersonaId` so the
  client never guesses (until auth #50 lands, the client-side `resolveViewerIsHost` first-human-seat
  proxy stands in — both resolve identically in today's rooms).
- **Host-only:** roster mutation, group config, room overrides, injections, force-turn, delete, rename/
  star/archive, anchor re-pin, invite mint/revoke, kick, handoff nomination. **Member:** send/turns on
  their own behalf, edit/delete THEIR rows (author-or-host per slot), read-only Overrides+Injections,
  self-leave, accept a handoff. A member NEVER sees an affordance that would only NOT\_FOUND (mirror the
  server gate client-side — the Preview-tab precedent).
- **Single-user deployments refuse the whole multi-human surface** as NOT\_FOUND (`multiHumanProcedure`,
  PD-106). The client must FEATURE-DETECT: one gated capability read (the notifications `list` probe or
  a config flag — FIX #2 decides the shape) hides the bell, the Invite rows, and the People section
  entirely. Never render dead multi-human chrome in a single-user install.

### 8.2 Invites (host mints; the link IS the credential)

Server semantics that the UX must not fight (`verbs/invites.ts`): the token is CSPRNG, returned RAW
exactly ONCE from `createInvite`, stored hashed; `redeemInvite` is THE one human-join chokepoint
(atomic, `role` server-forced `member`, `joinSeq` stamped at the canon head, idempotent re-add); a
targeted invite (`invitedHandle` — exact handle, no listing/search) additionally delivers a durable
`invite` notification carrying the `inviteId` but NEVER the token — **in-app accept of a targeted invite
is deliberately impossible; accept always rides the `/join/:token` link the host shares** (Part III §2
security posture — do not "fix" this with an accept button; the notification's actions are Preview-less
"Decline" + a passive "ask the host for the link" hint).

**The UX:**

- **Mint** — options menu "Invite people…" (host) → a small Dialog (legal interrupt): mode toggle
  Share-link ⇄ Invite-by-handle (exact handle input; unknown handle = the `invite_target_unknown` coded
  refusal shown inline — never silently degrade to a share link), optional expiry + max-uses, Create →
  the raw link shown ONCE with a copy button and "you won't see this again" copy. NOT a CONTEXT tab
  (minting is an interrupt, not config).
- **Outstanding invites** — a list INSIDE the same dialog (pending/expired/uses, per-row Revoke) needs
  the missing host read: **FIX #4 `chat.listInvites`** (host-only; `InviteView`s — no tokens). Until it
  lands the dialog is mint-only (never a dead list).
- **Join** — `/join/:token` is a REAL ROUTE (the one sanctioned deep-link addition beside `/`, `/login`,
  `/admin/*` — an invite link must survive a cold browser; §5.1's "routes are a localized bolt-on"
  escape hatch, applied). It renders the preview-then-confirm gate: `previewInvite` (room name · host
  handle · member count · mode label — NO roster identities, NO history) → Accept (`redeemInvite` →
  `selectChat(chatId)` + `setActiveSection("chats")`) / Decline (targeted only — `declineInvite`).
  Invalid/expired/foreign token = one honest "This invite isn't valid" state with a "Go home" affordance
  (leak-free NOT\_FOUND; rule 1 — no dead end).
- **History visibility from `joinSeq`:** a joiner's transcript replays from their join point. The room
  header shows a quiet system-style divider "X joined" (already representable as canon events); do not
  fetch or render pre-join history for a member the server would refuse anyway.

### 8.3 Membership lifecycle (People in the Roster tab)

The Roster tab gains a **People** section above the character Cast list (ONE tab, two groups — humans
and characters are both "who's in the room"; a second tab would split one concept). Rows: avatar
(persona-derived) · handle/display name · host crown on the host · "you" marker.

- **Kick** (host, on a member row) → AlertDialog confirm → `chat.kick` — server sets `leftSeq`, tears
  down their SSE within the kick tx, and delivers their `kick` notification. Their authored rows REMAIN
  (canon is history); their persona attribution stays frozen on old rows.
- **Leave** (the viewer's own row + an options-menu row) → confirm → `chat.selfLeave`. A sole-host
  self-leave ARCHIVES the chat (server rule) — the confirm copy must say so ("You're the host — leaving
  archives this chat for everyone"). After leaving: `goToLanding()` (the room would 404).
- **Host handoff** — two-party: host picks "Hand off host…" on a member row → `nominateHostHandoff`
  (notifies the nominee) → the nominee's notification carries an **Accept** action → `acceptHostHandoff`
  (atomic role swap; both rooms' chrome re-derive from the bus `chatUpdated`). Show a pending-nomination
  chip on the nominated row (host view) until accepted.
- **The cast bar** gains human chips AFTER the People section lands (presence-at-a-glance for group
  rooms) — same read, no controls, capped stack.

### 8.4 Notifications (the per-user durable inbox)

Server-complete: durable inbox + resumable SSE (`routers/notifications.ts` — replay-from-`lastEventId`,
live-first attach, `REPLAY_PAGE` bounded), producers already emit `invite` (targeted create), kick, and
handoff-nomination events through the ONE `emitNotification` chokepoint.

**The UX (CREATE B):** a topbar **bell** with an unread-count badge (mono, quiet) → a popover inbox
(rows: icon · one-line text · relative time · per-row actions — invite: Decline (+ the "ask for the
link" hint); handoff: Accept/Decline; kick: informational) + "Mark all read". `notifications.list` seeds
it; the subscription (`useNotificationsBus`, mirroring `useUserBus`'s mount-once-at-the-route pattern)
keeps it live; `markRead`/`dismiss` per row. Feature-detected per §8.1 (single-user hides the bell). The
inbox is a NEW client feature slice (`features/notifications/` — it is not chat-owned; chat is merely
its first producer), route-composed into the topbar slot.

---

## 9. Interaction flows (the load-bearing sequences)

- **(a) New chat.** Any "+"/⌘K/landing affordance → the J2 picker modal → pick N characters (or Blank)
  → `startNewChat({characterIds})` + `setActiveSection("chats")` + `closeModal` — a DRAFT mounts:
  greeting thread + draft CONTEXT twin + character-first topbar. Everything is editable pre-send.
- **(b) First send (the commit).** Send → `startChat` carrying the WHOLE draft config atomically
  (opening resolves: explicit ?? by cast size — 1 ⇒ `first-message` verbatim, >1 ⇒ `greet-all` verbatim,
  0 ⇒ `none`; the wand's "Guide the opening" forces `generate` — the engine writes a cast-aware opening)
  → `commitDraft(chatId)` promotes the handle WITHOUT changing `sessionKey` — **the surface must NOT
  remount mid-first-turn** (it would tear down the live SSE + the in-flight send; THE KEY DISCIPLINE,
  `active-chat-store.ts`) → the send commits as the first user turn → `clearDraftConfig`.
- **(c) The turn.** `messageCommitted` (user row lands; composer clears NOW) → `turnStarted` → ghost row
  streams (list still) → `turnCompleted`/`turnAborted` closes the slot and the canonical row replaces
  the ghost via the bus-driven refetch. Stop = `markStopping` (instant) + `abort` (idempotent; the slot
  closes only on the bus terminal).
- **(d) Fork-nav.** Row Fork → `forkChat({throughSeq})` → `onChatForked` → `selectChat(newId)` — the
  SAME landing action the chat-list select and ⌘K use (one seam; §5.1). The user bus's `chatsChanged`
  covers the list + the new chat's detail.
- **(e) Cross-section jumps.** Character card "Chat" → `startNewChat`/`selectChat` + `setActiveSection`
  (the character FINAL's §9c resume-or-new); a Roster row's "View character" does the reverse. Store
  actions only — never a feature→feature import.
- **(f) Join.** Link → `/join/:token` → preview → accept → seated + `selectChat` — the invitee's first
  frame of the room is the live transcript from their `joinSeq` forward.

## 10. Click-economy targets (verify the build against these)

| Journey | Target | How |
| - | - | - |
| Cold → resume the last conversation | 1 click | landing recent row, or LIST row; ⌘K → title → Enter |
| New chat with a known character | 2 clicks | `+` → pick (the picker's Start row auto-focuses via cmdk) |
| Send → reading the reply | 0 extra | optimistic lifecycle; ghost streams in place |
| Reroll the last reply | 1 click | swipe chevron (or ArrowRight) |
| Mute a group member | 2 clicks | CONTEXT Roster (1) → mute (1); the tab persists per §4.2 |
| Invite someone (host) | 3 gestures | ⋯ → Invite people… → Create+copy |
| Accept an invite | 2 clicks | open link → Accept (preview is the same screen) |
| Stop a runaway generation | 1 click | the morphing Stop; Esc is NOT wired to stop (Esc = close top layer, rule 6) |

If any core loop exceeds these, the build is wrong — restructure.

## 11. Pain-points to AVOID (each is a way this lane gets built wrong)

1. **NO effect keyed on the active-chat pointer** (§5.1; gate `no-effect-on-shared-selection`). The
   route composes; surfaces receive props; mirror readers use `useActiveChatId` + Query. "When the
   active chat changes, do X" is a render derivation or a `key=` remount — never an effect.
2. **NO `if(isGroup)` / no `participantCount` field** (D16). Solo is the roster-of-1 degenerate:
   size-gates (`cast.length <= 1 → null`) and composition checks (`resolveIsGroupChat`,
   `resolveRoomTheme`) — never a flag branch.
3. **NO optimistic cache surgery on chat reads.** Every chat mutation is `busDriven`; the bus + the ONE
   invalidation seam are the update path. A `setQueryData` in a chat feature file is a red flag (gate
   `no-inline-cache-surgery-in-stream`); a mutation-side invalidate of bus-covered keys double-fetches.
4. **NO second token subscriber.** Only the ghost row reads stream text. A component that "just needs
   the partial text" re-renders the world per delta — read `useTurnPhase` or wait for settle.
5. **Do NOT remount the room on draft→commit.** `sessionKey` is the slot key and it deliberately
   survives the promotion (§9b). Keying the surface by `chatId` breaks the first turn.
6. **NO ambient booleans for lifecycle.** Send⇄Stop, wand busy, swipe visibility all derive from
   `useTurnPhase`/the handle discriminant — never `isPending`, never a local `isStreaming` state.
7. **Modals are pickers and interrupts ONLY** (rule 5): the new-chat picker, add-member popover
   (anchored, not even a modal), invite dialog, delete/kick/leave confirms, rename. Room config is
   CONTEXT tabs; never an "Advanced chat settings" dialog.
8. **Destructive = AlertDialog confirm, never an undo-toast** (delete chat/messages cascade hard; kick
   and sole-host leave are outward-facing). Quiet in-place edits (rename/star/archive) confirm nothing.
9. **Never parse attribution, mentions-to-force, or trust from AI text.** Attribution = stamped ids;
   @mention forcing = HUMAN-authored text only (an AI `@Name` must never summon a speaker — inv §12.6);
   render trust = the resolved policy, fail-closed.
10. **Do not add a soft-disable toggle to injections** ("off" = delete — deliberate) and do not
    field-patch the group-config union (whole-object rebuild via `buildConfig`).
11. **Members never see host-only affordances** (and single-user installs never see multi-human chrome).
    Mirror the server gate in render; the server's leak-free NOT\_FOUND is the backstop, not the UX.
12. **Don't re-spec the shipped systems.** Message-row visuals/immersive modes → the immersive FINAL;
    persona pointers/`{{user}}` → FINAL-Persona PART A; theming layers → §12.1/§12.4. This doc OWNS
    flows and the multi-human room; it CONSUMES those.

---

## 12. BUILD LEDGER — FIX, CREATE, and DO-NOT-REBUILD

### FIX (transport/contract gaps — all domain code exists; verified against `routers/chat.ts` 2026-07-09)

1. **Expose the invite + membership cluster** (blocks §8; the whole cluster is dark). Router rows for
   `createInvite` · `previewInvite` · `redeemInvite` · `revokeInvite` · `declineInvite` · `kick` ·
   `selfLeave` · `nominateHostHandoff` · `acceptHostHandoff` (thin pass-throughs — authz lives INSIDE
   the verbs, the sibling-cluster shape). ALL of these ride `multiHumanProcedure` (the PD-106 belt —
   same posture as the notifications router). `previewInvite`/`redeemInvite` additionally need the
   `/join/:token` HTTP entry: the tRPC rows serve the app shell; the route itself is client-side (§8.2).
2. **The multi-human capability probe** (blocks feature-detection, §8.1). Smallest honest shape: the
   client calls one `multiHumanProcedure` read at boot (`notifications.list({limit:1})`) and treats
   NOT\_FOUND as "single-user install" → hides the bell/invite/People chrome. If that read-as-probe
   offends, add an explicit `settings.getCapabilities` row instead — decide at build, don't build both.
3. **`ChatSummary` list denorms** (the LIST rework, §4): `lastMessagePreview: string | null` (server-side
   `toPlainText`, \~140 chars) + `participantAvatarHashes` (present-roster order, cap 3). One pass over
   the existing list query; no N+1 (the `participantCharacterIds` junction-bulk precedent, views.ts L67).
4. **`chat.listInvites`** (blocks the outstanding-invites list, §8.2) — NEW small host-only read
   returning `InviteView[]` (tokens never re-derivable). Degrade: the invite dialog is mint-only.
5. **Expose `undoContinue` / `revertContinue`** (the continue UX, §6.3) — router rows; the verbs exist
   (`contract/service.ts` L179–181).
6. **(Deferred — flag only) `getChatLineage`/`listForks` exposure** — needed the day a chat-side branch
   tree UI is wanted; the character Activity tab's build (sibling lane) will force the same exposure.
   Do not expose speculatively here.

### CREATE (client — `packages/client/src/features/chat/` unless noted)

**Wave A — room/list polish (small, independent):**

- Continue-on-empty send (§6.4) + Undo/Redo-continue actions (§6.3) + the stale-caveat deletions.
- LIST: preview subtitle + avatar stack (after FIX #3) + fork badge + Starred/Archived chips (§4).
- Options menu: Compact history… row (host) with an AlertDialog explaining the D25 checkpoint.
  `chat.compact` is on the service but NOT the router (verified 2026-07-09) — add the thin row with the
  cluster-sibling shape.

**Wave B — the multi-human client (§8; after FIX #1/#2/#4):**

- `components/invite-dialog.tsx` (mint + outstanding list + revoke) and the options-menu rows
  (Invite/Leave/Hand off).
- `routes/join-page.tsx` — the `/join/:token` route (preview → accept/decline; hand-written route #4).
- Roster tab People section (`components/roster-people.tsx`) + kick/leave/handoff flows + the cast bar's
  human chips.
- `features/notifications/` — a NEW feature slice (bell + popover inbox + `useNotificationsBus`
  mounted at the route like `useUserBus`). NOT inside `features/chat` (chat is one producer, not the
  owner); the notification row's actions write through `#state`/`trpc.*` only.

**Wave C — chat lore (PD-30):**

- The `worldInfo.attachToChat`/`detachFromChat`/`listForChat` verbs are BUILT on the world-info service
  (`domain/world-info/service.ts` L67–69; `chatBooks` schema `db/schema/world-info.ts` L136) but NOT on
  the world-info router (verified 2026-07-09) — add the router rows (+ the PD-30 `WiBusEvent` emit check),
  then the CONTEXT `Lore` tab (host-write/member-read picker+list, the Relations pattern). Close PD-30 in
  the debt registry when this lands.

### DO NOT REBUILD (verified built — extend only)

The room composition (`chat-room-surface` + thread + composer + ghost + swipe strip + edit-in-place +
actions/metadata/selection rows) · the LANDING · the LIST + row kebab · the J2 picker · ⌘K palette · the
options menu · the CONTEXT panel + draft twin and ALL FIVE tab editors (dual-mode by design) · the cast
bar + add-member popover + speak-as + wand/guided dispatch · the draft system (draft-config store,
`resolveDraftCommit` carry, synth greeting rows, clear-on-commit) · the active-chat store + KEY
DISCIPLINE · the bus stack (chat SSE with replay/resume, user bus, invalidation seam, chat-stream
machine) · the whole server domain (54+ verbs incl. the dark invite/membership/notifications surface —
**never re-implement a "join" or a second participant-insert path; `redeemInvite` is the chokepoint**)
· arbitration + @mention (`select-speakers.ts`) · the opening policies (`start-chat.ts`) · the room
author's-note override + `depthPrompt` assembly wiring (landed 2026-07-09) · render trust · the
immersive visual system + persona system (their own FINALs). **Deliberate drops — do not restore:**
injection soft-disable · a scene/description header field · Esc-to-stop · a composer persona switcher ·
in-landing onboarding · ST's literal type-as-character speak-as (v1 = summon; no verb carries it).

---

## 13. Visual & aesthetic direction

- **The transcript is the hero; chrome is furniture** (rule 9). The reading column caps at
  `--width-shell-content`; the composer shares the same column so input and prose align. Accent ≤10% of
  any viewport — in a chat that budget belongs to the primary Send, the context-boundary rule, and
  speaker color; never to panel chrome.
- **Motion = the turn lifecycle.** The shimmer (TTFT) → paced streaming (grapheme-safe, 40cps floor) →
  settle swap is the ONE animation story; everything else is `transition` timing. No spinners, no
  layout shift on arrival (shape-matched skeletons everywhere — built). `prefers-reduced-motion`
  passthrough rides the pacer.
- **Identity is painted, never labeled twice.** Speaker names tint via per-speaker tokens; avatars are
  hue-seeded first-class fallbacks; the topbar carries the room identity ONCE (no triple-title).
  Group presence reads from the cast bar at a glance — dimmed = muted, crown = host (§8.3).
- **Focus mode must stay first-class:** immersive-ST = both side panels collapsed (§4.1) — every room
  affordance (options menu, stop, swipes) remains reachable with LIST+CONTEXT gone; nothing in this
  lane may assume a docked panel exists (the landing's `showRecents` derivation is the model).
- **Multi-human voice:** membership events (joined/kicked/left/handoff) read as quiet system-style
  dividers in the thread, sentence-case, never toasts-over-transcript. Invite/notification copy is
  plain and honest about the link-is-credential model ("Anyone with this link can join until it
  expires").
- **Baseline:** WCAG 2.2 AA; the thread rows are `role="article"` with speaker-named labels (built);
  keyboard parity for every hover reveal (built pattern — keep it).

## 14. Future-proofing seams (assume these; do not build them)

- **The three chat-owned client registries** (DESIGN-REVIEW §7 #23–25; their tasks #23/#32):
  `CHAT_SURFACE_SLOTS` (regions: thread-flanks ×2 · above-composer · composer-leading · header-actions ·
  thread-actions-menu · message-footer (crew U5)) · `CHAT_CONTEXT_SLOTS` (rpg/crew tabs beside §7's) ·
  `TOOL_RENDERERS` (the `<details>` fallback block, tool-use T7). Wired at `main.tsx`. Every §6/§7
  surface is already shaped as bounded sections — registry adoption is re-homing, not rework.
- **`ChatInjection.audience?: "all" | "host"`** (crew CW4 — §7 #15): additive field + redaction in every
  prompt-serving projection; the Injections tab gains an audience select THEN, not now.
- **The #22 injection-placement ruling** — depth+role on ALL injectables via `injectionDirectiveSchema`;
  contract widening that reds the Overrides/Injections forms when it lands.
- **`chat.seatAgent` + the `agent` participant kind** (D60 AP3): the Roster tab gains an agent row kind;
  attribution is already KIND-READY (one-arm add).
- **Expression events** (`{type:"expression"}` ephemeral bus member) and rpg's `postNarratorMessage` —
  thread-render arms that ride the existing bus reducer + row dispatch; no thread rework.
- **Real auth (#50)** replaces the first-human-seat viewer proxies (`resolveViewer*`) with the
  authenticated principal — the seams are single-homed in `lib/roster.ts`, so it's a one-file swap.

Test: a new room capability = a registry entry or a CONTEXT tab; a new membership event = a notification
type + a thread divider; a new turn kind = a bus event arm. A new concern is a one-line add — the doors
are already in the right walls.
