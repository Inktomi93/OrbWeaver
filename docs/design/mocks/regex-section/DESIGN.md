---
kind: design
status: active
updated: 2026-09-05
---

# The room's Regex section — one place to see and switch what runs here

> **Owner-approved 2026-09-05 ("regex approved") on version 2** of the canvas
> `https://claude.ai/code/artifact/21025057-dde4-480f-9a34-71993c4e9027`. Source: `build.mjs` → `canvas.html`
> beside this file; `renders/` holds the default-state PNG of every board in both themes at true size. v1 went
> through side-eye (`REVIEW-sideeye.md`) and stickler (`REVIEW-stickler.md`); §3 and §8 below carry v2's
> changes and the build obligations those reviews minted. Build to spec; must match the mockups.

**Owner, 2026-09-05:** the debugging case ("why is my chat weird → turn the various regex on and off → think of
all the places you have to go"), ST's panel as the bar ("in one place"), the steer ("a collapsible thing like
Injections or Overrides where you can control regex applied from one spot, but the main editing home is in
Config"), and "brainstorm with some agents". Three lenses ran: `PROPOSAL-ia.md` (where it lives, what it
contains, what it hands off), `PROPOSAL-ux.md` (the switch grammar, the loop, phone, a11y),
`PROPOSAL-sys.md` (what the tree serves today, what each control costs, the exact seams). `STUDY.md` is the
ST fact base. This document is the synthesis; the canvas draws it.

## 1. The verdict, in one paragraph

A **Regex** disclosure section in the room's **This chat** tab, sibling of Injections and Lorebooks, same
`DisclosureSection` grammar, closed by default with a count chip. Its body is the room's **effective regex
in run order**, grouped by tier, with two kinds of switch that mean two different things and say so:
**a tier switch means here, a row switch means everywhere.** It writes exactly four things: the per-chat
master, the per-chat tier allows, the library `enabled` of a script, and attach/detach/order for the room's
own tier. Authoring, ordering the other tiers, testing and import stay in Config behind `Open in library`.
SillyTavern's two switch levels are both global; ours give the debugger a local lever first.

## 2. Why here and not elsewhere (IA)

