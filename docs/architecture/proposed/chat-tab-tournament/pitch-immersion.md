# Pitch — IMMERSION / RP / FUN — the immersive default (revision 1)

```
kind: tournament-pitch (REVISED after adversarial review)   direction: immersion/rp/fun   designer: C
scope: the Chats section (LIST · CONTENT · CONTEXT) redesign, client-first + two rewarded server asks.
revision notes: addresses CRITIQUE.md I-M1..I-M6, I-m1..I-m4, and cross-pitch defects §4.2 #1–5.
  The theatrical register of rev-0 ("Stage and the Wings") is dropped per the owner tone note —
  functional names throughout. Steals taken (critique §4.3): the filed-amendment discipline +
  composition-scoped defaults (from the Discord pitch).
binding law: docs/architecture/core/{AGENTS,UI-Architecture-and-Layout,UI-Theming-and-Content,
  UI-Primitives-and-Reuse,UI-Gates-and-Lessons}.md · FINAL-Chats-Landing-Room-and-Context-UX.md ·
  FINAL-Character-Library-and-Editor-UX.md · history/FINAL-Persona-and-Immersive-Chat-Visuals.md ·
  BRIEF.md §4/§4b. The D-ledger wins on any conflict.
```

> **Read this first.** This is NOT a demolition pitch. FINAL-Chats §12 "DO NOT REBUILD" is honored to
> the letter. The redesign is: (1) an **immersive default posture** for the Chats section — filed as a
> proper law amendment this time (§8), composition-scoped so solo rooms default to focus and group rooms
> keep legibility; (2) a **promotion of the built guided-steering substrate** from a text-consuming
> dropdown to a first-class steering surface; (3) a **variant tray** (swipe gallery + branch) over three
> live verbs; and (4) two **rewarded server asks** in the BRIEF-§4 zone — a per-room **scene atmosphere**
> every member sees (multi-human) and a **composing signal** (multi-human presence) — plus a designed
> **dual-device live-spectate** experience that rides the already-built per-chat event stream.

---

## 1. Vision (one page)

