# Visual blech audit — list panes, character detail, context-panel meta tabs vs the RPG bar

- kind: stickler review (visual/design special brief, owner-directed)
- date: 2026-08-01
- instrument: `pnpm snap` against a `--dirty` snap-stage (working tree incl. all in-flight lanes,
  copy of the real dev DB, HMR-immune, base `http://localhost:5273`). Every PNG below lives in
  `reports/snaps/` (gitignored — re-capture commands are in the verification log).
- judgment frame: `docs/design/density-pass-spec.md` (APPROVED law) — tier map §3.1, chrome diet
  §3.2 (CD1–CD3), four-voice grammar §2.3; the RPG scene tab as the quality reference.
- caveat honored: ~5 concurrent lanes are uncommitted. Every finding was checked against
  `git status`/`git diff` — findings in files a lane is mid-editing are labeled **in-flight**.

---

## Findings — most damaging first

### F1 — Characters list: the search box is a 26px blank square (rendered defect, unusable)

- PNG: `chars-list-wide.png`, `chars-list-1280.png`
- What I see: row 2 of the library toolbar is `[blank ~26px square] [«Recent» select ~299px] [Group]`.
  There is no visible search box; the blank square IS the search input.
- Evidence (this session): `--eval` computed geometry — `input[aria-label="Search characters"]`
  → `{x:64, width:26, height:32}`; `[aria-label="Sort characters"]` trigger → `width:298.5`.
  The `flex-1` Input (`character-library-toolbar.tsx:59`) is crushed to its ~26px minimum because
  the sort `Select` sizes itself to its longest item ("Smallest cards") and nothing caps it.
- Rule: done ≠ rendered (doctrine). Also toolbar header comment promises "a returning user just
  starts typing — rule 6" — the affordance is invisible, so the promise is broken.
- File: `packages/client/src/features/character/components/character-library-toolbar.tsx` (committed,
  NOT in any in-flight diff).
- Direction: cap/fix the Select trigger width (fixed basis or `min-w-0` + truncate) so the Input
  keeps real width; search is the row's primary control, the sort is secondary.

### F2 — Character editor hero: the portrait overflows its box and clips the "Name" label

- PNG: `char-detail-wide.png`, `hero-crop-crop.png` (the close-up)
- What I see: the avatar image overlaps the "Name" field label — the label's leading glyphs sit
  under the portrait's hair. Reads as a broken layer, on the editor's centerpiece band.
- Evidence: `--eval` geometry — portrait Button box `34×34 @ x836–870`, the Avatar image inside it
  `64×64 @ x821–885`, label left edge `x882` → the image overflows its button ~15px on every side
  and crosses the label. Cause visible in `character-hero-band.tsx:136–147`: `Button size="icon"`
  keeps its fixed icon square; the `size-auto` className does not win, so the `size="hero"` Avatar
  paints outside it.
- Consequences beyond the clip: the real click target for "Replace portrait" is 34×34 — below any
  touch-target floor (a DEFERRED gate area → no automated coverage; this review is the check).
- File: `packages/client/src/features/character/components/character-hero-band.tsx` (committed; the
  in-flight character lane touches `character-appearance-tab.tsx` only — this is not lane debris).
- Direction: size the Button from its content (drop `size="icon"` for this trigger, or a real
  `size="hero"` button variant); assert the rendered box equals the avatar box in a CT.

### F3 — Character editor: 12 giant blue suggestion pills own the surface (CD3 violation)

- PNG: `char-detail-wide.png`
- What I see: "SUGGESTED" renders 12 large `intent="info"` (blue) pills, each with a sparkle icon +
  accept + reject buttons, wrapped over four rows. They are the loudest thing on the entire screen —
  louder than the one primary CTA (amber "New chat"), louder than the character's own name, and in
  a hue the surface otherwise never uses.
