---
kind: design
status: active
updated: 2026-09-05
---

# The Regex section — an interaction-design proposal (lane cb-regex-ux)

Lens: the grammar of the panel itself, the debugging loop, mobile, a11y. Scoped to the owner's steer of
2026-09-05: *"a collapsible thing like Injections or Overrides where you can control regex applied from one
spot but the main editing home is in Config."* Everything below is drawn at the CONTEXT column
(384px pane / **\~367px content box** — the width `injections-manager.tsx` measured its own collapse against)
and at a 430px phone.

---

## Verdict

**Build ONE `DisclosureSection` named `Regex` in the This-chat tab, closed by default, whose body is a
per-chat master switch, four non-collapsible tier groups each with its own per-chat switch, and the
effective run-order list — a read over `resolveHostTierRegexScripts` plus verbs that already ship.**
The design's whole teaching device is a two-scope switch grammar the user learns once: **a TIER switch means
*here*, a ROW switch means *everywhere*** — which is strictly more than SillyTavern offers (both of ST's
switch levels are global), and is what makes "turn it off and see" safe to do mid-chat. **I recommend
AGAINST adopting ST's Regex Presets**: the vocabulary collides head-on with our generation Presets (which
are a TIER IN THIS PANEL), and ST's apply semantics — rewrite `disabled` across the whole library, reorder
it, then reload the chat — is a global blast radius wearing a per-chat control's clothes; the room master
switch does the job the owner actually named.

---

## 1. The debugging loop

### The loop, stated

open → see what applies in run order → flip one tier → flip one script → verify in the chat → repeat → done.

### Desktop (mouse), per step

| Step | Actions | Why it is that cheap |
| - | - | - |
| Open | **1** (the `REGEX` kicker) if the context panel is already docked; 2 from a closed panel | The kicker IS the trigger (`chat-context-disclosure-section.tsx`), and the posture is remembered per host per section (`chat-context-section-open-store.ts`) — so after the first visit it is **0 or 1** |
| See run order | **0** | The body is the effective list, ranked 1..N, in the resolver's own order (`regex-tier.ts:24-31`) |
| Flip a tier | **1** | Four tier switches are visible at once — see §3 for why the tier groups are NOT disclosures |
| Flip a script | **1** | Row switch in the `ListRow` `actions` sibling slot |
| Verify | **0** for a DISPLAY-leg script; **1** (Regenerate) for a prompt-leg script | see the asymmetry below |

**The chat is visible the entire time** — the context panel is a docked column
(`--dimension-panel-context`, floor `panel-context-step` = 384px at a standard 1280px desktop,
`tokens.json:1226-1232`), not an overlay. This is the whole case for the owner's steer and against my
earlier 640px drawer: a drawer at that width on a 1280px desktop occludes the transcript, which breaks
step 5 of the loop it exists to serve.

### The one fact that dominates this loop, and that ST gets wrong

**A display-leg flip repaints instantly; a prompt-leg flip changes nothing until the next generation.**
Our display tier runs on the way to the DOM (`renderMessageForDisplay`, `#lib`; `list-room-display-scripts.ts`
narrows to `enabled ∩ DISPLAY` for exactly that reason), so flipping a `Rendered transcript` script
re-renders the visible transcript with no further action. Every other placement is assembled into the next
prompt.

ST does not distinguish these: a toggle just saves (`index.js:653-700` — the toggle handler calls `save()`
and nothing else), while `deleteRegexScript` and `applyPreset` both call `reloadCurrentChat()`, and the
preset-change path fires a toast reading *"Reload the chat for regex to take effect · Click here to reload
immediately"* (`index.js:1636-1646`). That toast is ST admitting its own loop has a hidden sixth step.

**We should never need that toast.** The panel says it once, in the master switch's gloss:

> Display edits apply now. Prompt edits apply on the next message.

and the row's own **stage glyphs already discriminate** — `Eye` = `Rendered transcript` = live; the other five
\= next turn (`REGEX_PLACEMENT_GLYPHS`, `regex-placement-labels.ts`). Zero new vocabulary, zero new width.

*Ranked alternative, rejected:* a `Regenerate` button in the panel head. It would collapse the verify step to
one in-panel action, and it is a **duplicate action door** — regenerate is the message's own affordance, and
minting a second one 900px away is precisely the class the 2026-08-19 fork and the `Resume`/`New` row of
`vocabulary-map.md` were written against. The gloss names the action; the message owns it.

### Desktop (keyboard)

