---
kind: review
status: draft
updated: 2026-08-30
---

# side-eye — RAIL delta pass: Characters

**Lane:** cb-rail-characters · **Surface:** the Characters section on live `:5173` (library list pane,
character content/editor, context pane incl. the snapshot/history UX, the card import/export doors) ·
**Base:** main `8989aba35`, environment confirmed alive before driving (`pnpm snap /` → `nav=OK
console-errors=0 page-errors=0`) · **Principal:** the single dev-stack user (`sessions.me` →
`{userId,handle,globalRole}`, `AUTH_MODE=oidc` effective); every receipt below was taken as that
principal · **Read-only:** no character was created, edited, archived, deleted, exported or imported.

**Population caveat, stated once and load-bearing for the whole report.** This is the post-reset seed
db: `character.list` `totalCount = 10`, tag vocabulary 28. The 2026-08-22 pass measured the owner's
real library at 327 characters / 551 tags. **Every scale-dependent finding in that report is
unreproducible here and I do not claim to have re-tested it** — I say so per row in the coverage
table. The true-empty (zero-character) arm is likewise unreachable: the seeded examples ARE the
first-run population.

---

## Verdict: SHIP WITH FIXES

The delta since 2026-08-22 is large and almost all of it is good. Three of that pass's four P1s are
verifiably dead — the library now stays docked on selection, the filter block collapses by default
(chrome above the list 272px → 180–192px and density finally moves it), the nested tag scroller is
gone, and a working `Skip to characters` link puts a keyboard user on the first row in **two
keystrokes** where it used to take 563. The fourth (Label-in-Name) is the owner-ruled accepted
exception and stays accepted.

What I found instead is a different class: **the surface has grown three separate action vocabularies
for one artifact**, and several controls that describe themselves wrongly. The single most
consequential one: once a character is open, there is no path on screen to **export its card** —
Export lives only in the list row's `⋯`, which a user who has already opened the character has no
reason to revisit. I concluded "export doesn't exist" myself, from the Character-actions menu, one
tool call before I found it.

---

## Per-area verdicts

| Area | Verdict |
| - | - |
| Library list pane | **Much improved.** Chrome trimmed, filters collapsed, skip link real, focus ring solid, census single-homed. Two live defects: a dead 28-facet tag vocabulary, and a 40px import button on coarse pointer. |
| Character content / editor | **Well crafted, mis-labelled.** Prose surface clean and readable; the `Own look` chip, the spoiler toggle and the 10.5px pill labels each mis-describe themselves. |
| Context pane | **Content is right, containers are wrong.** #513's Origin/Links/Options/Activity landed, but it lives under a tab called "Field", and "Options" is a 2253px junk drawer. |
| Snapshot / history UX | **Built and buried.** Reachable only at the bottom of the Options tab after \~1560px of theme editor + Trust prose. Empty state itself is fine. |
| Import door | **Functional, exit-less.** Clear copy (said three times), no visible Close/Cancel. |
| Export door | **Exists, single-homed in the wrong home.** Row `⋯` only; invisible from the open character and absent from bulk. |
| Card-atlas / hub-ingest delta | **NOT REACHED.** Every character on this db reports `Source: Made here`; no hub-ingested character exists and importing one would mutate. Explicitly uncovered — see the coverage table. |

---

## Probed appearance state (never assumed)

| Handle | Value (owner arm, today) |
| - | - |
| root | `data-blur-panels` `data-blur-composer` `data-blur-modals` **`data-reduced-motion=false`** · no `data-theme` · no `data-texture` · no `data-shadow` |
| root style | `--font-scale:1` `--blur-strength:14px` `--reading-line-height:1.55` |
| `.shell-grid` | `data-section=characters` `data-density=comfortable` **`data-elevation=flat`** `data-list-mode=docked` `data-context-mode=collapsed` |

Note the delta from 2026-08-22: `data-reduced-motion` is now **false** (it was `true` then), so this
pass measured live motion where the prior pass could not.

Arms taken: owner · `--appearance-preset maximal` (`elevation=glow`, `texture=grain`) ·
`--appearance-preset compact` · `--appearance-preset reading` (`--font-scale 1.25`) · `--theme Light`
· `--theme none` · `--mobile` (430×932 coarse) · `--viewport 768x900` · `--viewport 1920x1080` · four
pane states.

---

## Design health — Nielsen (honest; 25/40 on 2026-08-22)

| # | Heuristic | Score | Key issue |
| - | - | - | - |
| 1 | Visibility of system status | 3/4 | `Saved` indicator, N-of-TOTAL census and `1 selected` all correct; but the filter promises facets that match nothing, and provenance dates are impossible |
| 2 | Match system ↔ real world | 2/4 | raw `oklch(0.85 0.1 62)` printed as a user-facing value; `Made here` on shipped content; `Empty` as an unlabelled value; a "Field" tab containing no fields |
| 3 | User control & freedom | 3/4 | Cancel / Clear search / Clear all / back / skip link all present and good — the import dialog has no visible exit |
| 4 | Consistency & standards | 2/4 | three disjoint action menus for one artifact; two dialog patterns (one with Cancel, one without); two toggle patterns (one correct, one inverted); round toggles for multi-select |
| 5 | Error prevention | 3/4 | the create dialog states its requirement before you type — good; bulk `Delete` sits beside `Archive` (confirmation not verified, review-only) |
| 6 | Recognition over recall | 2/4 | version history is 1560px down a tab named Options; Export is invisible from the open character |
| 7 | Flexibility & efficiency | 3/4 | select mode + bulk bar + group + sort + skip link; no keyboard shortcuts on the surface |
| 8 | Aesthetic & minimalist | 3/4 | the list is genuinely handsome; a 917×750 empty CONTENT void and a 2253px Options tab pull it down |
| 9 | Error recovery | 4/4 | the no-matches states (search AND filter) are specific, echo the query, and offer the exact recovery — still the best in the app |
| 10 | Help & documentation | 3/4 | real glosses on tokens, theme, Trust, plus a `More info about Trust` door; nothing explains oklch or the tag vocabulary |
| | **Total** | **28/40** | good band, lower edge. Calibration only — the finding list is the deliverable, and per the owner's 2026-08-22 ruling the band gates nothing. |

