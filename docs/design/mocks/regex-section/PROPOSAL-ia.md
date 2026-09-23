---
kind: design
status: draft
updated: 2026-09-05
---

# The regex one-place — an INFORMATION-ARCHITECTURE proposal (lane cb-regex-ia)

> Lane **cb-regex-ia**, 2026-09-05. Read-only pass. Sources: `scratchpad/st-regex/STUDY.md` +
> `{dropdown.html,index.js,engine.js}`, `docs/law/UI-Architecture-and-Layout.md`,
> `docs/design/vocabulary-map.md`, `scratchpad/config-collections/DESIGN.md` (#1725, approved), and the
> tree (every claim below carries a `path:line`). Owner steer received mid-lane: *"I'm leaning towards a
> collapsible thing like Injections or Overrides where you can control regex applied from one spot but the
> main editing home is in Config."* This proposal is designed to that steer and answers Q1 honestly anyway.

---

## Verdict — three sentences

The one place is a **`Regex` disclosure section in the room's `This chat` CONTEXT tab**, sibling to
Injections and Lorebooks, in the same `DisclosureSection` grammar and the same ~432px column — it is the
house's one sectioned per-chat-configuration pane (`settings-context-tab.tsx:31-37`), it sits beside the
transcript so *flip → look* is one glance, and #616 already ruled that a foreign feature's per-chat knobs
go IN that tab rather than in a tab beside it. It is a **read-and-switch surface**: it prints the four
tiers in run order with provenance and gives you exactly three writes — the library `enabled` switch per
row, attach/detach for the **room** tier only, and one **`Skip all regex in this chat`** bisect — while
authoring, ordering, testing and the global switch stay in Config, reached by a per-row `Open in library`
hand-off. The honest cost of the CONTEXT column is that **drag-reorder, the editor, the tester and
move-between-tiers cannot live in 432px** and must hand off; the honest cost of our model is that **the
display leg and the prompt leg do not share tiers**, which the section has to say out loud rather than draw
one pipeline over both.

---

## Q1 — WHERE the one place lives

### Ranked

**1. (a) A `Regex` collapsible section in the `This chat` CONTEXT tab. ADOPT.**

Why the user feels it: the pane is *already* where a host goes when a chat is being weird. It holds Field
overrides, Injections, Documents, Lorebooks, Macro picks and the whole host band
(`packages/client/src/features/chat/components/settings-context-tab.tsx:216-277`), and the tab's own
teaching copy is "the knobs that apply to it"
(`packages/client/src/features/chat/lib/chats-section.tsx:179`). Regex is the one member of that family
with no seat. Adding it costs no new geography, no new door to learn, and the reader's existing muscle
memory ("open details, scan the kickers, open the one I want") transfers whole.

Three receipts that make this the *ruled* answer and not just the convenient one:

- **#616 already decided this shape.** `settings-context-tab.tsx:31-37`: *"a foreign feature's per-chat
  knobs belong IN it — not in a tab of their own beside it. … Automation's Rules is the first tenant — it
  shipped as a 5th host TAB and was retired to a section here in the same change."* A `Regex` context TAB
  would repeat exactly the mistake that change reversed.
- **CONTEXT's charter fits.** `UI-Architecture-and-Layout.md:266` — CONTEXT owns "detail + config of
  CONTENT's active artifact". The effective regex set is a property of the open room, not a library.
- **The debugging loop closes here for free on the leg that matters.** Display-tier regex is applied
  **client-side** (`packages/client/src/data/use-display-scripts.ts:68-94` →
  `packages/client/src/lib/message-render.ts:120-124`), and every regex mutation is `busDriven` on
  `regexChanged` which path-invalidates the whole regex router
  (`packages/client/src/components/regex-script-picker.tsx:36-38, 359-388`). So flipping a display script's
  switch in this pane **repaints the transcript 3 inches to the left, live** — the same effect ST buys with
  `reloadCurrentChat()` (`index.js:1949, 1976, 1990`), except ours costs nothing.

**2. (b) A CONTENT-level drawer/sheet from a topbar door or `/regex`. REJECT.**

Loses on three counts. (i) *Same action, same home* (`UI-Architecture-and-Layout.md:315`, rule 10) — the
room already has one per-room configuration home; a second one splits the concept and the next knob has two
plausible destinations. (ii) A sheet over CONTENT **covers the transcript you are flipping switches to
read**; the whole value of the loop is that the evidence stays on screen. (iii) `UI §4.2` interaction
physics 5 (`:299`): *"Modals are for interrupts and pickers ONLY … Section content NEVER lives in a modal —
it is a CONTEXT tab or a CONTENT state."* A regex control panel is section content.

*(A `/regex` slash command is still worth having later — as a door that opens the CONTEXT pane on the Regex
section, i.e. a keyboard accelerator to arm 1, not a surface of its own. `chatSlashCommands`
(`packages/client/src/features/chat/lib/chat-slash-commands.ts:24`) is the seam and it is one contribution
wide today.)*

**3. (c) The Config regex library opened with the room as context. REJECT for the loop, ADOPT as the
destination.**

Navigating to Config **leaves the room**. The chat pane is kept alive by `<Activity>`
(`UI-Architecture-and-Layout.md:326`) so nothing is lost, but the transcript is off-screen — "flip and
look" becomes "flip, rail-switch back, look, rail-switch away", four acts per bisect step instead of one.
That said, Config *is* the right destination for everything that needs width: the #1725 board already
gives the library a CONTENT-width control row, filter, bulk select, drill-in editor and an "Applies /
Where it's attached" teacher (`scratchpad/config-collections/DESIGN.md` §3.2-§3.5, boards 04-05). The
proposal below hands off to exactly that, one call: `selectCollectionMember("regex", scriptId)` +
`setActiveSection("config")` (`packages/client/src/state/config-selection-store.ts:30`,
`packages/client/src/state/config-nav-store.ts:79-83`).

**4. (d) Its own chat CONTEXT tab. REJECT** — same #616 receipt as arm 2, plus the tab strip is already
five wide (`chats-section.tsx:69-110`) and a sixth would be the "tab strip stays slim without dropping a
control" line that file argues against verbatim (`settings-context-tab.tsx:20`).

### The two honest breakages, and what the section hands off

**Breakage 1 — the pane is already very tall, and the section must not make it worse.** Measured and
recorded on the tree: fourteen sections, **2,836px desktop**, host band alone 1,880px
(`settings-context-tab.tsx:107-115`), which is exactly why *every* section became a disclosure and the
closed pane became the index. So `Regex` must ship **`CLOSED_BY_DEFAULT`** with a **count chip in its
kicker** (`HeadingWithCount`, `settings-context-tab.tsx:83-98`) — "REGEX 7" — so the closed pane still
answers "is anything running here?" without opening. It must also **not be a fifteenth peer**: it lands
directly after **Lorebooks**, in the member-readable "extra things acting on this room's text" run
(Injections → Documents → Lorebooks → **Regex** → Macro picks), and it **absorbs the existing
`Appearance` section** (see Q3), so the section count goes 14 → 14, not 14 → 15.

**Breakage 2 — 432px cannot hold a drag list.** The CONTEXT track is
`clamp(17rem, 30vw, 30rem)` (`packages/ui/src/tokens/tokens.json:2006`) = **272px floor / 432px at 1440 /
480px cap**, and the tab's own measured inner width is **367px** (`injections-manager.tsx:12`). The tree
already paid for guessing wrong here once: the config roster row's 48×32 switch + kebab took **42% of a
290px row** and clipped 27 of 33 script names, which is why the global switch was moved off it
(`packages/client/src/features/regex/components/regex-collection-rows.tsx:21-27`). A drag handle + rank +
name + scent + switch + kebab does not fit. So the section **hands off**:

| The user wants to… | Where it happens | The hand-off |
| - | - | - |
| edit the pattern / replacement / streams | Config → Regex → the script's editor | the row's `⋯` → **Open in library** (`selectCollectionMember("regex", id)`) |
| reorder within a tier | Config: global order in the teacher pane (`regex-context-body.tsx:31-35`), preset/character/room order in the picker's "Runs here, in order" (`regex-script-picker.tsx:169-185`) | same `⋯` → **Open in library**; the section **prints** the rank, never edits it |
| test against a sample | Config → the script's editor → `Test against a sample` (`regex-test-panel.tsx:1-17`) + the pipeline debugger (`regex-pipeline-panel.tsx:1-16`) | same `⋯` |
| make a script global | Config teacher pane — **the 2026-08-19 fork stays closed** (`regex-context-body.tsx:9-16`: *"Do not restore a row-level attach control without re-opening that fork"*) | the section shows `Everywhere` as a **read-only provenance group**, no switch on it |
| move a script between tiers | it is **not our verb** — ours is attach/detach at N scopes with run-once dedup (`packages/db/src/schema/regex.ts:74-78`), ST's "move" exists only because a script lives in exactly one scope (`index.js:667-700`) | attach/detach at the owning surface |

**Breakage 3 (stated, not fixed here) — "CONTEXT is never navigation"** (`UI-Architecture-and-Layout.md:295`).
`regex-context-body.tsx:24-28` recorded a matching refusal in Config's own context pane: *"A LIST ROW IS A
NAME, NOT A LINK. There is no door from here to a preset/character/room member — the existing
`openConfigTo` intent only opens a config COLLECTION, and none of these three is one."* **That ruling
survives; its input changed** — a regex script *is* a config collection member and
`selectCollectionMember("regex", memberId)` exists (`config-selection-store.ts:30`), which is precisely
the destination that did not exist then. The law itself is untouched because the section is not a list of
destinations: its rows carry switches, and the one door is a secondary item inside a `⋯` menu, never the
row's primary click. **No interactive nested in an interactive** (`DESIGN.md` §5.5) — the switch and the
`⋯` are siblings, and the row itself has no door.

---

## Q2 — WHAT is on it

### 2.1 The four tiers, in run order, with provenance

The run order is the resolver's and it is load-bearing:
`[...hostGlobal, ...preset, ...character, ...chat]`, deduped by row id, earliest tier wins
(`packages/server/src/domain/chat/substrate/regex-tier.ts:22-34`). The section draws exactly that, one
group per tier, with the vocabulary the tree already ships:

| Group kicker | Gloss under it | Provenance source |
| - | - | - |
| `EVERYWHERE` | "Runs in every chat you host." | `global_regex_scripts` (`schema/regex.ts:83`) — the wording is `regex-context-body.tsx`'s own |
| `FROM THE PRESET · <name>` | "Comes with the preset this room uses." | `preset_regex_scripts` (`schema/regex.ts:123`) |
| `FROM <character>` — one group per seated character, **in roster order** | "Comes with this character's card." | `character_regex_scripts`; roster order is load-bearing (`persistence/resolve-sources.ts:5-9, 30-31`) |
| `IN THIS CHAT` | "Only here." | `chat_regex_scripts` (`schema/regex.ts:143`) |

A script attached at two tiers **renders once at its earliest tier** (matching the executor) with a gloss
tail — "also from Alice's card" — so the reader learns the dedup instead of hunting a duplicate that never
runs. That property is the one thing our model has and ST's cannot (`regex-tier.ts:12-14`).

Rows carry a **global 1..N run rank** across the deduped set, in the mono `datum` register in a
`w-control-sm` cell — the `RankCell` anatomy verbatim (`regex-script-picker.tsx:307-322`).

### 2.2 The per-row switch — which flag, and the honest trade-off

**Recommendation: the switch is `regex_scripts.enabled`, the library flag. Do NOT invent a per-chat mute.**

What that means, said plainly on the surface: *off is off everywhere.*

The trade-off, honestly:

- **It is what ST does.** ST's row toggle writes `script.disabled` on the script inside its scope's storage
  (`index.js:653-657`); disabling a preset script disables it for **every** chat on that preset, and a
  global script for every chat, period. The owner's mental model ("turn them off and see what changes") is
  already calibrated to this.
- **For the display leg it is the ONLY switch that exists in our model, and this is the load-bearing
  finding of this pass.** `useDisplayScripts` reads the viewer's **whole library** narrowed to
  `enabled ∩ DISPLAY` (`use-display-scripts.ts:55-58, 73-77`) — it reads **no junction at all**. So a
  `DISPLAY`-placement script runs on your transcript **whether or not it is attached anywhere**, and
  attaching one to a preset/character/room does **nothing**. A per-chat mute would therefore be a control
  that silently does not work on half the pipeline.
- **The cost**: a host bisecting a shared script turns it off for their other rooms too, for the length of
  the bisect. That is real, and it is why the **`Skip all regex in this chat`** bisect (2.4) exists — it is
  the room-scoped destructive-free move, and it is the one you reach for first.
- **The existing badge already names the confusable state**: `Disabled in your library`
  (`regex-script-picker.tsx:283-287`), minted for exactly this "one row, two switches, neither labelled"
  defect. Reuse it verbatim on any row that is attached-but-off.

### 2.3 The per-tier master switches — RANKED, and I do not recommend ST's posture

ST has two: `preset_allowed_regex[api][presetName]` and `character_allowed_regex[avatar]`, both
**default OFF** consent gates (`engine.js:115-127`, `index.js:751-752`).

1. **Ship: one bisect, no per-tier masters** (see 2.4). Cheapest, room-scoped, answers "is regex the
   problem at all?" in one press, and costs zero schema (2.4).
2. **Then, if the bisect proves too coarse: per-tier masters as room state** — `preset`, per-character,
   `chat` — all defaulting **ON**, host-owned, stored as a small list on `ChatMetadata`. Bisect becomes
   binary-search over four groups instead of one all-or-nothing.
3. **Never adopt ST's default-OFF consent posture.** ST needs it because *scoped scripts arrive inside a
   stranger's card and execute*. Ours do not arrive that way: a card import **lifts** the card's scripts
   into your own library (`domain/regex/contract/dedup.ts:19-27` `CardLiftPlan`) where the library list
   shows them. Shipping them default-dead would recreate the exact defect this codebase already fixed once
   — *"a script that saves and runs nowhere, with nothing on screen saying so"*
   (`lib/regex-placement-labels.ts:74-79`, the F3 class).
   **Open, with a stated default:** the lift carries the card's own `enabled` verbatim
   (`contract/dedup.ts:9-13`), so an imported card *can* land enabled-and-attached. My default is
   **provenance, not consent** — the `FROM <character>` group names the card, so a weird chat's cause is
   one glance away. If the owner wants a consent gate, it belongs on the **import path** (lift disabled +
   a notification), not as a UI switch that has to be found before it can be flipped.

### 2.4 The bisect — `Skip all regex in this chat`

One host-only switch at the **top** of the section, above the tier groups:

> **Skip all regex in this chat** — "Nothing rewrites this room's prompts while this is on. Your own
> display scripts still change what you see."

- Storage: **`ChatMetadata.regexEnabled?: boolean`** — the blob is the established home for exactly this
  shape of per-room host posture, with three shipped siblings on the same idiom (`offerChoices`,
  `charactersCanReact`, `reactionsEnabled` — `packages/contracts/src/chat/metadata.ts:271-300`).
  **Zero migration.** Absent ⇒ ON (byte-identical to a room that never heard of it).
- Enforcement: the resolver drops the whole set — one guard at
  `substrate/assemble-gather.ts:406` / `verbs/edit.ts:247`, where `resolveHostTierRegexScripts` is called.
  Refused server-side, not hidden (the `reactionsEnabled` precedent, `metadata.ts:296-300`).
- Honesty: it cannot touch the display leg (that is the viewer's own library, client-side), and the copy
  says so. This is the sentence that stops the "I turned it off and the transcript still looks wrong" bug
  report.

### 2.5 Drag order — NO, in this pane

Order is authored where there is width (Q1 breakage 2). The section **prints** the rank because the rank is
the answer to "which one bit first"; it does not edit it. `applyScopeOrder` already exists for all four
scopes with per-arm authority (`domain/regex/verbs/attachments/apply-scope-order.ts:1-8`), and the Config
surfaces already call it.

### 2.6 Attach / detach — the ROOM tier only

`IN THIS CHAT` gets an **`Add to this chat`** door (host-only) that opens the **already-built**
`RegexScriptPicker` in `scope: {kind:"chat", chatId}` as a dialog, and each room row gets **Detach** in its
`⋯`. This is the section's one real write beyond the switches, and it is the cheapest thing in the whole
proposal:

> **The chat scope is fully built server-side and has ZERO client mount sites today.**
> `attachToChat` / `detachFromChat` / `listForChat` all ship
> (`domain/regex/contract/service.ts:125-128`; `verbs/attachments/attach-to-chat.ts:14`,
> `list-for-chat.ts:11`), the picker's `chat` arm is written and exhaustive
> (`components/regex-script-picker.tsx:93-97, 340-341, 379-388`), and a repo-wide search for
> `RegexScriptPicker` finds only the preset tab and the character facet — no chat caller.
> **The fourth tier is currently unreachable from the UI.** That alone justifies the section.

Attach for the preset / character / global tiers is **not** here — those rows say where they come from and
hand off. Host gate: `attachToChat` is `requireChatHost` (*"a room-wide text transform is a one-shot
jailbreak surface"*, `attach-to-chat.ts:1-3`), so a member sees the rows and simply gets no `Add` and no
`Detach` — the §8.1 permission-OMIT at row level, exactly as Documents and Lorebooks already do
(`settings-context-tab.tsx:226-229, 239-244`).

### 2.7 Test against a sample — NO, hand off

`regex-test-panel.tsx:8-10` states it: *"FEATURE-LOCAL … the panel has exactly one consumer."* It belongs
under the editor, at editor width, where the pattern you are testing is on screen. The `⋯` gets you there.

### 2.8 Named enable-sets ("Regex Presets") — DO NOT ADOPT NOW; park with a wake condition

ST's Regex Presets are a named `{global:[ids], preset:[ids], scoped:[ids]}` set that, on apply, writes
`script.disabled = !inSet` across every scope (`index.js:344-392`, `dropdown.html:73-87`). It is a
genuinely good instrument — **for ST**, which has no library and therefore no other bulk operation.

We already have the bulk operation: `bulkSetScriptsEnabled` ships
(`domain/regex/contract/service.ts:91`) and the #1725 board draws `Select scripts` → `Enable · Disable ·
Delete` as the library's control row (`scratchpad/config-collections/DESIGN.md` board 04, §3.2). A saved
enable-set adds a table, a lifecycle (create/update/re-apply/delete — four more controls,
`dropdown.html:82-85`), and a persistent "which set am I in, and has it drifted?" indicator ST needed a
whole `hasStateChanged` comparator for (`index.js:85-99`). That is a lot of surface for a want nobody here
has voiced.

**Park with a wake condition:** build it when either (a) the owner asks for it a second time, or (b) a
drive measures the bulk enable/disable round-trip through Config as the actual pain. Its home when it
wakes is **Config's library control row**, not this section — it is a library-wide instrument, and putting
it in a room's pane would make a room-scoped-looking control write global state.

---

## Q3 — how the four write homes relate to it

**The section REPLACES none of them. It is the read-and-switch surface over all four, plus the one write
home that was missing (the room).**

| Write home | Owns | After this proposal |
| - | - | - |
| **Config → Regex library** (`features/regex/lib/regex-collection.tsx:23-49`, #1725 boards 04-05) | authoring, the editor, `enabled`, the **global** attach + global order, duplicate/export/import/delete, bulk, the tester + pipeline debugger, "Where it's attached" | **unchanged, and it is the main editing home.** The section's every `⋯ → Open in library` lands here. |
| **Preset editor → Regex tab** (`features/preset/components/regex-tab.tsx:105`) | which library rows this preset attaches, and their order | **unchanged.** The section shows the result as `FROM THE PRESET · <name>` and does not attach. |
| **Character card → Regex scripts facet** (`features/character/components/character-regex-scripts-field.tsx:46`) | which rows a character carries, and their order | **unchanged.** Shown as `FROM <character>`. |
| **The room** | *nothing today — no client surface exists* | **the section becomes it**: `Add to this chat` + per-row `Detach`, over the built `attachToChat`/`detachFromChat`/`listForChat` verbs. |

**One consolidation, and it is the reason the section count does not grow.** The host band's `Appearance`
section is one switch — `HostDisplayScriptsControl`, "Show my display scripts to everyone"
(`settings-context-tab.tsx:321-331`; `host-display-scripts-control.tsx:36-43`). That is a **regex** control
wearing an appearance name: it is `chat.setHostDisplayScripts`, it decides whose display-tier *regex* the
room renders through, and it is the only thing under that kicker. **Fold it into the Regex section as the
host row directly under the bisect, and retire the `Appearance` disclosure.** Coupled sites: the
`sectionId: "appearance"` key in the per-host open-posture store
(`chat-context-disclosure-section.tsx:99-104` — a retired id simply stops being read), the section's own
`QueryBoundary` + `reserveKey="chat.context.appearance"`, and any CT/e2e locator naming that kicker.

**"Move to another tier" goes nowhere**, because it is not our verb (Q1 table, last row). ST needs it
because a script *lives* in one scope; ours is one library row attached at up to four scopes with run-once
dedup. The equivalent user intent — "stop this running here, start it running there" — is two attach
switches in two homes, and the section's `⋯ → Open in library` reaches the pane
(`regex-context-body.tsx`, "Where it's attached") that shows all four at once.

---

## Q4 — the two sketches, at real proportions

Every label below is either shipped on the tree or comes from `docs/design/vocabulary-map.md`.
Shipped strings reused: `This chat` · `Injections` · `Documents` · `Lorebooks` · `Macro picks` ·
`Host controls` · `Show details` · `New script` · `Disabled in your library` · `Runs here, in order` ·
`Where it's attached` · the `REGEX_PLACEMENT_GLYPHS` strip (`lib/regex-placement-labels.ts:56-63`) ·
the `regexRowScent` subtitle (`:135-142`). New strings are marked `†` and are listed after the sketches.

### Desktop — 1440 × 900, room open, CONTEXT docked, Regex open

Scale: 1 char ≈ 10px. RAIL 56px · LIST 346px (`clamp(17rem,24vw,26rem)`) · CONTENT 606px ·
CONTEXT 432px (`clamp(17rem,30vw,30rem)` at 1440) = 1440.

```
┌────┬─────────────────────────────────┬──────────────────────────────────────────────────────────┬───────────────────────────────────────────┐
│    │ CHATS                    12  New│  Midnight Run · Alice, Bo         ⌘K  🔔  ⛶  [Hide details]│ CHAT · MIDNIGHT RUN                    ✕  │
│ ◈  ├─────────────────────────────────┤──────────────────────────────────────────────────────────┤   Alice · Bo  ·  memory  ·  Noir preset   │
│    │ 🔍 Filter chats                 │                                                          ├───────────────────────────────────────────┤
│ 💬 │                                 │  Alice                                          14:02    │ ▸ FIELD OVERRIDES  1 set                  │
│ 👤 │ ▸ Midnight Run          2m      │  The rain hadn't stopped since Tuesday. She                │ ▸ INJECTIONS  2                           │
│ 🔎 │   Alice, Bo                     │  put the glass down without drinking from it.             │ ▸ DOCUMENTS  1                            │
│    │                                 │                                                          │ ▸ LOREBOOKS  2                            │
│ ⚙  │   Rooftop                1h     │  Bo                                             14:03    │ ▼ REGEX  7                                │
│ 🧩 │   Bo                            │  (OOC: keep it under 200 words)                          │   Find/replace rules acting on this room.†│
│ 📄 │                                 │  Then say it plain.                                      │   Display rules change only what you see;†│
│ 🎛 │   Long Way Down         yest.   │                                                          │   the rest apply from the next turn.†     │
│ ✨ │   Alice                         │  Alice                                          14:03    │                                           │
│    │                                 │  "Plain, then. He's dead and you knew."                   │   ⬒ Skip all regex in this chat†      ○──  │
│ 📊 │                                 │                                                          │                                           │
│    │                                 │                                                          │   ⬒ Show my display scripts to everyone ○─│
│    │                                 │                                                          │                                           │
│    │                                 │                                                          │   EVERYWHERE†                             │
│    │                                 │                                                          │    1  Strip OOC                    ●── ⋯  │
│ ─  │                                 │                                                          │       👁✉  \(OOC:[^)]*\)  · edited 3d      │
│ 🎨 │                                 │                                                          │    2  Em-dash killer               ○── ⋯  │
│ ⚙  │                                 │                                                          │       ✨👁  off · —  · edited 2w           │
│ 🙂 │                                 │                                                          │                                           │
│    │                                 │                                                          │   FROM THE PRESET · NOIR†                 │
│    │                                 │                                                          │    3  Trim trailing hedges         ●── ⋯  │
│    │                                 │                                                          │       ✨  \b(perhaps|maybe)\b · edited 1d  │
│    │                                 │                                                          │                                           │
│    │                                 │                                                          │   FROM ALICE†                             │
│    │                                 │                                                          │    4  Alice italics                ●── ⋯  │
│    │                                 │                                                          │       👁  \*([^*]+)\* · edited 5d          │
│    │                                 │                                                          │    5  Accent fix                   ●── ⋯  │
│    │                                 │                                                          │       ✉  teh · edited 5d                  │
│    │                                 │                                                          │                                           │
│    │                                 │                                                          │   FROM BO†                                │
│    │                                 │                                                          │    6  Bo shouting                  ●── ⋯  │
│    │                                 │                                                          │       ✨👁  [A-Z]{4,} · also from Everywhere│
│    │                                 ├──────────────────────────────────────────────────────────┤                                           │
│    │                                 │ ╭──────────────────────────────────────────────╮ 📎  ▶  │   IN THIS CHAT†                           │
│    │                                 │ │ Message Alice and Bo…                        │        │    7  Redact the address           ●── ⋯  │
│    │                                 │ ╰──────────────────────────────────────────────╯        │       ✉📖  221B · edited 12m               │
│    │                                 │                                                          │      [ + Add to this chat† ]               │
│    │                                 │                                                          │                                           │
│    │                                 │                                                          │ ▸ MACRO PICKS                             │
│    │                                 │                                                          │ ▸ HOST CONTROLS                           │
│    │                                 │                                                          ├───────────────────────────────────────────┤
│    │                                 │                                                          │ MEMBERS │ THIS CHAT │ GAME │ PREVIEW 👑    │
└────┴─────────────────────────────────┴──────────────────────────────────────────────────────────┴───────────────────────────────────────────┘
```

Anatomy notes tied to the tree:

- The `▸ / ▼` kickers are `DisclosureSection` (`chat-context-disclosure-section.tsx:116-143`) — an
  `interactiveKicker` `CollapsibleTrigger` at `size="control"`, posture remembered per host per section.
  Count chips are `HeadingWithCount` with `Badge size="inline"` (`settings-context-tab.tsx:83-98`).
- `⬒` marks a **host-only** row (the §8.1 permission-OMIT); a member's pane simply does not draw those two
  rows or the `+ Add to this chat` door, and every `⋯` loses Detach.
- Row line 1 = rank (`RankCell`, `w-control-sm`, mono `datum`) · name · `Switch` · `⋯`. Row line 2 = the
  shipped `regexRowScent` with the `REGEX_PLACEMENT_GLYPHS` strip leading — the two-line collapse-card
  anatomy Injections and Field overrides already wear (`injections-manager.tsx:178-213`).
- Row 6's `· also from Everywhere` is the dedup made visible (`regex-tier.ts:12-14`). Row 2 shows an `off`
  row keeping its place — `regexRowScent` leads with `off ·` for exactly this reason (`:141`).
- The bottom rail (`MEMBERS │ THIS CHAT │ GAME │ PREVIEW`) is the context bracket's foot rail, unchanged
  (`features/app-shell/components/context-rail.tsx`); the head band is `ChatContextBand`
  (`chats-section.tsx:163`).

### Phone — 430 × 860, one shell, CONTEXT as a sheet

Scale: 1 char ≈ 5px → 86 columns. The room is CONTENT; `Show details`
(`features/app-shell/components/context-toggle.tsx:22`) opens the pane as a sheet docked above the tab bar,
with its own `✕` (the topbar toggle sheds itself while the sheet is open — `:31-38`).

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ‹  Midnight Run                                              ⌘K   🔔   Show details │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  Alice                                                                    14:02    │
│  The rain hadn't stopped since Tuesday.                                            │
│                                                                                    │
├════════════════════════════════════════════════════════════════════════════════════┤
│ CHAT · MIDNIGHT RUN                                                             ✕  │
│   Alice · Bo  ·  memory  ·  Noir preset                                            │
├────────────────────────────────────────────────────────────────────────────────────┤
│ ▸ FIELD OVERRIDES  1 set                                                           │
│ ▸ INJECTIONS  2                                                                    │
│ ▸ DOCUMENTS  1                                                                     │
│ ▸ LOREBOOKS  2                                                                     │
│ ▼ REGEX  7                                                                         │
│    Find/replace rules acting on this room. Display rules change only†              │
│    what you see; the rest apply from the next turn.†                               │
│                                                                                    │
│    ⬒ Skip all regex in this chat†                                            ○──   │
│    ⬒ Show my display scripts to everyone                                     ○──   │
│                                                                                    │
│    EVERYWHERE†                                                                     │
│     1  Strip OOC                                                        ●──   ⋯    │
│        👁 ✉   \(OOC:[^)]*\)  ·  edited 3d                                           │
│     2  Em-dash killer                                                   ○──   ⋯    │
│        ✨ 👁   off · —  ·  edited 2w                                                │
│                                                                                    │
│    FROM THE PRESET · NOIR†                                                         │
│     3  Trim trailing hedges                                             ●──   ⋯    │
│        ✨   \b(perhaps|maybe)\b  ·  edited 1d                                       │
│                                                                                    │
│    FROM ALICE†                                                                     │
│     4  Alice italics                                                    ●──   ⋯    │
│        👁   \*([^*]+)\*  ·  edited 5d                                               │
│                                                              … 2 more              │
│                                                                                    │
│    IN THIS CHAT†                                                                   │
│     7  Redact the address                                               ●──   ⋯    │
│        ✉ 📖   221B  ·  edited 12m                                                   │
│        [ + Add to this chat† ]                                                     │
│                                                                                    │
│ ▸ MACRO PICKS                                                                      │
│ ▸ HOST CONTROLS                                                                    │
├────────────────────────────────────────────────────────────────────────────────────┤
│  MEMBERS  │  THIS CHAT  │  PREVIEW 👑                                              │
├────────────────────────────────────────────────────────────────────────────────────┤
│    💬 Chats        👤 Characters        🔎 Corpus        🙂 You                      │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Phone-specific obligations (all from law already on the tree):

- Every press target — kicker triggers, switches, `⋯`, the `Add` button — is `size="control"`, i.e. the
  pointer-conditional `--spacing-control-sm` floor: **44px coarse / 32px fine**
  (`room-overrides-form.tsx:85-92`, measured-and-fixed there).
- Copy wraps differently at 430 than at 367 — the skeleton must reserve the settled shape, not a bar
  (`InjectionsSkeleton`, `injections-manager.tsx:273-316`, and the `MACRO_PICKS_SKELETON_ROWS` lesson at
  `settings-context-tab.tsx:258-266`). The Regex section's fallback reserves *N two-line rows plus the two
  switch rows*, from the count the kicker chip already has.
- The tab strip drops `GAME` where no rpg tab resolved; the section is unaffected.

### New strings this section mints (`†`) — the whole list

`Find/replace rules acting on this room. Display rules change only what you see; the rest apply from the
next turn.` · `Skip all regex in this chat` · `Nothing rewrites this room's prompts while this is on. Your
own display scripts still change what you see.` · `Everywhere` · `From the preset · <name>` ·
`From <character>` · `In this chat` · `Add to this chat` · `also from <tier>` · `Open in library` (`⋯`
item) · `Detach from this chat` (`⋯` item).

**None of these needs a `vocabulary-map.md` row** — they name scopes, and the map has no regex rows at all
today. `Everywhere` / `Runs in every chat` / `Attached by presets` are already the pane vocabulary
(`regex-context-body.tsx:5-7, 17-19`), so this section borrows rather than mints. If the owner wants the
scope words governed, that is a **new map section**, and it should be filed as such rather than decided in
a build lane.

---

## Q5 — what is NEW vs a read over what exists

Cheap-first, and the honest split.

### Genuinely new (small)

| # | Thing | Cost | Why it cannot be a read |
| - | - | - | - |
| N1 | **One read verb** — `chat.regexForRoom` (or `regex.listForRoom`): returns the four ordered tiers with provenance labels + the deduped rank | ~1 verb + 1 params/views shape + 1 router row + 1 int test | `resolveRegexSources` is a **principal-less turn-time op** injected into chat (`domain/regex/contract/resolve.ts:7-11, 43`) — it has no caller-gate and is not on the tRPC surface. The verb is that op + the chat's `presetId`/`characterIds` + `resolveHostTierRegexScripts` (`substrate/regex-tier.ts:22`), i.e. **assembly of shipped parts**, not new logic. |
| N2 | **`ChatMetadata.regexEnabled?: boolean`** + `chat.setRegexEnabled` (host-gated) + one guard at the two resolver call sites | 1 contracts field, 1 verb, 2 one-line guards. **Zero migrations** — the blob column exists (`packages/db/src/schema/chat.ts:172`) and three siblings already ride this exact idiom (`contracts/src/chat/metadata.ts:271-300`) | it is new state |
| N3 | **The client section** — `RegexContextSection` + a `RegexScriptPicker` dialog mount + one `#state` hand-off action (`openRegexScriptInLibrary(scriptId)` = `selectCollectionMember("regex", id)` + `setActiveSection("config")`) | one component in `features/chat/components/`, one small `#state` action | new surface |

### Pure read / already built (the bulk of it)

- The four junctions + `position` + CASCADE — `packages/db/src/schema/regex.ts:46-158`.
- The tier union + run-once dedup — `domain/chat/substrate/regex-tier.ts:22-34`.
- Per-tier ordered reads — `domain/regex/persistence/resolve-sources.ts:34-49`.
- **Room attach / detach / list — all three verbs ship and have no client caller**
  (`contract/service.ts:125-128`; `verbs/attachments/{attach-to-chat,detach-from-chat,list-for-chat}.ts`).
- **The picker's `chat` scope arm ships** — `components/regex-script-picker.tsx:93-97, 340-341, 379-388`.
- The display-broadcast switch — `components/host-display-scripts-control.tsx:28-44` (relocated, not built).
- Live invalidation on every write — every regex mutation is `busDriven` on `regexChanged`, which
  path-invalidates the whole regex router (`regex-script-picker.tsx:36-38`).
- The row vocabulary — `regexRowScent` / `REGEX_PLACEMENT_GLYPHS` / `regexScriptTitle` /
  `Disabled in your library` (`lib/regex-placement-labels.ts:56-63, 135-142, 197-199`;
  `regex-script-picker.tsx:283-287`).
- The section grammar — `DisclosureSection`, `HeadingWithCount`, `SettingSwitchRow`, `RankCell`.

### The one disclosure constraint that shapes N1

The four-tier effective read is **host-only**. `listGlobal`/`listForPreset`/`listForCharacter` are
owner-gated, and `listRoomDisplayScripts` deliberately refuses to let a member learn what scripts the host
owns while the broadcast is off (`verbs/attachments/list-room-display-scripts.ts:39-46`). So:

- **Host** sees all four groups (N1's full payload).
- **Member** sees the `IN THIS CHAT` group only — `listForChat` is member-readable and room-public by the
  `listChatBooks` ruling (`list-for-chat.ts:1-4`) — plus a gloss naming that the host's own rules also run.
  This is the same member/host split Documents already draws (`settings-context-tab.tsx:181-188`).

Do not paper over this with a "hidden" tier count: a member's group list is genuinely shorter, and the
gloss says why.

---

## What I would NOT do

1. **Do not put a fifteenth top-level section in the This-chat tab.** 14 sections / 2,836px is the measured
   ceiling that forced the collapse-all (`settings-context-tab.tsx:107-115`). Land after Lorebooks and
   absorb `Appearance`.
2. **Do not restore a row-level GLOBAL attach switch anywhere.** The 2026-08-19 fork is closed with two
   measurements behind it (`regex-collection-rows.tsx:21-27`, `regex-context-body.tsx:9-16`). The section
   reads `Everywhere` and does not write it.
3. **Do not invent a per-chat mute table.** It would be a second truth beside `regex_scripts.enabled` and
   it would silently not work on the display leg (`use-display-scripts.ts:55-58, 73-77`).
4. **Do not put drag handles in a 367-432px column.** The same arithmetic already killed a switch there
   (42% of a 290px row, 27/33 names clipped).
5. **Do not build ST's Regex Presets now.** We already have library-wide bulk enable/disable
   (`service.ts:91`) and the #1725 board draws its control row. Park with a wake condition.
6. **Do not adopt ST's default-OFF per-tier consent.** Ours would ship every imported card's scripts dead
   with nothing saying so — the F3 defect (`lib/regex-placement-labels.ts:74-79`).
7. **Do not put the tester or the pipeline debugger in this pane.** Both are editor-adjacent by design
   (`regex-test-panel.tsx:8-10`, `regex-pipeline-panel.tsx:9-13`).
8. **Do not draw one pipeline over both legs.** Display is client-side and attachment-blind; prompt is
   server-side and tiered. Drawing them as one diagram is a lie the section's own copy has to carry.
9. **Do not make the row's primary click a link.** Switch and `⋯` are siblings; no nested interactive
   (`DESIGN.md` §5.5). CONTEXT is never navigation (`UI-Architecture-and-Layout.md:295`).
10. **Do not change a shipped label without a vocabulary-map row** (`DESIGN.md` §4). The `†` list above is
    all-new strings, no re-spellings.

---

## For the orchestrator

The section is small and almost entirely assembly: **one read verb** (N1 — `resolveRegexSources` +
`resolveHostTierRegexScripts` exposed with a member/host split), **one `ChatMetadata` boolean with zero
migrations** (N2), and **one client section plus a dialog mount of a picker arm that already exists and has
never been called** (N3). The strongest single finding of the pass is that **the chat regex tier is fully
built server-side and completely unreachable from the UI** — `attachToChat` / `detachFromChat` /
`listForChat` ship and `RegexScriptPicker`'s `chat` arm is written, but a repo-wide search finds only
preset and character callers; that is a dead-wire row worth filing on its own. The second is a correctness
finding that should be filed separately from any build: **`useDisplayScripts` reads the viewer's whole
library and no junction at all** (`packages/client/src/data/use-display-scripts.ts:55-58, 73-77`), so a
`DISPLAY`-placement script attached to a preset, a character or a room does nothing, while an unattached
one in your library runs on every transcript — the four-tier model the schema and the resolver describe
governs the prompt leg only. If a build lane draws the panel before that is either fixed or documented, the
panel will confidently show a display-only row under `FROM THE PRESET · Noir` that is not, in fact, running
from the preset. Third: adopting this proposal **retires the `Appearance` disclosure** by folding
`HostDisplayScriptsControl` into the Regex section — brief that as a coupled-site change (the
`sectionId: "appearance"` open-posture key, the `reserveKey="chat.context.appearance"` boundary, and any CT
or e2e locator naming that kicker) rather than as a move. The two forks that need an owner word, both with
stated defaults, are **per-tier master switches** (default: ship the single `Skip all regex in this chat`
bisect first, add masters only if it proves too coarse) and **card-lifted script consent** (default:
provenance in the `FROM <character>` group, not a consent gate; if a gate is wanted it belongs on the
import path, not the panel).
