---
kind: review
status: archived
updated: 2026-08-30
---

# side-eye — RAIL sweep 4/10: Characters

**Lane:** rail-characters · **Surface:** the Characters section on live `:5173` (library list, member/editor,
context pane) · **Data:** the owner's real imported library, `totalCount = 327` (server truth via
`character.list`), 551 tags in the filter vocabulary.

## Verdict: SHIP WITH FIXES

The section is *well built and badly proportioned*. Nothing is broken-broken: no console errors, no page
errors, no distorted images, no contrast failures in either theme, a smooth virtualized scroll at 327
rows, and a genuinely excellent empty state. What it fails at is **being a library browser for 327
things**. The filter block was designed for a small library and never re-sized for a big one — it eats a
third of the desktop pane and 42% of the phone, and its keyboard cost scales with the tag vocabulary
(563 tab stops to reach the first character). Separately, every row violates WCAG 2.5.3 Label in Name,
which is also why three characters named "Emily" are indistinguishable to voice control.

## Probed appearance state (never assumed)

Owner arm, read live off the DOM:

| Handle | Value |
| - | - |
| root | `data-blur-panels` `data-blur-composer` `data-blur-modals` **`data-reduced-motion=true`** |
| root | **no `data-theme`** · **no `data-texture`** · no `data-shadow` · no `data-theme-colorization` |
| root style | `--font-scale:1` `--blur-strength:14px` `--reading-line-height:1.55` |
| `.shell-grid` | `data-density=comfortable` **`data-elevation=flat`** `data-list-mode=docked` `data-context-mode=collapsed` |

The owner runs with **reduced motion ON and elevation flat** — every ornament off. Arms taken: this one,
`--appearance-preset maximal` (`data-elevation=glow`, `data-texture=grain`, `data-reduced-motion=false`,
blur 22px), `--appearance-preset compact`, and `--theme Light`.

## Design health — Nielsen (honest)

| # | Heuristic | Score | Key issue |
| - | - | - | - |
| 1 | Visibility of system status | 3/4 | `30 of 327 characters` is a page-load artifact worded as a result count |
| 2 | Match system ↔ real world | 2/4 | `1017 permanent` unglossed in the content header; `Add…` used as a *value* |
| 3 | User control & freedom | 3/4 | Clear search / Clear all / back chevron all present and good |
| 4 | Consistency & standards | 2/4 | one datum in two homes with two glosses; three vocabularies for "empty" |
| 5 | Error prevention | 3/4 | autosave `Saved` indicator; read-only-by-default surfaces |
| 6 | Recognition over recall | 3/4 | 551 tags behind a 192px window is recall, not recognition |
| 7 | Flexibility & efficiency | 2/4 | no A–Z jump at 327; 18–563 tab stops before the list; group mode is page-local |
| 8 | Aesthetic & minimalist | 2/4 | filter block takes 34% (desktop) / 42% (mobile) of the pane |
| 9 | Error recovery | 3/4 | the no-matches state is genuinely well designed |
| 10 | Help & documentation | 2/4 | one good tooltip (`Own look`); the token jargon has none |
| | **Total** | **25/40** | mid band — calibration only, the finding list below is the deliverable |

---

## Findings

### \[P1] The tag filter block puts 563 keyboard stops between a keyboard user and the library

**Measured** (`snap --eval`, `aside.shell-panel` focusable census, live `:5173`):

| State | Tabbable in the pane | Stops before the first character row |
| - | - | - |
| collapsed (default) | 66 | **18** |
| tags expanded (`+543 more`) | 595 | **563** |

All **551** tag chips are in the tab order, and **529 of them are scrolled outside** the 192px tag
viewport at any moment. There is no skip mechanism inside the pane — the page's `Skip to content` link
jumps to CONTENT, past the LIST entirely, so a keyboard user who wants the *list* has no shortcut.

**Why it hurts:** Sam expands the tag list (the obvious move with 551 tags), then cannot get back down
to the library without 551 Tab presses. This is the difference between "usable with effort" and
"abandoned".

**Fix — `adapt` + `harden`:** take the collapsed chip cloud out of the sequential tab order behind a
roving-tabindex group (one stop for the whole cloud, arrows to move within it), and give the expanded
state its own tab stop that lands on the list. Ship a "skip filters" affordance in the pane.