---

## Findings

### \[P1] One character, three disjoint action menus — and Export is unreachable from the open character

Measured, same character (`Sabine Veyra`), same session:

| Menu | Reached by | Items |
| - | - | - |
| `menu "Actions for Sabine Veyra"` | the LIST row's `⋯` | Archive · Duplicate · **Export card** · Delete |
| `menu "Character actions"` | the CONTEXT pane's `⋯`, with the character open | Open in Refinery · Duplicate · Convert to persona · Set as welcome greeter · Delete |
| the bulk bar | Select mode, ≥1 row ticked | **Tag** · Archive · Delete |

Only `Delete` appears in all three. `Export card` and `Archive` exist **only** in the row menu;
`Open in Refinery` / `Convert to persona` / `Set as welcome greeter` exist **only** in the context
menu; `Tag` exists **only** in bulk.

**Why it hurts a user:** the character card is a portable PNG/JSON — getting one back out is table
stakes, and it is the natural counterpart of the Import door sitting 40px away in the same header. A
user who has the character OPEN (the state in which "I want to export this" occurs) sees a
`Character actions` menu that does not contain it, and reasonably concludes the app cannot export. I
did exactly that during this pass, and only found `Export card` by separately probing the row menu.
Nielsen #4 (same action, same home, same label) and §13 IA single-homing.

**Fix — `distill`:** one action home per artifact. The context pane's `Character actions` is the
correct home for an OPEN character; make it the superset (add Export card + Archive + Tag), and let
the row `⋯` be a subset of the same registry rather than a second, different registry. Bulk stays a
subset by definition, but its members must come from the same vocabulary.

**Receipt:** `snap --goto characters --jsclick '[aria-label="Actions for Sabine Veyra"]' --aria
'[role=menu]'` (4 items) vs `snap --open-character 'Sabine Veyra' --click '[aria-label="Show detail
panel"]' --click '[aria-label="Character actions"]' --aria '[role=menu]'` (5 items) vs
`reports/snaps/cbrx-selected.png` (bulk bar: `1 selected | Tag | Archive | Delete | ✕`).

---

### \[P2] The tag filter offers 28 facets, every one of which matches nothing

`Group by tag` on the unfiltered library returns exactly one bucket: **`UNCATEGORIZED 10`** — all ten
characters carry zero applied tags. Yet the FILTERS block offers 28 tag chips
(`comedy · rpg-ready · fantasy · slice-of-life · wholesome · gothic · americana · assistant` +
`+20 more`), each a real toggle with a proper accessible name
(`"Filter by fantasy: off — activate to include"`).

Activating one:

```
CHARACTERS 0 of 10 … 1 active
No matches
No character in your library matches the current filters.
```

At least two of the offered tags (`fantasy`, `rpg-ready`) appear on `Sabine Veyra` as **unaccepted
SUGGESTIONS** (her applied-tag row reads `Empty`), so the vocabulary is not derived from applied tags
alone. I did not chase the producing query — **the mechanism is a question for the fix lane**, but
the symptom is fully receipted.

**Why it hurts a user:** the entire filter apparatus is a dead affordance on a fresh install — 28
clickable controls with no live consumer, which is the §0 "no dead toggles" class expressed in data
rather than in code. A first-timer's most natural exploration move ("show me the fantasy ones") returns
"No matches" and teaches them the library is broken.

**Fix — `harden` + `clarify`:** derive the filter vocabulary from tags actually carried by at least
one character in scope; render suggestion-only tags, if they must appear, in a visibly separate
"suggested" group with a count of 0 shown up front. Suppress the whole block when the vocabulary is
empty (the collapsed default already makes this cheap).

**Receipt:** `snap --goto characters --click '[aria-label="Group by tag"]' --eval aside.innerText` →
`"… 10 characters | UNCATEGORIZED | 10 | Elias Thorn …"`; chip census (8 visible) via
`--eval '[…aria-label^="Filter by"]'`; the filtered arm's `0 of 10` + no-matches copy.

---

### \[P2] The spoiler toggle inverts its own state announcement

The eye button beside `1 chat` flips **both** its accessible name and `aria-pressed`:

| Click | accessible name | `aria-pressed` |
| - | - | - |
| initial | `Hide spoilers` | `false` |
| after 1 | `Show spoilers` | `true` |

State 2 announces as **"Show spoilers, toggle button, pressed"** — which a screen-reader user reads as
"showing is ON", i.e. spoilers visible. Spoilers are in fact hidden. ARIA APG's rule is one or the
other: a static label with `aria-pressed` carrying state, or a label that flips with no `aria-pressed`.
Doing both inverts the meaning in exactly one of the two states.

**This surface already does it correctly elsewhere**, which is what makes it a defect rather than a
style choice: `Select multiple` keeps a static name and flips `aria-pressed` false→true
(measured in the same session).

**Fix — `clarify`:** keep the name static (`Spoilers`, or `Hide spoilers` throughout) and let
`aria-pressed` carry the state; or drop `aria-pressed` and keep the flipping action label.

**Receipt:** `snap --open-character 'Sabine Veyra' --eval <name+pressed> --click
'[aria-label="Hide spoilers"]' --eval <name+pressed>` → `{"name":"Hide spoilers","pressed":"false"}`
then `{"name":"Show spoilers","pressed":"true"}`. Contrast arm: `Select multiple` → `pressed` false→true
with the name unchanged, 20 checkboxes minted.

---

### \[P2] The character theme editor prints raw `oklch(...)` strings as its user-facing values

The CONTEXT → **Options** tab's theme editor labels each colour field with its literal CSS value:

```
Background   oklch(0.15 0.0105 238)
Accent       oklch(0.75 0.12 68)
Border       Inherit
Speaker name oklch(0.75 0.12 68)
Dialogue     oklch(0.85 0.1 62)
Narration    oklch(0.76 0.03 240)
Body         oklch(0.88 0.015 236)
```

Six raw colour-science strings visible in one screenful, beside one field (`Border`) that reads
`Inherit` and is perfectly legible.

