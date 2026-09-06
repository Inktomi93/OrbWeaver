---
kind: design
status: active
updated: 2026-09-05
---

# SillyTavern's Regex panel — a study, and what our one-place panel must be

**Owner, 2026-09-05:** "think of all the places you have to go [to turn regex on or off when a chat is being
weird]" · "sillytavern's is in one place" · (screenshot `Screenshot from 2026-09-05 12-03-33.png`) "go study the
f*** out of that panel". Sources read: the screenshot (ST staging, three-scope panel), and ST's
`public/scripts/extensions/regex/{dropdown.html,index.js,engine.js,editor.html}` at `staging`
(fetched 2026-09-05; receipts are `file:line` into those copies under `scratchpad/st-regex/`).

## 1. Anatomy of the panel (top to bottom, exactly as drawn)

| Slot | What it is | Receipt |
| - | - | - |
| Header `Regex` (drawer, collapsible) | one drawer in the extensions column; lives beside the chat | `dropdown.html:2-8` |
| Toolbar row 1: `+ Global` · `+ Preset` · `+ Scoped` · `Import` · `Bulk Edit` · `Debugger` | **creation is scope-first** (you pick where a script lives when you make it); Import takes many `.json`; Bulk Edit toggles a second toolbar; Debugger opens the "Advanced Regex Debugger" | `dropdown.html:9-36` |
| Toolbar row 2 (bulk mode): select-all · Enable · Disable · Move to global / preset / scoped (each shown only when a selection could move there) · Export · Delete | bulk verbs over checkboxes that appear on every row | `dropdown.html:38-67`, `index.js:496-501` |
| **Regex Presets**: a select + create · update · re-apply · delete | a NAMED SET OF ENABLED SCRIPT IDS across all three scopes (`{global:[ids], preset:[ids], scoped:[ids]}`); applying one sets `script.disabled = !inSet` for every script — a switchable enable-profile ("Marinara's Spaghetti Recipe"). It is the debugging/profile instrument: flip the whole enabled-set in one move | `dropdown.html:70-83`, `index.js:76-81, 351, 405` |
| **Global Scripts** — "Available for all characters. Saved to local settings." | tier 1; the list | `dropdown.html:85-92` |
| **Preset Scripts** — "Only available for this preset. Saved to the preset data." + a **section master toggle** | tier 2; the toggle is `preset_allowed_regex[api][presetName]` — a per-preset ALLOW, stored in the user's settings, default OFF (a preset's scripts do not run until the user allows that preset) | `dropdown.html:94-108`, `engine.js:122`, `index.js:752, 1979` |
| **Scoped Scripts** — "Only available for this character. Saved to the card data." + a section master toggle (greyed when no character) | tier 3; the toggle is `character_allowed_regex` (a list of allowed character avatars) — per-character ALLOW, default OFF: card-shipped regex never runs until the user says so | `dropdown.html:110-124`, `engine.js:115-118, 162-184`, `index.js:751, 1955` |
| A script row: `≡` drag handle · name (STRIKETHROUGH when disabled) · on/off toggle · `⋯` (Move to global / preset / scoped · Export) · ✎ edit · 🗑 delete | order = drag within the section; the toggle writes `script.disabled` ON THE SCRIPT inside its scope's storage; move = delete here + append there | screenshot; `index.js:653-700` |
| Run order = display order | the effective list is literally `[...global, ...preset, ...scoped]` — top of the panel runs first | `index.js:1090` |
| `/regex-toggle <name>` slash command; the Debugger | scriptable toggling; a test tool over a sample | `index.js:1448-1486` |

## 2. The three properties that make it "one place"

1. **Everything that applies to THIS chat is on one screen, in run order, with its switch.** The panel is
   contextual: the Preset section is the current preset's, the Scoped section is the current character's.
   You never leave the chat to find out what is running or to turn it off.
2. **Two levels of switch.** A per-script toggle (that script, wherever it is stored) and a per-TIER allow
   (this preset's scripts as a whole; this character's scripts as a whole). Bisecting is "flip a tier",
   then "flip a script".
3. **Enable-sets are savable.** Regex Presets let you name a configuration of switches and swap between
   them, which is how a power user keeps "debug", "clean output" and "author's recipe" a click apart.

Two things it is NOT: it is not a library (a script belongs to exactly one scope; sharing is copy or move),
and it has no chat tier (nothing is "this chat only").

## 3. What we have, mapped