**Receipt:** `snap / --goto characters --eval <focusable census>` →
`{collapsed_totalTabbable: 66, collapsed_stopsBeforeFirstRow: 18}`,
`{expanded_totalTabbable: 595, expanded_stopsBeforeFirstRow: 563, tagButtons: 551, tagButtonsScrolledOutOfView: 529}`.

---

### \[P1] Every character row fails WCAG 2.5.3 Label in Name — and that is why three "Emily"s are one "Emily"

The row button is `<button aria-label="Calamity, Doomblade of the Ninth Epoch"
aria-describedby="_r_5v_-subtitle" data-slot="list-row-body">` — the `aria-label` **overrides** the row's
visible text, which is name **plus handle**. The handle is exposed only as a *description*.

axe-core, via Lighthouse, flags this independently on **both** arms:
`label-content-name-mismatch` — *"Text inside the element is not included in the accessible name"* —
**9 nodes desktop, 9 nodes mobile** (one per rendered row).

The library contains genuine same-name collisions. Searching `emily` returns four rows whose ARIA is:

```
- button "Emily": emily-3
- button "Emily": emily-2
- button "Emily": emily
- button "Emily Singleton": emily-singleton
```

Three buttons, one accessible name. `Hikari` ×2 and `Eva` ×2 appear in the first 50 rows alone, so this
is a class, not a one-off.

**Why it hurts:** (a) voice control is broken — "click emily-3" matches nothing, because the name is
"Emily"; (b) a screen-reader user in list-navigation or a low-verbosity mode gets "Emily, button" three
times. The `#443/#458/#463` accname-disambiguation precedents apply to this surface and have not been.

**Fix — `clarify`:** fold the disambiguator into the *name*, not the description —
`aria-label={handle === slugOf(name) ? name : `${name} (${handle})`}`, or drop the `aria-label` entirely
and let name+handle compute the accessible name from content (which also satisfies 2.5.3 by
construction).

**Receipt:** `reports/lighthouse-rail-characters/report.json`,
`audits["label-content-name-mismatch"].details.items` (9 nodes, node path rooted at `ASIDE`, not the
vite-checker overlay); `snap --aria '[aria-label="Character library"]'` after `--fill … =emily`.

**Instrument-honesty note attached to this finding:** Lighthouse scored **Accessibility 100/100** on
both arms *while failing this audit*, because `label-content-name-mismatch` carries **`weight: 0`,
`group: "hidden"`** in the accessibility category (`categories.accessibility.auditRefs`). The 100 is a
false clean bill. Do not cite the score on this surface.

---

### \[P1] The filter block is sized for a small library; it costs a third of the pane at 327 characters

Measured scroll geometry of `[data-slot=virtual-list-scroll]`:

| Arm | Chrome above the list | List viewport | Rows visible | % of viewport that is list |
| - | - | - | - | - |
| desktop, comfortable (owner) | 272px | 520px | \~11 | 65% |
| desktop, `--appearance-preset compact` | 260px | 534px | 13 | 67% |
| desktop, tags expanded | **440px** | 352px | 8 | 44% |
| **mobile (430×932)** | **\~390px** | **284px** | **5** | **30%** |

Two things this table says:

1. **Density does not help.** `compact` shrinks the row from 44px → 40px but the chrome only from 272 →
   260 (−4%). The filter block is essentially density-immune, so the one lever a user has for "show me
   more at once" barely moves the thing that is actually consuming the space.
2. **Mobile is the real casualty.** Five character rows out of 327, under 390px of permanently-mounted
   filter furniture, with a bottom tab bar below. That is a card-catalogue drawer you view through a
   mail slot.

**Fix — `distill` + `adapt`:** the FILTERS block should be collapsed by default at this library size and
summarised as a single "Filters" control with an active count (the `1 active` readout already exists and
is good). Make the block density-responsive so `compact` actually compacts it. On mobile it should be a
sheet, not a permanently-mounted band.

**Receipt:** `reports/snaps/rc-chars-desktop.png`, `rc-chars-compact.png`, `rc-chars-mobile.png`,
`rc-orphan-tag.png`; `snap --eval` scroll-geometry reads quoted above.

---

### \[P1] Two stacked scroll containers, 220px apart, in the same 290px column

With tags expanded the LIST pane contains two independent vertical scrollers:

