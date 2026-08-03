# side-eye — the combined nightly pass (2026-08-03)

**Verdict: SHIP WITH FIXES.** Nothing here is unshippable, but the Configuration workspace —
tonight's centerpiece — has a whole-region padding hole that clips a primary action, a lying empty
state in all three collections, and a roster row that throws away 30% of its width. Those are
day-one-visible. Everything else is polish or vocabulary.

Driven live on an **isolated snap stage** (`--isolated --ref 89391c2f`, :5273/:8888), seeded to
**430 tags · 34 regex scripts (all global) · 2 world-info books**. The owner's :5173 was never
driven (one exception noted under Instruments).

Scope was the six-item brief; this is a FOCUSED review, so there is no scored Nielsen table —
per-target verdicts lead instead.

---

## Per-target verdicts (brief rank order)

| # | Target | Verdict |
|---|---|---|
| 1 | **Configuration workspace** | **DO NOT SHIP AS-IS** — 1×P0-adjacent (zero region padding clips the primary CTA), 3×P1, 6×P2. Roster/scale/virtualization mechanics are sound; the frame around them is not. |
| 2 | **Regex scope-order + attached-by rosters** | **SHIP** — the order editor is the best-built thing in the night. Two P2s (panel burial, generic title). |
| 3 | **Narrator tint in situ** | **SHIP WITH FIXES** — coloring works and is per-speaker; but the row label reads **"Group"**, never "Narrator", and two speakers' dialogue hues are 8° apart. |
| 4 | **FACEFILT folded strip** | **SHIP** — measured fold, hoist-on-pick, an explicit FILTERED chip with an exit. One P2 (no `aria-pressed`). |
| 5 | **Theme cluster / home skeleton / persona row** | **MIXED** — home-tile skeleton **RFIX VERIFIED** (numbers below). Theme cluster P2s. Persona surfaces carry two real IA defects. |
| 6 | **`autoFocusSearch` micro** | **FIXED + COMMITTED** (`0274b08d`), `pnpm check` green, before/after receipt in the message. |

---

## Findings

### P1 — the Configuration CONTENT region has **zero padding on every side**

Every mounted member editor renders flush into the pane corner, and with the context panel open the
world-info **`+ New entry` primary button's right edge lands exactly on the pane boundary**; without
it, on the bare viewport edge.

```
Configuration content: padTop 0px · padLeft 0px · padRight 0px
heading "americana" box → x=363, y=48   (region origin x=363, y=48 — flush)
world-info: content.right = 896 · "New entry".right = 896 · pencil.right = 896
```

The welcome state looks fine only because `config-welcome.tsx` carries its own `p-block`; the
editors don't. `docs/design/mocks/config-rail/workspace.html` insets the whole editor pane.
**Fix:** pad the region (or the member-editor frame), not each editor.
Receipt: `reports/snaps/nightly-tag-member-editor.png`, `nightly-wi-context.png`.

### P1 — expanding an EMPTY collection shows two stacked empty states, one of which lies

Open the Regex group at zero members and the ARIA tree reads:

```
- button "Regex scripts 0" [expanded]
- paragraph: No scripts match that filter.     ← there is no filter; the box isn't even rendered
- paragraph: No scripts yet.
- button "New script"
```

Root cause is one line, repeated in all three collections —
`tag-collection-rows.tsx:55`, `regex-collection-rows.tsx:47`, `world-info-collection-rows.tsx:95`
compute `empty = filtered.length === 0` and render *"No X match that filter."* regardless of whether
a filter is set. **Fix:** branch on `needle !== ""`; fall through to the host's empty slot otherwise.
Receipt: `reports/snaps/nightly-config-empty-expanded.png`.

### P1 — the regex roster cuts every script name to 128px inside a 290px row

```
regex row: rowW=290 · title width=128 (x 74→202) · toggle ~216–266 · 88px DEAD to the right edge
tag   row: rowW=290 · title width=199–207          (same roster, same pane)
regex rowH=52 · tag rowH=35
```

`LibraryRow`'s reserved cluster pads to the full three §12.2 slots, but no regex row has a kebab or
an inline verb — so two empty slots are reserved on every row and 30% of the row is blank while
"ST import — nar…" and "normalise em-d…" truncate. Two collections in ONE pane also disagree on row
pitch by 49%. **Fix:** reserve only the slots the list actually uses; align the two pitches.
Receipt: `reports/snaps/nightly-regex-group.png`.

### P1 — a narrator room labels every merged row **"Group"**, not "Narrator"

`Example — Second Opinion` is `group.output: "narrator"`, `speakerTags: true`. Every assistant row:

```
{name:"Group", color:"oklch(0.72 0.16 319)", role:"assistant"} ×4
```

The rows are stamped with a producer id absent from `character.list`, so
`resolveAssistantAttribution` resolves a name and a tint — meaning `NARRATOR_ATTRIBUTION`
(`name:"Narrator"`, `tokens:null`) is **never reached in this room**. To a reader, "Group" is a
magenta-tinted fake cast member. Mechanism is data-side (the stamped producer), but the rendered
result is the defect. Receipt: `reports/snaps/nightly-narrator-tint.png`.

### P2 — per-speaker dialogue tints are 8° apart and read as one colour

```
speaker A dialogue: oklch(0.85 0.10 80)
speaker B dialogue: oklch(0.85 0.08 72)
```

Row NAMES separate correctly (Charlotte `0.74 0.10 248` blue vs JFC `0.76 0.13 85` amber), but the
in-body dialogue spans — the thing you actually read — do not. These come from authored
`themeOverride`s (`cardEmbeddableSubset`), which have no hue-separation guarantee. The demo room
therefore ships the feature looking broken. **Fix:** de-collide dialogue hues per room, or fall back
to the id-hash when two members land inside a hue threshold.

### P2 — `Prune unused` mass-deletes with no confirm and no undo

`tag-collection-rows.tsx:80` — `onClick={() => prune.mutate()}`, and `usePruneUnusedTags` is a bare
`createEntityMutation` with no confirm. At my seeded fixture that is one ghost-button click away
from deleting 394 tags. Every other destructive verb in `LibraryRow` carries a `ConfirmDialog`.

### P2 — a regex script with `placement: []` is saveable, runs nowhere, and nothing says so

`placementSchema` has no `.min(1)`. With every "Runs on" chip off, the editor, the row scent and the
context arm are all silent. Receipt: `nightly-regex-context.png` (all five chips `aria-pressed=false`).

### P2 — the regex row's scan line is a truncated raw regex

`regexScriptScent` = `enabled ? pattern : "off · " + pattern`. Combined with the 128px title column
you get `off · /\s*(?:ooc|OO…` — the least human datum available, and it never says WHERE the script
runs. The mock's scent is `AI output · runs everywhere`. `packages/client/src/lib/regex-placement-labels.ts:51`.

### P2 — the Find pattern field does not look like a field, and its `<label>` points at nothing

```
.cm-editor  box 593×26 · bg oklch(0.158 0.006 60) · border 0px · border-radius 0px
            + a line-number gutter (31px) for a one-line regex
siblings:   Name = 32px rounded bordered input · Replace with = 84px rounded bordered textarea
<label for="base-ui-_r_dl_">Find pattern</label> → getElementById → MISSING
```

The most important input on the surface is a borderless square-cornered 26px strip, and clicking its
label does nothing (every sibling label focuses its field). The accessible NAME is fine —
`cm-content` carries `role=textbox aria-label="Find pattern"` — so this is craft, not a11y.
Receipt: `reports/snaps/nightly-regex-findpattern-crop.png`.

### P2 — the workspace welcome uses first-run copy at 430 tags

With 430 tags / 34 scripts the CONTENT still reads *"Nothing here is required — each one starts
paying off the moment you make the first."* `config-welcome.tsx`'s header documents the one-voice
deviation from the mock's two-voice frame, and the rules-of-hooks argument against a
count-at-the-parent switch is sound — but it only rules out the SWITCH, not writing one sentence
that is true for both readers. Keep one voice; fix the sentence.

### P2 — FACEFILT tiles carry no `aria-pressed`

After picking Elias Thorn the strip hoists him to slot 1 with an orange ring + orange label, but:

```
strip:   ["Show chats with Elias Thorn", "Show chats with Sabine Veyra", …]
pressed: [null, null, null, null]
```

The active filter is visual-only on the tile, and the tile's name ("Show chats with…") stays an
un-toggled promise. Partly mitigated by the `FILTERED: Elias Thorn ✕` chip, which is genuinely good.

### P2 — the theme cluster can't tell inherited from set

Seven `label + 32px swatch` pairs, no value text, no "Inherit" marker — while the helper paragraph
says *"Leave a field on Inherit (or clear a colour) to fall back to your global theme."* The mock
prints the value in the swatch row (`■ oklch(0.68 0.14 150)` / `□ auto`). Three vocabularies for one
idea in one 384px panel: **Inherit** · **clear a colour** · **Reset to global**.
Receipt: `reports/snaps/nightly-theme-cluster.png`.

### P2 — Settings › Personas contains no personas, and renders its own name twice