| ST | Orbweaver today | Receipt |
| - | - | - |
| Global scripts (settings) | the `global` junction on the ONE library (`regex_scripts`, owner-stamped) | `packages/db/src/schema/regex.ts:1-25` |
| Preset scripts (in the preset) | the `preset` junction; the preset editor's Regex tab is a PICKER over the library | `features/preset/components/regex-tab.tsx:1-6` |
| Scoped scripts (in the card) | the `character` junction; a card import LIFTS the card's scripts into the library and attaches them (`CardLiftPlan`, attachment order = card order) | `domain/regex/contract/dedup.ts:19-27` |
| — | a fourth tier, `chat` (this room only) | `schema/regex.ts` junctions; `regex-tier.ts:3` |
| run order global → preset → scoped | global → preset → characters (roster order) → chat; a row attached at two scopes runs ONCE at its earliest tier (dedup by FK-real id — a property ST cannot have) | `domain/chat/substrate/regex-tier.ts:7-14` |
| per-script `disabled` inside its scope | `regex_scripts.enabled` — ONE flag on the library row (so "off" is off everywhere it is attached) | `schema/regex.ts:17, 58` |
| per-tier allow (`preset_allowed_regex`, `character_allowed_regex`) | a room-level display-scripts OPT-IN gate (`resolveRoomDisplayPolicy`, host's) for the DISPLAY leg; no per-tier allow on the prompt leg that I can see from this study | `domain/regex/verbs/attachments/list-room-display-scripts.ts:5`, `features/chat/components/host-display-scripts-control.tsx` |
| Regex Presets (named enable-sets) | none | — |
| Debugger | `regex-test-panel.tsx` (test against a sample) | — |
| one panel beside the chat | none — four write homes (Settings library, preset tab, card, room control) and no effective view | (the owner's complaint) |

## 4. The gap, stated plainly

We split ST's one screen into a library plus three attachment homes and never built the screen. The pieces
underneath are better than ST's (one library, four tiers, run-once dedup, FK-real ids), which is exactly why
the panel is cheap to build now: it is a READ over `resolveHostTierRegexScripts` plus the existing junction
verbs, not a new model.

## 5. The contract — our one place

> **SUPERSEDED 2026-09-05 by `DESIGN-regex-panel.md` §3 (owner-approved v2).** This section was the first draft; the approved contract differs on the tier switches (per-chat, default on — NOT ST's consent gates), on the two legs (the tier groups are prompt-only; `On screen` is its own roster), and on vocabulary. Kept as the record of the ST-derived first cut.

**The Regex panel is a section of the chat's This-chat tab** (the same component also renders in Settings as
the de-contextualized library; see §6). In the chat it shows, top to bottom, in run order:

1. A toolbar: `+ Script` (scope picker in the editor, default = this chat) · `Import` · `Select` (bulk) · `Test`
   (the existing test panel) — the same verbs ST has, our spellings.
2. **Four sections, one per tier, in run order: Everywhere · Preset <name> · Characters (per present
   character, in roster order) · This chat.** Each section has its description line ("Runs in every chat" /
   "Comes with the preset <name>" / "Comes with <character>" / "Only here") and a **section master switch**.
3. Each row: drag handle (order within the tier — writes the junction `position`) · name (struck through
   when off) · on/off · `⋯` (Move to … / Export / Open in library) · edit (drills to the editor) · detach.
4. Bulk mode: select-all · Enable · Disable · Move to … · Export · Detach.

**Switch semantics (the one design decision, and it matches ST):**

- The per-row switch is the script's own `enabled` flag — off is off everywhere, as in ST, where disabling
  a preset script disables it for every chat on that preset. No new per-chat mute table; the owner's
  "turn them off to see what changes" is served at the row level exactly as ST serves it.
- The per-tier master switch is a per-SCOPE-OBJECT allow, as in ST: for Preset it is a flag on the preset;
  for a character it is the room's allow for that character's scripts (the existing display-scripts opt-in
  gate generalised to the prompt leg — one gate, both legs); for This chat a flag on the chat; Everywhere
  has no switch (turn scripts off individually, or bisect by tier). These are the schema additions:
  `presets.regexAllowed`, `chats.regexAllowed`, and the per-room per-character allow the display gate
  already models. The resolver drops a disallowed tier before dedup.
- **Regex Presets are adopted** as named enable-sets over the library (`regex_enable_sets`: name + the set
  of script ids that are ON); applying one writes `enabled` across the library, exactly ST's semantics.
  Optional; second commit.

Everything above is a read plus existing verbs except the three allow flags and the enable-sets table.

## 6. The same component in Settings

The Settings library (#1725's regex board) is the SAME list de-contextualized: every script the user owns,
grouped by where it is attached (a script attached in three places appears once, with three chips), the same
row anatomy, no tier master switches (there is no "this preset" in Settings), the editor as the drill-in, and
the details pane's "Where it runs" as the per-script inverse view. One component, two data sources
(`resolveHostTierRegexScripts(chat)` vs `listScripts(owner)` + attachments), one row.

## 7. What this changes for #1725

Nothing in the LIST/CONTENT move. The regex board's rows stay as drawn (no row switch in Settings — a switch
there would be the library-wide `enabled`, which is fine, but the owner's debugging case is served in the
chat panel, so Settings keeps the row quiet). The 2026-08-19 fork ("do not restore a row-level attach
control") is about the ATTACH switch, which stays in the details pane; the chat panel's row switch is the
ENABLED flag, a different control with a different home. Recorded here so nobody re-opens the wrong fork.

## 8. Build shape (for the row)

- Server: `chat.regex.effective` read (tiered, with allow flags), `preset/chat regexAllowed` writes, the
  per-character room allow generalised, optional `regex_enable_sets`.
- Client: `RegexPanel` (composition tier; `ListRow` rows; `SortableList` per section; the existing
  bulk bar), mounted in the This-chat tab and reused by the Settings library body.
- Pins: run order equals display order; a tier switch removes exactly that tier's rows from the effective
  set; a row switch is library-wide (two chats, one flip); dedup shows a script once at its earliest tier
  with the other chips.