| Slot | top | clientHeight | scrollHeight | visible share |
| - | - | - | - | - |
| `[data-slot=scroll-area-viewport]` (tags) | 220 | **192** | **6172** | **3.1%** |
| `[data-slot=virtual-list-scroll]` (characters) | 440 | 352 | 2200 | 16% |

The tag scroller shows **3.1%** of its content — 32 screens of chips in a 192px window — and has no
visible boundary, so nothing tells you that wheeling there will not move the character list. Scroll-wheel
targeting in that column is a coin flip.

**Why it hurts:** Riley wheels down expecting the library to move and the tag cloud moves instead. Casey
on a phone drags and gets whichever scroller the touch landed in.

**Fix — `layout`:** one scroller per pane. Move tag selection into the existing `Filter tags` search
(which already works and already narrows 551 → 1 for `orphan`) and cap the visible cloud at the
"suggested" 8 with no nested scroll region, or promote the picker to a modal (§14 physics 2 permits a
picker as a modal).

**Receipt:** `snap --eval <overflow census>` after `--click '[aria-label="Show 543 more tags"]'`;
`reports/snaps/rc-orphan-tag.png`.

---

### \[P2] `30 of 327 characters` is a paging artifact worded as a result count

The unfiltered list reads **`30 of 327 characters`**. That is the page size (`character.list {limit:30}`),
not a filter result. Confirmed by contrast: filtering to `emily` renders **`4 characters`** and the orphan
tag renders **`7 characters`** — the `N of M` form appears only when nothing is filtered. Meanwhile the
pane header simultaneously reads `CHARACTERS 327`.

So a cold user sees two counts, 230px apart, saying `327` and `30 of 327`, and the natural reading of the
second is "only 30 of your characters match" — which is false. Scrolling silently grows it (`scrollHeight`
2200 → 6880 after a scroll pass) with no explanation.

**Fix — `clarify`:** at rest show `327 characters`. Show `N of M` only when a filter or search is
narrowing. If a "loaded so far" signal is wanted, it belongs at the *bottom* of the list, next to the
loading sentinel, not at the top next to the total.

**Receipt:** `snap --eval` leaf-text read →
`{t: "30 of 327 characters", ff: "Geist Mono", fs: "13px"}`; `aside.innerText` in the emily and orphan
arms; `character.list` server `totalCount: 327`.

---

### \[P2] Group-by-tag groups the loaded page, not the library

Enabling **Group** on the unfiltered list produces:

```
30 of 327 characters
ADVENTURE 1 · CAN BE WHOLESOME, CAN BE SEXY 2 · FANTASY 1 · UNCATEGORIZED 27
```

Those four counts sum to the 30 rows currently paged in — they are not library facts. `ADVENTURE 1` reads
as "you own one adventure character"; the library has 551 tags and 327 characters. The groups will also
re-form and re-count under the user as scrolling pages more rows in.

**Why it hurts:** grouping is a *navigation* affordance. A grouping whose buckets change as you scroll is
worse than no grouping, because it looks authoritative.

**Fix — `harden`:** either compute group counts server-side over the whole library (the tag vocabulary
query already returns per-tag data), or label the mode honestly as grouping the loaded page. At 551 tags,
also state what happens past a sane group ceiling.

**Receipt:** `snap --click '[aria-label="Group by tag"]' --eval 'aside.innerText'`;
`reports/snaps/rc-group.png`.

---

### \[P2] Opening a character replaces the library list with a chats list — and the landmark keeps lying

Selecting a character from the library swaps the LIST pane's contents to that character's **chats**
(`header` reads `CHATS · SABINE VEYRA`). Two problems:

1. **The library is gone.** Browsing 327 characters one after another is not possible — every next
   character costs a back-chevron trip. This is the core scan-the-library task and the IA drops it.
2. **The landmark's accessible name does not follow.** The `<aside>` still carries
   `aria-label="Characters list"` while showing chats. A screen-reader user navigating by landmark lands
   on "Characters list, complementary" and finds a chat roster. §14 physics 1 (LIST drives CONTENT) is
   satisfied; the *naming* is not.

\*\*Fix — `clarify` (the cheap half): \*\* update the aside's `aria-label` in lockstep with the swapped
content (`Chats with Sabine Veyra`), since the visible header already does exactly this. **`layout` (the
real half):** for a 327-item library, consider keeping the library docked and putting the character's
chats in CONTEXT, where artifact-scoped detail belongs (§14).