- Rule: CD3 (§3.2) — "one focal element per surface… exactly one element may carry accent fill at
  rest." Twelve accent-filled pills at rest. Also §1 "uniform visual weight" habit, inverted:
  here the WRONG thing carries all the weight — metadata suggestions outshout identity and content.
- File: `packages/client/src/features/character/components/character-tag-suggestions.tsx:44`
  (`Badge intent="info"` per suggestion; committed, not in-flight).
- Direction: suggestions are pending metadata — quiet outline/ghost chips in the muted tone, one
  row with overflow ("+7 more"), accept on click, one "review all" affordance. Reserve fill for the
  accepted-tag state, and never `info` blue on this surface.

### F4 — Context panel opens to a full-height empty inspector on character detail

- PNG: `char-detail-wide.png`, `char-detail-scroll1.png`
- What I see: opening the detail panel on a character lands on "Field" → 480×1000px of
  "Open a field to inspect it." Both other surfaces (editor + list) are populated; the panel
  contributes nothing until you drill a facet.
- Rule: §3.1 — the context panel is INSTRUMENT tier ("read-mostly, glanceable, many data per cm²").
  An instrument surface whose resting state is 0 data per cm² fails its tier. The RPG comparison:
  the same panel on a game chat lands on Status/roster with real data.
- Contrast with available data: the editor already holds token counts (1703 total · 1277 permanent),
  provenance (`midg · main`), chat count, tags, greeting count — an overview card exists for free.
- File: `packages/client/src/features/character/lib/characters-section.tsx` (tab order: field first,
  no `defaultTab` logic; committed).
- Direction: default the character context to a populated tab (Links/Options) or make Field's empty
  state an overview instrument card (counts · provenance · last-chatted · tag summary), with the
  "pick a field" hint as its footer, not its entirety.

### F5 — Presets list: nine identical rows, zero scent (the "samey/underutilized" poster child)

- PNG: `presets-list-wide.png`
- What I see: "Default", then NINE rows all titled "Default (edited)" — no subtitle, no timestamps,
  no kind, no differentiator of any sort. Impossible to pick one on purpose.
- Underutilized data (named, per the brief): `PresetSummary`
  (`packages/server/src/domain/preset/contract/views.ts:10`) carries `kind`, `createdAt`,
  `updatedAt` — the row (`preset-library-row.tsx`) renders `name` only (+ "Built-in default" for
  the system row). Relative `updatedAt` alone would fully disambiguate these nine.
- Second-order defect the surface exposes: Duplicate mints colliding names ("Default (edited)" ×9)
  with no numbering — a data-hygiene papercut the row's poverty makes fatal.
- Rule: §3.1 LIST tier intent — instrument rows exist to be scanned; a row that cannot be told from
  its neighbor has no scan value. RPG comparison: the roster card distinguishes two entities with
  mood/status in ~70px; this list can't distinguish nine with a full pane.
- Direction: subtitle = `edited <relative updatedAt>` (+ kind when ≠ default); number duplicate
  names at mint time ("Default (edited) 2").

### F6 — The bracket layout, judged on its rendered merits (owner asked directly)

- PNG: `ctx-panel-full-crop.png` (full panel), `chat-ctx-settings.png` (meta tab active),
  `chat-ctx-rpg-scene.png`
- The law (CP-4 §4.2) says game strip above the viewport, meta strip below. As rendered, four real
  problems, one strength:
  1. **Selection vanishes across the gap.** With "This chat" active (bottom), the TOP strip shows
     six unlit glyphs — no dimming, no echo — and the two strips are ~870px apart. One-selection-
     across-two-strips is invisible; the game strip reads as a dead icon toolbar and the body's
     ownership is unstated. (`chat-ctx-settings.png`.)
  2. **The top strip is icon-only at the panel's one real width.** At the standard 480px docked
     panel the container-responsive labels NEVER show; the resting vocabulary is six ambiguous
     glyphs (Drama vs Flag vs BookOpen need hover). The "compressed form" is the permanent form.
  3. **The bottom strip reads as buttons, not tabs.** "This chat" / "Preview" render as gray
     rounded blocks; the crown ("Game", host door) is icon-only + cryptic. Nothing says "these are
     more tabs of the same panel" — the visual grammar says "action bar."
  4. **The panel doesn't spend its vertical budget.** On this chat the scene body ends ~640px and
     the meta strip sits at ~1040px — a ~400px dead zone pinned open by the bracket, while the
     waystone header burns ~140px on a dial + one line ("No ambient set").
  - Strength worth keeping: state-vs-administration is a REAL split, and the pinned bottom strip
    does keep admin reachable mid-scroll.
