---
kind: review
status: active
updated: 2026-09-05
---

# side-eye — Characters: the hub-ingested arm and the scale arm (#844), and the `2× "chats"` door (#891)

**Lane:** cb-characters-sideeye · **Mode:** FOCUSED (two briefed rows; no scored Nielsen table — per-target
verdicts instead) · **Base:** an ISOLATED snap stage pinned to main `883a58b960caea1417ef51286d0936e7102594dc`,
band 2 (`http://localhost:5293` / server `:8908`) · **Principal:** the stage's single dev-fallback owner
(`users.handle = "owner"`, `role = owner`) — every receipt below was taken as that principal · **Mutations:**
all on the isolated stage only (plugin consent, plugin enable, two hub-card imports, a 300-character seed).
Nothing touched `:5173`, main's db, or main's working tree.

This closes the two rows the 2026-08-30 pass listed as **NOT REACHED** in its coverage table
(`docs/reviews/side-eye/2026-08-30-rail-characters-delta.md` lines 631–632) and settles the
`duplicate-action-door (2× "chats")` finding it left unclassified. It reads alongside
`docs/reviews/side-eye/2026-09-02-characters-rail-drive.md` (#1114), whose rulings I cite rather than
re-litigate — with one explicit collision, called out in full below.

---

## Verdict

**Row 1 (#844 — the hub-ingested arm): DO NOT SHIP the provenance readout.** The arm is now driven end to
end and it produces one P1: a character downloaded from character-tavern.com through the Card Atlas plugin
tells the user **`Source: Made here`** on the one card whose entire job is provenance — on the same surface
that displays the card's creator and its import hash. Everything else in the ingest arm (avatar, editor
tabs, context pane, contrast, tap targets) is clean.

**Row 1 (#844 — the scale arm): SHIP WITH FIXES.** At 312 characters virtualization holds exactly, search
is honestly server-side, and the list tells you `30 of 312 loaded`. Two things do not survive the size:
**Group by tag** groups only the loaded page (self-declared, so honest but useless), and the section's own
title truncates to **`Chara…`** the moment you open a character.

**Row 2 (#891): NOT one door — the finding is an instrument gap, not an IA defect.** Fence text below.

---

## Per-target verdicts (rank order)

| # | Target | Verdict |
| - | - | - |
| ① | Hub ingest, end to end (consent → enable → search → add) | **Drivable, and it works.** Consent flow is legible and specific; the hub returns real results; the import lands the card, its avatar (768×768, `object-fit: cover`, no distortion) and its full field set. Three defects: the P1 provenance lie, no success announcement, and an "already in your library" message shown on a FIRST import. |
| ② | The ingested character on the Characters surface | **Clean apart from provenance.** `contrast candidates=84 judged=84 affected=0` in Hearth AND Light (with a planted control firing), tap targets 0 affected at coarse, focus-visible at every stop of an 8-stop keyboard walk, Lighthouse a11y/BP/SEO 100. |
| ③ | Scale (312 characters) | **Virtualization and search hold; the two page-local lenses do not.** 13 rows mounted at any scroll depth over a 16 216px track; non-virtualized CLS **0.0004**; search reaches row ~260 of 312. Group-by-tag is page-local; the list header truncates. |
| ④ | #891 `2× "chats"` on both arms, desktop + mobile | **Reproduced, measured, and judged NOT one door.** Positive control 2 → 3. |

Not reached, stated: a **third** appearance arm (`compact`/`reading`) on the ingested character — the 09-02
pass ran them at 10 rows and I spent that budget on the scale arm instead; **`--matrix`** (a ninth concurrent
browser against the ~6/origin SSE budget while the stage was already carrying a 312-row library); and
**Lighthouse mobile** (the desktop arm's only failure is the already-ruled `label-content-name-mismatch`,
and the coarse tap-target question is answered authoritatively by `--design-audit --mobile`).

---

## The arms I had to build, and what they cost (read this before trusting a receipt)

**The hub arm is real network.** Card Atlas reaches `character-tavern.com` and eight other hubs; the search
returned 30 live rows (`agent-a28cfde5613d26606-567278-2026-09-05T13-11-59-775Z`). The cards imported here
are real third-party cards (`Illyria` by `damagecontrol`, `Rebecca` by `paradigme`), which is exactly why
they are valid evidence: a seeded row could not have produced this finding.

**PREMISE CORRECTION (brief vs tree).** The brief and #844's done-criteria say the hub button reads
**"Summon to your library"**. On `883a58b96` it reads **"Add to library"**
(`agent-a28cfde5613d26606-572989-2026-09-05T13-12-47-882Z`). The rest of the flow is as briefed.

**A LANE HAZARD I PAID FOR — the chat seeder can brick a snap stage.** Running
`node tooling/src/seed/cli.ts chat` against a stage `DATABASE_URL` with `OWNER_HANDLES` taken from the dev
`.env` makes boot's `adoptMovedSeedKey` (`packages/server/src/entry/boot/seed-owner.ts:97-100`) **rename the
stage's owner row** from `owner` to that handle. The stage server's dev fallback principal then asks for
handle `owner`, `ensureUser` refuses ("a row already holds role='owner' under a different handle"), and
**every request 500s**. The app then took its own destructive-reset path — it wrote
`orbweaver.db.backup-1788615120395` and re-seeded defaults, destroying the 300 seeded rows and the first
ingested card. Recovery was to re-run the same supported code path with `OWNER_HANDLES=owner`. Every receipt
in this report was re-taken after that reset, on a clean stage, and the P1 was reproduced from scratch on
**two different cards**. Proposed memory lesson at the end.

**Probed environment state, never assumed** (`agent-a28cfde5613d26606-533101-2026-09-05T13-06-45-738Z`):

| Handle | Value |
| - | - |
| `<html>` | `data-blur-panels` `data-blur-composer` `data-blur-modals` **`data-reduced-motion=false`** · no `data-theme` (Hearth) · no `data-texture` |
| `<html>` style | `--font-scale:1` `--blur-strength:14px` `--reading-line-height:1.55` |
| `.shell-grid` | `data-section=characters` `data-list-mode=docked` `data-context-mode=collapsed` **`data-elevation=flat`** `data-focus-mode=false` |
| device (from the RESULT line, not the flag) | desktop arms `device=fine:dpr1:1280x800` · mobile arms `device=coarse:dpr3:430x740` |
| theme arm | `theme-request=Light theme-id=theme_00000000000000000000000003 theme-source=seed theme-root=light theme-light=526 theme-dark=0` |

**EVERY `--design-audit` arm in this report is `population-verdict=NO-VERDICT`** (`selection-idiom:
unmatchedUnselected×2`, and on the driven arm additionally `quiet-state:unmatchedOff×1`). I drove the
prescribed remedy (`--click '[aria-label="Select multiple"]'`,
`agent-a28cfde5613d26606-664882-2026-09-05T13-25-41-752Z`) and it did **not** clear — the arm still withheld.
So the design-audit findings below are **partial by the instrument's own accounting**, and "0 affected" on
any rule in them is a measurement of what it judged, not a clean bill for the surface. Where I need a clean
bill I say which rule, with its judged count and its planted control.

---

## Findings

### \[P1] A hub-ingested character reports `Source: Made here`

**What.** Import `Illyria` from Character Tavern through Card Atlas. Open it. The context pane's ORIGIN
group reads:

```
ORIGIN
  Added    1m ago
  Source   Made here
```

**Why it hurts a user.** This is the one readout in the app whose entire job is to answer "where did this
come from", and on a card the user downloaded from a public hub thirty seconds ago it says the user made it.
It is wrong in the direction that matters: a library of 300 imports, all claiming to be the owner's own work,
destroys the only signal that separates authored cards from downloaded ones — which is the signal the owner
needs before editing, exporting, or trusting a card. It is also self-contradicting **on the same surface**:
the Provenance field of the very same character holds `Creator: damagecontrol` and
`Import hash: a22826b0a102837abca382af3ce94808fd9310888faaee38a1407d98ad1e2f4b`
(`agent-a28cfde5613d26606-604057-2026-09-05T13-16-22-217Z`). The app **knows** it imported this card; the
Origin readout is the one place that says otherwise.

**Receipts.**

- `agent-a28cfde5613d26606-600103-2026-09-05T13-15-49-989Z` — ARIA of `[aria-label="Characters details"]`:
  `group "Source": paragraph: Source / paragraph: Made here`; PNG `snaps/cb-se-illyria-context.png` in that
  slot shows it rendered.
- `agent-a28cfde5613d26606-804295-2026-09-05T13-47-13-388Z` — the same, reproduced after the db reset, under
  `--theme Light` (`theme-light=526 theme-dark=0`), PNG `snaps/cb-se-illyria-light.png`.
- `agent-a28cfde5613d26606-829405-2026-09-05T13-51-13-128Z` — a **second, different** hub card:
  `"Rebecca@rebecca0 chats1,631 tokens…OriginAdded7m agoSourceMade here…"`.
- Server truth at ingest time: `GET :8908/api/_debug/db/characters` →
  `{"id":"character_01m1rv9961e8k8berfpkz7e9fp","name":"Illyria","handle":"illyria"}`.

**Mechanism (path:line).**

1. `packages/server/src/entry/compose/services.ts:866-878` — `runInstallerCharacterImport`, the ONE closure
   both plugin canon-write arms (`character.ingest`, `character.ingestAsset`) share, calls
   `createImportService(importCtx).importCharacter({ card: { bytes } })` — **no `filename`**.
2. `packages/server/src/domain/import/verbs/import-character.ts:205` — `importedFrom: filename ?? null`, so
   the row lands with `importedFrom = NULL`.
3. `packages/contracts/src/character/index.ts:84-89` — `characterProvenanceOf` returns `imported` only when
   `importedFrom !== null`; with NULL and a non-`AUTHORED_CARD_CREATOR` creator it returns **`authored`**.
4. `packages/client/src/features/character/components/character-overview-card.tsx:159,181-190` — the
   `authored` arm prints `AUTHORED_SOURCE = "Made here"`.

**This is a recorded ruling meeting a new INPUT, not a ruling I am reversing.** The header at
`character-overview-card.tsx:167-178` records #843's fix ("the row was `importedFrom ?? "Made here"`, a
two-arm claim on a three-arm fact") and #865's move of the verdict to one server-side derivation ("the
ruling survives; its INPUT changed — what moved is WHO DECIDES"). Both rulings are correct and both still
hold. The plugin ingest arm is a **third writer** that feeds that derivation nothing. The fixer's fork is
therefore: preserve `characterProvenanceOf` exactly, and give the plugin funnel a provenance string to hand
it.

**Fix.** `runInstallerCharacterImport` takes an `importedFrom` and passes it through
(`importCharacter({ card: { bytes }, filename })` already accepts one). The plugin bridge supplies it — the
hub host is already known and already manifest-fenced (`character-tavern.com` is in the 16 declared hosts),
so `card-atlas:character-tavern.com` (or the card URL) is both available and honest. A fourth arm is not
needed: `imported` with a non-URL `importedFrom` already renders as `Imported`
(`character-overview-card.tsx:160-163`).

**Second consequence, same root, worth its own line.** `findByImportedFrom`
(`packages/server/src/domain/character/contract/service.ts:145-147`,
`contract/params.ts:183-187`) exists specifically to back **"the hub search page's already-imported markers
(doc 03 §2.1)"** and is a batched `IN` read over `importedFrom`. Because the ingest funnel writes NULL there,
that oracle can never match a plugin-ingested row. The markers DO work
(`agent-a28cfde5613d26606-614138-2026-09-05T13-17-54-837Z` shows `in your library` on the Illyria result row)
— which means they run on `findByImportHash` instead, and `findByImportedFrom` is presently a dead oracle for
its stated purpose. A verifier lane should confirm whether it has any live caller at all.

---

### \[P2] The hub result row's `in your library` badge is invisible to a screen reader

**What.** After an import, the hub result row paints an `in your library` badge. The button's accessible
name does not carry it.

**Receipt** (`agent-a28cfde5613d26606-617302-2026-09-05T13-18-30-045Z`):

```
{ "label": "Illyria, damagecontrol · 2.8k↓",
  "text":  "in your libraryIllyriadamagecontrol · 2.8k↓",
  "title": null }
```

The `aria-label` overrides the content, so TAC step 2A never reaches the badge. Cross-checked against
`--aria`: `button "Illyria, damagecontrol · 2.8k↓": - text: in your library` — the badge is a child of a node
whose name is authored.

**Why it hurts a user.** On a 30-row result grid the badge is the ONLY thing distinguishing a card you
already own from one you do not; the rows are otherwise identical. Sam re-imports cards blind.

**Fix.** `clarify:` the hub result row's accessible name — fold the state in
(`aria-label={inLibrary ? \`${name}, ${creator} · ${downloads} downloads — already in your library\` : …}`),
or drop the `aria-label`entirely and let the name compute from the content it already renders. Receipt:`--aria\` shows the state inside the button's name.

---

### \[P2] A first-time import announces nothing — and the only message says "Already in your library"

**What.** Click `Add to library` on a card that has never been imported. 2.5s later the accessible tree
contains **no** `status` or `alert` node about the import; the button still reads `Add to library`; and the
only new text on the surface is:

> `Already in your library — adding again just re-checks the bytes.`

**Receipts.** Reproduced three times, including once on a card whose first-ever import this was:

- `agent-a28cfde5613d26606-580167-2026-09-05T13-13-41-906Z` (Illyria, first import, first db)
- `agent-a28cfde5613d26606-768411-2026-09-05T13-42-41-753Z` (Illyria, first import, clean db after reset)
- `agent-a28cfde5613d26606-774781-2026-09-05T13-43-38-029Z` (**Rebecca**, first-ever import) — full-page
  `--aria` at +2.5s: the only `status` in the tree is the boot's `status: App loaded.`

**Why it hurts a user.** This is the primary action of the entire Card Atlas surface and it produces no
confirmation, no count change in view, and no route to the thing that was just created. Worse, the message
that DOES appear asserts a false premise on the successful path — the user is told the card was already
there, which reads as "nothing happened". Nielsen #1 (visibility of system status) and #2 (match to the real
world). For Sam it is a silent action: nothing is announced at all.

**Fix.** `clarify:` the import result — an `role="status"` line naming what landed and offering the exit
("Added **Illyria** to your library — open it"), and reserve "Already in your library" for the genuine
re-add. Receipt: `--aria` after `Add to library` contains a `status` node naming the character, and the
first-import path never renders the "already" copy.

---

### \[P2] At a coarse pointer the character row still paints three inline actions — 156 of 413px

**What.** On the phone arm every library row carries Star + Chat + Actions as three permanently-visible
48×48 controls.

**Receipt** (`agent-a28cfde5613d26606-816684-2026-09-05T13-48-55-822Z`, `device=coarse:dpr3:430x740`):

```
row 413×48 · title lane 195px
  "Cast 1"             w=251 h=48 x=8     (row body)
  "Star Cast 1"        w=48  h=48 x=265
  "Chat with Cast 1"   w=48  h=48 x=319
  "Actions for Cast 1" w=48  h=48 x=373
```

156 of 413px (38%) is the trailing cluster; `Calamity, Doomblade of the Ninth Epoch` truncates at 195px
(PNG `snaps/cb-se-scale-mobile.png` in `agent-a28cfde5613d26606-812708-2026-09-05T13-48-21-285Z`).

**The law it breaks, verbatim.** `packages/client/src/components/row-reveal.ts:47-56`:

> THE RULE: at `pointer: coarse`, a row's SECONDARY affordances collapse into its ONE overflow control. …
> Both clusters exist because `ROW_REVEAL` turns hover-revealed controls permanently ON at coarse — **the
> affordance is right, the BUDGET is not.**

The shared constants (`ROW_ACTION_INLINE` / `ROW_ACTION_OVERFLOW`) are adopted by
`features/persona/components/persona-panel-row.tsx`, `persona-row-name-column.tsx`,
`features/chat/components/chat-summary-row.tsx`, `message-actions-row.tsx`, `reaction-picker.tsx` — and
**not** by `features/character/components/character-card.tsx:266-278`, which uses `ROW_REVEAL` alone.

**COLLISION WITH A PRIOR RULING — stated in full.** `docs/reviews/side-eye/2026-09-02-characters-rail-drive.md`
lists, under **WHAT IS GENUINELY WORKING (do not touch)** item 1, "it correctly goes always-visible at coarse
pointer", and in its taste section "The row actions correctly go always-visible on coarse". **That ruling
survives and I am not reversing it** — always-visible at coarse is the correct affordance, and hover-only
would be a P0 on touch. What that pass did not check is the second half of the same rule: the coarse cluster
must be **one** control, not three. `row-reveal.ts` says both halves in one sentence. The fixer's job is
therefore satisfy-the-new-symptom / preserve-the-old-mechanism: keep `ROW_REVEAL`'s
`pointer-coarse:opacity-100`, add the `ROW_ACTION_INLINE`/`ROW_ACTION_OVERFLOW` pair, and remember the
coupled site the constants' own header names — a collapsing row's star marker must move to
`ROW_REVEAL_SWAP_COARSE_KEEP` or the row paints neither the state nor the control.

**Why it hurts a user.** The name is the only column a phone reader is reading, and a third of the row is
spent on two verbs that already have a home in the overflow menu.

**Fix.** `adapt:` the character library row's coarse arm — receipt: `--mobile` geometry showing one trailing
control and a title lane ≥ 280px, plus a coarse screenshot in which
`Calamity, Doomblade of the Ninth Epoch` no longer truncates.

---

### \[P2] `Group by tag` at 312 characters groups only the 30 loaded

**What.** With 312 characters in the library, `Group by tag` produces one group, `Uncategorized 30`, under
this line:

> `Grouping the 30 of 312 characters loaded so far — the counts below are this page's, not the library's.`

**Receipt** (`agent-a28cfde5613d26606-833192-2026-09-05T13-51-55-932Z`).

**Why this is a P2 and not a P1.** The copy is **honest** — it names its own limit precisely, which is
better craft than most of this class gets. But the affordance is the library's primary organiser and at real
size it organises 9.6% of the library. A user with 312 cards clicks Group and learns nothing.

**Why it is a defect and not a wish.** Owner-ratified 2026-08-14 (shared-memory
`paged-list-lenses-go-server-side`): "Once a list is paged/virtualized/windowed, EVERY lens on it — search,
sort, tag filter, favorites — must be a server-side query param, or the lens silently means 'search of
whatever is loaded'." The other lenses already comply, and I proved it rather than assuming it:

- **Search is server-side.** `agent-a28cfde5613d26606-836246-2026-09-05T13-52-30-717Z` — typing `Cast 5`
  with 30 rows loaded returns `11 of 312` and mounts `Cast 59 … Cast 50`, rows created ~250 positions past
  the loaded window. Honest.
- **Sort** is the census key and moves the whole set (the header count follows).

Group is the one lens still evaluated over the loaded page.

**Fix.** `distill:`/server-side — the grouping lens becomes a query param like the others, or the control is
disabled past the first page with the reason (the current sentence, promoted from a caption to the control's
own state). Receipt: `Group by tag` at 312 rows produces group counts summing to 312.

---

### \[P2] The section's own title truncates to `Chara…` the moment you open a character

**What.** At rest the list-pane header reads `Characters  312  ⤒  + New`. Open any character (which docks
the context pane and narrows the list pane) and the title becomes `Chara…`.

**Receipts.** Two element shots of the same `.shell-panel-header`:

- rest: `agent-a28cfde5613d26606-846447-2026-09-05T13-54-33-826Z` → `snaps/cb-se-hdr-rest.png` — `Characters 312 ⤒ + New`
- character open: `agent-a28cfde5613d26606-849401-2026-09-05T13-55-01-505Z` → `snaps/cb-se-hdr-open.png` — `Chara… 312 ⤒ + New`

Geometry (`agent-a28cfde5613d26606-853608-2026-09-05T13-55-54-378Z`):

```
aside 272px · header 271px
title lane clientWidth 95px, scrollWidth 127px   (25% clipped, overflow:hidden/ellipsis)
"Import a character card" 32px   "+ New" 74px    (neither shrinks)
```

**Why it hurts a user.** The header's job is to say where you are; it is the first thing that gives up
width, and it gives it up in the state the section exists for. `Chara…` also reads as a rendering bug rather
than a design choice, which cheapens everything around it.

**Fix.** `layout:` the Characters list-pane header at ≤ 290px — the `New` button drops its label to its
glyph (it already has one) before the title truncates; the count moves to a title suffix or the search
placeholder. Receipt: the two element shots above, re-taken, both reading `Characters`.

---

### \[P2] Three form-control borders read below WCAG 1.4.11's 3:1 in both themes

**Receipts.** `--design-audit` `border-contrast`, `candidates=3 judged=3 affected=3`:

| Subject | Hearth | Light |
| - | - | - |
| `[aria-label="Search characters"]` | 1.19:1 | 1.28:1 |
| `[data-slot=select-trigger]` (Sort) | 1.19:1 | 1.28:1 |
| `[data-slot=field-root] > div.flex:nth-of-type(1) > input[data-slot=input-root]:nth-of-type(1)` (Name) | 1.19:1 | 1.28:1 |

Runs `agent-a28cfde5613d26606-627761-2026-09-05T13-20-14-248Z` (Hearth) and
`agent-a28cfde5613d26606-804295-2026-09-05T13-47-13-388Z` (Light).

**Why it hurts a user.** These controls declare a border as their boundary; at 1.2:1 the boundary is not
perceivable, so a low-vision user cannot see where the text field is. Note this is a *border* finding, not a
text one — text contrast on this surface is clean (below).

**Fix.** `colorize:` the input/select border token to clear 3:1 against `--color-background` in all three
shipped themes, or drop the border and carry the boundary on the fill. Receipt: the three subjects above at
≥ 3:1 in Hearth, Mocha and Light.

---

### \[P3] `wide-tracking` 0.08em on the token-count datum

`[aria-label="885 tokens total, 593 permanent — sent every turn"]` carries `letter-spacing: 0.08em` on
running text; the caps-micro tracking step pairs with caps, and this is not caps
(`agent-a28cfde5613d26606-627761-2026-09-05T13-20-14-248Z`; excluded `capsVoice=8`, so the rule did check
the caps case and this subject is not it). `typeset:` the datum voice back to the ramp's own tracking.

---

### \[P3 — stumbled on, en route] Extensions shows a generic CTA instead of the plugin, when the plugin's UI capability is ungranted

**What.** With nine plugins installed and Card Atlas switched **on** but holding none of its six requested
permissions, the Extensions section's LIST pane holds exactly one row and the CONTENT pane repeats the same
button:

```
complementary "Extensions1"
  button "Review what they ask for"   [data-testid="extensions-switcher"] button
main "Extensions content"
  button "Review what they ask for"   (DOM-path locator — the only map row with no semantic identity)
```

`agent-a28cfde5613d26606-754082-2026-09-05T13-40-05-885Z`. Compare the granted state
(`agent-a28cfde5613d26606-560387-2026-09-05T13-10-57-478Z`), where the same locator reads
`button "Card Atlas"`.

**Why it hurts a user.** Nine installed plugins render as one anonymous button with no inventory, so the
section cannot answer "what do I have"; and the same CTA appearing twice on one screen (list AND content) is
the double-empty-state shape. It is also how I lost twenty minutes: the switch reported the plugin ON while
the section showed the consent CTA, which reads as "the toggle did nothing".

Related, same run pair: **granting a plugin's permissions moves its row from position 1 to position 9** in
the Plugins settings list (`agent-a28cfde5613d26606-552034-2026-09-05T13-09-35-969Z` vs the pre-grant
capture) — the thing you just acted on jumps out from under you, and the next click in a scripted or
muscle-memory sequence lands on a different plugin. That is exactly how my first grant attempt after the db
reset silently granted **Affinity Tracker** two permissions instead
(`agent-a28cfde5613d26606-757497-2026-09-05T13-40-45-728Z` shows `Granting 2 permissions.` under Affinity
Tracker).

**Fix.** `onboard:` the Extensions section's ungranted state — the LIST names every installed plugin with its
state, and the CTA lives on the row, not instead of it. And `layout:` the Plugins settings list — a row's
position must not change as a result of acting on it.

---

## #891 — the `2× "chats"` judgment

### It reproduces, and the count is a measurement

| Arm | Run | Result |
| - | - | - |
| desktop, character open, context **docked** | `agent-a28cfde5613d26606-635249-2026-09-05T13-21-20-792Z` | `duplicate-action-door P3 2x button "chats"` · `candidates=2 judged=2 affected=2 populations=1` |
| mobile coarse (`device=coarse:dpr3:430x740`), context overlay | `agent-a28cfde5613d26606-656750-2026-09-05T13-24-41-932Z` | identical `2x button "chats"` |
| desktop, context **collapsed** | `agent-a28cfde5613d26606-627761-2026-09-05T13-20-14-248Z` | rule reports `candidates=0` — the second door is not rendered |
| **POSITIVE CONTROL** — same as row 1 plus a trailing `--eval` planting a third `<button aria-label="Chats">` in `main` | `agent-a28cfde5613d26606-651922-2026-09-05T13-23-56-285Z` | `candidates=3 judged=3 affected=3` · `3x button "chats"` |

So `2` is a measured number, not a floor. (A second planted control, a `color:#8a8a8a` on `background:#909090`
div, fired `contrast: P1 1.08:1` in `…-627761` — the colour family is live on this surface too.)

### The two doors, measured

`agent-a28cfde5613d26606-645636-2026-09-05T13-22-50-793Z`:

```
#context-cell-chats                       BUTTON role=null label=Chats text=Chats aria-current=null
                                          parentRole=toolbar parentLabel=Character
nav[aria-label=Primary] button[aria-label=Chats]
                                          BUTTON label=Chats text=Chats aria-current=null
```

Full selectors from the finding's own detail:

- **A:** `[aria-label=Primary] > div.shell-rail-sections:nth-of-type(1) > div.shell-rail-group:nth-of-type(1) > button.inline-flex[data-slot=button]:nth-of-type(1)`
- **B:** `#context-cell-chats`

Driving B (`agent-a28cfde5613d26606-648645-2026-09-05T13-23-18-328Z`) repaints the CONTEXT pane and nothing
else:

```
complementary "Characters details":
  region "Chats":
    - paragraph: No chats yet
    - paragraph: No chats with Illyria yet — start the first one.
    - button "New chat"
  toolbar "Character": Overview | Chats | Links | Look | History | Trust
```

### Verdict: **NOT one door**

Four independent differences, each measured:

| | A — rail | B — `#context-cell-chats` |
| - | - | - |
| **verb** | navigate the app to another section | switch which facet of the current artifact the context pane shows |
| **scope** | every chat in the library | this character's chats (`No chats with Illyria yet`) |
| **region** | `nav "Primary"` — the RAIL | `toolbar "Character"` — the CONTEXT pane |
| **effect** | replaces LIST and CONTENT; leaves Characters | repaints CONTEXT only; CONTENT untouched |

`docs/architecture/core/UI-Architecture-and-Layout.md` §4.1–4.3 assigns those two jobs to two different
regions and states that CONTEXT is *never navigation*. A rule that groups them has not seen the region. The
prior lane's read was right.

Note what this is NOT: the rule is not generally wrong here. On the same surface it also reports **five**
`2x button "<character name>"` findings at rest (`agent-a28cfde5613d26606-661589-2026-09-05T13-25-15-951Z`) —
the library LIST row and the CONTENT landing's `list "Recently chatted"` row for the same character. That
class is real IA, it is already filed as nit 16 of
`docs/reviews/side-eye/2026-09-02-characters-rail-drive.md`, and it is a **ruling** question (a recents shelf
is a deliberate Nielsen-#7 accelerator), not a fence question. My read: keep the shelf, record the ruling.
The fence below must not silently swallow that class — it is scoped to `role="toolbar"` cells only.

### The fence row, verbatim, for the tooling owner (I did NOT apply it — `tooling/**` is fenced to primary)

**Rule:** `duplicate-action-door` (`tooling/src/ui-audit/contract/rules.ts:48`, family `quality`, `P3`).

**Shape:** the rule already carries a `(container, item)` identity to fold sibling LIST rows into one home
(`census-interactive.ts` `doorListHome`, consumed by `checks-quality.ts` `doorHomes`, #851). The same shape
answers this: a door inside a `role="toolbar"` whose siblings are that toolbar's other cells is a **view
switch of the toolbar's subject**, not a home for the verb its label names.

**Walker half** — `tooling/src/ui-audit/ops/walker/census-interactive.ts`, beside `doorListHome`:

> `doorToolbarHome(el)` — walk up to `LIST_ANCESTOR_MAX` levels for the nearest ancestor with
> `role="toolbar"`; require ≥ 2 sibling cells under it (same "a list needs SIBLINGS" guard `doorListHome`
> already uses, so a lone button in a toolbar is still a real home); publish
> `{ toolbar: doorElementId(anc) }` on the door.

**Node half** — `tooling/src/ui-audit/lib/checks-quality.ts`, in `doorHomes`:

> a door carrying a `toolbar` home is EXCLUDED from cross-region grouping and accounted as
> `excluded(viewSwitchCell)` in `settledPopulationAccounting` — never dropped silently, so
> `candidates = judged + withheld + excluded` still closes.

**Header rationale to carry with it:**

> A `role="toolbar"` cell switches which FACET of the toolbar's subject is shown; it does not offer the verb
> its label names. Measured 2026-09-05 (#891): the rail's `Chats` navigates the whole app to the Chats
> section, while `#context-cell-chats` — a cell of `toolbar "Character"` — repaints the character context
> pane with THIS character's chats (`No chats with Illyria yet`). Same word, two regions, two verbs.
> `UI-Architecture-and-Layout.md` §4.1–4.3 is what makes them different, and a rule that cannot see the
> region reports a false home. The toolbar idiom itself is ratified (#112, `aria-current` + roving tabindex,
> not a tablist), so this is a permanent shape, not a transitional one.

**Pin (two directions, one file, `tests/tooling/ui-audit/…`):** a fixture with one `nav > button[aria-label=Chats]`
and one `[role=toolbar] > button[aria-label=Chats]` produces **zero** `duplicate-action-door` findings; the
same fixture with `role="toolbar"` removed from the second parent produces **one**. Without the second
direction the fence is unfalsifiable.

---

## Instrument findings (report only — `tooling/**` is primary's fence)

### `cohort-anatomy` is firing on inline prose spans (probable false positive, P2 by the fix-tools-as-we-find-them-lying rule)

The rule reports, on the ingested character's greeting:

| Arm | Reported |
| - | - |
| desktop Hearth `…-627761` | `3 of 7 at 69px, 4 at 45px (span\|dialogue\|)` |
| desktop Light `…-804295` | `4 of 7 at 45px, 3 at 21px` |
| mobile coarse `…-656750` | `4 of 7 at 21px, 3 at 45px` |

Subject: `[data-slot=character-greeting-bubble] > div.space-y-0 > p > span.text-dialogue[data-slot=dialogue]`.
These are **inline spans inside one paragraph of running prose**. Their height is a function of how many
LINES each quoted passage wraps to — which is why the numbers change with the viewport and with the theme's
metrics, and why the majority/minority split inverts between arms. That instability is the tell: a
component-size property does not move when you resize the window.

`RULE-AUTHORING.md`'s mechanism-match table is the lens — the rule's premise ("siblings built from ONE
component render at materially different heights") assumes a BLOCK cohort, and an inline span's box height is
not a size property at all. Suggested fence: exclude subjects whose computed `display` starts with `inline`,
or whose `getClientRects().length > 1` (a wrapped inline), accounted as `excluded(inlineWrap)`. Positive
control for the fix: two block siblings of one component at different heights must still fire.

### The `selection-idiom` withholding is not clearable by the remedy it prints

Every `--design-audit` arm here is NO-VERDICT on `selection-idiom: unmatchedUnselected×2`. The finding's own
remedy is "drive the surface into its selected state"; the driven arm
(`agent-a28cfde5613d26606-664882-2026-09-05T13-25-41-752Z`, `--click '[aria-label="Select multiple"]'`) still
reports `population-withheld=quiet-state:unmatchedOff×1+selection-idiom:unmatchedUnselected×1`. Either the
remedy text names the wrong drive for this surface, or the Characters toolbar's selection idiom genuinely has
no twin — either way the Characters surface **cannot currently produce a complete design-audit verdict**, and
that has been true across this pass, the 09-02 pass (which recorded the same `unmatchedUnselected=2`) and the
08-30 pass. Three passes with no verdict is a rule-side row, not a reviewer-side one.

---

## What is clean — with the receipts that prove I attacked it

1. **Text contrast on the ingested character, in both polarities.** `contrast candidates=84 judged=84
   affected=0` in Hearth (`…-627761`) and in Light (`…-804295`), with a **planted 1.08:1 control firing as
   P1 in the same run** — so the rule was live, not asleep. `gray-on-color` 0/84. `text-over-art` fully
   excluded (`flatBackdrop=84`) — the reading surface is a clean plate, not art.
2. **The ingested avatar is not distorted.** `agent-a28cfde5613d26606-623173-2026-09-05T13-19-25-090Z`:
   natural 768×768, box 64×64, `object-fit: cover`, `ar_src 1.000 / ar_box 1.000`; `distorted-image`
   `candidates=13 judged=0 excluded(objectFitCropsOrLetterboxes=13)`. A hub PNG survives the CAS round-trip
   intact.
3. **Tap targets at a real coarse pointer.** `tap-candidates=16 judged=16 affected=0` at
   `device=coarse:dpr3:430x740` (`…-656750`); every row control measures exactly 48×48. The coarse floor is
   met — the finding above is a width BUDGET finding, not a floor finding.
4. **Virtualization holds at 312 rows.** `agent-a28cfde5613d26606-788566-2026-09-05T13-45-17-022Z`: after 60
   wheel steps, `scrollTop 15616 / scrollHeight 16216`, **13 rows mounted** (identical to the count at
   `scrollTop 0`), first `Cast 14`, last `Cast 2`. Budgeted CLS over that scroll:
   `cls 0.5081 · virtualized 0.5077 · **non-virtualized 0.0004**` (budget 0.1) with **0** compositor-dirty
   animations (`…-794617`).
5. **Search is honestly server-side at scale**, and the list says so out loud
   (`30 of 312 loaded`, `Characters 11 of 312`). The Group-by-tag caption naming its own page-local limit is,
   as copy, exactly right — it is the one place in this pass where the app told me its limitation before I
   measured it.
6. **Keyboard.** Eight `--key Tab` stops through the character content
   (`agent-a28cfde5613d26606-822261-2026-09-05T13-49-53-687Z`): Replace portrait → Name → New chat → Hide
   spoilers → Add tag → Suggest tags → Add opening → Edit, **`:focus-visible = true` and a live 1px outline
   at every stop**. No trap, no skipped control, no invisible focus.
7. **Lighthouse desktop on the ingested character:** accessibility **100**, best-practices **100**, SEO
   **100**, 34 audits, one failure — `label-content-name-mismatch`, 22 nodes, all
   `div.@container/list-row > button.group` list rows. That is the owner-accepted Label-in-Name exception the
   08-30 pass recorded; the only delta is that its node count now scales with the library (6–10 → 22).
   Report: `…-826232/lighthouse/root.json`.
8. **Console: 0 errors, 0 page errors, in every one of ~30 runs.**

---

## Taste & flow verdict (the blunt call)

**The Card Atlas panel looks good and reads well.** The result grid is calm, the detail view puts the cover
art, the creator and the download/like/message counts where a browsing eye wants them, and the copy
("Search to begin — the atlas covers nine community hubs") is the right length. This does not look like AI
made it. It looks like someone who has used a card hub made it.

**But the import has no ending.** You click the one button the whole surface exists for and the screen
barely changes: the button stays `Add to library`, and a grey line appears telling you it was already there.
There is no "here it is", no count, no link. The most important moment on the surface is the flattest one.
That is the single thing I would fix first for feel, independent of the P1.

**The Characters surface at 312 rows is denser than it is heavy, and that is a compliment.** The list stays
responsive, the count is honest, and the progressive `30 of 312 loaded` footer is quietly excellent — most
apps would show a spinner and lie. What breaks the spell is `Chara…`: a section that truncates its own name
the moment you use it reads as unfinished, and it is the first thing the eye lands on.

**The context pane is the best-composed thing here** (the 09-02 pass said so and it is still true) — and it
is also where the P1 lives, which is the cruel part: the pane you trust is the pane telling you the wrong
thing. `Made here` sits two lines above `Added 1m ago`, in the same typographic voice, with the same
confidence.

**Empty space.** On the Overview tab with a fresh character the context pane spends its bottom ~400px on
nothing (see `snaps/cb-se-illyria-light.png`). Six tabs across the foot, three short groups at the top, and a
void between. Not broken, but unbalanced — the pane looks like it lost something.

**IA (§13 single-homing), scoped to what I drove.** Two concepts have two homes on the ingest path:
**Tags** (rendered in the character CONTENT as `TAGS Empty + Add tag` and again in the CONTEXT pane as
`TAGS / Applied Empty`), and the **already-in-library state** (the hub row badge and the detail-view
sentence, which disagree in tone: the badge says a fact, the sentence says an outcome). Neither is severe;
both are worth folding. The `2× "chats"` pair is explicitly NOT one of these — see the judgment above.

**Cold-start test.** A first-timer landing on Extensions with nine plugins installed sees one button reading
`Review what they ask for` and cannot name a single thing they have installed. That fails the five-second
test outright.

---

## Retractions

**One, mine, published.** Mid-pass I read the list-pane header as permanently truncated ("Chara…") from the
`agent-a28cfde5613d26606-600103` and `…-804295` screenshots and was about to file it as an
always-on defect. The measurement refutes that: at rest the title lane is 127px of 127px needed and reads
`Characters` in full (`agent-a28cfde5613d26606-846447-2026-09-05T13-54-33-826Z`). The truncation is
**state-dependent** — it appears only when the context pane docks and the list pane narrows 307 → 272px. The
finding above states the narrower, true claim. The receipt that killed the wrong one is the pair of
element shots plus the two width measurements.

**Nothing inherited was overturned.** The 08-30 pass's two NOT-REACHED rows are now reached and its guess
that the hub arm would expose a provenance gap is confirmed. The 09-02 pass's coarse-affordance ruling
survives — see the collision note under the coarse finding.

---

## Instrument coverage

| # | Instrument | Status |
| - | - | - |
| 1 | `snap --map` | **RAN** — Characters (48 controls, 0 DOM fallbacks, 41 actionable), Extensions granted (22/0) and ungranted (22 controls, **1 DOM fallback** — itself the finding) |
| 1 | `snap --aria` / `--text` | **RAN** — ~12 captures: the bell, the consent dialog, the plugins region, the atlas panel (results + detail + post-add), the character content, the context pane in Overview / Provenance / Chats |
| 1 | `snap --contrast` | **DELEGATED to `--design-audit`'s `contrast` rule** (84 judged, 0 affected, both themes) with a planted 1.08:1 positive control firing. No hand `--contrast` line was needed; stated rather than skipped silently |
| 1 | `snap --eval` | **RAN** — ~20: appearance handles (root + `.shell-grid`), avatar natural/box/aspect/object-fit, both `chats` doors' identity, coarse row geometry, header clip chain ×2, virtualizer census ×2, `__orb.motion()` ×3, `__orb.animations()`, focus census ×8 |
| 1 | `snap --matrix` | **SKIPPED** — a 16-cell pairwise sweep is a ninth concurrent browser against the ~6/origin SSE budget while the stage was already carrying a 312-row library; the two theme arms + two device arms + four pane states were taken by hand instead |
| 1 | `snap --json` | **SKIPPED** — the terminal console never approached the 200-message cap (max 75 in any run) |
| 1 | `snap --watch` | **SKIPPED** — no streaming surface on this path; the import's post-click window was covered by an argv `--pause` + full `--aria` |
| 2 | `--design-audit` desktop, character open, context collapsed | **RAN — NO VERDICT** (`selection-idiom:unmatchedUnselected×2`). `…-627761`, census 507, findings 6 (1 = my plant) |
| 2 | `--design-audit` desktop, context **docked** | **RAN — NO VERDICT.** `…-635249`, census 599 — the arm that reproduces `2x button "chats"` |
| 2 | `--design-audit` **`--mobile`** (coarse, dpr3) | **RAN — NO VERDICT.** `…-656750`, census 283, `pointer=coarse`, `tap-affected=0` |
| 2 | `--design-audit` Characters at rest (no character open) | **RAN — NO VERDICT.** `…-661589`, census 377 — the five per-character doors |
| 2 | `--design-audit` driven (`Select multiple`) | **RAN — NO VERDICT.** `…-664882` — the arm that was supposed to clear the withholding and did not; see instrument findings |
| 2 | `--design-audit` **`--theme Light`** | **RAN — NO VERDICT.** `…-804295`, census 634, `theme-light=526 theme-dark=0` |
| 2 | design-audit **positive controls** | **RAN ×2** — a planted low-contrast div fired `contrast P1 1.08:1` (`…-627761`); a planted third `<button aria-label="Chats">` moved `duplicate-action-door` 2 → 3 (`…-651922`) |
| 3 | `snap --motion` | **SKIPPED in favour of `__orb.motion()`** — the 08-30 pass recorded that the motion arm correctly REFUSES on this surface (0 PipelineReporter frames; it is static after nav). Numbers taken from `__orb.motion()` over a real 60-step scroll instead |
| 4 | `snap --perf` | **SKIPPED** — box loadavg ran 24–52 on 24 cores for the whole window; every run carried `load-suspect=app-snapshot`. A responsiveness number taken there would not be a verdict. Named as a gap, not claimed |
| 5 | Lighthouse **desktop** | **RAN** — `…-826232`, a11y/BP/SEO 100, 34 audits, 1 failure (the ruled `label-content-name-mismatch`, 22 nodes) |
| 5 | Lighthouse **mobile** | **SKIPPED** — `--design-audit --mobile` is the authoritative coarse tap-target receipt and it ran; the desktop arm's only failure is theme- and device-independent |
| 6 | `__orb.motion()` / `.animations()` | **RAN ×3** — boot at 312 rows (`cls 0.0127 / non-virt 0.0127`, `worstBlocking 530ms`), after a 60-step scroll (`non-virt 0.0004`), animations `n=0 dirty=0` |
| 6 | `__orb.renders()` / `.snap()` | **SKIPPED** — no churn symptom surfaced; the console's own `[perf] slow commit region:list` lines carried the same signal (below) |
| 7 | Console triage | **RAN** — table below |
| 8 | PNGs actually looked at | **RAN** — 5 read: context pane (Hearth), full surface (Light, 312), mobile 430 coarse, and the two header element shots that produced the retraction |
| 9 | Keyboard walk | **RAN** — 8 bare `--key Tab` stops with `document.activeElement` + `:focus-visible` + computed outline read at each (`…-822261`). Scope stated honestly: this is a CONTENT-region walk that began from the topbar's `Show details`, not a from-the-top walk including the skip link (the 09-02 pass covers that) |
| 10 | Appearance arm — owner/`defaults` | **RAN** — probed live off `<html>` + `.shell-grid`, not assumed |
| 10 | Appearance arm — `maximal` / `compact` / `reading` / `diagnostics` | **SKIPPED** — budget went to the scale arm; the 09-02 pass ran them at 10 rows and this pass adds no density-dependent finding that they would move. Named, not silent |
| 10 | `--full-motion` | **SKIPPED** — the owner arm already carries `data-reduced-motion=false` (probed) |
| 10 | Theme arm — `--theme Light` | **RAN** — with a **computed** polarity receipt, per the standing rule: `data-theme=light`, body `oklch(0.98 0.004 75)`, rail `oklch(0.955 0.006 72)`, fg `oklch(0.24 0.01 60)`, and the run's own `theme-light=526 theme-dark=0`. My eye was not the instrument |
| 10 | Theme arm — Mocha | **SKIPPED** — named. The three shipped themes are Hearth/Mocha/Light and this pass covered two |
| 11 | Pane state — list docked + context collapsed | **RAN** (`…-627761`, `…-661589`) |
| 11 | Pane state — list docked + context **docked** | **RAN** (`…-635249`, `…-804295`) — the arm that produces both the `chats` door and the header truncation |
| 11 | Pane state — mobile, list collapsed + context **overlay** | **RAN** (`…-656750`, `…-812708`) |
| 11 | Pane state — list collapsed + context docked | **SKIPPED** — covered by the 09-02 pass; no width-dependent finding here turns on it |
| 12 | Retained-section inventory (`--map --include-hidden`) | **SKIPPED** — the `dom-retained-hidden` counts were read off every design-audit RESULT line instead (348–525 retained nodes per arm) and no scored claim in this report rests on hidden DOM |
| — | **Hub-ingest arm (#844)** | **RAN — the point of the pass.** Consent granted, plugin enabled, live hub searched, **two** real cards imported, both reviewed end to end |
| — | **Scale arm (#844)** | **RAN at 312 characters** (300 seeded + 10 default + 2 hub-ingested), stated count |
| — | Destructive-action confirmation (row/bulk Delete) | **NOT TESTED** — out of scope for both rows |

### Console triage

| Class | Count / worst | Disposition |
| - | - | - |
| `console errors` / `page errors` | **0 / 0** across ~30 runs, every arm | clean |
| `[frame] long frame … blocking …` @ `main.tsx` / `authed-app.tsx` / `modern-*.js` | 512ms frame / 461ms blocking worst; also 293/243, 214/148, 211/161 | **known-ruled** boot family (#433) — **and load-suspect**: loadavg 24–52 on 24 cores throughout, every run stamped `load-suspect=app-snapshot`. Read as evidence, not verdict |
| `[perf] slow commit region:list` | 63ms (mount), 167ms / 124ms / 32ms / 14ms (nested-update) at **312 rows** | **INVESTIGATE, load-suspect.** The 08-30 pass measured a 78ms worst long task at 10 rows. I did NOT control for load, so I do not claim a scale delta — but a quiet-tree re-run of section entry at 312 rows is owed before anyone calls this fine |
| `[drop] … rendered frame mid-animation · aside[aria-label=Characters list]` | 1 per section entry | **already filed** — the 08-30 pass's P3 for exactly this selector |
| `[drop] … · [data-slot=weave-veil]` | 1 at boot | **known-ruled** boot splash |
| `[reflow] forced synchronous style/layout` @ `view-transition.ts`, `performWorkUntilDeadline` | 6–27ms ×3 | **known-ruled** — inside the boot frames above |
| `[cls] shift 0.0x unexpected · [role=region] moved 0px,-Npx` | within budget | boot settle; budgeted CLS 0.0127 / 0.0004 |
| vite dep-optimizer `ERR_ABORTED` ×6 on the cold stage boot | 1 run | **instrument/environment** — snap names them as dep-optimizer churn itself; the run refused (`nav=ERROR`, `data-app-ready DEGRADED`) and was re-run warm. Not a product finding |

### Artifact slots (immutable; every citation above is one of these)

All under `reports/runs/snap/<runId>/`. The full id list, in drive order:
`…-533101` `…-548205` `…-552034` `…-556839` `…-560387` `…-567278` `…-572989` `…-580167` `…-596773`
`…-600103` `…-604057` `…-614138` `…-617302` `…-623173` `…-627761` `…-635249` `…-645636` `…-648645`
`…-651922` `…-656750` `…-661589` `…-664882` `…-754082` `…-757497` `…-762182` `…-768411` `…-774781`
`…-782703` `…-788566` `…-794617` `…-804295` `…-812708` `…-816684` `…-822261` `…-826232` `…-829405`
`…-833192` `…-836246` `…-846447` `…-849401` `…-853608` — all prefixed
`agent-a28cfde5613d26606-` and dated `2026-09-05`.

---

## The single biggest opportunity

**Make provenance a first-class fact of the import path, and the whole Characters surface gets more honest
at once.** One field — the ingest funnel stamping `importedFrom` — fixes the P1, revives the
`findByImportedFrom` oracle that the hub markers were designed around, and gives the library the axis it is
currently missing at scale: with 312 cards and a dead tag lens, "mine vs downloaded" is the one grouping a
real user actually wants, and the app already computes it (`characterProvenanceOf`, three closed arms) for
every row of both read models. The shelf exists; nothing is putting anything on it.

---

## State left behind

The isolated stage on **band 2** (`883a58b960ca`, `:5293` / `:8908`) is left **UP and warm**, holding: Card
Atlas granted + enabled, 312 characters (300 `Cast N` + 10 defaults + `Illyria` + `Rebecca`), and two seeded
chats. It is disposable — `pnpm snap --stage-down` from this checkout releases it. I did not tear it down in
case the orchestrator wants a fix lane to re-verify against the same population; if band 2 is needed, reap
it. `reports/` artifacts are gitignored.

---

## Issue summaries for the board (orchestrator pastes these)

**#844 — RESOLVED as coverage; produces one NEW P1.** Both NOT-REACHED arms are now driven. The
hub-ingested arm: consent → enable → live hub search → two real cards imported (`Illyria` by
`damagecontrol`, `Rebecca` by `paradigme`, Character Tavern). Verdict on the arm: avatar, editor tabs,
context pane, contrast (84 judged / 0 affected, both themes, planted control firing), coarse tap targets
(0 affected at `coarse:dpr3:430x740`), keyboard (8/8 `:focus-visible`) and Lighthouse (100/100/100) are all
clean. The scale arm at **312 characters**: virtualization holds (13 rows mounted at any depth over a
16 216px track), non-virtualized CLS **0.0004**, search is honestly server-side (`11 of 312`, reaches rows
~250 past the loaded window), and the list states `30 of 312 loaded`. Note the brief's button label is
stale — the hub CTA reads **"Add to library"**, not "Summon to your library".

**NEW — P1 · character: a hub-ingested card reports `Source: Made here`.** A card downloaded from
character-tavern.com through Card Atlas shows `ORIGIN / Source: Made here` in the context pane, on the same
surface that displays `Creator: damagecontrol` and `Import hash: a22826b0…`. Mechanism:
`entry/compose/services.ts:866-878` calls `importCharacter({ card: { bytes } })` with no `filename` →
`domain/import/verbs/import-character.ts:205` writes `importedFrom = NULL` →
`contracts/src/character/index.ts:84` `characterProvenanceOf` returns `authored` →
`character-overview-card.tsx:159` prints "Made here". This is #843/#865's ruling meeting a THIRD writer, not
a reversal: preserve the derivation, give the plugin funnel a provenance string (the manifest-fenced hub host
is already known). Same root kills `findByImportedFrom` (`character/contract/service.ts:145-147`), which
exists to back the hub's already-imported markers and can never match a plugin-ingested row. Receipts:
runs `agent-a28cfde5613d26606-600103` / `-804295` / `-829405` (2026-09-05), reproduced on two cards in two
databases and in two themes.

**NEW — P2 · characters (mobile): the library row keeps three inline actions at coarse pointer.** Star +
Chat + Actions are each 48×48 and permanently visible, spending 156 of a 413px row and leaving the title lane
195px, where `Calamity, Doomblade of the Ninth Epoch` truncates. `packages/client/src/components/row-reveal.ts:47-56`
states the rule ("at `pointer: coarse`, a row's SECONDARY affordances collapse into its ONE overflow
control … the affordance is right, the BUDGET is not"); the `ROW_ACTION_INLINE`/`ROW_ACTION_OVERFLOW` pair is
adopted by the persona and chat rows and not by `features/character/components/character-card.tsx:266-278`.
**This does not reverse the 2026-09-02 ruling** that always-visible-at-coarse is correct — it adds the second
half that pass did not check. Coupled site: a collapsing row's star marker must move to
`ROW_REVEAL_SWAP_COARSE_KEEP`. Receipt: run `agent-a28cfde5613d26606-816684`.

**NEW — P2 · characters: `Group by tag` at 312 rows groups only the 30 loaded.** Self-declared
("Grouping the 30 of 312 characters loaded so far — the counts below are this page's, not the library's"),
so honest, but the library's primary organiser organises 9.6% of it. Search and sort already comply with the
owner-ratified 2026-08-14 paged-lens law; Group is the one client-side lens left. Receipts: runs
`agent-a28cfde5613d26606-833192` (group) and `-836246` (the search control that proves the law is otherwise
met).

**NEW — P2 · characters: the list-pane title truncates to `Chara…` when a character is open.** Docking the
context pane narrows the list pane 307 → 272px; the title lane gets 95px of the 127px it needs while `+ New`
(74px) and the import glyph (32px) do not shrink. Receipts: element shots
`agent-a28cfde5613d26606-846447` (rest: `Characters`) vs `-849401` (open: `Chara…`), geometry `-853608`.

**NEW — P2 · plugins/atlas: a first-time import produces no confirmation and shows "Already in your
library".** Reproduced 3×, including on a card's first-ever import: 2.5s after `Add to library` the
accessible tree holds no `status`/`alert`, the button still reads `Add to library`, and the only new text
asserts the card was already there. Also P2: the hub result row's `in your library` badge is overridden by
`aria-label="Illyria, damagecontrol · 2.8k↓"`, so a screen-reader user cannot tell owned rows from unowned.
Receipts: runs `agent-a28cfde5613d26606-774781`, `-768411`, `-580167`, `-617302`.

**NEW — P2 · plugins: the Extensions section with an ungranted-UI plugin shows one anonymous CTA.** Nine
installed plugins render as a single `button "Review what they ask for"` in the LIST and the identical button
again in CONTENT (the only map row on the surface with no semantic identity). Related: granting a plugin's
permissions moves its row from position 1 to position 9 in Plugins settings, which silently redirected a
subsequent click onto a different plugin. Receipts: runs `agent-a28cfde5613d26606-754082`, `-757497`,
`-552034`.

**NEW — P2 · characters: three form-control borders read 1.19:1 (Hearth) / 1.28:1 (Light), under WCAG
1.4.11's 3:1** — `[aria-label="Search characters"]`, `[data-slot=select-trigger]`, the Name
`input[data-slot=input-root]`. Receipts: runs `agent-a28cfde5613d26606-627761`, `-804295`.

**#891 — RESOLVED: NOT one door; the remedy is a `tooling/**` fence, not a client change.** `2× button
"chats"` is `nav[aria-label=Primary] > … > button` (global section navigation — leaves Characters, loads the
Chats section) and `#context-cell-chats` (a cell of `toolbar "Character"` that repaints the CONTEXT pane with
THIS character's chats: `No chats with Illyria yet — start the first one`). Different verb, scope, region and
effect; `UI-Architecture-and-Layout.md` §4.1–4.3 assigns the two jobs to two regions and says CONTEXT is
never navigation. Reproduced desktop and mobile-coarse; the count is a measurement (planting a third door
moved it 2 → 3). The fence: publish a `doorToolbarHome` beside `doorListHome` in
`tooling/src/ui-audit/ops/walker/census-interactive.ts` and exclude toolbar-homed doors from cross-region
grouping as `excluded(viewSwitchCell)` in `tooling/src/ui-audit/lib/checks-quality.ts`, with a two-direction
pin. Full fence text + rationale in the review. Separately, the same rule's five `2x button "<character
name>"` findings on the Characters landing (list row vs the `Recently chatted` shelf) are the already-filed
nit 16 of the 2026-09-02 pass and are a RULING question, not a fence one — the fence above must stay scoped
to `role="toolbar"`. Receipts: runs `agent-a28cfde5613d26606-635249`, `-656750`, `-651922`, `-645636`,
`-648645`.

**NEW — P2 (instrument) · `cohort-anatomy` fires on inline prose spans.** Three arms report different
majority/minority splits for the same `span[data-slot=dialogue]` cohort (69/45px desktop, 45/21px Light,
21/45px mobile) — the heights are line-wrap counts, not component sizes, and they move with the viewport.
Mechanism mismatch per `RULE-AUTHORING.md`; suggested exclusion `inlineWrap` for computed `display: inline`
or `getClientRects().length > 1`, with a positive control keeping block cohorts firing. Receipts: runs
`agent-a28cfde5613d26606-627761`, `-804295`, `-656750`.

**NEW — P3 (instrument) · Characters cannot produce a complete design-audit verdict.** Every arm across three
passes (08-30, 09-02, this one) is `population-verdict=NO-VERDICT` on `selection-idiom:
unmatchedUnselected×2`, and the finding's own printed remedy (drive the selected state) does not clear it —
the driven arm adds `quiet-state:unmatchedOff×1` and still withholds. Receipt: run
`agent-a28cfde5613d26606-664882`.

---

## Proposed memory lesson (the orchestrator owns the write)

**Index line:**
`- [seeder bricks a stage](chat-seeder-owner-handles-bricks-a-snap-stage.md) — a stage seed with the dev .env's OWNER_HANDLES renames the stage owner row and 500s every request`

**Body:**

> ---
>
> name: chat-seeder-owner-handles-bricks-a-snap-stage
> description: "Seeding a snap stage db with OWNER_HANDLES from the dev .env makes boot's adoptMovedSeedKey RENAME the stage's owner row; the stage server's dev fallback principal then asks for handle `owner`, ensureUser refuses, every request 500s, and the app takes its own destructive-reset path — backing up the db and re-seeding defaults. Use OWNER_HANDLES=owner."
> metadata:
> type: project
> -------------
>
> Measured 2026-09-05 (cb-characters-sideeye, #844's scale arm). `node tooling/src/seed/cli.ts chat --characters 300` against `DATABASE_URL=file:<stage>/orbweaver.db` with `OWNER_HANDLES` copied from
> `<repo>/.env` completed exit 0 and reported 312 characters — and the stage was dead. `seedOwner`
> (`packages/server/src/entry/boot/seed-owner.ts:97-100`) calls `adoptMovedSeedKey`, which RENAMES the
> existing `role='owner'` row's handle to `OWNER_HANDLES[0]`. A `snap --isolated` stage boots under
> `ORB_ENV_NO_FILE` and resolves its dev FALLBACK principal as handle `owner`; after the rename
> `ensureUser("owner")` refuses ("a row already holds role='owner' under a different handle") and every
> request returns 500. The app then took a destructive reset — wrote `orbweaver.db.backup-<epoch>` beside
> the db and re-seeded the ten default cards — so the seeded population AND anything imported during the
> session were gone with no message in the drive.
>
> **How to apply.** Any lane seeding a snap stage exports `OWNER_HANDLES=owner` (the stage's own fallback
> handle), never the dev `.env` value; the other two inherited keys (`CREDENTIALS_KEY`) and
> `ORB_ENV_NO_FILE=1` are still required. Recovery, if it happens: re-run the SAME supported code path with
> `OWNER_HANDLES=owner` — `adoptMovedSeedKey` renames it back and `/healthz` returns 200 — never a raw
> UPDATE on a live WAL db. And re-take every receipt after the reset: the rows you measured before it no
> longer exist. Related: \[\[stage-db-is-a-fresh-dev-copy]], \[\[sentinel-key-proves-a-destructive-reset]],
> \[\[seeded-data-never-verification]].