**Receipt:** `snap --eval` → `{label: "Characters list", header: "CHATS · SABINE VEYRA / New chat"}`;
`reports/snaps/rc-char-member.png`.

---

### \[P2] The context pane is a read-only echo of the content pane — four duplicated facts on one screen

With the detail panel open at 1280px, these appear **twice simultaneously**:

| Fact | CONTENT (sticky header / body) | CONTEXT ("Characters details", 384px) |
| - | - | - |
| tokens | `1257 total · 1017 permanent` | `Tokens 1257 total` / `1017 permanent — sent every turn` |
| handle | `@sabine` (under Name) | `Handle @sabine` |
| chats | `1 chat ›` | `Chats 1` / `last 5h ago` |
| tags | `No tags  + Add tag` | `Tags None` |

§13 IA single-homing: one concept, two homes, both visible at once. The context pane currently spends
384px re-stating what is 300px to its left. Note the asymmetry that makes this a *fix*, not just a
complaint: the **CONTEXT copy is the only one that glosses the jargon** (`1017 permanent — sent every
turn`), while the CONTENT header ships the bare `1017 permanent` with no `title`, no `aria-label`, no
tooltip (verified: all three null).

**Fix — `distill`:** pick one home per datum. The content header should carry the *live editing* state
(`Saved`, token budget with the gloss attached); the context pane should carry what content does not —
Origin, Links, Options, activity. Drop the echoes.

**Receipt:** `snap --aria 'aside[data-panel-side=context]'` (29 lines, quoted above);
`reports/snaps/rc-context2.png`; `snap --eval` → `{t: "1257 total · 1017 permanent", title: null, aria: null, parentAria: null}`.

---

### \[P3] Three vocabularies for "empty" in one editor

`No tags` (tag row) · `None` (context pane, Tags) · `Add…` (four ADVANCED rows: System prompt,
Post-history instructions, Note at depth, Regex scripts). Nielsen #4. `Add…` is a *value* slot rendering
an *action* word, which reads as a truncated label until you measure it.

**Receipt:** `snap --eval` → `Add…` is a `<p data-slot=text>`, `scrollWidth === clientWidth === 31`, **not
clipped** — the ellipsis is literal.

---

### \[P3] Section entry breaches the long-task budget

`perf-meter / --goto characters` step 0: **2 long tasks, worst 69ms**, blocking 15ms, worst rAF gap 50ms.
The 551-row `tag.listTagFilterVocabulary` query lands here (`[perf] slow commit region:list 31ms
(nested-update)` in console). Over the 50ms LoAF budget.

Contrast with the primary action, which is excellent: `--click '[aria-label="Sabine Veyra"]'` →
**24ms duration, 2ms input delay, 0 long tasks, 0 shift.**

**Receipt:** `reports/perf-meter/perf-meter.json`.

---

### \[QUESTION for the orchestrator, not a finding] The row subtitle is not always the handle

Regular rows render the handle as the subtitle (`calamity`, `emily-3`). The seven orphan-import rows
render **`orphan import`** instead (`Diana / orphan import`, `Aestel / orphan import`, …) — even though
those characters do have handles (`diana`, `aestel`, confirmed via `character.list`). I could not
determine the mechanism (my `character.list` search probe returned empty and I did not spend further
calls on it).

This matters because the handle-in-the-subtitle is the *only* visual disambiguator for same-name
characters. If the subtitle can be pre-empted by a tag or an elevator pitch, then two same-named
characters that both have pitches lose their disambiguator entirely — and the accname fix above becomes
the only defence. **Someone should confirm the subtitle's precedence rule before the P1 accname fix is
scoped.**

---

## ARIA-navigability recommendations