- Owner context (mid-review): the chrome-unification / shell-lockdown seams (the `.shell-panel-header`
  band, the panel tab-strip slots, the pinned panel edges) were carved BEFORE the HUD was planned to
  take over part of the content pane. That matches what the pixels show: the symptoms above are less
  "the bracket is a bad tab design" and more "a HUD is renting a generic details-panel's chrome slots"
  — the waystone squeezed into a band slot sized for a label, game-state tabs wearing the same strip
  grammar as admin tabs, and the HUD's vertical rhythm fighting a panel that was chromed for
  scroll-a-list content. The fix likely lives at the SEAM level, not inside the strips.
- Direction (not a redesign): first decide whether the HUD keeps renting the context-panel seams or
  gets its own takeover region contract (band + strips + body as one HUD-owned composition — which
  the shell lockdown docs would then ratify). If it keeps renting: make selection legible across
  strips (dim the non-owning strip, or an active-tab echo/breadcrumb in the band); give the bottom
  strip tab grammar (shared underline/tint vocabulary + a "CHAT" kicker) or fold it into the panel
  header; let the waystone compress to a slim band when ambient-less; consider the body's empty tail
  as the place the meta strip docks when content is short.

### F7 — Chats list: flat rows that hide their own states (samey by omission)

- PNG: `chats-list-wide.png`
- What I see: five rows of identical shape — hue-blob initials avatar, title, subtitle, time. Two
  adjacent rows literally both titled "You, Niko". A live RPG chat ("Nate, Azarael" — it has the
  full game panel) is indistinguishable from anything else.
- Underutilized data (named): `ChatSummary`
  (`packages/server/src/domain/chat/contract/views.ts:50`) carries `star`, `archived`,
  `parentChatId` (fork marker), `viewerRole`, `participantCharacterIds`. None are rendered. And
  `participantCharacterIds` + the already-loaded character list cache could resolve REAL portraits
  (Azarael has one) instead of initials blobs — the avatar slot is spending its pixels on noise.
- Rule: §3.1 LIST tier ("many data per cm²… density is the feature") + the RPG bar: the roster card
  shows identity + mood + status per entity; the chat row shows two text lines it already printed
  in the title.
- Direction: portrait (resolved via participant ids) over hue-blob; a quiet star glyph when
  starred; a tiny game marker (crown/d20) for rpg chats; archived rows visibly receded. A
  last-message snippet needs a contract field — flag for the workboard, not free today.

### F8 — Meta-tab voice: title-case bold headers where the panel grammar is kickers

- PNG: `chat-ctx-settings.png` vs `chat-ctx-rpg-scene.png` / `chat-ctx-rpg-inventory.png`
- What I see: the RPG tabs speak the four-voice grammar — caps-micro kickers with hairlines
  ("ON STAGE — 2", "JUST NOW", "CARDS", "PACK — 0"), label/datum pairs, italic gloss. Two tabs
  over, "This chat" speaks a different language: "Field overrides", "Injections", "Background",
  "Tool use" as title-case bold body text, four identical "inheriting" dropdown boxes of uniform
  weight.
- Rule: §2.3 (kicker = "a section's name; never a datum" — caps micro + hairline) and §1's
  "uniform visual weight" receipt. Same panel, two grammars = the "everything else feels blech"
  sensation in one screenshot pair.