`Tab` to the `REGEX` trigger → `Enter` → `Tab`/`Space` through master, four tier switches, and N row
switches, in DOM order. The whole loop is Tab+Space with no custom chord. Reordering inside the chat tier is
dnd-kit's built-in `Space · arrows · Space` with the mid-drag focus keeper and the name-reading live region
(`sortable.tsx` — `LABEL_DATA_KEY`, `withAnnouncements`). **I recommend minting no keyboard shortcut**: the
panel is a form, and a global "skip all regex" chord is speculative.

**The one keyboard path worth a v2 row:** a `/regex` slash command. ST ships `/regex-toggle <name>`
(`index.js:1448-1486`) and we have the seam already — `SlashCommandContribution` / `SLASH_COMMAND_GROUPS`
(`lib/contribution-contracts.ts`). It is the only path where the chat is 100% visible and a flip costs one
line of typing without leaving the composer. **Spell the scope into the verb, do not copy ST's**:
`/regex here off` (this chat's master) vs `/regex off <name>` (the library flag) — ST's single
`/regex-toggle` writes the global flag with no scope word anywhere, which is the same legibility hole §2
is about.

### Phone (430px)

**Correction to the brief, with a receipt:** on a phone the context panel is **not a sheet** — it is a
FULL-SCREEN pane. `chat-track.ts:11-12` states it: *"Mobile was clean at every state (the panels are
full-screen views there, not tracks)"*. So the chat is **not** visible behind the panel, and no amount of
panel design changes that.

The honest phone loop:

| Step | Actions |
| - | - |
| Open panel → open Regex | **2** first time, **1** thereafter (remembered posture) |
| Flip a tier or a row | **1** |
| Verify | **1** (back to the chat) + 1 (Regenerate) for the prompt leg |
| Return | **1** — and it lands on the same open section at the same scroll |

So: **≤2 actions per step, met**, with the return trip carrying the cost the desktop dock avoids.

The lever that actually pays here is **remembered posture, which is already built** — the per-host
per-section open store means the phone user's second and every subsequent visit is one tap into the exact
state they left. Design implication: the Regex section must use a stable `sectionId` (`"regex"`), never a
label-derived key, per that store's own contract.

*Ranked alternative, rejected:* a half-height bottom sheet leaving the last two messages visible. The app has
no half-sheet grammar; panels are full-pane on mobile as one shell posture, and forking that for one
section is a shell change bought with a section's problem.

---

## 2. The switch grammar — what a row switch means (THE decision)

### Recommendation (ranked #1): the row switch is the library-wide `enabled`, and the panel makes that scope legible without a confirm

**Semantics.** ST's, exactly: one flag on the script, off is off everywhere it is attached
(`regex_scripts.enabled`, `schema/regex.ts:17`). No new per-chat mute table.

**Why users will nonetheless expect per-chat, and why that is fine here.** They will — "I flipped it in this
chat" is a reasonable read. Three things pay that debt:

1. **The tier switches ARE the per-chat control** (§3), and they sit directly above the rows, in the same
   panel, at the same moment. The user who wants "off just here" has a control for it one row up, and it is
   the one the debugging loop wants anyway.
2. **The chat tier's rows are per-chat by construction** — detaching a chat-tier row affects nothing else.
3. **The consequence is announced, once, with an undo, and only when it actually reaches beyond this chat.**

That third one is my specific mechanism and it is the answer to *"make the scope of the flip legible at the
moment of flipping"* in a 367px column with no room for a per-row chip:

> **Flip a row OFF → toast: `Trim ellipsis is off everywhere · Undo`** — but only when
> `listScriptUsage` says the script is attached somewhere other than this chat.

A script attached only here is per-chat by construction and gets **no toast at all**. This is not ceremony
tax: the notice fires exactly when it carries information, the undo makes it free to be wrong, and after one
or two flips the user has learned the grammar and the toasts become background. `notify` (`#lib`) already
supports an action. No confirm dialog — a confirm on every flip would destroy the ≤2-action loop, and the
2026-08-19 finding was explicitly about a switch with *"no confirm and no undo"*: **undo is the half that was
missing, not confirm.**

**No per-row "Disabled in your library" badge at rest.** The picker already mints that badge for the
attached-but-off case (`regex-script-picker.tsx`, side-eye 2026-08-22 P2-2) — because on the picker the row's
own switch means ATTACH, so a second state word needs its subject named. **In this panel the row switch IS
`enabled`**, so the switch already is the badge; a chip repeating it would be the doubling that finding
removed. The scope rides the accessible name instead (§6).