| Element | Problem | Exact fix |
| - | - | - |
| `button[data-slot=list-row-body]` (every row) | `aria-label={name}` suppresses the visible handle → WCAG 2.5.3 Label in Name fails; same-name rows collide | put the handle in the NAME: `aria-label={`${name} (${handle})`}` when the handle is not derivable from the name — or remove `aria-label` and let content compute it |
| `aside[data-panel-side=list]` after a character opens | `aria-label="Characters list"` while rendering chats | mirror the visible header: `aria-label={`Chats with ${character.name}`}` |
| The 551 `[aria-label^="Filter by"]` chips | all sequentially tabbable; 529 off-screen at any time | roving tabindex — one stop for the group, arrow keys within |
| The LIST pane | no way to skip the filter block to the rows | add a pane-scoped skip link, or make the count line (`30 of 327 characters`) a focusable landmark boundary |
| `1257 total · 1017 permanent` (content header) | no accessible gloss (`title`/`aria-label`/`aria-describedby` all null) | reuse the context pane's copy: `aria-label="1257 tokens total, 1017 permanent — sent every turn"` |

**Verified GOOD and not to be touched:** the tag filter chips carry state in their names
(`"Filter by NSFW: off — activate to include"`), the row action buttons are individually named
(`"Star Emily"`, `"Chat with Emily"`, `"Actions for Emily"`), the suggested-tag pills are properly
named `"Accept banter"` / `"Dismiss banter"`, the `Own look` chip has a real tooltip, and the keyboard
walk showed `:focus-visible = true` with a 1px outline at **every** one of 12 stops.

---

## Taste & flow verdict (the blunt call)

**Does it look like shit?** No. It looks *good and mis-proportioned*. The craft is real — the type is
quiet, the row rhythm is even, the avatars are crisp 512→32 crops, the kicker sections in the editor
(`VOICE` / `EXTRAS` / `ADVANCED`) are the house voice used correctly, and nothing shouts. The problem is
purely one of budget: in a 290px column holding 327 things, a third of the height is spent on filter
furniture that is mostly irrelevant to the thing you came to do. On a phone that becomes 42% and five
visible rows, which crosses from "dense" to "wrong". Filtering to four Emilys and *still* seeing the full
eight-chip tag cloud plus `+543 more` above them is the moment the proportions read as an oversight
rather than a choice.

**Does it flow weird?** In one specific place, badly: selecting a character deletes the library from the
screen. You came to browse 327 characters; you clicked one; the list is now that character's chats. Every
"let me look at the next one" costs a back trip. For a section whose entire job is a big library, losing
the library on selection is the wrong trade.

**Is it intuitive cold?** The list is, immediately — search, sort, filter, rows with faces and handles;
a first-timer knows what to do in two seconds. The **editor is not**. `1257 total · 1017 permanent` and
`OWN LOOK` sit in the top-right of the first thing you see with no explanation on that surface (the
gloss lives 300px away in a pane that is closed by default). A `SUGGESTED` row of pills each carrying a
✓ *and* an ✕ reads as two states until you hover — the semantics turn out to be correct
(`Accept banter` / `Dismiss banter`), so this is a visual legibility nit, not a defect.

**More than one home for a concept?** Yes, four times over, all visible in a single 1280px frame:
tokens, handle, chat count and tags each render in both CONTENT and CONTEXT. The context pane has not
yet found a job that content is not already doing.

---

## What is genuinely working (do not touch)

1. **The virtualized list at 327 rows is smooth.** A 26-step scroll pass measured **non-virtualized CLS
   0.0071** against a 0.1 budget, with **zero blocking** on all 19 in-scroll LoAFs (the one 119ms
   blocking frame is at `startTime 1286` from `main.tsx` — boot, not scroll). Infinite paging grew
   `scrollHeight` 2200 → 6880 without a jump. `__orb.motion()` receipt.
2. **The no-matches empty state.** Glyph, `No matches`, the specific echo `No character matches
   "zzqqxx".`, and a `Clear search` recovery button. This is §5 and Nielsen #9 done properly — better
   than most of the app.
3. **The orphan-import placeholders read as honest, not broken.** All seven (Diana, Aestel, Ana, Sala,
   Misery, Mako, Bonnie Cow) render tinted initials tiles (`D`, `A`, `S`, `M`, `BC`) with `orphan import`
   as the subtitle. No broken-image icons, no empty squares, no apologetic copy. Exactly right.
4. **Images are never distorted.** Every avatar measured 512×512 natural → `object-fit: cover`,
   rendered 32×32 (list) and 64×64 (editor), aspect 1.000 → 1.000. No squish anywhere on this surface.
5. **Long imported fields are handled well.** Novella-length Description / Personality / Scenario /
   Example messages / Creator notes each collapse to one row with a single-line preview under a section
   kicker; the opening prose renders on a clean card at a **73ch measure** (16px / 24px line-height),
   inside the 65–75ch band, on a solid background — no text-over-art anywhere.