- Note: §6 sweep S3 covers the context-panel surfaces — this is that stage's work; recorded here
  as the concrete receipt of what S3 must fix (headers → `Section kicker`, override rows keep
  their interactive boxes).

### F9 — Options tab: an 11-row single-column swatch ladder

- PNG: `char-ctx-options.png`
- What I see: Theme → Surface/Message text/Bubbles as eleven stacked rows, each a text label over
  one ~28px swatch, ~70% of the panel width empty on every row; the visible viewport exhausts on
  colors before Trust/Background/History are reachable.
- Rule: instrument-tier context panel (§3.1) carrying form-ladder airiness (§1 habit 2: form
  primitives building instrument surfaces). RPG comparison: the same vertical budget carries the
  entire scene state.
- Direction: label-left/swatch-right compact rows or a two-column swatch grid — halves the height
  without new primitives. (Partly in-flight territory: `character-appearance-tab.tsx` has an
  uncommitted lane touching the Trust rows, but the swatch-column layout is committed — judged.)

### F10 — Landing glow clips to a hard-edged smudge

- PNG: `chats-list-wide.png`, `landing-blob-crop.png`
- What I see: above the "Pick up a thread" wheel, a warm radial glow is cut off by its container's
  top edge mid-gradient → at page scale it reads as a dirty rectangle, not lighting.
- Evidence: element at the point is the landing scroll container (`overflow-y-auto`) — the glow
  paints inside it and clips. Minor polish; it's the first thing on the default route.
- Direction: move the glow to a non-clipping layer or fade it out before the container edge.

---

## In-flight — noted, not judged (re-check after the lanes merge)

- `rpg-scene-tab.tsx`, `rpg-header-band.tsx`, `rpg-gm-scalars.tsx`, `rpg-character-detail.tsx`,
  `tracker-blocks.tsx`, `cast-card-slots.tsx` all carry uncommitted lane edits. The RPG panel was
  judged only as the quality REFERENCE (it holds the bar); its own rough edges were not audited.
- Roster "status…" + "+ condition" placeholders (`chat-ctx-rpg-status.png`) look mid-build —
  tracker lane is actively editing these files → labeled in-flight, re-check after merge.
- The red `❗6 ⚠️0` badge overlapping the bottom-right of the panel in every shot is dev tooling
  chrome (sibling of the TanStack devtools button in the ARIA tree), not product UI — excluded.

## Verified clean

- Empty states across world-info ("No books yet"), inventory ("Empty pack — the story fills it…"),
  cards ("No cards yet — the story crafts them…"), landing quick-picks: honest, actionable,
  on-voice — the empty-states-are-load-bearing bar is met everywhere I looked.
- List-row selection styling (`packages/ui/src/primitives/list-row/variants.ts:16-18`): bg tint
  (`bg-primary/10`) + left accent rail + `rounded-control` — consistent with the §3.1 LIST row
  ("selection = bg tint"); the apparent "box" on the selected row is the tint, not a border box.
- Preview meta tab (`chat-ctx-preview.png`): context meter + per-section token rows + mono block +
  honest count caveat — instrument-tier done right; closest meta surface to the RPG bar.
- deadcss scan: 0 findings on every capture; no failed requests; no page errors (beyond dev perf
  warnings). Contrast: no failures on measured targets; nothing read as an AA risk by eye.
- The bracket's disabled Map tab (lock + reason) and the CP-4 header band mechanics render as
  specified (mechanics verified; the layout critique is F6).

## Not run / out of scope

