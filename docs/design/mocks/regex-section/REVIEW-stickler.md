---
kind: review
status: active
updated: 2026-09-05
---

# Stickler review — the room's Regex section (DESIGN-regex-panel.md + build.mjs/canvas.html)

Lane **cb-regex-stickler** · 2026-09-05 · read-only on the repo (reads + `ast-grep`/`pnpm ast` only; load 30.2 at start) ·
subject: `scratchpad/st-regex/DESIGN-regex-panel.md` §1–§7, the mock `build.mjs` (DATA/RENDER blocks = the spec's
literal form), `STUDY.md`, `PROPOSAL-{ia,ux,sys}.md`. The side-eye lane owns visual/a11y; this review owns the
information architecture against the law, the interaction contract, and the coupled-site truth.

## 0. Verdict

**BUILD WITH NAMED CHANGES — not a redraw.** The skeleton survives every ruling I could find: a `Regex`
`DisclosureSection` in the This-chat tab (the #616 ruling, `settings-context-tab.tsx:31-37`), closed with a count
chip (#830), member-readable chat tier in the Lorebooks shape, a host-only effective read under D19, the row switch
as the library `enabled` (a different column from the 2026-08-19 fork's ATTACH control), the tier allows as a
`ChatMetadata` sub-blob on the `commitMetadataUpdate` path, drop-before-dedup, #1733 first. What does not survive
is the mock's treatment of the **display leg** (P1 — the tier and master switches structurally cannot touch a
DISPLAY placement, and the intro line says they do), the **read shape** (P1 — `EffectiveRegexRow` as specified
cannot render board 02's inert rows without the client re-deriving the union), and a cluster of P2s the build
brief must absorb: per-character switches make the un-flatten a resolver-contract change rather than a read
nicety; the mock's one dedup example is drawn at the wrong tier; the attach dialog is specified as one component
and drawn as another; the chat tier can carry a script the current host does not own and every drawn control on
that row is dead; the "no toast for a chat-only script" rule cannot be decided from the data the read carries.
Three owner forks are named with defaults (the `Everywhere` tier switch, the scope-word map row, card-lifted
default-on). Zero findings are law violations that would refuse the build; every one is a change the build brief
can carry.

## 1. Confirmed findings, ranked

### F1 · P1 · The section draws ONE pipeline over two legs — the tier/master switches cannot govern a DISPLAY placement, and the mock says they do

- **What.** Board 01's intro reads "**Display** rules change what you see now … a tier's switch turns it off
  **here**" (`build.mjs:191`), tier rows carry display glyphs (`Em-dash killer` stages `[0,1,1,0,0,0]`,
  `Alice italics` `[0,0,0,0,0,1]` = DISPLAY-only, `build.mjs:158,160`), and DESIGN §3 says the master and tier
  switches are "the A/B lever". On the tree the display leg reads **no junction at all**: `useDisplayScripts`
  composes the viewer's WHOLE library narrowed to `enabled ∩ DISPLAY` (`packages/client/src/data/use-display-scripts.ts:55-58, 73-77`)
  plus, when the host opted in, the host's WHOLE library the same way (`list-room-display-scripts.ts:28-29`),
  and runs it inside `renderMessageForDisplay` (`lib/message-render.ts:119-127`). The server union
  (`resolveHostTierRegexScripts`) feeds only the prompt legs — SEND/RECEIVE (`engine/pipeline.ts:352,406`),
  the assembled history (`assembly/context.ts:863`), the preview (`verbs/read.ts:984`). A `regexTiers` allow or a
  `regexEnabled` master dropped inside that resolver therefore changes nothing a viewer SEES.
- **Failure scenario.** Host flips `From the preset` OFF (board 02): `Trim trailing hedges` (prompt-only) stops
  on the next reply — correct; but a preset-attached script with a DISPLAY placement keeps repainting the
  transcript, drawn inert under a tier the host just switched off. Host flips `Run regex in this chat` OFF: the
  transcript still shows display-regexed text. This is the exact bug report the IA lane's dropped sentence
  ("Your own display scripts still change what you see", `PROPOSAL-ia.md` §2.4) existed to prevent; the
  synthesis kept the claim and dropped the caveat.
- **Second half of the same defect.** The panel's roster is also INCOMPLETE for the display leg: a DISPLAY
  script in the viewer's library that is attached NOWHERE runs on every transcript (`use-display-scripts.ts:55-58`
  filters by `enabled`+placement only) and appears in no tier group; conversely a DISPLAY-only script attached at
  the preset tier is listed under `From the preset` although the preset has nothing to do with its running.
- **Law.** D53 / D121-E (registry:130, 340): "the per-user `markdownOnly` DISPLAY tier … the flags ARE the tier
  discriminant"; the O-4 ruling (`use-display-scripts.ts:9-23`) — two tiers (broadcast, then the viewer's own),
  attachment-blind by construction. The IA proposal named the rule ("Do not draw one pipeline over both legs",
  §"What I would NOT do" 8); the DESIGN does not carry it.
- **Change.** (a) Tier groups list **prompt-leg participation only**: a row whose placement set has a
  prompt-side member; a DISPLAY-only row attached at a tier does not belong under the tier. (b) The `ON SCREEN`
  group becomes the display leg's REAL roster — exactly `useDisplayScripts(chatId)`'s output (the viewer's
  own `enabled ∩ DISPLAY`, preceded by the host's broadcast set when ON), provenance per row (`yours` /
  `the host's`), the row's `enabled` switch as its only lever (the only one that exists), and the broadcast
  switch beneath it. A script on both legs appears in BOTH groups with its glyph strip — that is the truth of
  the model, not a duplicate. (c) Copy: the master and tier switches say "prompt" ("Run regex on this chat's
  prompts" or a scope line), and the intro says what you see is your display scripts, untiered. (d) The kicker
  count is the prompt-leg effective set; `ON SCREEN` carries its own count. (e) Pin: a DISPLAY-only row is never
  rendered inert by a tier flip; a tier flip never changes `useDisplayScripts`'s output.
- **The O-4 property survives the move.** The broadcast switch relocating from `Host controls › Appearance`
  into this section touches neither `chat.setHostDisplayScripts` nor `chatMetadata.hostDisplayScripts` nor
  `listRoomDisplayScripts`'s off arm (`roster.ts:355-369`, `entry/compose/regex.ts:57-74`,
  `list-room-display-scripts.ts:24-27`), so "a room that never touched the toggle is byte-identical" holds by
  construction. Q4 is otherwise clean; only the intro's claim fails (above).

### F2 · P1 · The specified read shape cannot render board 02 — and the mock numbers rows that do not run

- **What.** DESIGN §6 specifies `EffectiveRegexRow { script, tiers: [{scope, position}] }` = the resolver's
  post-drop, deduped output, and §3 says "a tier that is off keeps its rows visible and inert". Those two
  sentences contradict: the drop happens **before** dedup inside the resolver (§6, the sys lane's load-bearing
  pin), so an OFF tier's rows are not in the resolver's output at all. Rendering them means the client holds the
  UNFILTERED per-tier lists and re-derives the effective set — precisely the "never a client re-union of four
  lists" pin the UX proposal owes (`PROPOSAL-ux.md` §"The pins the build owes"), and the way the panel's rank
  drifts from the turn's.
- **Mock defect in the same shape.** `build.mjs:205-207` increments `rank` for every row regardless of
  `tierOn`, so on board 02 `Trim trailing hedges` (inert, does not run) is `3` and `Alice italics` is still `4`
  — the rank column claims a run position for a script the resolver dropped, on the board whose whole point is
  the flip.
- **Change.** ONE pure function in `substrate/regex-tier.ts` takes `{sources, allow}` and returns BOTH the
  per-tier attachment listing (every attached row, dropped or not, with its slice position and whether its tier
  is allowed) and the effective run order `[{scriptId, runsAt: RegexAttachScope}]`; the turn calls it for the
  effective list, the read returns both halves. The client renders groups from the listing, marks inert from
  `allow`/master, prints rank ONLY from the effective half (an inert or deduped-away row shows no rank), and
  derives `+N` from the row's other tiers. Pin: preset OFF with a script at preset+chat → the row's rank moves to
  its chat position; inert rows keep their place and lose their rank. This also fixes the order-of-provenance
  question in F4: `runsAt` is data, never a client guess.

### F3 · P2 · Per-character tier switches make the un-flatten a RESOLVER-CONTRACT change, not an optional read nicety, and the allow blob is id-keyed

- **What.** The mock draws a switch per present character (`build.mjs:167-168, 202`; DESIGN §3 "one per
  present character"). Dropping ONE character's scripts before dedup requires the resolver to know which seat
  contributed which row — and `HostTierRegexSources.character` is a flat concatenation
  (`domain/chat/contract/regex.ts:28`, `domain/regex/contract/resolve.ts:39`) that `resolve-sources.ts:31`
  computes per character and then `flatMap`s away. DESIGN §6 files the un-flatten under "the effective read"
  only, and `PROPOSAL-sys.md` §Q1 calls it skippable ("cost 0"). With per-character switches it is neither.
- **Coupled sites (all tsc-forced once the field's type changes).** `domain/regex/contract/resolve.ts:39` ·
  `persistence/resolve-sources.ts:31,45` · `domain/chat/contract/regex.ts:28` · `substrate/regex-tier.ts:23` ·
  `assemble-gather.ts:406-413` · `verbs/edit.ts:247-249` · `tests/server/domain/chat/substrate/regex-tier.test.ts:52-77`
  · the vocabulary-map row "The seated characters' regex-scope slice — `HostTierRegexSources.character` /
  `ResolvedRegexSources.character`" (`docs/design/vocabulary-map.md`, the #903 C2 row) re-attests if the
  spelling changes.
- **The blob shape.** `regexTiers?: { preset?: boolean; chat?: boolean; characters?: Partial<Record<CharacterId, boolean>> }`
  — the id-keyed sub-blob precedent is `databankVisibility` (`contracts/src/chat/metadata.ts:246-250`, documentId
  vocabulary); a stale key for a departed character is unread, as it is there. **Absent ⇒ allowed is right**: the
  `hostDisplayScripts` absent-arm precedent (`metadata.ts:262-271`, `chat-detail.ts:74` `=== true`), every
  existing room byte-identical; there is no per-user default to inherit, so the `offerChoices` tri-state
  (`metadata.ts:272-282`) does not apply. `HostTierRegexSources.allow` must be a **required** field — an
  optional one does not force `edit.ts:247`.

### F4 · P2 · The mock's one dedup example is drawn at the WRONG tier — it teaches the rule backwards

- **What.** `Bo shouting` sits under `From Bo` with `+1 · also from Everywhere` (`build.mjs:161, 207`). The
  resolver's order is `[...hostGlobal, ...preset, ...character, ...chat]` with first occurrence kept
  (`substrate/regex-tier.ts:23-31`; schema header `db/src/schema/regex.ts:20-22` "earliest tier"), so a script
  attached at global AND at Bo runs at **Everywhere**, and the row belongs there with `+1 · From Bo`. DESIGN §3
  states the rule correctly ("once, at its earliest tier"); the canvas — "the spec's literal form" — contradicts
  it on the only row that illustrates it.
- **Consequence.** The panel's teaching device for dedup (and the reason the tier switch + dedup trap in
  `PROPOSAL-ux.md` §7.4 needs a pin) is demonstrated inverted to the owner and to the side-eye lane.

### F5 · P2 · `Add to this chat` is specified as the built picker and drawn as the sibling racks' dialog — and mounting the picker whole duplicates the section's own controls

- **What.** DESIGN §3 and §6 say the door opens "the built `RegexScriptPicker`, chat arm, in a dialog". That
  component renders the owner's WHOLE library as per-row ATTACH switches (`regex-script-picker.tsx:292-300`,
  `aria-label="Attach <name>"`) and, once anything is attached, mounts `RegexScopeOrder` over the attached slice
  ("Runs here, in order", `:169-186`). Inside the Regex section that is a **second live order editor for the same
  `chat_regex_scripts` junction** the section's drag grips edit, and a second detach door beside the row's
  `⋯ → Detach` — the "two live controls for one fact on one screen" class the 2026-08-19 fork removed
  (`regex-collection-rows.tsx:21-28`, `regex-context-body.tsx:9-16`), re-created inside a dialog over the
  section. Meanwhile the phone board draws a candidates-only sheet with checkboxes and `Attach 1`
  (`build.mjs:231`) — the grammar of `AddChatBookDialog` (`add-chat-book-dialog.tsx:1-24`: candidates = library
  minus attached, one-shot attach, closes on the pick, deliberately no search), which is what BOTH sibling racks
  in this pane ship.
- **Change.** Build the `AddChatBookDialog` twin (an `AddChatRegexScriptDialog`: `regex.listScripts` minus
  `listForChat`, one press = one `attachToChat`, `Disabled in your library` badge on a disabled candidate); leave
  `RegexScriptPicker` where it is. §6's "mount them — S / zero new client work" for attach becomes "one small
  dialog"; the section's grips stay the ONE order editor for the chat tier.

### F6 · P2 · The chat tier can carry a script the CURRENT host does not own — and every control the mock draws on that row is dead

- **What.** A host handoff repoints the room's BOOKS through `copyHandoffBooks` (`domain/chat/substrate/handoff-copy.ts:57,88,97` — `bookRepoint`); nothing repoints or clears the room's regex junction —
  `ast-grep run -p 'chatRegexScripts' -l ts packages/server/src/domain/chat` → **0 hits, scannedFileCount=134**,
  and `handoff-copy.ts` contains no `regex` (grep). The chat slice is not owner-filtered
  (`resolve-sources.ts:40` `listChatScripts(ctx.db, chatId)`; `contract/resolve.ts:9-11`), so the previous
  host's script keeps running under the new host's turns — that is the design (room-public prompt content). But
  on that row: the switch writes `regex.updateScript` (owner-gated → `RegexNotFoundError`), `Open in library`
  cannot resolve it (`listScripts` is owner-scoped), and **`Detach` throws** — `detach-from-chat.ts:16-19`
  re-checks `loadOwnedScript(ownerId, scriptId)`, the OPPOSITE of the books verb whose asymmetry is stated at
  `chat-books-section.tsx:106-110` ("deliberately does NOT re-check book ownership, so a book a PREVIOUS host
  attached is detachable too … the row would otherwise be a dead end after a handoff").
- **Consequence.** A pre-existing dead end the panel EXPOSES: a row with three controls that fail, on the tier
  the room is told it owns.
- **Change.** (a) Draw the "not yours" arm for a chat-tier row (name · "Attached by a previous host" · Detach
  only — no switch, no library door); the read marks it (`script.ownerId !== host` is knowable server-side).
  (b) File the verb asymmetry as its own row, a prerequisite of the section like #1733: drop the ownership
  re-check on `regex.detachFromChat` (the books precedent; `requireChatHost` stays the gate), red-first with a
  two-host handoff int test.

### F7 · P2 · "A chat-only script gets no toast" cannot be decided from the read — `tiers[]` is THIS room's union, not the script's usage

- **What.** DESIGN §3: "a flip that reaches beyond this chat raises a scoped toast with Undo … a chat-only
  script gets no toast"; the mock keys it on `s.tier === "chat"` (`build.mjs:244`). A row in `Only here` may be
  attached to any number of OTHER rooms, presets or characters not seated here — `regex_scripts.enabled` is one
  column (`schema/regex.ts:58`), off is off there too, and nothing in `EffectiveRegexRow.tiers` (this room's
  four scopes) can see it. The honest cross-room fact exists only in `listScriptUsage`
  (`list-script-usage.ts:29-33`, per script, owner-gated) — an N-query fan-out if asked per row.
- **Change.** The read carries `attachedElsewhere: boolean` per row (one grouped count over the four
  junctions for the row's script ids minus this room's own rows — a single owner-scoped query), and the toast
  fires on it; or every OFF flip toasts "Turned off everywhere it's used — Undo". `notify` already takes an
  `action` (`lib/notify.ts:24-37`), so the Undo half is buildable as drawn.

### F8 · P3 · Vocabulary — three of §4's attributions are wrong, and one new word collides with the sibling rack in the same pane

`docs/design/vocabulary-map.md` has **zero** regex or scope rows (read in full; grep `regex` → none in the
table). Against the tree:

| Word (DESIGN §4 claim) | Tree | Verdict |
| - | - | - |
| `Everywhere` "(map)" | NOT in the map. Shipped as the Documents rack's `global` scope label in THIS tab (`features/chat/lib/chat-documents-model.ts:53-54`) and the databank context kicker (`databank-context-body.tsx:177`) | word fine; attribution wrong |
| `Only here` (new) | the SAME pane's Documents rack spells the chat scope **`This chat`** (`chat-documents-model.ts:55`) | **collision**: two words for one scope in one pane. Default `This chat` (zero new words; yes, inside the "This chat" tab — the Documents chip already lives with that). Alternative = mint `Only here` as a map row AND re-spell the Documents chip in the same wave. Owner fork O3 |
| `From <character>` (new) | Documents says `From a character` because its view carries only the junction KIND (`:56-58`); the un-flattened read CAN name the character | consistent — a richer arm of the shipped grammar |
| `Add to this chat` "(the picker's shipped verb)" | NOT shipped anywhere in `packages/client/src` (only a comment in `roster-preset/hooks/use-saved-rosters.ts:2`, about rosters). The pane's shipped door verb is `Attach a lorebook` (`chat-books-section.tsx:91`) | new; use the pane's grammar — `Attach a script` |
| `Detach` "(shipped)" | shipped as **`Detach from this chat`** (`chat-books-section.tsx:122`, `chat-documents-section.tsx:287`) | use the full shipped spelling |
| `Open in library` (new) | neighbours: `Open your script library` (`regex-script-picker.tsx:225`, `character-facet-inspector.tsx:175`) | new; acceptable; one spelling for the door |
| `Show my display scripts to everyone` | shipped verbatim (`host-display-scripts-control.tsx:37`) | fine |
| `Run regex in this chat` | new (F1 changes its scope wording) | fine, subject to F1 |
| `From the preset · <name>` | "preset" is the generation-config word (AGENTS §6; UI-Arch §4.2 "Generation config is NOT settings — it is the Presets section") | fine |
| `Undo` | `NotifyAction.label` free text | fine |

### F9 · P3 · Board 02 does not render the state its caption claims, and the mock's data is shared across frames

- `build.mjs:283`: the `flipped` handler declares `const s = SCRIPTS.find(...)` and never uses it, so on board 02
  `Em-dash killer` is drawn **ON** under a toast saying it was turned off everywhere. `SCRIPTS` is a module-level
  mutable array shared by all five frames (`build.mjs:156`), so a row click in one frame mutates the others'
  data (only the clicked frame redraws). The side-eye lane's board-02 verdict is being taken on a state the spec
  did not produce.

### F10 · P3 · Row switches go `aria-disabled` under an OFF tier though they are the LIBRARY switch — against the mock's own cited precedent

- `build.mjs:207` passes `!tierOn` as the row switch's disabled flag, and `:202` disables tier switches when
  the master is off. The row switch is `regex_scripts.enabled` — a fact this room's tier does not govern — so
  a host cannot turn a preset script off everywhere without first re-allowing the tier here, and cannot pre-set
  the tier configuration while the master is off. The precedent the design cites for the inert arm keeps the
  switch live: "Only the identity dims — the switch keeps full weight, because it is still live"
  (`regex-script-picker.tsx:268-274`). Change: dim identity, keep every switch operable.

### F11 · P3 · The closed-pane index loses the master's state; the count chip has two semantics

- With the master OFF the in-force count is 0 and `HeadingWithCount` hides a zero chip
  (`settings-context-tab.tsx:84-98`; `build.mjs:216,220`), so a room whose host switched regex off three days
  ago reads as a bare `REGEX` — indistinguishable from "no scripts", in the pane whose closed state IS the
  index (#830, `settings-context-tab.tsx:107-116`). The UX proposal's `REGEX off` chip (§3) was dropped. And
  the member chip counts every chat-tier row incl. disabled (`build.mjs:220`) while the host chip counts in
  force (`:216`) — one chip, two meanings.

### F12 · P3 · States the tree WILL produce that the mock does not draw

| State | Tree receipt | What the design must say |
| - | - | - |
| Preset-less room | `presetId` is `null` "when the system `DEFAULT_PROMPT_CONFIG` stood in" (`domain/regex/contract/resolve.ts:26`) | `From the preset · <name>` has no name — omit the group or spell the default |
| Settling / failed reads | every section body rides `QueryBoundary` + `renderError` + `reserveKey` (`settings-context-tab.tsx:231-238`); the skeleton must reserve the settled shape (#823 lesson, `:259-267`) | a shape-matched fallback (N two-line rows + switch rows from the cached count) and the retry arm |
| Member, broadcast ON | `ChatDetail.hostDisplayScripts` is member-readable (`chat-detail.ts:74`); the member's transcript is being restyled by the host's scripts | one line: "The host's display scripts also change what you see here" |
| Member, host master OFF | if `regexEnabled` rides `ChatDetail`, the member's `Only here` rows are inert; if it does not, they claim to run | say which; the mock's member board draws neither |
| A script in three tiers | `tiers[]` is a list | `+2`, and the chip's `title` names both |
| A row you do not own (chat tier) | F6 | the "not yours" arm |
| A tier's OFF state with a dual-attached row | F2 | rank moves to the next tier |

### F13 · P3 · Coupled sites the DESIGN §6 list omits (verified on the tree)

- **Invalidation** (`packages/client/src/data/invalidation.ts:212`): `regexChanged → [trpc.regex.pathFilter()]` does
  NOT reach a `chat.*`-homed effective read; the row grows `trpc.chat.listEffectiveRegex.pathFilter()` **and**
  `promptPreviewReads` — the Preview tab runs the `PROMPT_HISTORY` leg over `hostTierRegexScripts`
  (`verbs/read.ts:983-997`), so a flip changes the preview. The effective read must also invalidate on
  `chatUpdated`/roster events (a character joining changes the union) — name the rows.
- **Cross-tenant sweep** (`tests/server/transport/cross-tenant-sweep.suite.int.test.ts:10-12` completeness
  guard): one PROBED row per new proc (`chat.listEffectiveRegex`, `chat.setRegexTierAllow`/`setRegexEnabled`),
  plus the post-sweep integrity pin for each write — the `chat.setHostDisplayScripts` template is `:919-920`
  and `:2472`.
- **The display switch's three CTs** open `HOST_BAND` first (`settings-context-tab.ct.tsx:336-381`,
  `tests/support/node/open-context-sections.ts:17`) — after the move they open the `Regex` kicker; the presence
  ledger's waiver text says "inside CommittedSettingsTab's Host controls group"
  (`tests/tooling/chat-component-presence.test.ts:112-115`) and a new `regex-context-section.tsx` needs a CT or a
  ledger line (`:1-11`, both directions bite). The #830 index pin (`:1138-1147`) and the D-1 order pins
  (`:783-785, 840-842`) tolerate a new section between Lorebooks and Host controls.
- **`reserveKey`**: the reservation gate's arm B REDs a repeated literal (`tooling/src/verify/gates/query-boundary-reservation.ts:6-8`);
  the section takes `chat.context.regex`, and `chat.context.appearance` dies with its boundary
  (`settings-context-tab.tsx:327`). The `sectionId: "appearance"` posture key needs nothing — an unknown
  persisted key is dropped on next write (`chat-context-section-open-store.ts:20-23`).
- **`ChatDetail`** gains the fields (`substrate/chat-detail.ts:74` and `contract/views.ts:199-204`, the
  `hostDisplayScripts` twin); the parse seam gains `.optional().catch(undefined)` rows
  (`domain/chat/contract/metadata.ts:42`); the verb rides `commitMetadataUpdate` (`verbs/roster.ts:139,355-369`;
  \#1450 CLOSED — ONE JSON path per write); the proc lands beside `setHostDisplayScripts`
  (`transport/trpc/routers/chat.ts:585-587`); the client hook beside `useSetHostDisplayScripts`
  (`features/chat/hooks/use-context-panel-mutations.ts`).
- **Bus** (#1733, OPEN, tree matches): `attach-to-chat.ts:26` / `detach-from-chat.ts:25` emit only
  `emitUserEvent`; `ROOM_ENTITY_KINDS` at `contracts/src/chat/bus.ts:372`; the three belts at
  `entry/compose/room-reach.ts:14-19, 136-140`. The `membership-fan-guard` gate cannot see it
  (`scanRoot` = `domain/chat/**`, `tooling/src/verify/gates/membership-fan-guard.ts:10,23`).
- **Doc drift to truth-repair in the same wave:** `docs/design/entity-room-member-freshness-bridge.md:363`
  says "chat-scoped display-tier scripts can change member-rendered transcript bytes (`chat/substrate/regex-tier.ts`)"
  — refuted: `regex-tier.ts` feeds the prompt legs only; the display path reads no junction (F1).

## 2. The per-decision table — what each DESIGN decision rests on

| Decision (DESIGN §) | Ruling / tree fact | Verdict |
| - | - | - |
| A section in the This-chat tab, not a tab/drawer/Config (§2) | #616 owner ruling 2026-08-24 (`settings-context-tab.tsx:31-37`); UI-Arch §4.2 physics 5 (`:299` "Section content NEVER lives in a modal"); CONTEXT = "detail + config of CONTENT's active artifact" (`:266`) | holds |
| Closed by default, count chip (§2) | #830 (`settings-context-tab.tsx:107-150`), `HeadingWithCount` (`:84-98`) | holds; F11 for the OFF state |
| Placed among the member-readable racks, above Host controls (§3) | D-1's line is READABILITY: Documents/Lorebooks sit above the band with host-only attach/detach as row-level OMITs (`:22-30, 226-253`); `regex.listForChat` is `requireChatMember` (`list-for-chat.ts:13`) | holds |
| Absorbs `Host controls › Appearance` (§2) | the section is only `HostDisplayScriptsControl` (`settings-context-tab.tsx:322-332`); O-4 ruling's server half untouched (`roster.ts:355-369`, `compose/regex.ts:57-74`) | holds; F1 for the copy; F13 for the CTs/reserveKey |
| Effective read is host-only (§3 member view) | D19 (registry:51); `domain/chat/contract/regex.ts:8-11`; `regex-tier.ts:3-5`; `list-room-display-scripts.ts:5-8` (a member must not learn the host's library); house precedent: Preview tab `crown` + `when: isHost` (`chats-section.tsx:100-108`) | holds |
| Member sees `Only here` read-only, controls omitted (§3) | `list-for-chat.ts:1-4` (D18/D64, `listChatBooks` ruling); Lorebooks rack shape (`chat-books-section.tsx:15-18, 111-127`); `no-separate-reduced-modes`; sweep row PROBED (`cross-tenant-sweep…:1593`) | holds; the member sees pattern + edit stamp (the row IS room-public); F12 for broadcast-ON / master-OFF lines |
| Row switch = library `enabled` (§3) | `schema/regex.ts:17-19,58`; executor's first gate `kit/regex/index.ts:341`; the 2026-08-19 fork is about the GLOBAL ATTACH junction (`regex-context-body.tsx:9-16`, `regex-collection-rows.tsx:21-36`) — a different column, and the fork's second reason (two live toggles on ONE screen) does not apply: Config's editor and the room are never co-rendered | **different control in law and code — the fork stays closed**; F7 for the toast; F10 for the disabled arm |
| Tier allows as a `ChatMetadata` sub-blob (§6) | `commitMetadataUpdate` ONE key (`roster.ts:139,362`; #1450 CLOSED); parse rows `.optional().catch(undefined)` (`domain/chat/contract/metadata.ts:42`); absent ⇒ default precedent `hostDisplayScripts`; id-keyed precedent `databankVisibility` | holds; F3 for the shape |
| Drop BEFORE dedup, inside the resolver (§6) | `regex-tier.ts:23-31`; both callers `assemble-gather.ts:406`, `edit.ts:247` (ast-grep) | correct; F2 for the read's shape; `allow` must be required |
| `position` = rank within slice (§6) | `apply-scope-order.ts:55-56, 79-84` writes the array index; `queries.ts:230-237` reads `position asc, createdAt asc` | holds exactly |
| Only the chat tier is ordered/attached/detached from the room (§3, §5) | `attach-to-chat.ts:17`, `detach-from-chat.ts:15`, `apply-scope-order.ts:77-85` — `requireChatHost`; the other arms would rewrite every chat on that preset/character (`apply-scope-order.ts:4-5`) | holds (no D-row; the one-home principle) |
| `Open in library` from a CONTEXT pane (§3) | UI-Arch §4.2 physics 1 ("never navigation"); shipped CONTEXT-arm doors exist: `databank-active-in.tsx:142,149` (`setActiveSection`), `databank-context-body.tsx:152` (`openConfigTo`); destination `selectCollectionMember` (`config-selection-store.ts:30`); `regex-context-body.tsx:24-28`'s "no door" was about destinations that did not exist | holds — a secondary menu item, not a nav row |
| Un-flatten the character slice (§6) | `resolve-sources.ts:31` flattens; `contract/resolve.ts:28` "IN ROSTER ORDER" | required, not optional — F3 |
| #1733 lands first (§6) | issue OPEN; `attach-to-chat.ts:26`; `bus.ts:372`; `room-reach.ts:136-140` | holds |
| `chat.listEffectiveRegex` homed in `domain/chat`, row type in `@orb/contracts/regex` reusing `RegexAttachScope` (§6) | `domain/regex/contract/resolve.ts:4-5` "Chat still owns the UNION … this op resolves, it never unions"; `RegexAttachScope` at `contracts/src/regex/index.ts:271-282`; cross-boundary shape → contracts (`CLAUDE.md` "Type homes and unions") | holds; F2 reshapes the row |

## 3. The §5 refusals — supported, contradicted, or taste

| Refusal | Basis on the tree / ledger | Verdict |
| - | - | - |
| ST's default-OFF consent gates | the card lift carries the card's `enabled` verbatim (`substrate/dedup.ts:49-51`) and attaches (`contract/dedup.ts:20-27`); D121-E: the library is the owner's; the F3 "saves and runs nowhere" class | **supported**. Residual owner fork O2: a characters-tier default-off would change existing rooms; if consent is ever wanted it belongs on the import path |
| Regex Presets (named enable-sets) | "preset" = generation config only (AGENTS §6; UI-Arch §4.2); the map's precedent for a saved named set is a DIFFERENT user word (`rosterPreset` → "Roster", `vocabulary-map.md`); `bulkSetScriptsEnabled` ships (`bulk-set-enabled.ts`) | **supported**; parked with a wake condition is right |
| Per-chat mute of an inherited script | no table (`schema/regex.ts` four junctions only); `mute` is spent (`unmutedCharacters`, map row); and — the decisive fact — a mute would be blind to the display leg exactly as the tier switch is (F1) | **supported**; "off everywhere" is honest ONLY with F1's leg split and F7's toast fact |
| Move between tiers | no transactional verb; detach+attach half-fails into "attached nowhere" (`attach-to-chat.ts:23` appends; two round trips) | **supported** |
| Reorder other tiers from the room | the verb PERMITS it (`apply-scope-order.ts:38-45` global gate = script ownership) | **design choice, well-reasoned** (blast radius); no ruling either way |
| Strikethrough as the off signal | AT-invisible; the shipped dual channel (switch + `opacity-60`, `regex-script-picker.tsx:275`) | **supported** |

## 4. Owner forks (each with a default)

- **O1 — an `Everywhere` tier switch.** DESIGN: absent; UX proposal: present. Same blob, same drop, one more
  optional boolean. Without it, isolating "is it one of my globals" costs N row flips that reach every chat.
  **Default: include it** (kicker `Everywhere`, switch named `Everywhere — in this chat`, the mock's own
  aria pattern). The cost is one word that reads oddly, not a mechanism.
- **O2 — card-lifted character scripts default-ON** (the tree today). **Default: keep ON**; consent, if
  wanted, lands on the import path with a notification, never as a tier switch.
- **O3 — the scope words.** `Everywhere` · `This chat` · `From a character`/`From <name>` · `From the preset`
  are one vocabulary spoken by two racks in one pane and by databank's context. **Default: a vocabulary-map
  row that ratifies the Documents spellings**, and the Regex section borrows them (`This chat`, not `Only here`).

## 5. Coupled-site list for the build brief (verified `path:line`)

1. **Read** — `domain/chat/substrate/regex-tier.ts:22-34` (extend to `{sources, allow}` → listing + effective),
   `domain/chat/contract/regex.ts:23-33` (`HostTierRegexSources.allow`, un-flattened `character`),
   `domain/regex/contract/resolve.ts:36-41`, `persistence/resolve-sources.ts:31,45`, callers
   `substrate/assemble-gather.ts:406-413`, `verbs/edit.ts:247-249`, pin `tests/server/domain/chat/substrate/regex-tier.test.ts`;
   the verb (new, `domain/chat/verbs/…`, `requireHost` — `guard.ts:60`), the view in `@orb/contracts/regex`
   beside `RegexAttachScope` (`contracts/src/regex/index.ts:271-282`), proc beside
   `transport/trpc/routers/chat.ts:585-587`, sweep row + integrity pin
   (`tests/server/transport/cross-tenant-sweep.suite.int.test.ts:10-12, 919-920, 2472`).
2. **Metadata** — `contracts/src/chat/metadata.ts:239-301` (`regexEnabled`, `regexTiers`), parse rows
   `domain/chat/contract/metadata.ts:29-52`, verb(s) on `commitMetadataUpdate` (`verbs/roster.ts:139, 355-369`),
   `ChatDetail` (`substrate/chat-detail.ts:74`, `contract/views.ts:199-204`), client hook
   (`features/chat/hooks/use-context-panel-mutations.ts`).
3. **Section** — `features/chat/components/settings-context-tab.tsx:246-253` (after Lorebooks, `sectionId="regex"`,
   `CLOSED_BY_DEFAULT`, `HeadingWithCount`, `reserveKey="chat.context.regex"`), the new
   `regex-context-section.tsx` + the `AddChatRegexScriptDialog` (F5, the `add-chat-book-dialog.tsx` twin),
   `RegexScopeOrder` on the chat tier (`components/regex-scope-order.tsx:44-52`), the moved
   `HostDisplayScriptsControl` (`host-display-scripts-control.tsx`), delete the Appearance disclosure
   (`settings-context-tab.tsx:322-332`).
4. **Display leg (F1)** — the `ON SCREEN` roster reads `useDisplayScripts(chatId)` (`data/use-display-scripts.ts:68`);
   no server change.
5. **Bus** — #1733: `contracts/src/chat/bus.ts:372`, `entry/compose/room-reach.ts:136-140`, the client
   `BUS_FILTERS.roomEntityChanged` Record (`data/invalidation.ts:174`), a room-fan op on `RegexContext`
   (`attach-to-chat.ts:26`, `detach-from-chat.ts:25`).
6. **Invalidation** — `data/invalidation.ts:212` (`regexChanged` grows the effective read + `promptPreviewReads`);
   the roster/`chatUpdated` rows for the effective read; pin `tests/client/data/invalidation.test.ts`.
7. **Verb asymmetry (F6)** — `domain/regex/verbs/attachments/detach-from-chat.ts:16-19` drops the ownership
   re-check (books precedent `chat-books-section.tsx:106-110`); its int test.
8. **CTs / ledgers** — `tests/client/features/chat/components/settings-context-tab.ct.tsx:336-381` (the three
   display-switch tests open `Regex`, not `HOST_BAND`), `:1138-1147` (add `["Regex", "false"]`), the story
   `tests/client/features/chat/_ct-stories.tsx:2119-2140` (stubs for the new reads),
   `tests/tooling/chat-component-presence.test.ts:112-115` (waiver text + the new component's line),
   `tests/client/features/plugin/lib/chat-anchors.ct.tsx:265` (unaffected — still opens `HOST_BAND`).
9. **Vocabulary** — `docs/design/vocabulary-map.md`: a scope-words row (O3); re-attest the
   `HostTierRegexSources.character` row if the field reshapes (F3).
10. **Docs** — the O-4 ruling's homes are code headers (`use-display-scripts.ts:9-23`,
    `host-display-scripts-control.tsx:1-15`, `contracts/src/chat/metadata.ts:262-271`, `roster.ts:341-354`) —
    the control's header says "on the chat context panel's Settings tab … matching the tool-round control in
    the same section" (`:9-11`) and needs its sentence updated; D121-E (registry:340) is untouched;
    `entity-room-member-freshness-bridge.md:363` truth-repair (F13).

## 6. What I verified clean (so silence is covered)

- **Q2 fork:** the row switch (`regex_scripts.enabled`) and the 2026-08-19 fork's control
  (`global_regex_scripts` membership) are different columns/junctions; the fork text names "a row-level ATTACH
  control" (`regex-context-body.tsx:16`) and "THE GLOBAL SWITCH left this row" (`regex-collection-rows.tsx:21`).
  The only other `enabled` writers are the editor and the bulk bar (`regex-bulk-bar.tsx` per its header) in
  Config — never co-rendered with the room. Fork not reopened.
- **Q3 member view:** `listForChat` member-gated, room-public, full `RegexScriptRow` (pattern + stamp) by the
  `listChatBooks` ruling; the member chip counts the chat tier only — no host-library leak; `regexTiers`/
  `regexEnabled` on `ChatDetail` reveal only booleans. With broadcast ON the member's transcript is restyled
  and `listRoomDisplayScripts` returns the host's `enabled ∩ DISPLAY` rows to them — that is O-4's opt-in
  design, not a leak the panel introduces (F12 asks for the sentence).
- **Q4 O-4 property:** byte-identical off arm holds (server untouched); `useDisplayScripts` order (broadcast
  then viewer, viewer-last) unchanged by the move.
- **Q5:** `commitMetadataUpdate` ONE key confirmed (#1450 CLOSED, `roster.ts:139,361-362`); two callers of
  `resolveHostTierRegexScripts` confirmed by ast-grep (2 production sites + the test); absent ⇒ allowed is the
  right default (existing rooms byte-identical).
- **Q6:** home in `domain/chat` agrees with `resolve.ts:4-5`; `position` = write index = read rank.
- **Q8:** table §3.
- **Q1's "state the tree cannot produce":** none beyond F4 (the inverted dedup row) and F6 (a row whose
  controls cannot succeed); the `Everywhere`-has-no-switch absence is a choice, not an impossibility (O1).
- **CONTEXT navigation door:** shipped precedent exists in a CONTEXT arm (`databank-active-in.tsx`,
  `databank-context-body.tsx`).
- **Gates that will see the build:** `query-boundary-reservation` (arm B), `membership-fan-guard` (blind here,
  by scanRoot), `chat-component-presence` (both directions), the cross-tenant sweep completeness guard,
  `no-inline-union-redecl` (reusing `RegexAttachScope` avoids it).
- **`chat-track.ts:11-12`** — mobile panels are full-screen views, not a sheet (DESIGN §2 correct).

## 7. What I did NOT verify

- Rendered widths and the 27%/42% row-budget arithmetic (side-eye's lane); the `injections-manager.tsx:12`
  367px figure; the live artifact URL (judged from `build.mjs`).
- The four e2e specs that mention "This chat" (`tests/e2e/support/chat-room.ts`, `injection-roundtrip.spec.ts`,
  `group-chat.spec.ts`, `multi-tab-room-sync.spec.ts`) — not read; the literal grep found no e2e locator naming
  the display switch or `Host controls › Appearance`.
- `copyHandoffBooks`'s internals and whether any regex analog exists OUTSIDE `domain/chat` (the ast-grep over
  `domain/chat` and the grep over `handoff-copy.ts` are the receipts; `compose/regex.ts` exports no handoff op).
- The `regex` registry row with the `roomReach: none` why-string the freshness-bridge doc cites (location not
  located).
- `regex-editor-fields.tsx` (the editor's `enabled` switch — inferred from the bulk-bar header and the design's
  own statement, not read).

## 8. Durable lessons for the memory store (orchestrator writes)

- Index line: `[regex display leg=attachment-blind](regex-display-leg-is-attachment-blind.md) — any per-chat/per-tier regex control governs PROMPT legs only; a panel must not draw one pipeline over both`
  Body: `useDisplayScripts` reads the viewer's whole library (`enabled ∩ DISPLAY`) + the host's when broadcast is
  on; no junction is consulted (`data/use-display-scripts.ts:55-58,73-93`; `list-room-display-scripts.ts:28-29`).
  The server union (`regex-tier.ts`) feeds SEND/RECEIVE/history/preview only. **Why:** the 2026-09-05 regex-panel
  design drew tier/master switches as "turns it off here" over rows with display glyphs; the switch cannot reach
  the display leg. **How to apply:** any regex control scoped by room/tier states "prompt" in its copy, and the
  display roster is `useDisplayScripts`'s output, listed separately.
- Index line: `[chat regex junction survives handoff](chat-regex-junction-survives-handoff-undetachable.md) — no repoint for chat_regex_scripts; detachFromChat re-checks ownership (unlike worldInfo's)`
  Body: `chatRegexScripts` has zero refs in `domain/chat` (handoff repoints books via `copyHandoffBooks` only);
  the chat slice is not owner-filtered so the old host's script keeps running; `detach-from-chat.ts:16-19` throws
  for a script the new host does not own. **How to apply:** any room-tier regex surface needs a "not yours" arm,
  and the verb wants the books asymmetry before the surface ships.

## 9. Paragraph for the orchestrator

cb-regex-stickler: **build with named changes** — the IA holds (section in the This-chat tab per #616, closed +
chip per #830, member read-only chat tier in the Lorebooks shape, host-only effective read under D19, the row
switch is the library `enabled` and the 2026-08-19 fork stays closed, tier allows as a `ChatMetadata` sub-blob on
`commitMetadataUpdate`, #1733 first). Two P1s must land in the spec before a build brief: **(F1)** the mock
conflates the two legs — `useDisplayScripts` reads no junction, so a tier or master switch cannot affect a DISPLAY
placement and the intro says it does; the `ON SCREEN` group must become the display leg's real roster
(`useDisplayScripts`'s output) and tier groups list prompt-leg participation only; **(F2)** the read shape
`EffectiveRegexRow` (post-drop output) cannot render board 02's inert rows without a client re-union — the
resolver function must return both the per-tier listing and the effective order, and the mock's rank counts
inert rows. Five P2s: per-character switches make the un-flatten a resolver-contract change with an id-keyed
allow (F3); the mock's only dedup example sits at the wrong tier (F4); the attach dialog is specified as the
picker (which would mount a second order editor for the same junction) and drawn as the books dialog — build the
books twin (F5); the chat tier can carry a previous host's script and every drawn control on it fails —
`detachFromChat` re-checks ownership unlike the books verb; file it (F6); the "chat-only script gets no toast"
rule needs a cross-room fact the read does not carry (F7). P3s: three §4 vocabulary attributions are wrong and
`Only here` collides with the Documents rack's `This chat` in the same pane (F8); board 02 does not render its
own caption and the mock's data is shared across frames (F9); switches disabled under an off tier against the
cited precedent (F10); the closed index loses the master's OFF state (F11); undrawn states (F12); omitted coupled
sites incl. invalidation rows, sweep rows, the three display-switch CTs, `reserveKey`, a doc drift (F13). Owner
forks with defaults: an `Everywhere` switch (include), card-lift default-on (keep), the scope-word map row
(ratify `This chat`). Report: `scratchpad/st-regex/REVIEW-stickler.md`. 13 findings · ceiling P1 · zero
build-refusing law violations.