6. **Contrast holds in both themes.** Owner arm: chips 8.66:1, search field 6.55:1, narration `<em>`
   8.29:1. `--theme Light` arm (`data-theme=light`, bg `oklch(0.98 0.004 75)`): chips 7.01:1, search
   4.99:1. All PASS. Zero contrast failures across every arm.
7. **The primary action is fast** — 24ms click duration, 2ms input delay, no long task, no shift.
8. **Coarse-pointer tap targets pass.** `design-audit --mobile` at `pointer=coarse`, census 351:
   zero tap-target findings.

## The single biggest opportunity

**Give the 327-character library back its vertical space and its keyboard.** One change —
collapse the FILTERS block by default behind a single control with the existing `1 active` counter —
fixes the P1 proportion finding (34%/42% of the pane back), removes the nested-scroller P1 (no expanded
cloud, no second scroller), and takes the keyboard cost from 563 stops to a handful. Three of the four
P1s collapse into one layout decision.

---

## Retractions

1. **"The `Add…` labels are clipped."** Wrong. I read the right-aligned `Add…` in
   `rc-member-bottom.png` as text-overflow. Measured: `scrollWidth === clientWidth === 31` — the ellipsis
   is a literal character in the string. Downgraded to a P3 copy-consistency nit.
2. **"The `Add…` controls are four identically-named buttons (accname collision)."** Wrong. They are
   `<p data-slot=text>` value labels with no button ancestor in their local chain — passive text, not
   control names. Withdrawn entirely.
3. **"The SUGGESTED tag pills' ✓/✕ are ambiguous affordances."** Withdrawn at the a11y level: the
   accessible names are `Accept banter` / `Dismiss banter` — correct and unambiguous. Only the visual
   legibility nit survives.
4. **"The three Emilys are indistinguishable to a screen reader."** Over-stated. The handle *is* wired
   via `aria-describedby="_r_…-subtitle"`, so many screen-reader modes will announce it after the name.
   The finding survives at P1 on narrower, verified ground: WCAG 2.5.3 Label in Name fails (axe-core
   confirms, 9 nodes × 2 arms), voice control cannot address the rows, and low-verbosity /
   list-navigation modes drop descriptions.
5. **A 400-row duplicate-name census I ran is void.** My in-page pagination loop did not advance the
   cursor, so it fetched the same 50-row page eight times and reported every handle ×8 (`calamity` ×8,
   etc.). Deleted. The duplicate-name claim rests only on directly verified evidence: `Emily` ×3 via
   search, and `Hikari` ×2 / `Eva` ×2 within one genuine 50-row page.
6. **Lighthouse "Accessibility 100/100" is not a clean bill on this surface** and I will not cite it as
   one. `label-content-name-mismatch` fails on both arms while carrying `weight: 0`, `group: "hidden"` in
   the category — the score is structurally incapable of registering the only a11y rule this surface
   breaks.

---

## Instrument coverage