**Why it hurts a user:** this is the "insider-knowledge name" smell in the product surface. The
panel's own copy explains the intent correctly — *"each field prints its own value, so you can always
tell which ones this card sets"* — so the design goal (distinguish set from inherited) is right; the
notation is a leak of the token pipeline's internal spelling into the UI. Nielsen #2, §9 Jordan
(jargon barrier).

**Fix — `clarify`:** keep the swatch, replace the value text with something a person reads — `Custom`
beside the swatch, or a hex, or the source theme's field name. `Inherit` stays as-is; it already works.

**Receipt:** `reports/snaps/cbrx-ctx-options.png` (six strings legible in the 384px pane); ARIA tree of
`aside[data-panel-side=context]` in the Options tab (70 lines, quoted in `cbrx-opts.log`).

---

### \[P2] The Import dialog has no visible way out

`dialog "Import a character card"` contains, in full: a heading, two paragraphs, a `Choose File`
control, and two more paragraphs. **Zero buttons** besides the file input — no `✕`, no `Cancel`,
no `Close`.

Measured: `[...dialog.querySelectorAll("button")]` → `[]`, on both the desktop and the 430px coarse
arm. `Escape` does dismiss it (measured: dialog present → `--key Escape` → absent). A backdrop element
exists (`div[data-slot=dialog-backdrop]`, 430×740) but I could **not** verify backdrop-tap dismissal —
my synthetic pointer sequence did not close it, and synthetic events are not trustworthy against Base
UI's outside-press detection. **I am not claiming backdrop dismissal is broken.** The finding stands on
the visible-affordance ground alone.

**Why it hurts a user:** on touch there is no Escape key. Every other dialog on this surface has an
exit — the sibling `New character` dialog ends in `Cancel | Create`. §5 "provide the exits" and
Nielsen #3/#4.

**Fix — `clarify`:** give it the same `Cancel` the create dialog has (or a header `✕`), matching the
house dialog recipe.

**Receipt:** `snap --goto characters --mobile --click '[aria-label="Import a character card"]' --eval <button census>` → `{"open":true,"closeBtns":[]}` → `--key Escape` → `{"open":false}`;
`reports/snaps/cbrx-import.png`; create-dialog contrast arm → `"… Cancel\nCreate"`.

---

### \[P2] The `Own look` chip: `role="img"`, a sentence for a name, and a gloss only a mouse can reach

```html
<... role="img" aria-label="This card carries its own look — edit it in the Options tab." tabindex="-1">
  <p>Own look</p>
</...>
```

Three separate problems in one element:

1. **WCAG 2.5.3 Label in Name** — visible text is `Own look`; the accessible name is a sentence that
   does not contain it. (This is *not* covered by the #512 owner ruling, which is scoped to the
   list-row `title + qualifier` contract.)