The pane is a heading and one unrelated switch ("Notify me when my persona changes in a chat"). The
persona roster lives in the `you` sheet. The nav also stacks `Personas` (group header) directly
above `Personas` (selected item) — two identical labels, 40px apart, both `button "Personas"` in the
a11y tree. Receipt: `reports/snaps/nightly-personas.png`.

### P2 — the persona row states one fact three times

Row anatomy: avatar · **Traveler** / *"Your default persona"* · 👑 `img "Your default"` ·
♥ `img "Favorited"` · `button "Your default"` · `button "Unfavorite"` · `button "Actions for
Traveler"` · ›. "Your default" appears as a subtitle, a marker image AND a button whose label is a
state rather than a verb. Directly above it, `PLAYING AS / Traveler` renders the same persona a
second time with a different anatomy. Receipt: `reports/snaps/nightly-persona-rows.png`.

### P3 — two sibling context arms, two different grammars

Regex says **"Runs in every chat"** under ALL-CAPS kicker headings (`ATTACHED BY PRESETS · 0`);
world-info says **"Everywhere / Fire this book in every chat"** under 17px sentence-case headings
(`Everywhere` / `Personas` / `Characters`). Same slot, same panel title ("Details" — generic in both;
the mock's was "WHERE IT RUNS").

### P3 — misc
- Creating a member leaves its group **collapsed**: `+ New script` opens the editor in CONTENT while
  the roster still shows `REGEX SCRIPTS 2 ›`. The thing you just made is invisible in the LIST.
- `--- MAP ---` shows `regex.listScriptUsage` **three times in one tRPC batch**, same `scriptId`.
- Two new scripts are both `New script / no pattern yet` with no disambiguator; `LibraryRow` has a
  `qualifier` slot for exactly this (presets use it).
- The `+N More` tile promises the *others* but its picker lists **all 10** characters, including the
  four already in the strip.
- The welcome card titles don't reserve width for the count: `REGEX SCRIPTS` wraps to two lines at 34
  while its siblings stay on one.
- The virtual box is `max-h-96` (a raw 384px Tailwind scale, not a token) on an 800px pane, leaving
  ~250px of dead space below World Info at desktop.

---

## Retractions (findings I filed and then killed with my own receipts)

1. **"Virtualized rows aren't keyboard-reachable."** FALSE. Only 11 of 430 rows are in the DOM, so I
   expected Tab to escape to `Prune unused` after row 11. A real `press_key Tab` from `arcane-224`
   landed on **`arcane-252`** — scroll-into-view fires the virtualizer and mounts more
   (`renderedRows 11→13`, `scrollTop 235.5`). The whole library is walkable.
2. **"Virtual list announces 11 items, not 430."** FALSE. Playwright's ARIA snapshot doesn't print
   `setsize`; `virtual-list.tsx:144` sets `aria-setsize={items.length}` + `aria-posinset`.
3. **"Group bands don't expose `aria-expanded`."** FALSE — same snapshot artifact; every band carries
   `aria-expanded` + `aria-controls`.
4. **"Five sub-44px tap targets on mobile."** FALSE — all five are TanStack devtools chrome
   (`class="go755898927"`, `x=0`, below the viewport). Product mobile has zero.
5. **"Mobile has no config roster."** FALSE — it's behind the list-drawer toggle and opens full-width.
6. **"Two 'Runs on' chips render different rings."** FALSE — computed `box-shadow` is identical
   (`oklch(0.72 0.175 52) 0 0 0 2px inset`) on both; a screenshot mis-read.

---

## What held up under attack

- **Reading surface (pixel-sampled over the theme photo, not css-resolved):** message prose
  **17.41:1**, dialogue spans **12.25:1**, italic narration **7.34:1**, attribution **17.14:1**,
  timestamp **8.45:1**. All PASS. No text bleeding over art.
- **The home-tile skeleton RFIX is verified.** Live tokens `control-lg=40 · row=8 · block=12`, against
  the device's remembered boxes:

  | tile | box | rows | painted | residual |
  |---|---|---|---|---|
  | `home.jump` | 320 | 6 | 304 | **+16** |
  | `chat.recents` | 349 | 7 | 352 | **−3** |
  | `chat.quickPicks` | 349 | 7 | 352 | **−3** |
  | `chat.tempChat` | 111 | 2 | 112 | **−1** |

  Against the reported before-state (189px of blank, a 2.9px hairline stub) this is fixed. Verdict
  upgraded from *needs-row-pitch-polish* to **PASS**.
- **Focus rings are real.** A live Tab traversal puts `:focus-visible` true with
  `oklch(0.72 0.175 52) 0 0 0 2px inset` on the focused row.
- **Virtualization is tight** — 11 rendered of 430, `scrollHeight 18043`.
- **The `Runs on` toggle group is a proper roving-tabindex** (`tabindex=0` on one, `-1` on the rest).
- **The regex order editor's move buttons are all individually named** (`Move strip ooc #10 up`).
- **The world-info empty state is genuinely well-written.**
- **Config roster accessible names are clean** — `Show chats with <name>`, `<script> runs in every
  chat`, `Filter tags`, `Import a world-info book`. No unlabeled icon buttons found anywhere.


---

## Taste & flow verdict (the call no instrument makes)

**The Configuration roster: good bones, genuinely.** Three collapsed bands with a count and a `+`,
stacked, is the right shape — you can see what libraries exist without scrolling anything, which is
exactly what the owner ruling asked for. It reads as a map. I would ship this shape.

**The member editors look unfinished.** Not "needs polish" — *unfinished*. Text starts 0px from the
divider, the primary button touches the pane edge, and the two colour swatches in the tag editor sit
at x=379 and x=663 with 250px of nothing between them because a two-column grid got stretched across
590px for two 32px squares. Next to the mock's inset, framed pane it looks like a layout that never
got its container. The welcome screen has padding; the editors do not; that inconsistency is what the
eye reads first.

**The regex roster looks broken at a glance.** Names truncated at half the row width with 88px of
blank beside them, a subtitle that is a chopped-off regex, and a virtual box clipped mid-row with a
"Prune unused" link jammed right under the half-row. Nothing is *wrong* per se, but a person landing
here cold would assume the list failed to render.

**The empty slot below a collapsed band is confusing on sight.** A `>` chevron says closed; a dashed
box below it shows content. The code's rationale for hoisting it out of the disclosure is honest and
I agree with the goal — but the chevron and the box are telling the user two different things.

**"FILTERED: Elias Thorn X" is the best small thing in the night.** State stated in words, one obvious
exit, right where the effect is. That is how the theme cluster's inherit-vs-set should read too.

**The global run-order editor is the best BUILT thing in the night** — numbered, "this script" marks
your position, every move button named. But it buries the panel it lives in: 34 rows push
"Attached by presets / characters / rooms" ~1400px below the fold, in a panel whose entire stated
job is telling you where the script runs. The order list should collapse, or the rosters should lead.

**One home per concept — where it is broken:**
- The persona `Traveler` renders **twice, 40px apart** (`PLAYING AS` above `YOUR PERSONAS`), with two
  different anatomies. And within the one row, "your default" is said three times.
- **Settings > Personas has no personas.** A nav item that names a thing and does not contain it,
  while the nav renders the word "Personas" twice in a row.
- The character card has **four** tag affordances on one screen — `+ Add tag`, per-suggestion
  accept/dismiss x3, `Suggest tags`, `Manage tags`. That is 5+ competing options for one concept at
  one decision point (the §8 ceiling is 4).
- Regex "Runs in every chat" is a switch on the roster row **and** a switch in the context panel,
  both visible simultaneously. Defensible as a list accelerator; still two homes on one screen.

**Cold-first-timer test.** The workspace passes: "The parts every chat is built from" plus three
described launcher cards is a genuinely good teaching state, and I would know what to do. The
character card fails on one detail — a bare blue dot labelled **APPEARANCE** floats at the right edge
of the Name field with no tooltip, no border, no affordance. I had to read source to learn it means
"this character carries a theme override." A user has no chance.

## Instruments

- `pnpm design-audit /` → 26 findings, **all false positives**: 3× `z-index-escalation` on TanStack
  devtools + `tsd-resize-handle`, 23× `nested-card` on Base UI internals. Zero contrast, zero
  distortion, zero real tap-target findings. Note: `design-audit` has no `--isolated`, so this one
  run hit :5173 (read-only page load, no interaction).
- ~9 chrome-devtools calls, all for the stateful keyboard walk.
- Everything else: `snap` (`--isolated --ref` · `--goto` · `--open-chat` · `--open-character` ·
  `--map` · `--aria` · `--contrast[-pixel]` · `--eval` · `--jsclick` · `--mobile` · `--ls` ·
  `--watch` · `--file` · `--crop` · `--shot-of`).

## Not reached
Tag member editor's CONTEXT arm (mock frame 3, "Nothing to attach"); the shared regex picker's
"Runs here, in order" split (drag handles / >30 move buttons / keyboard) — only the GLOBAL scope's
order editor was driven; `mobile.html` / `rail-and-glyph.html` mock diffs.
