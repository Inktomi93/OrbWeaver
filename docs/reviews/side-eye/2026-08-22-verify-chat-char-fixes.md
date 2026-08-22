---
kind: review
status: current
updated: 2026-08-22
---

# side-eye verification — lane se-verify-1 (2026-08-22)

> Verification pass over the merged wave-1 fix set (#487 · #490 · #491 · #492 · #493), driven live on
> :5173 post-merge. Verdict: **SHIP** — all seven chat items clean; the three character items land with
> two deliberate, documented divergences from the verification brief's wording and one real residual
> defect (sighted duplicate disambiguation, filed).

## BLOCKER HIT AND CLEARED — the dev app was hard-down

The dev app on :5173 was white-screening for ~24 minutes at the start of the pass:

```
SyntaxError: The requested module '/@fs/…/packages/ui/src/lib/live-token-resolver.ts?t=1787432261489'
does not provide an export named 'LIVE_TOKEN_ROOT_ATTRIBUTE'
```

The export exists on disk (`packages/ui/src/lib/live-token-resolver.ts:79`, landed c763d94a8, merged
b1b3e82d9 at 15:33). Vite (started 11:54) served a **pre-fix 3-export transform** — `curl` of both the
timestamped and bare module URLs returned byte-identical 20542-byte bodies without the export, and a
`touch` on the source did not invalidate it: **vite's watcher was dead**, so every sibling lane's UI HMR
was also broken. `.cache/stack/client.log` shows the unhandled error repeating 15:54–15:56. Remedy taken:
`bash tooling/src/stack/stack.sh restart` (15:57). Everything below is measured post-restart. The
standing self-heal law did not hold here — filed as its own tooling row (the wedge is silent; `stack
status` reports up while the app white-screens).

## Per-item verdicts

| # | Item | Verdict |
|---|---|---|
| 1 | #490-1 search clear affordance | **CONFIRMED** |
| 2 | #490-2 "Variant" kicker on the swiper | **CONFIRMED** |
| 3 | #490-3 "N of TOTAL" census | **CONFIRMED** |
| 4 | #490-4 "Show chats from" | **CONFIRMED** |
| 5 | #490-8 exactly ONE add-character door | **CONFIRMED** (non-vacuous) |
| 6 | #490-9 talkativeness no `%`, ≥12px | **CONFIRMED** |
| 7 | #487 dim floor 0.45 | **CONFIRMED** (strongest receipt of the set) |
| 8 | #491 filters disclosure | **CONFIRMED with 2 corrections** |
| 9 | #492 duplicate-name qualifier | **HALF-REFUTED** — accessible name yes, visible title no, by design |
| 10 | #493 census honesty + editor gloss | **CONFIRMED** |

### 1 — #490-1 search clear · CONFIRMED

Clear button gated on non-empty and actually empties the query. One run, three states: at rest
`inputValue ""`, no clear button, census `896`; after fill "Hikari" → `"Hikari"`, button present, census
`129 OF 896`; after click clear → `""`, button gone, census `896`. Same `Row` → `Input` → `Button
size="icon" intent="ghost"` + `Icon X` pattern as the month clear, both gated identically
(`chat-list-surface.tsx:120-137`). Accessible names `Clear the search` / `Clear the month`.

### 2 — #490-2 Variant kicker · CONFIRMED

"Example — The Bench After the Rift" has one variant on its last assistant message, so the pager is
correctly hidden there; the real pager rides "Example — The Ashen Spire". Strip children in DOM order:
`BUTTON "Previous variant"` · `SPAN "Variant"` · `SPAN "3 / 3"` · `BUTTON "Next variant"`. Kicker
computed: 10.5px, uppercase, letter-spacing 0.84px, opacity 1, box 52.4×13.1 (rendered, not sr-only);
datum 13px. Screenshot `reports/snaps/se1-swiper.png` reads `‹ VARIANT 3 / 3 ›`.

### 3 — #490-3 census · CONFIRMED

`896` bare → `129 OF 896` under search → `896` after clear, read off `[aria-label="Chats list"]`
innerText across three states.

### 4 — #490-4 month label · CONFIRMED

ARIA: `textbox "Show chats from"`; `MONTH_LABEL` at `chat-list-surface.tsx:69`. The only surviving
"Jump to month" in `packages/` + `tests/` is the explanatory comment at `chat-list-surface.tsx:62`.

### 5 — #490-8 one add-character door · CONFIRMED, non-vacuously

In "Example — The Ashen Spire": the cast bar IS rendered (3 `[data-slot=cast-chip]`) and its
`querySelectorAll("button")` → `[]`. `[aria-label="Add a character"]` count = 0 with the context panel
closed, 1 with the CAST tab open. The non-vacuity control matters — a hidden cast bar would have made
this pass for the wrong reason.

### 6 — #490-9 talkativeness · CONFIRMED

Chip visible text `Talks|50`, no `%`, both spans 13px; accessible name `Talkativeness: Sabine Veyra —
talks at level 50 of 100`. Popover: `Talks relative to the others`, 13px, no `%`
(`reports/snaps/se1-talkpop.png`).

### 7 — #487 scrim floor · CONFIRMED

Two framing corrections: the control is labelled **"Scrim opacity"**, and it renders only when a
background image is set — revealed via the non-mutating `--appearance
'{"backgroundImageKind":"seeded","backgroundSeededId":"misty-highlands"}'` shim (nothing written).
`min="0.45" max="1" step="0.05" value="0.45"`; label/description `Scrim opacity` / `Darkens the image so
text stays legible — never fully off.` Driven to the bottom: `Home` → 0.45; 3× `ArrowDown` → 0.45. The
rendered consequence: `[data-slot=theme-background-scrim]` computes `opacity: 0.45` — the floor paints.
Contract binding: `BACKGROUND_DIM_MIN = 0.45` in contracts, aliased (not re-spelled) by
`appearance-bounds.ts`. Caveat: latent on this account (no background image set).

### 8 — #491 filters disclosure · CONFIRMED with two corrections

Collapsed by default (`aria-expanded="false"`). Tag cloud one tab stop, live-walked: `role="toolbar"`,
551 chips, exactly 1 at `tabIndex=0`; Tab enters, ArrowRight moves, Tab leaves to the first character
row. Active chips + "N active" + "Clear all" survive collapse.

**Correction 1 — "scope pills still visible while collapsed" is REFUTED as written.** Only a *pressed*
pill survives collapse (`character-filter-chips.tsx:163-164`, deliberate and documented). The law ("a
filter you cannot see is a filter you cannot turn off") is intact; the wording overstated it.

**Correction 2 — "Skip to characters is the FIRST focusable inside the pane" is REFUTED.** It is the
third (after `Import a character card` and `New`), sr-only until focused. It does precede everything it
skips — functionally fine; the claim was wrong.

### 9 — #492 duplicate-name qualifier · HALF-REFUTED (deliberate divergence)

Accessible name **CONFIRMED** and propagates to every row control (`Star "Emily" · emily-3` etc., same
shape on Hikari/Eva pairs). Visible row title **REFUTED**: `ListRow.titleQualifier` is documented "Never
rendered" (the WCAG 2.5.3 prefix rule) — three bare bold `Emily` titles render
(`reports/snaps/se1-emily-rows.png`); the handle is the pre-existing subtitle, not a title qualifier.
And the gate is **DERIVABILITY, not collision** (stated in `character-card.tsx:handleQualifier` with two
reasons: keyset paging makes a collision scan page-scoped; the subtitle is not reliably the handle).
Consequences both directions: `Emily`/`emily` (a real collision whose handle IS the slug) gets NO
qualifier; `Charlotte · assistant` and `JFC · jfc-coder` (no collision) DO. Documented, reasoned
deviations — not execution defects — but they leave live findings (below, filed).

### 10 — #493 census honesty · CONFIRMED

Status line `327 characters` (census); foot of list `30 of 327 loaded` (separate number, quiet voice);
header band `CHARACTERS 327`. Editor gloss confirmed: visible `1666 total · 1276 permanent` with
`title` and `aria-label` explaining permanent (10.5px micro step, non-interactive — the 11px floor
doesn't bind).

## New findings (filed)

- **[P1→filed #517] Sighted users get no guaranteed way to tell duplicate-named characters apart.** The
  visible disambiguator is the subtitle ladder `elevatorPitch ?? tagLine ?? handle` — handle LAST. Every
  current Emily/Hikari/Eva happens to fall through to the handle, so it works by luck; no live broken
  instance could be produced. The #490-2 swipe-strip fix resolved the same class the opposite way
  ("give the sighted user the visible word"). Fix direction: render the qualifier when the subtitle is
  not the handle, or promote `subtitleReveal` to always-on for qualified rows.
- **[P2→#517] The derivability gate mints actively misleading qualifiers** (`Charlotte · assistant`,
  `JFC · jfc-coder` collide with nothing; the real collisions go unqualified). ARIA receipt: 13 rows,
  8 qualified, 0 of the 8 colliding. Spend the disambiguator where there is ambiguity.
- **[P2→#518] `327` printed twice in one 290px column** (header band + FILTERS status line, ~130px
  apart). Keep the foot's `30 of 327 loaded`; drop one bare census. `reports/snaps/se1-chars-band.png`.
- **[P2→#519] The collapsed FILTERS group no longer advertises what filtering exists** — a cold
  first-timer gets no signal that Favorites/Archived/551 tags are behind "More filters", and the lone
  mono datum reads like a debug counter. Label the disclosure for what it opens.
- **[P3→#520] Two "New" buttons on the Characters plane** (LIST band + CONTENT landing) — the #490-8
  duplicate-door class, still standing here.
- **[P3→#521] The `+10 / More` overflow tile reads as a character named "More"** (same avatar-plus-
  caption clothes as character tiles). `reports/snaps/se1-chats-band.png`.
- **[P3→#522] The empty month input renders as bare `-------- ----`** — no format hint beyond the label.
- **[P3→#523] An unlabeled `tabindex=0` scroll viewport** sits between "Show fewer tags" and the tag
  toolbar; announces as an unnamed generic.
- **[P3, not filed] `flat-type-hierarchy` fires on every audited surface** (10.5/13/15/16px, ratio
  1.5:1) — a standing ramp-compression signal, not a regression from this train.
- **[P2→#524, tooling] The wedged vite watcher is silent** — see the blocker above.
- **[P3→#525] Chats band polish:** `CHATS 129 OF 896` scans as one token (label and datum run
  together); the search ✕ sits outside the field while the month field's picker glyph sits inside —
  mechanism unified, silhouette not.

## What's genuinely working — don't touch

- **The scrim floor implementation** — the client bound aliases the schema constant, so the slider
  structurally cannot offer a clamped-away value; Home/ArrowDown + the rendered `opacity: 0.45` is a
  complete proof; the survives-input-changed framing against D144(d) is right.
- **The 551→1 roving toolbar** — clean APG implementation, live-walked.
- **`rowActionSubject` propagation** — the row controls disambiguate with the row, so three
  identically-named kebabs never hide behind three distinctly-named rows.

## Biggest opportunity

Close the #492 asymmetry in the direction #490-2 established: two fixes in one train diagnosed the same
defect class and resolved it opposite ways; only one leaves a user unable to tell two things apart.
Pick the swipe-strip answer for rows too. (Filed as #517; intersects the #512 axe decision — rendering
the qualifier visibly would clear `label-content-name-mismatch` as a side effect.)

## Instrument coverage

snap `--map`/`--aria`/`--eval`/`--shot-of` (~16 invocations) · `--key` keyboard walks (toolbar roving +
scrim floor) · `--appearance` non-mutating shim · design-audit on chats/characters/room (0 P0/P1/P2,
5 P3) · screenshots `se1-swiper`/`se1-talkpop`/`se1-emily-rows`/`se1-chats-band`/`se1-chars-band` ·
console triage (0 errors post-restart; known boot warnings below budget). Skipped: `--mobile` (no
tap-target claim in scope), `--contrast` (#487's derivation is pinned by `palette-contrast.suite`),
motion/perf instruments and Lighthouse (out of scope / load), theme arms (no polarity claim).

## Retractions

None of the reviewer's own. Three of the verification brief's claims corrected: item 8's "scope pills
visible while collapsed" (only pressed ones), item 8's "first focusable" (third), item 9's "in the row
title" (accessible name only, never rendered — by explicit design). All three divergences are
documented in the shipped source with reasoning; the code is defensible, the brief's description of it
was not.