**The duplicate-action-door check, run.** `enabled` is currently writable from the editor and from the bulk
bar (`regex-bulk-bar.tsx` — "on/off (the row's own `enabled`)"). Neither is on this screen. The 2026-08-19
fork removed a *second live copy of one switch on one screen \~990px apart*
(`regex-collection-rows.tsx` header) — that fork is about the **global-ATTACH** switch and stays closed; my
row switch is a different fact with a different word, and after this change there is exactly **one row-level
switch in the app and it is here** (the config library row stays quiet, per DESIGN.md §3.3 and STUDY §7).
And it can never collide with `regex-context-body.tsx`'s *"Runs in every chat"* switch: that one attaches,
this one enables, and the two are never co-rendered.

### Ranked #2, stated as a fork with a default of NO: a per-chat mute table

**What it buys:** the literal expectation. **What it costs, honestly:**

- a new junction + a resolver arm before `executeRegexScripts`' `enabled` filter;
- the row's state space goes from 2 to 4 (library-off × chat-muted), and the panel must render all four
  legibly at 367px — including the genuinely confusing "on here, off everywhere" cell;
- it is a control ST does not have, so it cannot be validated against the owner's stated model
  ("sillytavern's is in one place");
- and the chat TIER already delivers per-chat off for anything attached here.

**Default: no.** Wake condition: someone reports wanting a *global* or *preset* script silenced in one room
while it keeps running elsewhere — that is the one case the tier switch answers too bluntly, and it is the
only case the mute table uniquely buys.

**Do not ship both switches on one row.** Two switches per row at 367px is unreadable, and it is the
two-controls-one-fact shape by another name.

---

## 3. Per-tier master switches

### They are ENABLES here, not ALLOWS — and that is a real divergence from ST, with a reason

ST's tier toggles are per-object **consent gates**, default OFF, backed by a one-time popup on first
encounter (`engine.js:115-118`, `engine.js:122`, `index.js:1607-1628` — `checkCharEmbeddedRegexScripts`
sets an `AlertRegex_<avatar>` key and asks). They exist because in ST **a card's regex lives in the card** —
it is someone else's code arriving in a file you downloaded.

**Ours does not.** A card import LIFTS the card's scripts into the owner's library and attaches them
(`CardLiftPlan`, `domain/regex/contract/dedup.ts:19-27`). **The consent moment is the import**, and a script
in your library is one you already accepted. So a default-OFF tier switch here would mean "the scripts you
attached silently do not run" — the F3 defect class this codebase keeps filing (`regex-placement-labels.ts`
`SCENT_NO_PLACEMENT`; `regex-test-panel.tsx`'s whole second half).

**Recommendation:** four tier switches, **all per-chat**, **all default ON**, named as enables.

Making them per-CHAT rather than per-carrier is the other divergence from the STUDY's `presets.regexAllowed`
sketch, and it is the more useful one: the debugging question is *"is the preset's regex breaking THIS
chat"*, and a per-preset flag makes you break every other chat on that preset to find out.

### The resulting grammar, which is the design's teaching device

| Control | Scope | Where it is |
| - | - | - |
| `Run regex in this chat` | this chat | first row in the section |
| tier switch | this chat | the tier group's own kicker row |
| row switch | **everywhere** | the row's `actions` slot |

Two scopes, two rows of control, said once in the master's gloss. ST cannot teach this because **both of
ST's levels are global** — its preset allow is per-preset-across-all-chats and its row flag is per-script.
ST offers no per-chat regex control at all.

### Where they sit — and the structural constraint that decides it

A `Switch` cannot be nested inside the `CollapsibleTrigger` that a `DisclosureSection`'s kicker already is
(interactive-in-interactive; the `ListRow` contract exists to keep `actions` a *sibling* of the button body
for exactly this reason).

**So the four tier groups are NOT disclosures.** They are plain `Section kicker` groups inside the one
Regex disclosure — the same grammar `regex-context-body.tsx` already uses for
`Attached by presets · 2`, with the switch as a `Row justify="between"` sibling of the kicker text, which is
also exactly the shape ST draws (`dropdown.html:94-108`). This buys three things: **no primitive delta**,
**no nested-interactive violation**, and — decisively for the bisect loop — **all four tier switches visible
after ONE tap**, rather than four doors behind a door.

*Ranked alternative, rejected:* teach `DisclosureSection` an `actions` sibling slot (the `ListRow` contract,
verbatim). Defensible as a primitive delta, but it buys a control that is *hidden when its own section is
closed*, which is the wrong property for a bisect instrument.

### "Skip all regex here" — yes, and it is the highest-value control in the design