| # | Instrument | Status |
| - | - | - |
| 1 | `snap --map` | **RAN** — 54 elements, 0 DOM fallbacks (`rc-map.log`) |
| 1 | `snap --aria` | **RAN** — library, orphan-filtered library, context pane |
| 1 | `snap --contrast` | **RAN** — 7 measurements across owner + Light arms, 0 FAIL, 1 correct `OCCLUDED … NO VERDICT` refusal |
| 1 | `snap --expect-no-overflow` | **RAN** — mobile arm, `assertion-fails=0` |
| 1 | `snap --matrix` | **SKIPPED** — its 8 variants are covered by the hand-taken desktop + `--mobile` + `--theme Light` + 2 appearance arms; a 9th browser would have risked the SSE budget |
| 1 | `snap --json` manifests | **SKIPPED** — terminal console never capped (max 24 messages in any run), so the lossless log added nothing |
| 2 | `design-audit / --goto characters` | **RAN** — 2 findings, both P3, census 396 (`reports/design-audit/root.json`) |
| 2 | `design-audit … --mobile` | **RAN** — 1 finding (P3), `pointer=coarse`, census 351 |
| 3 | `motion-audit` | **RAN → correct refusal.** `verdict=INSTRUMENT-ERROR`: 338 trace events, **0 PipelineReporter frames** in the 2500ms window — the surface is static after nav and the owner arm has reduced-motion on, so nothing composited. Not a verdict; motion was measured instead via `__orb.motion()` under a real scroll (row 6) |
| 4 | `perf-meter --click` | **RAN** — `reports/perf-meter/perf-meter.json`; nav 69ms worst long task (breach), click 24ms/2ms (clean) |
| 5 | Lighthouse desktop | **RAN** — `reports/lighthouse-rail-characters/` |
| 5 | Lighthouse mobile | **RAN** — `reports/lighthouse-rail-characters-mobile/` |
| 6 | `__orb.motion()` | **RAN** — 21 LoAFs, CLS raw 0.0389 / virtualized 0.0318 / **non-virtualized 0.0071** |
| 6 | `__orb.shell()` | **RAN** — panel modes confirmed |
| 6 | `__orb.renders()` / `.perf()` / `.flags()` | **SKIPPED** — no render-churn symptom surfaced; the `[perf] slow commit` console channel already attributed the two hot commits (`region:content` mount, `region:list` nested-update) |
| 7 | Console triage | **RAN** — table below |
| 8 | PNGs actually looked at | **RAN** — 9 images read |
| 9 | Keyboard walk | **RAN** — 12 `--key Tab` stops, `fv=true` + 1px outline at every stop; plus the 18-vs-563 tab-stop census |
| 10 | Appearance arm — owner/`defaults` | **RAN** — probed live, not assumed |
| 10 | Appearance arm — `maximal` | **RAN** — `rc-chars-maximal.png`; `data-elevation=glow`, `data-texture=grain`, `data-reduced-motion=false`, blur 22px. No geometric or legibility change; no colour claim made (my eye is not a colorimeter) |
| 10 | Appearance arm — `compact` | **RAN** — row 44→40px, chrome 272→260px; the density-immunity finding came from here |
| 10 | Appearance arm — `reading` | **SKIPPED** — no reading-typography finding was in play; the one prose surface measured 73ch in the owner arm, inside band |
| 10 | Appearance arm — `diagnostics` | **SKIPPED** — no metadata chrome under judgment |
| 10 | Theme arm — `--theme Light` | **RAN** — `data-theme=light` applied, contrast re-measured, all PASS |
| 10 | `--full-motion` | **SKIPPED** — the `maximal` arm already carried `data-reduced-motion=false` |
| 11 | Pane state — list docked + context collapsed | **RAN** (default) |
| 11 | Pane state — context docked | **RAN** — `rc-context2.png`; produced the P2 duplication finding |
| 11 | Pane state — list collapsed / both hidden | **SKIPPED** — the findings here are all about the list pane having *too little* room; the wider arms cannot surface them, and budget went to the mobile arm instead, which is the narrow end that does |
| 11 | Pane state — mobile | **RAN** — `rc-chars-mobile.png` |

### Console triage

| Message | Disposition |
| - | - |
| `[frame] long frame 141–153ms · blocking 91–103ms @ main.tsx · route /` | **known-ruled** — boot, `#433`-family (brief) |
| `[drop] 56–102ms mid-animation · svg[aria-label=Orbweaver] · [data-slot=weave-veil]` | **known-ruled** — boot splash, `#433`-family |
| `[perf] slow commit region:content 20–21ms (mount)` | **section mount** — not filed; under the 50ms bar |
| `[perf] slow commit region:list 12–31ms (nested-update/update)` | **FILED** as the P3 above — the 551-row tag vocabulary landing |
| `[cls] shift 0.0066 · CLS 0.0071 (virtualized 0.0000)` | **within budget** (0.1) — boot settle |
| console errors / page errors | **0 across every run**, all arms |

**Environment:** live dev stack `:5173` / `:8788`, `AUTH_MODE=oidc` effective, read-only throughout — no
character created, edited, deleted, or saved. Two of my own probe steps failed and are noted as *my*
errors, not product defects: a `--wait-for characters` (that flag takes a SELECTOR — rendered text
needs the `text=` prefix; a bare phrase parses as a CSS type chain, #550 — this line originally
asserted the opposite and is truth-repaired) and a
mixed selector-engine `--contrast` (`[css] >> nth=0`, which the map's own NOTE warns against).