- **The This-chat tab is where the room's own facts live**, and #616 already retired a per-feature CONTEXT
  tab (automation's Rules) INTO a section of this tab — a Regex tab would repeat the reversed mistake
  (`settings-context-tab.tsx:31-37`).
- A CONTENT drawer or sheet covers the transcript you are trying to judge and puts section content in a
  modal (UI-Architecture §4.2 physics 5). Config-with-room-context leaves the room: four acts per bisect
  step. Both lose the loop.
- The tab already carries 14 sections; Regex ships **closed by default** with its count in the kicker and
  **absorbs `Host controls › Appearance`**, which is only `HostDisplayScriptsControl` — a regex control under
  an appearance name — so the section count stays at 14 and the display leg gets its true home.
- On a phone the context panel is a full-screen view, not a sheet (`chat-track.ts:11-12`); the return trip is
  one tap because the tab remembers each section's open posture per host
  (`chat-context-section-open-store.ts`). Desktop loop ≤ 1 action per step, phone ≤ 2.

## 3. The body, top to bottom (host view) — as approved in v2

**v2 changes vs the first draft (from the two reviews):** (a) a **lever strip** is the first thing in the body —
the per-chat master plus ONE switch per tier, `Everywhere` included — so every lever is visible after one tap
regardless of how far the tier lists scroll (v1's 856px body in a 762px pane put the last tier switch past the
fold); (b) the tier groups list **prompt-leg participation only**, because the display leg is attachment-blind
(2026-08-02 O-4 ruling: the viewer's whole library `enabled ∩ DISPLAY` + the host's broadcast, `use-display-scripts.ts`)
and a tier switch or the master cannot reach it; **`On screen` is its own roster** (the display scripts in force
for this viewer: yours from your library, the host's when broadcast is on, each with the script's own switch);
(c) off rows keep full contrast (no opacity stacking) and wear an `OFF` mark; **ranks belong only to rows that
run** (an off row shows `—`); (d) the deduped example sits at the tier that WINS (the resolver keeps the
earliest: `Bo shouting` under `Everywhere` with `+1 · From Bo`); (e) switches drawn at the shipped size (48×32
fine / 64×44 coarse class) so the budgets are honest; (f) a chat-tier row the current host does not own (a
previous host's, #1739) is drawn marked `previous host` with no switch and a menu that says so; (g) kebabs carry
the script's name in their accessible name; (h) vocabulary per §4 v2.


| Slot | What it is | Semantics |
| - | - | - |
| Kicker `REGEX · 6` + chevron | `HeadingWithCount`; N = scripts in force **after dedup** (a chip that counts pre-dedup lies on the panel's face) | closed by default |
| Intro line | "Display rules change what you see now. Prompt rules apply from the next reply. A row's switch turns that script off everywhere." | the two facts a debugger must know; ST hides the first behind a "reload the chat" toast |
| `Run regex in this chat` switch | per-chat master (`ChatMetadata.regexEnabled`, absent ⇒ on) | the A/B lever: one flip, regenerate, compare |
| **The lever strip** (v2): `Run regex in this chat` (master) + one switch per tier — `Everywhere` · `Preset · <name>` · one per present character · `This chat` — each with its in-force count | per-chat flags (`ChatMetadata.regexEnabled`, `regexTiers` keyed by tier / character id; absent ⇒ on); the strip is the bisect instrument, visible before any scrolling | a `Switch` cannot live inside a `CollapsibleTrigger`; the strip is what makes all levers one tap away |
| A one-line stage legend (`input · reply · lore · history · reasoning · display`) | names the six placement squares once | the squares are the shipped `REGEX_PLACEMENT_GLYPHS` icons in the build |
| Four tier groups, **plain `Section`s, not disclosures**, in RUN ORDER: `EVERYWHERE` · `FROM THE PRESET · <name>` · `FROM <CHARACTER>` (one per present character, roster order) · `THIS CHAT` | each: kicker + post-dedup in-force count (+ `off here` when its lever is off) + a one-line provenance; a tier that is off keeps its rows readable at full contrast, ranks drop out (`—`), row switches stay live (they are the library fact) | the tier's lever lives in the strip, not the header |
| A row | rank numeral (only while it runs) · stage glyphs · name (+ `OFF` mark when off; `+1` chip when also attached elsewhere in this room) · scent (the pattern; the edit stamp is dropped — it caused the one measured truncation) · **on/off** · `⋯` (`More for <name>: Open in library[, Detach from this chat]`) | on/off = the library row's `enabled`, i.e. **off everywhere** (ST's semantics); the row's accessible name says it (`Strip OOC — everywhere`); a flip that reaches beyond this chat raises a toast with **Undo**; whether a chat-tier script is attached anywhere else is a fact the read must carry (`attachedElsewhere`) — the toast is skipped only when it is false |
| Dedup | a script attached in two tiers appears **once**, at its earliest tier, with a `+1` chip naming the other | the resolver's run-once rule, made visible |
| `THIS CHAT` extras | a drag grip per row (the chat tier's `position` via `applyScopeOrder`) · `Attach a script` (a dialog in the lorebook-attach grammar — the twin of `AddChatBookDialog`, NOT the `RegexScriptPicker`, which mounts a second order editor and attach switches over the same junction) · `Detach from this chat` in the row's `⋯` · a row owned by a previous host: marked, no switch, menu says not yours (#1739) | the room's own tier is the only one the room may order or populate |
| `⋯` menu | `Open in library` (hand-off to the Config member drill-in, #1725) · `Detach` (ONLY HERE rows) | no Move-to-tier: a room gesture must never edit a preset or a card |
| `ON SCREEN` (last) | the display-leg ROSTER: every display script in force for this viewer (`useDisplayScripts`' output — yours from your library, the host's when broadcast is on), each row with provenance (`yours` / `the host’s`) and, for yours, the script's own switch; then `Show my display scripts to everyone` (the existing host broadcast switch, moved here from Host controls › Appearance); one line: "Display scripts change what you see, now." | the display leg is viewer-library-wide by the 2026-08-02 O-4 ruling; the server never sees the toggle, so the room stays byte-identical until the host opts in |

**Member view (D19):** the effective union resolves under the host's frozen `runAsUserId`; a member has no
parameter on it. Members see `ONLY HERE` read-only (controls omitted, the Lorebooks precedent) and one line:
"The host's regex applies to this room." Nothing about the host's library leaks.

## 4. Copy and vocabulary (v2 — corrected by the stickler; the map has NO regex/scope rows today)

`Regex` (section) · `Run regex in this chat` (new; master) · `Everywhere` and `This chat` (the Documents rack's own scope words in the SAME pane, `chat-documents-model.ts:53-55` — reused, never `Only here`) · `From the preset · <name>` / `From <character>` (new provenance kickers) · `Open in library` (new hand-off verb; neighbour `Open your script library`) · `Attach a script` (the lorebook grammar `Attach a lorebook`) · `Detach from this chat` (shipped) · `Show my display scripts to everyone` (shipped, moved) · `Undo` (shipped toast grammar) · `previous host` (new mark). Every new word lands as a vocabulary-map row in the build; `STUDY.md` §5's earlier tier semantics are SUPERSEDED by this §3 (marker added there).

## 5. Not adopted, with the reason

- **ST's default-OFF consent gates** per preset/character: they exist because a card's regex lives in the
  card; ours lifts card scripts into the library at import (`dedup.ts:19-27`) — consent already happened;
  default-off would ship every imported card's scripts silently dead (the F3 class).
- **ST's Regex Presets** (named enable-sets): parked with a wake condition — `bulkSetEnabled` + the #1725
  library's `Select scripts` cover the bulk case; a new table plus a vocabulary mint ("preset" is
  owner-loaded) is not warranted by the debugging case. Wake: a user asks to keep two configurations a click
  apart.
- **A per-chat mute of an inherited script**: a new table, a resolver stage, sweep rows, and a second "off"
  concept on one row ("mute" is already spent on characters). The tier switch plus the library switch cover
  the job; revisit only if a real session shows "off everywhere" is too coarse.
- **Move between tiers, drag across sections, reordering global/preset/character from the room**: a
  room-local gesture that silently edits every other chat on that preset or character. One home.
- **Strikethrough as the off signal**: invisible to AT; the row dims and its scent says `off`.

## 6. What the tree serves today vs what is new (systems)

| Control | Today | New | Size |
| - | - | - | - |
| the effective read | the union is computed inside the turn and discarded (`regex-tier.ts:22-33`, callers `assemble-gather.ts:406`, `edit.ts:247`) | `chat.listEffectiveRegex` (host-gated), homed in `domain/chat` (it needs preset + roster; `contract/resolve.ts:4-5`), output `EffectiveRegexRow { script, tiers: [{ scope, position }] }` reusing `RegexAttachScope`; un-flatten the character slice (`resolve-sources.ts:31`) | M |
| row on/off | `regex.updateScript {enabled}` / `bulkSetEnabled`, bus-driven | none | S |
| master + tier allows | none | `ChatMetadata.regexEnabled` + `regexTiers` sub-blob on the `setHostDisplayScripts` path (no migration; absent ⇒ on); `HostTierRegexSources.allow` and the drop **before** dedup inside the resolver (tsc forces both callers) | M |
| room tier attach / detach / order | `attachToChat` / `detachFromChat` / `applyScopeOrder` (host-gated) + `RegexScriptPicker` chat arm + `RegexScopeOrder` — **built, zero production call sites** | mount them | S |
| members see the room tier | `regex.listForChat` (member-gated, room-public) | read-only rack | S |
| members' rack refreshes | **broken** — `regexChanged` is a per-user channel (#1733) | `"regex"` in `ROOM_ENTITY_KINDS` + a room-fan op | M (prerequisite) |
| display leg | `HostDisplayScriptsControl` + `useDisplayScripts` | move the control into the section | S |

First commit = the read + the master/tier blob + the section mounting the built picker and order editor;
#1733 lands with it or before it.

## 7. Build obligations minted by the reviews (beyond §3)

1. **The read returns two things** (stickler F2): a pure function in `regex-tier.ts` takes `{ sources, allow }`
   and returns BOTH the per-tier listing (rows of a disallowed tier included, marked) and the effective order
   `[{ scriptId, runsAt }]`; rank comes only from the effective half; the client never re-unions.
2. **Per-character allows need a per-seat character slice** (F3): `resolve-sources.ts:31` flattens; the
   `HostTierRegexSources.character` slice becomes per seat, the allow blob is id-keyed (the `databankVisibility`
   precedent), `allow` is a REQUIRED field so both callers (`assemble-gather.ts`, `edit.ts`) are forced; absent
   ⇒ allowed.
3. **#1733 first** (a host's attach/detach never reaches members: `regexChanged` is per-user); **#1739** (a
   previous host's chat-tier script cannot be switched or detached by the new host) is drawn, and its verb
   asymmetry is a prerequisite or an explicit "not yours" arm.
4. The closed index chip: in-force count for the host, `off` when the master is off (a bare count hides the
   master state); the member chip counts only rows that run.
5. Undrawn states the build renders and cites: a preset-less room, settling / failed reads, a member with
   broadcast on, a member when the master is off, `+2`, an empty tier.
6. Coupled sites (stickler §9): `invalidation.ts` grows the effective read + `promptPreviewReads`; sweep rows per
   new proc; the three display-switch CTs that open `HOST_BAND`; the presence-ledger waiver text; `reserveKey`
   arm B for the section; the doc drift at `entity-room-member-freshness-bridge.md:363`; the `Appearance`
   disclosure's posture key / `reserveKey` / locators retire with the move.
7. Side-eye's measured floors: every switch a `role=switch` with a scoped name; section trigger as the `h3`
   kicker; toast `role=status` with an Undo button, anchored in the CONTEXT column, not over the transcript;
   phone targets ≥ 44; the tab's total height is the tab's problem — the section is closed by default.

## 8. Canvas boards (v2)

| Board | Frame | State |
| - | - | - |
| 01 | 1440×900 | the room, This chat tab, Regex open, host — the lever strip, seven scripts in run order, `Bo shouting` deduped to Everywhere (+1), the On screen roster last |
| 02 | 1440×900 | after two flips: the preset tier OFF here (rows readable, ranks drop out) · `Em-dash killer` OFF everywhere (toast with Undo) · a previous host's `Sailor slang` marked, not yours |
| 03 | 1440×900 | the same room as a member: This chat read-only, one line |
| p1 | 430×860 | phone: the This chat panel full-screen, Regex open |
| p2 | 430×860 | phone: `Attach a script` as a sheet |