2. **`role="img"` on a text badge** is the wrong role — nothing here is an image; it is a status chip.
3. **`tabIndex: -1` and `title: null`** — the explanatory sentence is delivered to a screen reader (as
   the img's name) and to a mouse (as a hover tooltip), but a **keyboard-only sighted user and a touch
   user can never see it**. That gloss is the only thing on the surface that tells you where the
   character's look is edited.

**Fix — `clarify`:** drop `role="img"`; make the chip a `<button>`/`<span role="status">` whose
accessible name IS `Own look`, and attach the sentence via `aria-describedby` + a focusable tooltip
trigger — so keyboard and touch reach it too.

**Receipt:** `snap --open-character 'Sabine Veyra' --eval <chip probe>` →
`{"role":"img","aria":"This card carries its own look — edit it in the Options tab.","tabIndex":-1,
"text":"OWN LOOK","title":null}`; ARIA tree line `- img "This card carries its own look…": - paragraph: Own look`.

---

### \[P2] Version history is buried at the bottom of a junk-drawer tab

The snapshot log (`character_snapshots`, D28) is real and its empty state is good —
`History / Snapshot now / "No snapshots yet. Take one to capture this character's current state."` It
is mounted at the **very end** of the CONTEXT → Options tab, which also holds, in order: the full
per-character theme editor (12 colour fields + font + radius + preview), the Background picker, and a
three-paragraph Trust essay.

Measured tabpanel geometry: **`clientHeight 693` · `scrollHeight 2253` · 31% visible.** Reaching
History costs \~1560px of scrolling past three unrelated concerns, inside a 384px pane.

**Why it hurts a user:** "can I undo what I just did to this character" is a high-stress question, and
there is no affordance a user would guess. The tab is also four concerns wide (look · background ·
security · versioning) — Nielsen #6, §8 chunking, §13 IA.

**Fix — `layout`:** split the Options tab. Versioning is its own concern and deserves its own tab
(`History`) or a hero-band affordance; Trust is a security concern and reads as one. The tab strip
already has room — it holds four tabs and a `…` in 384px.

**Receipt:** `snap --open-character … --click 'role=tab[name="Options"]' --eval <tabpanel geometry>`
→ `{"clientH":693,"scrollH":2253,"ratio":"0.31"}`; the tail innerText read quoted above;
`reports/snaps/cbrx-ctx-options.png`.

---

### \[P2] `Import a character card` is a 40px target on coarse pointer

`design-audit --goto characters --mobile` (pointer=coarse, census 335) reports one tap-target finding:
`40×44px`, short side 40, below the 44px floor. **Corroborated by four-cardinal `elementFromPoint` as
briefed** — the button owns its centre, north and south points, and **loses** the point at ±21px
horizontally (`w: LOST:HEADER.shell-panel-header`, `e: LOST:DIV.flex…`). It carries **no**
pointer-conditional `::after` expander (`getComputedStyle(el,"::after").content === "none"`), so the
40px box is the real hit area, not an artifact of box math.

This is not a false positive of the class the skill warns about: it is a real `<button>` with a real
accessible name, on screen, with no touch-target pseudo-element.

**Fix — `adapt`:** give it the same pointer-conditional touch-target `::after` the `@orb/ui` Button
`size="glyph-*"` variants carry (`packages/ui/src/primitives/button/variants.ts:16-20,76-82`), or widen
the glyph button to 44px on coarse.

**Receipt:** `reports/design-audit/root.json` (mobile arm) + the four-cardinal probe quoted above;
`reports/snaps/cbrx-chars-mobile.png`.

---

### \[P3] The tag-suggestion pill labels are 10.5px interactive text

`design-audit` fires `undersized-ui-text` six times on the character editor, desktop **and** coarse
arms alike. **Located precisely** (the raw count is not forwarded): the offending nodes are the label
`<span data-slot="text">` *inside* each suggestion button —

```
{"t":"banter","fs":10.5,"tag":"SPAN","interactiveAncestor":"Accept banter"}
{"t":"drama", "fs":10.5,"tag":"SPAN","interactiveAncestor":"Accept drama"}
… ×5 pills + the "Suggested" kicker
```

The micro voice (10.5px) is correct for the `SUGGESTED` kicker; it is below the 11px functional floor
for a control's own label. Note the buttons themselves compute 13px — reading the button node instead
of the span is how this gets mis-reported (see Retractions).

**Fix — `typeset`:** move the pill label to the 11px+ label voice; keep `SUGGESTED` at micro.

**Receipt:** `reports/design-audit/root.json` (editor arm, 6 × P2 `undersized-ui-text`) +
the located-node eval above. Hit geometry is fine: the pills measure 75×44 / 48×48 on coarse with all
four cardinal points owned.

---

### \[P3] Seeded characters report provenance that cannot be true

Four characters checked (`Charlotte`, `JFC`, `Kohaku`, `Niko`), context Field tab, identical:

```
ORIGIN | Added | 3h ago | Source | Made here | … | ACTIVITY | Last chat | Aug 2, 2026
```

Two problems: (a) **`Made here`** on characters the user did not author — they shipped with the app;
(b) `Added 3h ago` beside `Last chat Aug 2, 2026` is **impossible** — a chat 28 days before the
character existed (today is 2026-08-30).

**Why it hurts a user:** the Origin card's whole job is provenance. On first run, the first character a
user inspects tells them two things that are false. Nielsen #1.

**Fix — `clarify`:** give seeded content its own Source value (`Example — shipped with Orbweaver`), and
either stamp seeded `createdAt` to the authored date or suppress `Last chat` when it precedes `Added`.

**Receipt:** four `--open-character X --eval <context tabpanel innerText>` reads, quoted above.

---

### \[P3] The Characters list pane drops a frame on every section entry

Console, reproduced on **every** run of this pass across arms:

```
[drop] 74–77ms rendered frame mid-animation (budget 50ms) · aside[aria-label=Characters list]
       · [data-slot=theme-scope] · <html> · OVER BUDGET   (desktop)
[drop] 54ms  … · aside[aria-label=Characters list] · <html> · OVER BUDGET   (mobile)
```

This is distinct from the boot-splash `weave-veil` drops (known-ruled, #433 family): the flagger names
the Characters list aside, and it fires at list mount, i.e. the `data-list-flip=in` entrance.

**Receipt:** console of `cbrx-chars-desk.log`, `cbrx-chars-mobile.log`, `cbrx-arch.log` and others
(consistent across \~8 runs). Supporting: `__orb.motion()` after a full drive →
`{cls: 0.0227, virtualizedCls: 0, nonVirtualizedCls: 0.0227, worstBlocking: 93}` — the 93ms LoAF is at
`startTime 1303` from `main.tsx` (boot), and **`nonVirtualizedCls 0.0227` is comfortably inside the 0.1
budget**, so this is a single-frame entrance cost, not layout instability.

---

### \[P3] Section entry still breaches the long-task budget — and it is not the data

`perf-meter / --goto characters --click '[aria-label="Sabine Veyra"]'`:

| step | long tasks | worst | blocking | rAF gap | shift |
| - | - | - | - | - | - |
| goto characters | 2 | **78ms** | 8ms | 83ms | 0 |
| click a character | 0 | — | 40ms dur / 4ms delay | 50ms | 0 |

The 2026-08-22 pass measured 69ms here and attributed it to the 551-row tag-vocabulary query. Today's
vocabulary is 28 rows — **33× smaller — and the worst long task is 78ms, slightly worse.** So the
attribution was wrong: the cost is the section mount itself, not the vocabulary.

The primary action remains excellent: 40ms duration, 4ms input delay, zero long tasks, zero shift.

**Receipt:** `reports/perf-meter/perf-meter.json`.

---

### \[P3] Reading measure sits one character over the band, at every desktop width

The opening-greeting paragraph measures **76ch** (696px at 16px/24px Geist) — the ratified band is
65–75ch. The cap is real and holds: identical 696px at 1280px, 1920px and list-collapsed; it drops to
496px / 54ch when the context pane docks, and to 68ch under `--appearance-preset reading`
(`--font-scale 1.25`). So this is a one-character calibration nit on the default arm, not a runaway.

`design-audit`'s own line-length rule (0.573 ratio since #464) does not fire, consistent with 76.

**Receipt:** canvas `measureText("0")` measure across four pane states and four viewport arms, logged in
`cbrx-panes.log`, `cbrx-compact.log`, `cbrx-reading.log`, `cbrx-w768.log`, `cbrx-w1920.log`.

---

### \[P3] Smaller things, each receipted

- **`1 selected` wraps to two lines** in the bulk bar — the count label breaks between "1" and
  "selected" in the 290px pane. `reports/snaps/cbrx-selected.png`.
- **The tag row's value has no label.** ARIA reads `paragraph: Empty` then `button "Add tag"`; the word
  "Tags" appears nowhere in the accessible tree. (The four ADVANCED rows do this right —
  `button "System prompt"` + `text: Empty`.)
- **The import dialog says one thing three times**: `"Drop a SillyTavern character card (PNG or
  JSON)."` / `"Drop a card, or click to browse"` / `"SillyTavern character cards (PNG or JSON)"` — in a
  250px dialog with one control. `repeated-container-text` class.
- **The CONTEXT `Field` tab contains no fields.** Its default body is Origin / Links / Options /
  Activity, with the actual instruction (`"Pick a field on Sabine Veyra to inspect it here."`) as the
  last line, below 20 lines of unrelated content. Worse, **`Links` and `Options` are also their own
  tabs** — the same two concepts have two homes inside one 384px pane. Rename the tab (`Overview`) or
  move the summary out of it.
- **Multi-select uses round toggles.** Circular controls read as single-choice; a multi-select wants
  square checkboxes. `reports/snaps/cbrx-selectmode.png` (roles are correct — `role=checkbox`
  `aria-checked` — this is purely the shape).
- **`wide-tracking`** P3 on `[data-slot=save-bar-meta] > p.text-mic` (letter-spacing 0.08em on the
  `1257 total · 1017 permanent` line) — design-audit, both arms.

---

## ARIA-navigability recommendations

| Element | Problem | Exact fix |
| - | - | - |
| the spoiler eye | name flips `Hide spoilers`↔`Show spoilers` **and** `aria-pressed` flips — state 2 announces the inverse of reality | pick one: static name + `aria-pressed`, or flipping name + no `aria-pressed`. `Select multiple` on the same surface is the correct model |
| `[role=img][aria-label="This card carries its own look…"]` | wrong role; visible `Own look` not in the accessible name (2.5.3); `tabindex=-1` so the gloss is mouse-only | `role="status"` (or a real button), accessible name = `Own look`, sentence via `aria-describedby`, and make it focusable so keyboard/touch reach the tooltip |
| the tag value row | `paragraph: Empty` + `button "Add tag"` — no "Tags" anywhere in the tree | label the group (`<p id=…>Tags</p>` + `aria-labelledby`), matching the ADVANCED rows' pattern |
| `dialog "Import a character card"` | no visible dismiss control; Escape-only on a surface reachable by touch | add `Cancel` (or a header `✕`) to match `New character` |
| `button "Import a character card"` (coarse) | 40px hit width, no touch-target `::after` | apply the `@orb/ui` glyph-button touch expander |
| tab `Field` | the tab name does not describe the panel's content | rename to `Overview`, or move the summary rows into the panel header shared by all tabs |
| suggestion pill labels | 10.5px interactive text | 11px+ label voice |

**Verified GOOD, do not touch:** the `Skip to characters` link (Tab → Enter → focus lands on
`button "Elias Thorn"` *inside* `[data-slot=virtual-list-scroll]` — measured); every tag chip carries
state in its name (`"Filter by fantasy: off — activate to include"`); row action buttons are
individually named (`Star …`, `Chat with …`, `Actions for …`); bulk checkboxes are named per row
(`"Select Elias Thorn" aria-checked=true`); the suggestion pills' `Accept banter` / `Dismiss banter`
names are unambiguous; the token line carries both a `title` and a proper `aria-label`
(`"1257 tokens total, 1017 permanent — sent every turn"`); the list aside's `aria-label` no longer goes
stale, because the library no longer swaps content.

---

## Taste & flow verdict (the blunt call)

**Does it look like shit?** No — the library pane is one of the better things in this app. The row
rhythm is even, the 32px avatar crops are crisp, the name/handle pair is quiet and legible, the
selected row's accent bar reads instantly, and the filter block finally earns its 26px instead of its
old 272px. Nothing shouts. The editor is nearly as good: the opening card is a clean, solid reading
surface with dialogue and narration properly differentiated, no text over art anywhere, and the
`VOICE / EXTRAS / ADVANCED` kickers are the house voice used correctly.

Two things do look wrong, and both are about **spent space**, not craft:

1. **The default CONTENT pane is a 917×750 hole with a caption in it.** `Choose a character / Pick
   someone from the list, or make someone new with New at the top of it.` is friendly copy floating in
   72% of the screen doing nothing. §14 says an unselected CONTENT is "a designed landing/teaching
   state, never an empty room" — this is an empty room with a note taped to the wall. The section owns
   ten characters, four of them with portraits worth showing, and shows none of them. Recents,
   starred, a "recently chatted with" strip, anything.
2. **The CONTEXT Options tab is 2253px of four unrelated jobs in a 384px column**, and one of those
   jobs (version history) is the one you'd most want a door to. Scrolling a page and a half of colour
   pickers to reach "did I break this character" is the wrong shape.

**Does it flow weird?** The big flow defect from 2026-08-22 is **fixed** — selecting a character no
longer destroys the library, and browsing character-to-character is now one click each. What flows
weird now is *acting* on a character: you open it, you want to do something to it, and the menu under
your cursor is missing half the verbs — which live in a menu attached to the row you already left
behind. That is a flow that punishes you for having navigated.

**Is it intuitive cold?** The list, immediately — search, sort, filter, faces, handles; a first-timer
is oriented in two seconds. The editor, mostly — until the top-right, where `1257 total · 1017
permanent` and `OWN LOOK` sit in 10.5px micro type with the explanation hidden behind hover. And the
Options tab is not intuitive at all: a person opening it to change a colour is met with
`oklch(0.85 0.1 62)` and has no idea whether that is a value they can edit, a diagnostic, or an error.

**More than one home for a concept?** Yes, three times:

- **actions** — three menus, three vocabularies, one overlap (`Delete`) \[P1 above];
- **Links** and **Options** each render as a section *inside* the Field tab **and** as their own tab,
  simultaneously visible in the same 384px pane;
- **"empty"** is now consistently spelled `Empty` (an improvement on the old `No tags` / `None` /
  `Add…` trio) — that one is *fixed*, and I note it because the fix took.

---

## What is genuinely working (do not touch)

1. **The keyboard cost collapsed.** Arrival focus → `Skip to characters` → Enter → the first row,
   inside the virtualised scroller. Two keystrokes; the prior pass measured 18 (collapsed) and 563
   (tags expanded). The whole pane is 48 tabbable elements collapsed / 59 expanded, with 8 / 19 stops
   before the first row.
2. **The filter block is no longer density-immune.** Chrome above the list: 180px (compact) / \~190px
   (comfortable) / 240px (reading), against the old flat 272px→260px. The nested tag scroller is gone —
   exactly one scroller in the pane at every state I drove (`virtual-list-scroll`).
3. **The library stays docked on selection** and the selected row is unmistakable. `#501` / `#255`
   fixed and it reads right.
4. **Focus is visible at every stop** — a 2px inset accent ring (`box-shadow: … oklch(0.72 0.175 52)
   0 0 0 2px inset`), `:focus-visible` true at all 13 walked stops. (`outline: none` is the reset, not
   an absence — the ring is a shadow layer.)
5. **Contrast holds everywhere I measured** — 9 measurements across owner / `--theme Light` /
   `maximal`: dialogue 10.95:1, narration 8.29:1, row title 17.57:1 (14.82:1 light), row subtitle
   8.66:1 (7.01:1 light), filter disclosure 8.66:1, micro text 7.75:1, search field 17.14:1. Zero
   failures, zero indeterminates.
6. **The no-matches states.** Both of them: search (`No character matches "zzqqxx". / Clear search`)
   and filter (`No character in your library matches the current filters. / Clear all`), each with the
   count line correctly reading `0 of 10`. Still the best empty-state work in the app.
7. **The census is single-homed.** `10 characters` in the FILTERS group is a **1×1 `role="status"`**
   SR-only mirror — not a visible second census. `#518` verified.
8. **The create door.** `New character` states its requirement before you type (`A name and a
   description are both required.`) and ends in `Cancel | Create`. Prevention over recovery, done right.
9. **Zero console errors and zero page errors across \~25 driven runs**, every arm.

---

## The single biggest opportunity

**Give the open character one action home, and give the CONTENT pane a reason to exist.** The first is
a one-registry consolidation that kills the P1 and two of the IA complaints at once. The second is the
larger design question: this section's default state spends three quarters of the screen on a
sentence, on a surface that owns the app's most visual objects. A designed landing here — recents,
starred, portraits — would make Characters feel like a library rather than a filing cabinet with a
note on it.

---

## Retractions (five, all mine)

1. **"The Light theme does not reach the Characters surface."** WRONG, and it is the third recorded
   instance of this exact error by a side-eye reviewer. I read `cbrx-arm-light.png` and then
   `cbrx-light-idle.png` as "still dark except two warm patches" and had begun building a regression
   finding. Killed by two receipts: `getComputedStyle` → `html/body/.shell-grid` =
   `oklch(0.98 0.004 75)`, rail `oklch(0.955 0.006 72)`; and a **decoded framebuffer read of the same
   PNG I had just misread** → rail `RGB(243,239,236)`, list pane `(246,242,239)`, topbar `(250,248,245)`
   — byte-identical to the numbers already recorded in
   `.claude/agent-memory/side-eye/light-theme-polarity-receipts.md`. The dark region at (700,700) is
   Sabine's **own-look carried card** (D44 takeover), which is correct behaviour, and explains why her
   dialogue/narration contrast is identical (10.95:1 / 8.29:1) in both theme arms.
   *The memory that would have prevented this exists and I had read it. It did not stop me because I
   formed the impression from the image first.* See the proposed memory amendment below.
2. **"`Dismiss panel` is a dead control."** WRONG. It is the mobile/overlay scrim: 1280×752, `opacity:
   0`, inside an `aria-hidden=true` subtree. My `--click` on it correctly failed actionability
   (`steps-failed=1`). Not a product defect.
3. **"Multi-select has no destination — you can tick rows and nothing happens."** WRONG. The bulk bar
   (`1 selected | Tag | Archive | Delete | ✕`) is pinned at the foot of the list pane. My `innerText`
   probe was `.slice(0,300)` and truncated before reaching it, and my `--aria` selector guess
   (`aside … footer, [role=toolbar]`) did not match its element. Found in the screenshot. The bulk bar
   is fine; only the two-line `1 / selected` wrap and the missing bulk Export survive as findings.
4. **"The reading measure is unbounded by pane state."** WRONG. It caps at 696px in every arm I drove
   (1280 / 1920 / list-collapsed all identical). My first measurement of 79ch came from a selector that
   matched the card wrapper, not the paragraph. The surviving finding is a 1ch calibration nit at 76ch.
5. **"The suggestion pills' labels are 13px and fine."** Precision correction rather than a full
   retraction: the *button* computes 13px; the *label span inside it* computes 10.5px, which is what
   `design-audit` flags. My first probe read the wrong node and would have wrongly dismissed a true
   detector finding.

**Not re-filed, by ruling:** the Lighthouse `label-content-name-mismatch` residual (10 nodes desktop,
10 mobile) is the owner-ruled ACCEPT+DOCUMENT exception of #512 — the row contract (name = title +
qualifier, subtitle via `aria-describedby`) is recorded in `list-row.tsx`'s header. Both Lighthouse
arms score Accessibility **100/100 while failing it**, because the audit carries `weight: 0, group:
"hidden"` — the score remains structurally incapable of registering this surface's one axe failure,
and I do not cite it as a clean bill.

---

## Instrument coverage

| # | Instrument | Status |
| - | - | - |
| 1 | `snap --map` | **RAN** — panel header (2 elements, 0 DOM fallbacks). Note: my `header` selector matched the *panel* header, not the topbar; topbar controls were enumerated by `--eval` instead |
| 1 | `snap --aria` | **RAN** — `main` (74 lines), context pane (33 + 70 lines), both action menus, the import dialog, the panel header |
| 1 | `snap --contrast` | **RAN** — 9 measurements × 3 arms (owner / `--theme Light` / `maximal`), `contrast-fails=0` in every run |
| 1 | `snap --expect-text` | **RAN** — `main h2=Sabine Veyra`, `assertion-fails=0` |
| 1 | `snap --matrix` | **SKIPPED** — its 8 variants are covered by hand arms taken here (desktop / mobile / 768 / 1920 / Light / none / maximal / compact / reading); a 9th concurrent browser risks the \~6/origin SSE budget |
| 1 | `snap --json` manifests | **SKIPPED** — the terminal console never capped (max \~19 messages in any run), so the lossless log added nothing |
| 1 | `snap --watch` | **SKIPPED** — no streaming or transient surface on this section |
| 2 | `design-audit / --goto characters` | **RAN** — 1 finding (P3 `flat-type-hierarchy`, page-wide), census 311, `pointer=fine` |
| 2 | `design-audit … --mobile` | **RAN** — 2 findings (P2 tap-target 40×44 → filed; P3 flat-type), census 335, `pointer=coarse`, 4 obscured candidates correctly WITHHELD |
| 2 | `design-audit --open-character` (editor, desktop) | **RAN** — 8 findings, census 666: 6 × P2 `undersized-ui-text` (located and filed), P3 `wide-tracking`, P3 flat-type |
| 2 | `design-audit --open-character --mobile` | **RAN** — identical 8, census 369, `pointer=coarse` |
| 3 | `motion-audit / --goto characters` | **RAN → correct refusal.** `verdict=INSTRUMENT-ERROR`: 230 trace events, **0 PipelineReporter frames** in the 2500ms window — the surface is static after nav, so dropped-frame % is undefined, not 0%. Not a verdict; motion measured via `__orb.motion()` + the console `[drop]` flagger instead |
| 4 | `perf-meter --goto characters --click` | **RAN** — `reports/perf-meter/perf-meter.json`; nav 78ms worst long task (breach, filed), click 40ms/4ms clean |
| 5 | Lighthouse desktop (MCP) | **RAN** — `reports/lighthouse-cbrx-chars-desktop/`; a11y/BP/SEO/agentic 100, one failing audit = the ruled `label-content-name-mismatch` (6+ row nodes) |
| 5 | Lighthouse mobile (MCP) | **RAN WITH A CAVEAT** — `reports/lighthouse-cbrx-chars-mobile/`; same single failure (10 nodes). **The MCP reported emulation `1280×800, isMobile:false` while the report's `configSettings` claim `formFactor: mobile, 412×823`** — snapshot mode analyses the standing DOM, so I do **not** treat this as a real mobile render. `design-audit --mobile` (true 430×932 coarse) is the authoritative tap-target receipt |
| 6 | `__orb.motion()` | **RAN** — `cls 0.0227 · virtualized 0 · non-virtualized 0.0227` (budget 0.1), `worstBlocking 93ms` at boot; the one real shift is `[data-slot=character-greeting] moved 0px,42px` as the suggestion row mounts |
| 6 | `__orb.animations()` | **RAN** — `[]` (0 active, 0 non-compositor-clean) |
| 6 | `__orb.renders()` | **RAN** — `region:content 14 (1 mount/13 updates, max 81ms)`, `region:list 16`, `region:context 4`; no runaway churn |
| 6 | `__orb.shell()` | **RAN** — panel modes confirmed at every pane arm |
| 7 | Console triage | **RAN** — table below |
| 8 | PNGs actually looked at | **RAN** — 9 images read; and one of them re-read by framebuffer decode after my eye got it wrong (Retraction 1) |
| 9 | Keyboard walk | **RAN** — 13 `--key Tab` stops with `:focus-visible` + computed ring at each; plus a skip-link activation walk (Tab → Enter → first row, verified inside the scroller) and collapsed/expanded focusable censuses |
| 10 | Appearance arm — owner/`defaults` | **RAN** — probed live off root + `.shell-grid`, not assumed |
| 10 | Appearance arm — `maximal` | **RAN** — `elevation=glow`, `texture=grain`; contrast unchanged, no geometry change, no colour claim made |
| 10 | Appearance arm — `compact` | **RAN** — row 44→40px, chrome 190→180px, list viewport 472→614px. This is the arm that proves the density-immunity P1 is fixed |
| 10 | Appearance arm — `reading` | **RAN** — `--font-scale 1.25`, row 55px, chrome 240px, prose 68ch (inside band) |
| 10 | Appearance arm — `diagnostics` | **SKIPPED** — no metadata chrome under judgment this pass |
| 10 | `--full-motion` | **SKIPPED** — the owner arm already carries `data-reduced-motion=false` today |
| 10 | Theme arm — `--theme Light` | **RAN** — `data-theme=light`, computed + **decoded-pixel** receipts, contrast re-measured. Produced Retraction 1 |
| 10 | Theme arm — `--theme none` | **RAN** — byte-identical to the owner arm (owner runs no `data-theme`), as expected |
| 11 | Pane state — list docked + context collapsed | **RAN** (default) — prose 76ch |
| 11 | Pane state — list docked + context docked | **RAN** — prose 54ch; produced the Field/Links/Options duplication finding |
| 11 | Pane state — list collapsed + context docked | **RAN** — prose 76ch |
| 11 | Pane state — mobile 430 coarse | **RAN** — 7 rows visible (was 5 at the old chrome height) |
| 11 | Width arms 768 / 1920 | **RAN** — 768 switches to the mobile shell (bottom tab bar, back chevron, list hidden); 1920 keeps 76ch prose and an 880px list viewport |
| — | Card-atlas / hub-ingest arm | **NOT REACHED** — all 10 characters report `Source: Made here`; no hub-ingested character exists on this db and producing one requires a mutating import. **Uncovered; recommend a follow-up drive after a hub ingest lands a character** |
| — | Scale behaviour (virtualizer, 327-row scroll, 551-tag vocabulary) | **NOT REACHED** — the db is 33× smaller than the prior pass's. The 2026-08-22 scroll receipt (`nonVirtualizedCls 0.0071` over 26 scroll steps at 327 rows) remains the scale evidence; I did not re-take it |
| — | Destructive-action confirmation (bulk `Delete`, row `Delete`) | **NOT TESTED** — review-only. Flagged as a question, not a finding |

### Console triage

| Message | Disposition |
| - | - |
| `[frame] long frame 135–334ms · blocking 85–284ms @ main.tsx · route /` | **known-ruled** — boot, #433 family |
| `[drop] 54–102ms mid-animation · svg[aria-label=Orbweaver] · [data-slot=weave-veil]` | **known-ruled** — boot splash, #433 family |
| `[drop] 54–77ms mid-animation · aside[aria-label=Characters list] · [data-slot=theme-scope] · <html>` | **FILED** (P3) — names the Characters list pane, fires at list mount, not boot splash |
| `[perf] slow commit region:content 17–20ms (mount)` | **section mount** — under the 50ms bar, not filed |
| `[perf] slow commit region:list 18–31ms (nested-update)` | **INVESTIGATE → filed** as the section-entry long-task P3; note the prior pass's "551-row vocabulary" attribution is refuted (28 rows today, cost unchanged) |
| `[cls] shift 0.0221–0.0293 · CLS … (virtualized 0.0000)` | **within budget** (0.1) — boot settle |
| console errors / page errors | **0 across every run, every arm** (\~25 runs) |

---

## Issue summaries for the board (orchestrator pastes these)

**NEW — P1 · characters: one artifact, three disjoint action menus; Export unreachable from the open
character.** The row `⋯` (Archive/Duplicate/**Export card**/Delete), the context `Character actions`
(Open in Refinery/Duplicate/Convert to persona/Set as welcome greeter/Delete) and the bulk bar
(**Tag**/Archive/Delete) share only `Delete`. A user with the character open sees no export path and
concludes the app cannot export a card — the reviewer did exactly that. Make the context menu the
superset from one registry; row and bulk become subsets of the same vocabulary. Receipts: three
`--aria '[role=menu]'` captures + `reports/snaps/cbrx-selected.png`. Nielsen #4, §13 IA.

**NEW — P2 · characters: the tag filter offers 28 facets that match nothing.** Group-by-tag returns
`UNCATEGORIZED 10` (every character untagged) while FILTERS offers 28 chips; activating `fantasy`
yields `0 of 10 / No matches`. At least `fantasy` and `rpg-ready` appear as *unaccepted suggestions* on
Sabine, so the vocabulary is not applied-tags-only. Derive it from tags actually carried in scope, or
group suggestion-only tags separately with their zero count shown. Mechanism (which query feeds the
vocabulary) is an open question for the fix lane. §0 no-dead-toggles, Nielsen #1/#2.

**NEW — P2 · characters: three self-describing controls describe themselves wrongly.** (a) The spoiler
eye flips both its name (`Hide`↔`Show spoilers`) and `aria-pressed` (false↔true), so one of its two
states announces the inverse of reality — `Select multiple` on the same surface does it correctly.
(b) The `Own look` chip is `role="img"` with a sentence for an accessible name, visible text `Own look`
not contained in it (WCAG 2.5.3, not covered by the #512 row ruling), and `tabindex=-1`, so its gloss
is mouse-only. (c) The tag value row exposes `paragraph: Empty` + `button "Add tag"` with no "Tags"
label anywhere in the tree. All three receipted by live `--eval`/`--aria`.

**NEW — P2 · characters: the Options tab is a four-concern junk drawer that buries version history.**
2253px of content in a 693px pane (31% visible): theme editor → background → a three-paragraph Trust
essay → `History`. The snapshot log is the thing a user most needs a door to and it is last. Also in
that tab: six raw `oklch(...)` strings printed as user-facing values (`clarify` — swatch + `Custom`/hex;
keep `Inherit`, which reads perfectly). Split History (and probably Trust) into their own tabs.

**NEW — P2 · characters: the Import dialog has no visible exit.** Zero buttons besides the file input
on both desktop and 430px coarse; Escape works but touch has no Escape, and backdrop dismissal was not
verifiable with synthetic pointers (not claimed broken). The sibling `New character` dialog ends in
`Cancel | Create` — match it. Same door: the `Import a character card` button is 40×44 on coarse with
no touch-target `::after` (four-cardinal `elementFromPoint` loses the point at ±21px horizontally) —
apply the `@orb/ui` glyph-button expander.

**NEW — P3 cluster · characters polish.** (1) Suggestion pill *label spans* are 10.5px interactive text
(6 × design-audit `undersized-ui-text`, node-located; the buttons themselves are 13px). (2) Seeded
characters report `Source: Made here` plus `Added 3h ago` beside `Last chat Aug 2, 2026` — impossible
provenance on first run. (3) The Characters list pane drops a 54–77ms frame on every section entry
(`data-list-flip=in`). (4) Section entry: 2 long tasks, worst 78ms — **and the prior pass's
"551-row tag vocabulary" attribution is refuted**, the vocabulary is 28 rows today and the cost is
unchanged. (5) Prose measure 76ch vs the 65–75 band at every desktop width. (6) `1 selected` wraps to
two lines in the bulk bar; the context `Field` tab contains no fields and duplicates the `Links` and
`Options` tabs; the import dialog states one fact three times; multi-select uses round toggles.

**ALREADY FILED / VERIFIED FIXED (no new row needed).** #501/#255 (library stays docked on selection),
\#518 (census single-homed — the second line is a 1×1 `role=status` mirror), #513 (context pane carries
distinct Origin/Links/Options/Activity), #502 (token gloss: `title` + `aria-label` both present), the
filter-block proportion and nested-scroller P1s (chrome 272→180–192px, exactly one scroller, density
now moves it), and the 563-keyboard-stop P1 (skip link: Tab → Enter → first row inside the scroller).
\#512 stays accepted — both Lighthouse arms still fail `label-content-name-mismatch` at `weight: 0`, as
the ruling anticipated.

**COVERAGE GAP for the board.** The card-atlas hub-ingest delta this pass was briefed to cover was not
reachable read-only: every character on the seed db reports `Source: Made here`. A follow-up side-eye
should drive a hub-ingested character's card, avatar and tags on this surface once one exists.

---

## Proposed memory amendment (orchestrator owns the write)

Index line:

`- [light-theme polarity](light-theme-polarity-receipts.md) — decode the pixel BEFORE you look; the memory alone has not stopped three reviewers`

Body to append to `.claude/agent-memory/side-eye/light-theme-polarity-receipts.md`:

> **Third instance, 2026-08-30 (cb-rail-characters).** A reviewer who had *read this file in the same
> session* still misread two Light-arm PNGs as "still dark" and began drafting a regression finding.
> Reading the lesson is not sufficient, because the wrong impression forms from the image before the
> rule is recalled. **Strengthened rule: on any `--theme` arm, the FIRST action after the capture is the
> framebuffer decode or the `getComputedStyle` read — before the PNG is looked at at all.** A theme arm
> whose report contains no decoded pixel is an incomplete arm, not a passed one. Second trap confirmed
> in the same run: a theme arm without `--idle` captures the pre-hydration dark paint, so an un-idled
> theme screenshot is void regardless.