One tap answers *"is regex the problem at all?"* — the owner's literal opening question. Neither ST nor we
have it today. It is the section's first row: `Run regex in this chat`. It also gives the closed section an
honest index entry: **the kicker's count chip reads `REGEX 6` normally and `REGEX off` (warning tone) when
the master is off**, so a host who left regex disabled three days ago finds out without opening anything —
the `HeadingWithCount` idiom, `size="inline"` (#829: the `sm` arm doubles the kicker's line box on arrival).

### How an OFF tier draws its rows

**Greyed, not hidden, not collapsed, and NOT struck through.**

- **Not hidden / not collapsed:** the panel's whole job is *what applies here*; hiding rows the moment a tier
  is off means the panel stops answering its own question at exactly the moment you are debugging.
- **Greyed:** reuse the shipped idiom verbatim — `className={... ? "min-w-0 opacity-60" : "min-w-0"}` on the
  identity cluster only, switch at full weight (`regex-script-picker.tsx`'s `PickerRow`, side-eye
  2026-08-22 P2-2: *"Only the identity dims — the switch keeps full weight, because it is still live and it
  is the control that got you here."*). Same reasoning, same pixels.
- **Not struck:** see §6.

### Bisect cost

Master → 4 tiers → N rows is a real halving ladder: **≤ 5 taps** takes a host from "everything runs" to a
single suspect tier, per-chat and fully reversible, with no dialog anywhere.

---

## 4. Rows

### Reuse, verbatim

`LibraryRow → ListRow` from #1725 §3.3 — leading stage glyphs · title · scent subtitle · kebab as a SIBLING
action. What the chat panel **adds**:

1. **A rank cell.** `[1] [2] [3]…` in the resolver's order, the `RankCell`/`GlobalOrderRow` anatomy already
   shipped in `regex-script-picker.tsx` and `regex-context-body.tsx`. It is what makes the kicker's claim
   ("in run order") checkable rather than asking the reader to count by eye — that surface's own argument,
   verbatim.
2. **The on/off switch**, first child of the `actions` sibling cluster, before the kebab.
3. **A `+N` `meta`** on rows the resolver deduped (§7.4).
4. **A drag grip — in the `Only here` section only** (§4.3).

### The width budget at 367px, measured against the 2026-08-19 finding

That finding killed a row switch at a *290px* row where switch+kebab were **42%** and the text column
measured **133px**. Here the row sits in a 367px content box (\~317px of row after the pane and card
insets), and switch+kebab is \~76–88px ≈ **27%**. Survivable — but only if the row gives something back:

**Drop the edit stamp from this panel's scent.** `regexRowScent` ends with `edited 4m ago`
(`regex-placement-labels.ts`), which exists to tell four rows all called "New script" apart *in the
library*. In this panel the discriminators are the rank and the tier section, and the question is *what runs*,
not *which of these did I touch*. Add a third projection to that module's one home — `regexPanelScent` =
stage glyphs in the lead slot + the whole pattern, nothing else — so the panel is one more projection of one
vocabulary, not a new one. (The module's header already carries the precedent for splitting a projection by
surface width: `regexRowScent` vs `regexScriptScent`, 2026-08-19.)

**Density:** `compact`. The pointer-conditional token does the tap floor (44px coarse / 32px fine), so
compact does not cost reachability.

### Kebab items

`Open in library` (the drill-in the owner's steer names) · `Test against a sample`
(`regex-test-panel.tsx`, already built) · `Detach from this chat` — **the last one only on `Only here`
rows**.

**Deliberately refused, each with its reason:**

- **Delete** — destructive, and deleting from here cascades to every preset, character and room (the
  consequence `regex-bulk-bar.tsx`'s confirm exists to name). It lives on the library row, one hop away.
- **Export** — a library verb; nothing about this chat.
- **Move to tier** — *this is where our model and ST's genuinely part.* ST can offer it because a script
  belongs to exactly one scope, so "move" is delete-here + append-there. Ours is ONE library with four
  junctions, and "move from Preset to Everywhere" means detaching from a preset the panel does not own,
  affecting every other chat on it. **The panel must not fake a verb the model does not have.** The
  library's details pane already owns the whole cross-scope picture (`regex-context-body.tsx`).

### Drag, order, and touch

**Drag is allowed in the `Only here` (chat) section and nowhere else.** `applyScopeOrder` takes
`scope: {kind:"chat"}`, so reordering there is per-chat and correct; reordering the other three tiers from a
chat panel would rewrite an order that belongs to a preset, a card, or the whole library and reaches every
other chat — a per-chat panel silently editing global state. Global order already has its author
(`regex-context-body.tsx` §"Global run order"), and preset/character order has the picker.

Consequences, both good:

- **Do not reserve the grip column** in the other three sections. The reserve rule (side-eye 2026-08-06 P3,
  `scopeOrderShowsGrips`) exists so two slices *of one list* share a left edge; these are four separate
  `Section`s with four independent left edges, so reserving would spend \~32px × 3 sections on nothing.
- **Past `COLLECTION_LARGE_GROUP`** the chat section swaps grips for per-row `Move up`/`Move down`, free
  from `RegexScopeOrder`'s existing two-arm shape — the capability never disappears, only the mechanism.

**Touch:** keep the explicit grip; do **not** add long-press-anywhere-on-the-row. The row already carries a
switch and a tap-to-open body, and a long-press that starts a drag from anywhere fights both. The grip is
the disambiguator, and `SortableList` already gives it a real name (`Reorder Trim ellipsis`) plus WAAPI
drop-settle with a reduced-motion short-circuit (motion guide §3.9 — *remove*, not shorten).

**Move between tiers by dragging across sections:** no. Same refusal as the kebab item, same reason.

---

## 5. Named enable-sets (ST's "Regex Presets")

### Verdict: do not adopt. Ranked, with the receipts.

1. **Vocabulary collision, and it is the worst kind — inside the same panel.** "Preset" in this app is
   generation config, and *"Preset scripts"* is a TIER IN THIS VERY SECTION. A "Regex Presets" control sitting
   two rows above a "From the preset" group is a guaranteed misread, and no rename escapes cheaply:
   "Profiles", "Sets", "Modes", "Looks" (taken, theming) each cost a new `vocabulary-map.md` row for a
   feature nobody has asked for.
2. **ST's apply semantics is a global rewrite wearing a per-chat control's clothes.** `applyPreset` walks
   every scope, sets `script.disabled = !inPreset` on **every script**, **re-sorts the lists into the
   preset's order**, saves, and calls `reloadCurrentChat()` (`index.js:340-395`). Ported onto our
   library-wide `enabled`, one dropdown pick silently flips enable state for every chat the owner has —
   the exact blast radius §2 spends a toast and an undo to make legible for a *single* flip.
3. **It is not the owner's job.** The stated job is bisect ("figure out why the chat is being weird"), which
   is §3's ladder. Saved profiles serve the later job of keeping configurations a click apart.

### What replaces the "keep debug vs clean a click apart" job

**The room master switch is that click** (`Run regex in this chat`, one tap, per-chat, reversible), and the
four tier switches are the coarse profile axis. That covers the practical version of the job with zero new
model.

**If it is ever wanted for real**, the honest home is **not** a global `enabled` rewrite: it is a saved set of
**chat-tier attachments** (`regex.listForChat` + attach/detach + `applyScopeOrder`, all shipping), which is
per-chat by construction and reaches nothing else. Park it with that wake condition and that shape.

---

## 6. Accessibility

**Every switch names its scope; the ROLE carries the state.** Never fold on/off into the name — a name that
changes with state is churn, and `aria-checked` already says it.

| Control | Accessible name | Announces as |
| - | - | - |
| master | `Run regex in this chat` (visible label — N1: visible text beats `aria-label`) | "Run regex in this chat, switch, on" |
| tier | `Preset scripts, in this chat` | "Preset scripts, in this chat, switch, on" |
| row | `Trim ellipsis, in every chat` | "Trim ellipsis, in every chat, switch, on" |

The row switch is the one place an `aria-label` is added over a visible label, and it is legal under §13.10
N1 (icon-only/terse) **and** WCAG 2.5.3 (the name CONTAINS the visible script name verbatim, so voice control
works). It is also the cheapest possible fix for the §2 problem: the scope the 367px column has no pixels
for is free in the name.

**Headings.** Each tier group is a `Section kicker` → a real `<h3>`. The Regex disclosure's own kicker is
also an `<h3>`, so the outline under it is flat. That is the pane's existing shape, not a new defect: the
Host-controls band already nests `DisclosureSection` kickers under a `DisclosureSection` kicker
(`settings-context-tab.tsx`). Do not invent a heading-level prop to fix it here.

**Strikethrough is dropped.** ST struck the name of a disabled script (`dropdown.html` + the screenshot).
Three reasons not to copy it: (a) it is invisible to a screen reader, so it can never be the only signal
anyway; (b) at the instrument tier's \~13px in a 367px column it is a legibility tax on the row's most
important string; (c) we already have a shipped, tested, dual-channel signal for exactly this state — the
switch (announced) plus `opacity-60` on the identity cluster (seen). Two channels, no third.

**Focus order** falls out of `ListRow`'s contract for free: rank (not focusable) → row body button → switch →
kebab, because `actions` is a *sibling rendered after* the body.

**`aria-describedby` for provenance.** `ListRow` already routes `subtitle` + `meta` + `markers` into
`describedby` and keeps the NAME as the title alone (#512's accepted ruling). So the `+N` dedup meta reaches
a screen reader as a description without polluting the name. **Do not** put the provenance chip in
`markers` — that slot is documented glyph-scale, and a variable-width chip beside the title steals the
name's width at the pane floor (measured, `list-row.tsx`'s `subtitleLead` doc). `meta` is the right slot.

**Keyboard drag** is dnd-kit's, already wired, already announcing by row name.

**Live region on flip.** The toast (§2) is the announcement; no extra `aria-live` region. A second live
channel for the same event is a double announcement.

---

## 7. Empty and edge states

1. **No scripts anywhere.** The Regex section renders, kicker bare (no chip — a `0` chip is noise,
   `HeadingWithCount`), body = the picker's **existing** empty arm verbatim: *"You haven't written any regex
   scripts yet — write one in your library, then attach it here."* + the `Open your script library` button
   (`regex-script-picker.tsx` `EmptyLibrary`, side-eye X-19: an empty state carries the thing it is telling
   you to do). One home, one copy, one door.
2. **A tier with no scripts.** The tier **header still renders**, with `· 0` and its switch, and **no body
   line**. Renders because omitting it *"would read as 'not built', not as 'none yet'"*
   (`regex-context-body.tsx`'s `AttachmentList`, verbatim). No body line because `Preset scripts · 0` is
   already a complete statement — that surface's own argument — and four empty prose lines at 367px is the
   height this pane cannot spend.
3. **A character not allowed yet.** *This state does not exist in our model*, and the panel should not
   simulate a permission it does not have. Card scripts are lifted to the library at import, so consent
   happened there. What IS worth saying is **provenance, not permission**: the tier gloss reads *"Came with
   the characters in this room."* If a future consent gate is ever wanted, its home is the import flow, not
   a chat panel — and ST's own version proves the point, since its popup fires on character load, not from
   inside its panel (`index.js:1607-1628`).
4. **A script attached at two tiers.** It appears **once, at its earliest tier** — the resolver already
   guarantees this and the order is load-bearing (`regex-tier.ts:24-31`), so the panel must *display* the
   resolver's output, never re-union the four lists. It carries `meta: "+1 more"`; the kebab's
   `Open in library` leads to `regex-context-body.tsx`, which answers *where else* completely and is the one
   home for that answer.
   **The trap this creates, and the pin it needs:** a host turns the Preset tier off and a script keeps
   running because it is also global. Therefore **a tier's count chip must count the rows that tier actually
   CONTRIBUTES after dedup**, not its raw attachment count — otherwise `Preset scripts · 3` with two deduped
   away is a lie the panel tells on its own face. Pin it.
5. **40 scripts in one tier.** Reuse both shipped size behaviours on the same constant
   (`COLLECTION_LARGE_GROUP`): past it, (a) the panel head grows the filter box the picker and config rail
   already share — **filtering across all four tiers at once**, since "which script is doing this" is not a
   per-tier question — and (b) the chat section's drag becomes Move up/Move down. **No `VirtualList`**: the
   picker's own refusal applies — a windowed sub-slice inside a pane its host already renders unwindowed
   puts a second scroller in a panel and lies about the page's real cost.
   Note the filter's known trap, already solved upstream: **a filtered view has no order to edit**
   (`applyScopeOrder` treats unnamed rows as a tail), so while a needle is set the chat section renders plain
   ranked rows and the reorder affordance returns with the full list — `regex-script-picker.tsx` verbatim.

---

## 8. Sketches

> 1 char ≈ 6px. Words shown are shipped strings or `vocabulary-map.md` words except the four I am proposing,
> which are marked `†`: `Run regex in this chat`†, `Everywhere`†, `Only here`†, `Came with …`†.
> `EVERYWHERE / PRESET SCRIPTS / CHARACTER SCRIPTS / ONLY HERE` are the tier kickers (`interactiveKicker`
> voice is for the *disclosure* trigger only; these are plain `kicker`, since they are not triggers).

### A. Desktop — CONTEXT column, 384px pane / \~367px content box

```
 CONTEXT                       [ People | This chat | Preview ]
┌──────────────────────────────────────────────────────────────┐
│ FIELD OVERRIDES  1 set                                     ⌄ │
│  … the three-field form …                                    │
│ INJECTIONS  2                                              › │
│ DOCUMENTS  1                                               › │
│ LOREBOOKS  2                                               › │
│ MACRO PICKS                                                › │
│ REGEX  6                                                   ⌄ │ ← h3 trigger + count chip
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Run regex in this chat†                          (  ●)   │ │ ← per-chat master
│ │ Display edits apply now. Prompt edits apply on the next  │ │
│ │ message. A row's switch turns that script off everywhere.│ │
│ │                                                          │ │
│ │ EVERYWHERE† · 3                                  (  ●)   │ │ ← tier · per-chat
│ │  1  ⌁👁  Trim ellipsis                    (  ●)   ⋯      │ │
│ │         /\.{3,}/                                         │ │
│ │  2  ⌁    Strip OOC                        (  ●)   ⋯      │ │
│ │         /\(OOC:[^)]*\)/                                  │ │
│ │  3  ⌁    Name fixup                +1     (●  )   ⋯      │ │ ← off: identity dims
│ │         /Aza(rael)?/                                     │ │   `+1` = also elsewhere
│ │                                                          │ │
│ │ PRESET SCRIPTS · 2                               (  ●)   │ │
│ │ Came with† Storyteller v3.                               │ │
│ │  4  ⌁    Collapse whitespace              (  ●)   ⋯      │ │
│ │         /\n{3,}/                                         │ │
│ │  5  ⌁    Cut asterisks                    (  ●)   ⋯      │ │
│ │         /\*{2,}/                                         │ │
│ │                                                          │ │
│ │ CHARACTER SCRIPTS · 0                            (  ●)   │ │ ← empty: header only
│ │                                                          │ │
│ │ ONLY HERE† · 1                                   (  ●)   │ │
│ │ ⠿ 6  ⌁👁 Testing thing                    (  ●)   ⋯      │ │ ← grip: chat tier only
│ │         /TODO/                                           │ │
│ └──────────────────────────────────────────────────────────┘ │
│ HOST CONTROLS                                              › │
└──────────────────────────────────────────────────────────────┘
```

Reading the row: `⠿` grip (chat tier only) · rank · `REGEX_PLACEMENT_GLYPHS` strip (`⌁` prompt legs, `👁` =
`Rendered transcript` = repaints instantly) · name · `meta` (`+N` when deduped) · `Switch` · kebab. Line two
is `regexPanelScent` — the whole find pattern, truncated by the box, no second ellipsis
(side-eye 2026-08-19 P2-1).

`⋯` = `Open in library · Test against a sample` (+ `Detach from this chat` in ONLY HERE).

### B. Phone — 430px, full-screen context pane (not a sheet)

```
┌────────────────────────────────────────────────────────────────────┐
│ ‹ Back      Midnight Run          [ People | This chat | Preview ] │
├────────────────────────────────────────────────────────────────────┤
│ FIELD OVERRIDES  1 set                                           ⌄ │
│ INJECTIONS  2                                                    › │
│ DOCUMENTS  1                                                     › │
│ LOREBOOKS  2                                                     › │
│ MACRO PICKS                                                      › │
│ REGEX  6                                                         ⌄ │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ Run regex in this chat†                                (  ●)   │ │
│ │ Display edits apply now. Prompt edits apply on the next        │ │
│ │ message. A row's switch turns that script off everywhere.      │ │
│ │                                                                │ │
│ │ EVERYWHERE† · 3                                        (  ●)   │ │
│ │  1  ⌁👁  Trim ellipsis                          (  ●)   ⋯      │ │
│ │          /\.{3,}/                                              │ │
│ │  2  ⌁    Strip OOC                              (  ●)   ⋯      │ │
│ │          /\(OOC:[^)]*\)/                                       │ │
│ │  3  ⌁    Name fixup                      +1     (●  )   ⋯      │ │
│ │          /Aza(rael)?/                                          │ │
│ │                                                                │ │
│ │ PRESET SCRIPTS · 2                                     (  ●)   │ │
│ │ Came with† Storyteller v3.                                     │ │
│ │  4  ⌁    Collapse whitespace                    (  ●)   ⋯      │ │
│ │          /\n{3,}/                                              │ │
│ │  …                                                             │ │
│ └────────────────────────────────────────────────────────────────┘ │
│ HOST CONTROLS                                                    › │
└────────────────────────────────────────────────────────────────────┘
```

Same anatomy, more slack — every control is already at the coarse-pointer 44px floor by token construction
(`--spacing-control-sm`), so nothing changes but the wrap points. The phone's real cost is the **return
trip**, and it is paid by the remembered posture, not by a layout change.

---

## What I would not do

1. **Would not build it as a 640px drawer** — my own earlier answer, retired by the owner's steer and by the
   measurement behind it: at 1280px a 640px overlay hides the transcript, which is step 5 of the loop.
2. **Would not adopt Regex Presets** (§5) — vocabulary collision inside its own panel, and a global rewrite
   with a per-chat feel.
3. **Would not put a second switch on the row** for a per-chat mute. Two switches at 367px is the
   two-controls-one-fact shape by another name.
4. **Would not add `Move to tier` or cross-section drag.** ST can; our one-library/four-junction model
   cannot, and faking it would silently edit a preset or a card from a chat panel.
5. **Would not put a Regenerate button in the panel** — duplicate action door; the gloss names it, the
   message owns it.
6. **Would not confirm-dialog a flip.** Confirm destroys the loop; the missing half of the 2026-08-19
   finding was *undo*, and a scoped toast with Undo delivers it for the price of nothing.
7. **Would not strike through a disabled name** — invisible to AT, a legibility tax at 13px, and redundant
   beside two channels we already ship.
8. **Would not make the tier groups collapsible.** A bisect instrument whose controls hide behind their own
   sections is not a bisect instrument.
9. **Would not `VirtualList` the panel** at 40 scripts — the picker's refusal applies verbatim.
10. **Would not mint a "skip all regex" keyboard chord.** Speculative; `/regex here off` on the existing
    slash seam is the real power path if one is wanted.
11. **Would not default any tier switch OFF.** ST's default-off is a consent gate for foreign code we lift
    into the library at import; copying it here just makes attached scripts silently dead.
12. **Would not repeat the tier as a per-row provenance chip.** The section IS the provenance; only deduped
    rows need `+N`.

---

## For the orchestrator

The build is smaller than it reads. **Client:** one `DisclosureSection sectionId="regex"` in
`settings-context-tab.tsx` (closed by default, `HeadingWithCount` chip whose value is the effective-set
size), whose body is four plain `Section kicker` groups over `LibraryRow`/`ListRow` rows, plus the shipped
`RegexScopeOrder` on the chat tier only, plus one new projection (`regexPanelScent`) added to
`regex-placement-labels.ts`'s existing one-home module. Almost every part is a reuse with a receipt:
`EmptyLibrary` and the `COLLECTION_LARGE_GROUP` filter from `regex-script-picker.tsx`, the `opacity-60`
inert idiom and the `RankCell` anatomy from the same file, the tier-kicker-with-switch Row from
`regex-context-body.tsx`, `regex-test-panel.tsx` as the kebab's Test door, and the remembered-posture store
the pane already owns. **Server:** the effective read (`resolveHostTierRegexScripts` exists and dedupes;
`regex.listForChat` / `applyScopeOrder` / `listScriptUsage` all ship and are routed) plus **four new
per-chat booleans** — a room master and three tier flags, all on the chat, not on the preset — and the
resolver dropping a disabled tier BEFORE dedup.

**Three decisions I would put in front of the owner rather than assume:** (1) the row switch is library-wide
`enabled` with a scoped Undo toast rather than a new per-chat mute table (§2 — I have a ranked default of
YES and a stated fork with a wake condition); (2) tier switches are per-CHAT enables defaulting ON, which
diverges from ST's per-carrier consent-allows defaulting OFF, on the grounds that our import already lifted
the consent moment (§3); (3) Regex Presets are refused (§5).

**The pins the build owes**, each catching a lie the design can tell on its own face: the panel's list is
the resolver's output in the resolver's order (never a client re-union of four lists); a tier's count chip
counts post-dedup contribution; a tier switch removes exactly that tier's rows from the effective set; a row
switch is library-wide (two chats, one flip); a deduped script appears once at its earliest tier with `+N`;
and the `sectionId` is the stable string `"regex"`, never derived from the label.

**Two hazards for whoever gets this.** The 2026-08-19 fork in `regex-collection-rows.tsx` bans restoring a
row-level *attach* control in the config library — my row switch is `enabled`, a different fact, on a
different surface, and the fork stays closed; say so in the brief so nobody re-opens it or, worse, refuses
the work citing it. And `regex-context-body.tsx`'s empty copy already points here — *"Open a chat's
This-chat panel to attach it there"* — so the panel is a promise the app is currently making and not keeping.

**One lens routing note:** this is a rendered surface with a measured width budget (§4), so it wants
`side-eye` at both 384 and 430 before it is called done, and the width arms matter — a point measurement at
one end will not prove the row's 27% actions budget holds.