- `pnpm check` / test battery: deliberately NOT run — this is a visual brief on a shared tree
  carrying ~5 uncommitted lanes (owner rulings: no whole-tree batteries during concurrent lanes;
  battery runs are the orchestrator's, on a quiesced tree). No source-correctness claims in this
  report depend on gates.
- Group/multi-member chat surfaces (Members meta tab): the dev DB has no committed group chat —
  `--context-tab members` on the 1:1 chat resolves to the default tab (`membersTabJustified` hides
  it). Not captured; not judged.
- Mobile/coarse-pointer variants; settings panes (SET-SEAMS lane owns them); corpus/stats sections.

## Verification log (re-capture recipes)

- Stage: `pnpm snap / --dirty` (boots/reuses the working-tree stage at :5273 with a dev-DB copy);
  subsequent calls used `--base http://localhost:5273` to avoid re-sync churn mid-audit.
- Captures (all `--wide` 1920×1080 unless noted): `chats-list-wide` (`/`), `chars-list-wide` +
  `chars-list-1280` (`--goto characters`), `char-detail-wide` / `char-detail-scroll{1,2}`
  (`--open-character Azarael --click '[aria-label="Show detail panel"]'`, scroll via `--eval
  scrollTop`), `char-ctx-links` / `char-ctx-options` (`--context-tab links|options`),
  `chat-ctx-members|settings|preview` and `chat-ctx-rpg-scene|status|inventory`
  (`--open-chat "Nate, Azarael"` + panel open + `--context-tab …`), `presets-list-wide`
  (`--goto presets`), `worldinfo-list-wide` (`--goto worldInfo`), crops `hero-crop-crop`,
  `ctx-panel-full-crop`, `landing-blob-crop`.
- Geometry probes: search-input/select rects; portrait button vs avatar image vs label rects;
  list-row heights (52px, pad 6×8, gap 8); landing-glow element identification.
- Code reads (full files): snap.ts (flags/order), snap-stage.ts header, chats-section.tsx,
  characters-section.tsx, section-context-host.tsx, context-tabs-panel.tsx, chat-list-surface.tsx,
  chat-summary-row.{ts,tsx}, character-library-surface.tsx, character-card.tsx,
  character-list-view.ts, character-library-toolbar.tsx, character-hero-band.tsx,
  character-options-tab.tsx, preset-library-row.tsx, list-row variants; contract shapes
  ChatSummary / CharacterSummary / PresetSummary; rpg-context-section tab defs; in-flight diffs
  for the character + tracker lanes.

## Unconfirmed, low priority

- Chat transcript at 1920 leaves a large dead right gutter inside the transcript region (character
  messages hug a ~560px column left-of-center while user bubbles right-align) — visible in every
  chat capture but not measured against the intended transcript max-width setting; may be the
  configured reading measure working as designed.
- The `--full` flag cannot capture inner-scroll surfaces (app is h-screen with inner overflow) — a
  harness ergonomics note, not a product defect.

## Biggest wins — ranked shortlist (owner picks)

1. **Fix the two rendered breakages on the character surface** — the 26px search box (F1) and the
   portrait-over-label overlap (F2). Cheap, and they're the "feels broken" floor under everything.
2. **Quiet the suggestion pills** (F3) — one change turns the character editor from carnival to
   composed; CD3 compliance in an afternoon.
3. **Give every list row its second datum** (F5 + F7 + F1's row content): presets get
   `edited 2h ago`, chats get portraits + star/game markers, characters get `last chatted` meta.
   This is the direct answer to "underutilized and samey" — same rows, real scent.
4. **Bracket/HUD seam decision, then legibility pass** (F6): first rule whether the HUD keeps
   renting the generic panel seams (carved pre-HUD in the shell lockdown) or gets its own takeover
   region contract; then cross-strip selection echo + tab-grammar for the bottom strip + compressed
   ambient-less waystone. Keeps the CP-4 split, fixes what it feels like.
5. **Default the character context panel to a populated view** (F4) — the panel should never open
   empty next to a data-rich editor.
6. **S3 voice sweep receipt** (F8/F9): kickers + label/datum voices on the meta tabs and Options
   swatch grid — fold into the already-planned density S3 stage rather than a new lane.