**Thesis: the room defaults to immersion; every control is one reveal away.** The transcript fills the
frame at rest — no docked panels, no forms in view — and the machinery RP power users live in (swipe,
regen, continue, impersonate, steer, summon, branch, author's note, world-info depth) is reachable in
one gesture without leaving the room. Reveal is deliberate and reversible; conceal is the resting state.

**Who it serves.** The migrating SillyTavern power user (swipes, steers, author's-note depth — the ST
mine's daily verbs), the newcomer who just wants to talk to a character and never meets a slider, AND —
per BRIEF §4b — the user on two devices and the multi-human room. The same shell serves all four because
reveal is earned (UI-Arch §4.3 rule 4) and the two server asks (§7) make the room's *look* and *liveness*
server-authoritative — so what you staged on the desktop is what your phone and your co-players see.

**Why it beats the current tab.** The immersive *rendering* system already shipped — 8 chatStyles
including the five immersive modes Echo/Whisper/Hush/Ripple/Tide (`chat/lib/message-row-variants.ts`,
FINAL-Persona §B.2), per-speaker theme tinting (§12.4), the background layer
(`app-shell/components/theme-background-layer.tsx`), the solo-chrome takeover (FINAL-Chats §6). But the
*control posture* is a command-center: the LIST docks by default (`rail-slots.ts` L107
`chats: {list:"docked"}`), steering hides behind a dropdown that silently consumes the composer's text,
and the room's look is private to each viewer. This pitch makes the shipped immersion the default
experience, the shipped steering a first-class surface, and — the genuinely new part — makes the room's
staging **shared**: a host-set scene atmosphere all members and all of your own devices render alike,
and a live turn that streams on every open device. Immersion stops being a per-viewer render preference
and becomes a property of the room.

**The one-sentence test:** *can a power user steer, swipe, branch, and curate without ever docking a
panel — and does the scene look and breathe the same on your phone, and for the person you invited?*

---

## 2. The composed screen(s) — region by region

The shell is FIXED (UI-Arch §4.1): RAIL · LIST · CONTENT · CONTEXT. No region added, removed, or merged.
What changes: the Chats-section default posture (§2.1 — a filed amendment, §8) and CONTENT/CONTEXT
internals.

### 2.1 The posture: focus by default, composition-scoped

The mechanism exists: per-section panel modes `docked | overlay | collapsed`
(`state/shell-store.ts` `PANEL_MODES`), the §11.1 clamp-overlay, and the persisted focus toggle
(UI-Arch §4.1). The *default* is what I change, and the default is law
(`SECTION_PANEL_DEFAULTS`, `rail-slots.ts` L107–113) — so this is **Law-amendment ask A (§8)**, filed
properly this round, and **composition-scoped** (the Discord-pitch steal):

- **Solo room open (1 human + 1 character):** LIST → `overlay` (edge-reachable, zero width closed — the
  clamp), CONTEXT stays `collapsed`. The solo-chrome ThemeScope takeover (FINAL-Chats §6) already
  commits the room to the character's look in exactly this composition — a docked LIST beside it
  undercuts the shipped takeover. This is the immersion heartland; it gets the focus default.
- **Group / multi-human room open:** LIST stays `docked` (the law's collection-first default). I do not
  contest the Discord pitch's opposing amendment (CONTEXT docked for groups) — the two amendments
  **partition the composition space** and can both be adopted; my side of the argument is in §8.
- **No chat open (landing):** the map's boot defaults stand untouched.
- **User override always wins thereafter** (§4.2 rule 3 — the amendment changes only the seed).
- A **panels toggle** in the room header (label: "Panels", a `PanelLeft` icon-button) flips between the
  focus posture and docked panels for the current section — the §4.1 focus toggle given a visible home.
  It writes the existing `panelOverrides` via `setPanelMode`; no new store.

The landing's `showRecents` derivation already keys off `shellLayout.listMode !== "docked"`
(FINAL-Chats §5), so with the LIST in overlay the landing shows recents — the two postures compose today.

**Seed mechanism (the D-m3-class divergence, named):** the `SECTION_PANEL_DEFAULTS` header
(rail-slots.ts L99–106) anticipates a runtime seed "via `setPanelMode` when a chat commits." My
amendment rides that same anticipated seam, extended to chat-*open* and composition-aware: the seed is
folded into the **store actions** `selectChat`/`startNewChat`/`commitDraft` (writers write — §5.1;
never an effect keyed on the active-chat pointer, gate `no-effect-on-shared-selection`). Composition
(solo vs group) is read at the action's call site from the data the caller already holds.

### 2.2 RAIL

Unchanged (FINAL-Chats §3). Nothing to build.

### 2.3 LIST — the conversation rows (finds)

Keep the built `chat-list-surface.tsx` wholesale plus the FINAL's own §4 Wave-A rework: real
`AvatarStack` (`participantAvatarHashes`, FIX #3) · title · `lastMessagePreview` (FIX #3 —
`toPlainText` server-side, never raw markdown) · mono relative time · the quiet `GitFork` badge on
fork rows (`parentChatId`) · Starred/Archived chips. Stays the plain suspense read, client-filtered
(FINAL-Chats §4 "deliberately unpaged"). Nothing net-new beyond Wave A.

### 2.4 CONTENT — the room

Keep the composed pane `[cast bar | thread | selection bar | composer]` (`chat-room-surface.tsx`) and
every behavioral contract in FINAL-Chats §6. Internals this pitch touches:

- **The thread** consumes the shipped immersive system unchanged: the 8 `MESSAGE_ROW_SKINS`, per-speaker
  tinting, the ghost row as the ONLY token subscriber (§11.1), the context-boundary divider — **kept
  verbatim as "In context from here"** (rev-0's re-voice is DROPPED per I-m1; the component's own
  restraint comment wins), with the D25 checkpoint summary as its tooltip detail, which FINAL-Chats §6.1
  already plans — the right-sized version of the read-first glance the critique's steal list offered.
- **A new room layer slot:** the **scene atmosphere** ThemeScope (§7 ask #1) wraps the room chrome when
  the chat row carries an atmosphere override — one more `<ThemeScope>` nesting level; resolution by
  CSS-cascade nesting exactly as FINAL-Character §8.2 ("do not write merge code").
- **Per-message actions** unchanged (Edit · Hide · Fork · Copy · Delete, dim-at-rest reveal), plus Wave
  A's Undo/Redo-continue. **Fork copy change (cross-pitch defect #3):** in a room with >1 human
  (derived from the participants' human count — never an `isGroup` flag, pain-point 2), Fork gains an
  AlertDialog confirm whose copy states the `FLAG[fork-humans]` semantics from `verbs/fork.ts`:
  *"Forks into a private copy from this message. Other people aren't carried over — you'll be the host
  of the copy."* Solo rooms keep today's quiet no-confirm fork.
- **The composer** keeps the pill, Send⇄Stop morph off `useTurnPhase`, IME guard, clear-on-commit, and
  Wave A's continue-on-empty. The wand is replaced by the **Guide popover** (§3.1).

### 2.5 CONTEXT — config/detail

Keep all five built dual-mode tabs (Overrides · Roster · Group · Preview · Injections —
`chat-context-panel-surface.tsx` + the draft twin, FINAL-Chats §7) and the Wave-C Lore tab. CONTEXT
holds actions ON the artifact, never navigation (§5.1).

**Roster-size progressive disclosure (BRIEF §4b — the explicit audit, against the owner-designated
neo-tavern reference `group-config.ts` + the built gates).** Rule: **every group-only control is hidden
at roster ≤ 1 character and revealed as the roster grows**; the built gates already enforce most of it —
this table makes the rule explicit per control so a builder can't ship group machinery into a solo room:

| Control | Reveal rule | Where it's gated today |
| - | - | - |
| Roster tab (mute · talkativeness · force-turn) | host AND >1 character | built (FINAL-Chats §7) |
| Group tab (output narrator⇄per-speaker DU · policy ×5 · speakerTags · groupNudge · cardScope/member-card visibility · auto-mode maxTurns/delayMs/allowSelfResponses + cost warning) | host AND >1 character | built (FINAL-Chats §7; inventory = neo `group-config.ts` + the built tab) |
| Cast bar (+ its host-only `+` → AddMemberPopover) | >1 character (`cast.length <= 1 → null`) | built (`chat-cast-bar.tsx` L61) |
| SPEAK-AS (summon a speaker) | size-gated to >1 character | built (`speak-as-select.tsx`, FINAL-Chats §6.4) |
| People section / invite / handoff chrome | multi-human capability probe (FIX #2); single-user installs render none of it | FINAL-Chats §8.1 |
| **The growth seed (net-new, small):** an "Add character…" row in the ⋯ options menu (host) | **visible at ANY roster size** — at roster = 1 the cast bar and Roster tab are both hidden, so today a solo room has NO path to become a group (verified: `chat-options-menu.tsx` has no add row; the cast bar's `+` is inside the ≤1-gated bar). The row opens the same picker body `add-member-popover.tsx` uses, presented as a Dialog when no bar exists to anchor it. Fires the built `addCharacterToChat`. | net-new client row over a built verb |

The last row is the disclosure rule's missing half: controls reveal as the roster grows **only if a solo
room has a way to grow** — the seed affordance is this pitch's §4b disclosure contribution.

---

## 3. The flagship: steering promoted — the Guide popover, the variant tray

Per the critique's cross-pitch verdict (§4.1): the steering convergence is signal about *where* the
value is and a trap about *how much*. My sizing: a popover-with-its-own-input — bigger than a re-voice
(it fixes the two-input model), smaller than an inline command grammar (which needs a parser and a
grammar nobody asked for). The flagship **blocks on zero FIX rows** — every verb it fires is on the
router today (critique §4.4 notes this schedule advantage; saying it out loud as instructed).

### 3.1 The Guide popover (replaces the wand dropdown; same dispatch, fixed input model)

Today's wand (`composer-wand.tsx`) is a Menu whose items consume the composer's draft text as the steer
and which is *disabled entirely when the composer is empty* (its own header: "the trigger itself gates
on a non-empty draft"). That coupling is the usability defect: you must pre-type your steer into the
message box, then find the dropdown, and the box you thought was your message vanishes into a parameter.

**The Guide popover** keeps the dispatch (`use-guided-actions.ts` — UNCHANGED) and replaces the
presentation: the same composer-left button (wand icon, `aria-label="Guided generations"`) opens an
anchored Base UI popover (not a modal — UI-Arch §4.2 rule 5; same class as the built
`add-member-popover`) containing:

- **One steer field of its own** — a single-line input, placeholder "Optional direction for the next
  generation…". **The two-input rule (I-M5), stated as spec:** *the Guide popover NEVER reads or clears
  the composer draft; its steer is its own field; the wand's non-empty-draft trigger gate is deliberately
  removed* (the popover is openable any time the turn machine is `idle`). The composer draft is only
  ever a message (Send's property); the steer is only ever a parameter.
- **The action rows, canonical labels (I-M4 resolved: rule-10 compliance by keeping the EXISTING labels
  everywhere):** `Guided response` · `Guided swipe` · `Guided continue` · `Impersonate ▸`
  (1st/2nd/3rd-person submenu) — byte-identical to today's wand labels (`composer-wand.tsx` L106–121),
  so the swipe chevron's tooltip, the continue-on-empty Send morph ("Continue"), and the options-menu
  rows keep their one canonical name per verb. Rev-0's fiction labels ("Try that again", "Take it
  further") are DROPPED. Any flavor lives in a muted description line under an item, never in the label.
- Each row fires its verb with `guided: { action, input: steerField, placement }` — the typed
  `GuidedSteer` (`domain/chat/contract/params.ts` L64; placement default `{kind:"system"}` = the
  `{{guided_instruction}}` marker; the steer reaches the model only via placement, never history —
  L56–58). Verbs: `generate` / `swipe` / `continueTurn` / `impersonate`, all router-live (the #27
  exposures, `routers/chat.ts`).
- Tail-gating unchanged: swipe/continue rows disable when there is no tail assistant slot (the built
  gate). In a DRAFT the popover shows the one degenerate item, canonical label `Guide the opening`
  (§4.2 step 3).
- **Keyboard:** the button is in the composer's tab order; the popover is Base-UI focus-managed;
  Enter in the steer field fires the first enabled action; Esc closes and returns focus to the trigger.

### 3.2 The variant tray (swipe gallery + branch — the ST steal, sequenced honestly)

The tail swipe counter (`swipe-strip.tsx`, mono `idx/total`) becomes a **real button** (I-m2) that opens
an anchored popover listing the slot's variants via `chat.listMessageVariants` (router-live,
`routers/chat.ts` L337). Per row: the variant's opening line (plain text) + two actions:

- **Select** — `chat.selectVariant` (pointer move, zero copy, D26). Bus-confirmed (`variantSelected`).
- **Branch from this variant** — **a two-verb sequence, stated (I-M3):** if the row is not the selected
  variant, fire `selectVariant(variantId)` first and await its bus confirm, THEN
  `forkChat({throughSeq})`. Fork remaps the copy's `selectedVariantId` to the copied *selected* variant
  (`verbs/fork.ts` header), so the pre-select is what makes the branch land on the chosen variant.
  **Stated side effect:** the pre-select also steps the SOURCE chat's pointer to that variant — visible
  in the strip and reversible by stepping back; the tray's own Select action is the same operation, so
  the composition is coherent rather than surprising. The fork then navigates (`onChatForked` →
  `selectChat(newId)` — the one seam, FINAL-Chats §9d).
- **Fork-humans copy (cross-pitch defect #3):** in a >1-human room the Branch action confirms with the
  same copy as §2.4's Fork ("private copy — other people aren't carried over; you'll be the host").
- **Keyboard (I-m2):** the tray rows are a listbox — ArrowUp/Down traverse, Enter = Select, and each
  row's actions are reachable via a per-row menu (Enter opens it) so Branch has a non-pointer path.
  Coarse pointers get always-visible row actions.
- Gated on `variantCount > 1`; plain rows only (no iframes — no keep-mounted concern); reads
  `useTurnPhase` in render only (pain-points 1/4).

### 3.3 Chat style — scope-honest (I-M2 resolved)

`chatStyle` is one account-wide synced pref (`use-chat-style.ts` — `UserSettings.appearance.chatStyle`;
the §12.1 persistence rule). Rev-0's room-header "Set the mood" control implied room scope while
mutating the global — wrong. Fixed, two stages:

- **v1 (this pitch's spec):** the room-header affordance is a **shortcut** — "Chat style…" in the ⋯
  options menu opens Settings → Appearance pre-focused on the chatStyle control. No law bent, no scope
  lie; discovery of the five immersive modes is still one menu away from the room.
- **v2 (rides §7 ask #1):** the scene-atmosphere override is a `ThemeOverride`, and the ThemeOverride
  subset already includes `chatStyle` + density (UI-Theming §12.1; FINAL-Character §8.1 control table) —
  so when the atmosphere ask lands, a **per-room** chatStyle exists natively, host-set, scoped honestly
  to the room, no second mechanism.
- Rev-0's "make the default skin immersive for new users" is withdrawn as a designer decision and filed
  as an **explicit owner ask** (§8 item B) — theming-axis defaults are user-pref territory
  (UI-Theming §12.1), not mine.

---

## 4. Flows (numbered; verb per step; commit model stated)

### 4.1 First-run / empty state

1. App opens on `{kind:"landing"}` (FINAL-Chats §5 — never an empty room): hero + recents (≤8) +
   quick-picks (≤6). *Two suspense reads; no verb.*
2. Empty library → same component shows "Create your first character" (data-driven, no `if(empty)`
   branch). *`setActiveSection("characters")`.*

### 4.2 Create a chat — scene-setting

1. Any `+` / ⌘K / quick-pick → the J2 picker (built). Pick N characters or Blank (character-first,
   §4.3 rule 2). *`startNewChat({characterIds})` + `setActiveSection("chats")` + `closeModal`.* A DRAFT
   mounts; **no server row exists** (LAW 1); every edit below is a `draft-config-store` write.
2. The greeting thread renders each founding character's greeting as a normal editable row
   (`synthGreetingRow`). The greeting swipe strip (`greeting-swipe-strip.tsx`, built) steps between the
   card's alternate greetings — pick the opening beat. *Store writes (`greeting` binding).*
3. **Directed opening:** the Guide popover in a draft shows `Guide the opening` — type a one-line
   direction ("open in the rain-soaked market") → fires `startChat` with `opening:"generate"` FORCED +
   `guided:{action:"opening", input}` (`use-guided-actions.ts` `fireOpening` — verified; the
   `OpeningPolicy` union is `greet-all | generate | none | first-message`, `@orb/contracts/chat` L896).
   The model writes a cast-aware opening instead of a canned greeting. *This commits the chat* (the
   opening path IS a startChat).
4. Otherwise, first **Send** carries the whole draft config atomically into `chat.startChat`
   (greetings · rosterOverrides · groupConfig · roomOverrides · injections — FINAL-Chats §2/§9b) →
   `commitDraft(chatId)` promotes the handle WITHOUT remounting (pain-point 5) → `clearDraftConfig`.

### 4.3 In-room messaging

- **Send:** *`chat.send`* (immediate; promise spans the turn). `messageCommitted` clears the composer;
  ghost streams; `turnCompleted` swaps the canonical row via the bus (§9c).
- **Steer / regen / continue / impersonate:** Guide popover (§3.1) → the matching verb with the popover's
  own steer. *Immediate.*
- **Edit:** hover/focus-within → Edit → inline textarea (state in `message-edit-draft` store — survives
  scroll, PD-119). *`chat.editMessage`* (immediate).
- **Branch:** per-message Fork (with the >1-human confirm, §2.4) or the variant tray's sequenced
  Select→Fork (§3.2). *`chat.forkChat({throughSeq})`* → navigates.
- **Stop:** the morph. *`markStopping` + `abort`* — slot closes on the bus terminal.

### 4.4 Multi-human — invite → join → host actions (+ this pitch's owned additions)

The invite/membership/notifications cluster is domain-complete and transport-dark (verified:
`createInvite`/`previewInvite`/`redeemInvite`/`kick`/`selfLeave`/`nominateHostHandoff`/
`acceptHostHandoff` absent from `routers/chat.ts`; `listInvites` is NOT on the service contract —
the persistence read `listInvitesForChat` exists at `domain/chat/persistence/invites.ts` L30, so FIX #4
adds the service + router rows over a built read — I-m3 tightened). Baseline flows are FINAL-Chats §8
(mint dialog, `/join/:token` route, People section, kick/leave/handoff, the bell + notifications slice,
capability-probe hiding on single-user installs). On top of that inherited wave, this pitch **owns**:

1. **Shared scene atmosphere (§7 ask #1).** Host opens CONTEXT → a new **Scene** section (host-write,
   member-read; sits beside Overrides): the same clamped token-control cluster the character Appearance
   tab reuses (FINAL-Character §8.1), bound to the ROOM. *Immediate-commit* (`chat.setChatTheme`, the
   ask) → `chatUpdated` on the bus → **every member's room chrome re-renders in the staged look**, and
   the same user's other devices follow (the override lives on the chat row — server truth, not a device
   pref). A member gets a device-local "Use my own theme in this room" opt-out toggle (view pref;
   Zustand-persist — the §12.1-sanctioned home). Values are clamped by the SAME `ThemeOverride` Zod
   clamp (§12.1 — colors can't select/execute/exfiltrate), so a hostile host can at worst be ugly.
2. **The join moment.** The `/join/:token` preview (FIX #1) renders inside the room's atmosphere: the
   `previewInvite` view gains the room's clamped atmosphere override (rider on ask #1) so the preview
   page is wrapped in that `<ThemeScope>` — the invitee sees the room's staging before accepting.
   Privacy note, flagged honestly: `previewInvite` deliberately leaks NO roster identities
   (FINAL-Chats §8.2); an atmosphere is host-authored room chrome, not identity, but the owner should
   ratify that classification before the rider lands (§8 item C).
3. **Composing presence (§7 ask #2).** While another human in the room is typing, their chip in the cast
   bar's human section (the §8.3 human chips) carries a subtle composing indicator, and a one-line
   "Kestrel is writing…" cue sits above the composer (quiet, text-only, `aria-live="polite"`).
   Ephemeral — never persisted, never in the transcript.
4. **Membership events as thread dividers** — inherited law (FINAL-Chats §13), kept: "X joined",
   sentence-case system dividers, never toasts-over-transcript.

### 4.5 Dual-device — live spectate (designed, mostly already true)

The per-chat stream carries the WHOLE turn lifecycle **including token deltas** — `ChatBusEvent`
has a `{type:"delta"}` member (`packages/contracts/src/chat/index.ts` L657) and `chat.streamMessages`
yields to every subscribed member with a per-yield membership gate (`routers/chat.ts`). So a second
device (or a second human) with the room open receives `turnStarted → delta → turnCompleted` live —
**the transport for "watch the scene stream on your phone while the desktop drives" already exists.**
This pitch turns that from an accident into a designed experience:

1. Open the same chat on device B → the SSE attaches → device B's ghost row streams the in-flight turn
   with the full immersive decoration (the ghost is the one token subscriber on EACH client — the
   §11.1 rule is per-client, not per-account).
2. **Client fix this requires (small, named):** the ghost's speaker attribution for a non-initiating
   viewer — `ghost-message-row.tsx`'s own header notes the roster/persona name wiring "is undefined
   until a caller wires the room's roster/persona names down to the ghost." Wire it (the
   `turnStarted` event carries `speakerCharacterId` — contracts L672–683), so a spectating device shows
   WHO is speaking, not an anonymous ghost.
3. Stop stays honest on both devices: `useTurnPhase` derives from the same bus events; the initiating
   device's Stop aborts, the spectator's slot closes on the shared terminal event.
4. **Build checkpoint, stated:** verify the spectator ghost renders mid-turn on a second session at
   build time (the wiring says it does; the claim is design-around-verified-transport, not tested UX).
   Zero server cost.

### 4.6 Context-panel work

Toggle Panels (header) → CONTEXT docks → the five tabs + Scene (§4.4) + Lore (Wave C). Overrides =
4-field autosave; Injections = per-row autosave, "off" is delete; Group = whole-object DU rebuild;
Roster = immediate verbs (all FINAL-Chats §7, built). Commit models unchanged from the §2 table.

---

## 5. Click economy (typing counted symmetrically — I-m4 / cross-pitch defect #5)

Notation: c = click/tap, t = a typing act. Baseline = FINAL-Chats §10 + the built wand's actual flow.

| Task | Today | This design |
| - | - | - |
| Cold → resume last conversation | 1c | 1c |
| New chat with a known character | 2c | 2c |
| New chat with a directed opening | 2c + t (steer typed into composer) + 2c (wand → Guide the opening) | 2c + 1c (Guide) + t + Enter — **same cost; the steer has its own labeled field instead of hijacking the message box** |
| Send → read reply | t + 1c, 0 extra | same |
| Reroll the last reply | 1c (chevron / ArrowRight) | 1c (chevron) — unchanged; also reachable as Guide → Guided swipe |
| Steer the next reply | t (steer into composer) + 2c (wand → Guided response) | 1c (Guide) + t + Enter — **\~even on gestures; the win is the composer draft is no longer consumed and the empty-composer case works at all** (today's wand is disabled on an empty draft) |
| Impersonate | t + 2–3c (wand → Impersonate → person) | 1c + 0–1t + 1–2c — \~even; same submenu |
| Branch from a NON-selected variant | \~1–5c (chevron-step to it) + 1c hover Fork | 1c (counter) + 1–2c (row → Branch) — **wins when the slot is deep; states the select side-effect honestly (§3.2)** |
| Enter/leave the focus posture | hunt (no visible affordance) | 1c (header Panels toggle); solo rooms open IN it (amendment A) |
| Change chat style | Settings → Appearance → find control (\~3–4c) | 2c (⋯ → Chat style…, lands pre-focused) — a shortcut, not a new scope |
| Stage the room's look for everyone (host) | impossible (viewer-local only) | 2c (CONTEXT → Scene) + per-control gestures — **new capability (ask #1)** |
| Mute a group member | 2c | 2c (unchanged) |
| Invite someone (host) | 3 gestures | 3 (unchanged, FINAL-Chats §10) |
| Accept an invite | 2c | 2c (+ the preview now shows the room's staging) |
| Stop a runaway generation | 1c | 1c (either device, §4.5) |

No FINAL-Chats §10 target regresses. The steering rows are now claimed as *quality* wins at equal
gesture cost, not phantom click wins.

---

## 6. Kept vs replaced (honest demolition cost)

**KEPT wholesale (FINAL-Chats §12 DO-NOT-REBUILD, verified on disk):** the room composition
(`chat-room-surface` + `message-list-surface` + thread + ghost + edit-in-place + selection bar) · the
LANDING · the LIST + row kebab · the J2 picker · ⌘K · the options menu (extended, below) · the CONTEXT
panel + draft twin + all five tab editors · the cast bar + `add-member-popover` · `speak-as-select` ·
the draft system · the active-chat store + KEY DISCIPLINE · the bus stack + `chat-stream` machine ·
arbitration + @mention · opening policies · render trust · the immersive visual system + persona system
(their FINALs) · the context-boundary divider **verbatim** ("In context from here").

**REPLACED (one component's presentation; dispatch kept):** `composer-wand.tsx`'s Menu → the Guide
popover (§3.1) — `use-guided-actions.ts` untouched; the wand's composer-consume + non-empty-draft gate
are deliberately deleted behaviors (the two-input fix), and its five item labels are kept verbatim.

**NET-NEW client (small, enumerated):**

- The variant tray (§3.2) — one popover over three live verbs.
- The Panels header toggle + the composition-scoped posture seed inside `selectChat`/`startNewChat`/
  `commitDraft` (§2.1) — store-action edits, no new store.
- The ⋯ menu "Add character…" row (the solo→group growth seed, §2.5) over built `addCharacterToChat`.
- The ⋯ menu "Chat style…" shortcut (§3.3 v1).
- The fork confirm copy in >1-human rooms (§2.4).
- The Scene section in CONTEXT + the room `<ThemeScope>` layer + the member opt-out toggle (§4.4 #1 —
  client half of ask #1; reuses the FINAL-Character §8.1 control cluster).
- The composing cue (cast-bar chip state + the one-line composer cue) — client half of ask #2.
- The spectator-ghost attribution wiring (§4.5 #2 — a prop chain the ghost's header already anticipates).
- **Inherited, not mine (the FINAL's scheduled waves):** multi-human client (Wave B), LIST denorms
  (Wave A), continue-on-empty + undo/redo-continue (Wave A), notifications slice, Lore tab (Wave C).

**DELETED:** the wand's two coupling behaviors named above. No surface is demolished.

**Build-order honesty (critique §4.4):** the flagship (§3.1/§3.2) blocks on **zero** FIX rows — every
verb is router-live today. The multi-human wave blocks on FIX #1/#2/#4 (as it does for every pitch).
Asks #1/#2 are additive and block nothing else.

---

## 7. Server asks

BRIEF §4 (amended): asks serving dual-device/multi-human are rewarded — both asks below are aimed
squarely at that zone. Everything else in this pitch fires existing router verbs.

1. **Scene atmosphere — a per-room, host-set `ThemeOverride` every member renders.**
   *What:* one nullable clamped-`ThemeOverride` field on the chat row + one host verb
   (`chat.setChatTheme`, immediate-commit, `requireHost`) + carry on `ChatDetail` (+ the optional
   `previewInvite` rider, §4.4 #2) + the `chatUpdated` bus fan it already gets for free.
   *Why it's this direction's ask:* it makes immersion a property of the ROOM — shared staging for
   multi-human (the host sets the scene everyone sees) and automatic dual-device coherence (server row,
   not a device pref). It lands on the seam the law explicitly left open: UI-Theming §12.1 defers
   per-chat theme scope with "the resolution order accepts them later without rework"; the clamp, the
   control cluster (FINAL-Character §8.1), and the `<ThemeScope>` nesting resolution (§8.2) all exist.
   And because the ThemeOverride subset includes `chatStyle`/density (§12.1), it retroactively gives the
   §3.3 chat-style story a true per-room scope with no second mechanism.
   *Precedence:* propose chat > character > global > default; the exact slot (above or below character)
   is an **owner ruling at build** — both orders are pure ThemeScope nesting order, zero merge code.
   *Cost guess:* S–M — one column + one verb + contract/view carry + one client ThemeScope layer +
   the Scene control section (reused cluster). No new clamp, no new resolution engine.
2. **Composing signal — an ephemeral per-chat presence event.**
   *What:* a `{type:"composing", chatId, userId}` ephemeral `ChatBusEvent` member (the landed
   `{type:"expression"}` ephemeral member is the exact precedent — same replay-guard posture, never
   persisted) + a tiny rate-limited `chat.signalComposing` mutation the composer calls throttled
   (leading-edge + \~4s repeat while typing continues).
   *Why:* multi-human presence-in-the-room — a scene with other humans should feel occupied.
   *Cost guess:* S — one contract member + one thin verb + throttle client-side. Honest note: this is a
   genuinely NEW verb (nothing existing does it); it is claimed under the §4 reward zone, not smuggled.
3. **Not an ask — a designed claim on built transport:** dual-device live spectate (§4.5) rides the
   existing `{type:"delta"}` per-chat stream; its cost is one client prop-wiring task + a build-time
   verification checkpoint, both named in §4.5.

**Declined ask (named so the omission is a choice):** a user-bus presence/streaming fan for LIST-level
"live" pips (the Greenfield pitch's zone). Real, but it serves inbox awareness more than in-room
immersion; one direction, one bet — this pitch spends its ask budget inside the room.

## 8. Law-amendment asks

**A. `SECTION_PANEL_DEFAULTS` / UI-Arch §4.1-§4.2-rule-3 — composition-scoped Chats posture
(the rev-0 disqualification fix — filed properly).**
*Current law:* `chats: { list: "docked", context: "collapsed" }` (`rail-slots.ts` L107–113); the map
header anticipates a chat-lane runtime seed via `setPanelMode` for state-dependent behavior.
*Proposed amendment:* the Chats section gains a composition-aware posture SEED, applied inside the
`selectChat`/`startNewChat`/`commitDraft` store actions (never an effect — §5.1): **solo room open ⇒
LIST `overlay` + CONTEXT `collapsed`; group/multi-human room open ⇒ LIST stays `docked`; no chat open ⇒
the boot map unchanged; any user toggle wins thereafter** (the amendment touches only the seed, rule 3
intact).
*The conflict, argued (the coordinator flagged it):* the Discord pitch amends the SAME map in the
opposite direction — CONTEXT docked for groups (membership legibility). **These amendments are
compatible, not competing:** mine claims the solo composition for focus; theirs claims the group
composition for legibility; adopted together the space partitions cleanly (solo = focus posture ·
group = docked LIST + docked CONTEXT). My side of the argument where they'd overlap: in the SOLO
composition the shipped solo-chrome takeover (FINAL-Chats §6) already hands the room chrome to the
character's theme — the product's own built behavior says a solo room is a place you inhabit, and a
docked collection list beside it is chrome the composition has outgrown. For GROUPS I concede
legibility outright — that is their strongest ground and this direction's weakest, and a partitioned
ruling costs me nothing I need. The owner adjudicates.
*Mechanism divergence, named (the D-m3 discipline):* the map header anticipates a one-time seed on
chat COMMIT; this amendment widens it to chat OPEN and makes it composition-read — the seed lives in
the store actions the navigation already routes through, so no new reader shape and no effect.

**B. Owner ask (explicit, not a designer decision):** should a fresh install's default
`appearance.chatStyle` be one of the immersive modes rather than `bubble` (the current ST-parity
fallback, `use-chat-style.ts`)? Theming axes are user prefs with owner-ruled defaults
(UI-Theming §12.1) — rev-0 tried to decide this silently; it is now filed as a question, default
answer "no change."

**C. Rider ruling for ask #1 (flagged, not assumed):** classify a host-set room atmosphere as
non-identity room chrome for `previewInvite` purposes (§4.4 #2), or keep the preview atmosphere-free.
Either answer leaves ask #1 intact.

## 9. Seams (one line each — where the in-the-wings sets land)

- **expressions:** the sprite swap rides the landed `{type:"expression"}` ephemeral bus member → a
  sprite slot in CONTENT (solo-first; defers to the row-skin portraits in groups); authoring = the
  character editor's future tab (FINAL-Character §14). The focus posture is its natural host.
- **crew:** member tabs land as `CHAT_CONTEXT_SLOTS` entries beside §7's tabs; reactions in
  `CHAT_SURFACE_SLOTS` message-footer (FINAL-Chats §14 #23–25).
- **automation:** `/`-commands are automation's lane (FINAL-Chats §6.4); the Guide popover is the
  guided sibling, not a competitor; a saved-steer quick-action would ride automation's rule store later.
- **tool-use:** `TOOL_RENDERERS` `<details>` block in the thread (FINAL-Chats §14 #25).
- **rpg:** GM seat = roster kind; `postNarratorMessage` = a thread-render bus arm; a future GM surface
  can graft rows into the Guide popover (one registry-shaped list).
- **hub-browse:** rail-level; imports feed the J2 picker. No in-room seam owed.
- **databank:** `{{databank}}` is assembly-side; a chat knowledge slice = a CONTEXT tab beside Lore.
- **buddy-observer:** ephemeral bus reactions → message-footer slot; self-quip = a thread arm (D60).
- **agent-principal:** `chat.seatAgent` + the `agent` roster kind → Roster row kind; attribution is
  KIND-READY (FINAL-Chats §14).

## 10. Risks & open questions

1. **The amendment adjudication (A) could go against solo-focus.** If the owner rules for uniform docked
   defaults, the pitch degrades gracefully: the Panels toggle still exists, focus is 1 click away, and
   everything else here is independent of the default. The flagship does not depend on the amendment.
2. **Scene atmosphere vs member autonomy.** A host staging MY reading surface is the design's sharpest
   value judgment. Mitigations shipped with it: the clamp (no injection surface), display-only tokens
   (never generation), and the member device-local opt-out. Open: should the opt-out be synced instead
   of device-local? (Lean: device-local — it's a viewing condition, like panel modes.)
3. **Atmosphere precedence (chat vs character) is a real fork** — in a solo room both the character
   override and a room atmosphere could claim the chrome. Deferred to the owner ruling named in §7 ask
   \#1; both orders are one nesting swap.
4. **The spectate claim rides transport verification.** The delta member + per-yield gate are verified
   in contracts/transport; the end-to-end "second session's ghost streams" is asserted from wiring, not
   from a run — hence the named build checkpoint (§4.5 #4). If a gap surfaces (e.g. the stream attaches
   but the ghost store needs a turn-in-progress snapshot on late attach), the fix is client-side
   (seed the machine from the in-flight state on subscribe) — flagged, not designed away.
5. **The composing signal can get noisy in big rooms.** Throttle + cap the cue to one line
   ("N people are writing…" past 2). If the owner judges it chatty, it's severable — nothing else
   depends on it.
6. **Two popovers near the composer (Guide, variant tray) must not stack confusion.** Both are
   single-purpose, anchored, Esc-dismissed, and never open simultaneously (opening one closes the
   other via the shared Base UI dismiss behavior). Side-eye should verify the coarse-pointer reach.
7. **What I'm least sure of:** whether the Guide popover's own steer field fully retires the "steer
   lives in the composer" habit for migrating ST/neo users, or whether a transition affordance is
   needed (e.g. a one-time hint when a user types in the composer then opens Guide). I flag it for the
   side-eye pass rather than speculatively building the hint.
