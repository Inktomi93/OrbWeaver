---
kind: review
status: draft
updated: 2026-08-29
---

# side-eye — B10 "+rules on a cast" (saved casts carry the room's enabled rule presets)

> **Verdict: SHIP WITH FIXES.** The rider's MECHANISM is correct and I proved it with stored data,
> not screenshots: a non-default knob (`everyN: 12`) is captured on save, stored on the cast,
> re-minted into a fresh room and switched on, and a second apply mints nothing. Desktop reads well
> and the keyboard story is genuinely good. Two P1s block a clean ship: the picker's cast rows
> **collapse on mobile** — the cast NAME renders at 0px and the new rules badge overlaps the Start
> button by 48px, so the badge's own centre hit-tests to *Start a chat* — and the **"Start" door
> applies the rules in total silence**, discarding the `rulesSkipped` reasons the build record
> requires be reported.
>
> Lane `cb-se-casts`. Review-only; no product files touched.

## 0. Where these receipts came from (read this before citing a number)

**Principal: every receipt below was taken as the dev user "Traveler"** (the single-user dev
principal; `Playing as Traveler` in the rail, host of every room driven). A per-user-scoped empty
read here is a statement about Traveler, not about whether data exists.

**Fixtures are mine, not seed.** The seeded `Example — …` chats were used as *host-owned rooms*; every
rule, knob value, and saved cast under test was created by this lane through the UI.

**Two stacks, and why.** The pass opened by finding `:5173` **boot-dead** (§1). While the orchestrator
restarted it I drove `snap --isolated`. `:5173` was restored at 22:59:52 and the last third of the pass
ran there. The two shas were diffed over every B10 path before composing the receipts:

```
git diff --stat a2cb2ada7 0a9f715c5 -- packages/client/src/features/roster-preset \
  packages/client/src/features/automation packages/server/src/domain/roster-preset \
  packages/contracts/src/roster-preset      → EMPTY
```

Artifacts: `reports/snaps/cbse-*.png`, `reports/tool-guard/cbse-*.log`, `reports/design-audit/root.json`,
`reports/traces/cbse-*.zip`.

## 1. Environment finding (reported mid-run, now RESOLVED)

`:5173` was serving a **corrupt vite module graph** and the app never reached its data layer.

- Boot page error: `SyntaxError: The requested module '/@fs/…/packages/contracts/src/plugin/index.ts'
  does not provide an export named 'resolvePluginBoundKeyValueRows'` → caught by `CatchBoundaryImpl`,
  `data-app-ready=""`, query cache EMPTY, snap `nav=ERROR`. (`reports/snaps/cbse-boot.png`,
  `reports/traces/cbse-boot.zip`.)
- Source was consistent (`packages/contracts/src/plugin/ui.ts:979` defines it,
  `packages/contracts/src/plugin/index.ts:213` re-exports it); the **served transform was stale** —
  `curl :5173/@fs/…/plugin/ui.ts` returned HTTP 200 / 174,616 bytes carrying only
  `resolvePluginBoundAssetId` + `resolvePluginBoundTiles`, missing `resolvePluginBoundKeyValueRows`
  **and** `resolvePluginBoundSelectOptions`.
- Cause: vite pid 11438 started 06:01:28 and absorbed the whole day's merge train; the B10 merge landed
  22:48:51. Only the server (`node --watch`) respawns on merge — the memory
  `long-lived-vite-corrupt-graph` exactly.
- **Resolved**: restarted vite pid 2576762 @ 22:59:52; the served module now carries the export.

Second environment note, filed for tooling rather than product: **an active merge train destroys a
lane's `snap --isolated` fixtures.** `--isolated` stages HEAD, so each merge re-stages under a new sha
dir and the previous stage db (with the lane's created fixtures) is gone — it happened twice in 25
minutes (`a2cb2ada7deb → f28bff302c48 → 0a9f715c52a3`) and cost two full fixture rebuilds. `snap` does
accept `--ref <sha>` (orchestrator correction: `tooling/src/snap/ops/stage.ts`, `parse.ts:257`); only
`pnpm snap --help` omits it, which is what sent me down the unpinned path.

## 2. Per-target verdicts (FOCUSED review, brief's order)

| # | Target | Verdict |
| - | - | - |
| 1 | Rules surface — enable 2 presets, one non-default knob | **PASS.** Reached at "This chat" → Host controls → Rules. Minted + enabled cleanly. One stumbled-on B2 defect (P3-5). |
| 2 | Save include-line | **PASS on copy, FIX on states.** Wording is exactly right; the zero and loading arms are missing (P2-3), and it is the smallest text in the dialog (P3-2). |
| 3 | The "N rules" badge (N vs 0) | **FIX.** Copy/pluralisation correct, contrast passes both themes; but no accessible name (P2-1) and it is the direct cause of the mobile collapse (P1-1). |
| 4 | Editor Rules block | **FIX.** Dead display by design, but it echoes titles only — the knob bag that distinguishes two casts is invisible (P2-2); no heading semantics (P2-5). |
| 5 | Apply / re-apply / skip report | **MECHANISM PASS, REPORTING FAIL.** Re-mint + enable + knobs verified by data; idempotency verified. The Start door reports nothing at all (P1-2); "Added 0" on re-apply (P2-4). Lore-refusal skip NOT driven — see coverage. |
| 6 | Mobile / themes / reduced-motion | **Mobile FAIL (P1-1). Themes PASS** (Light + dark measured, all contrasts pass). Motion clean — no animation to judge. |

## 3. Findings

### P1-1 — On mobile the cast NAME is erased and the rules badge collides with the actions; tapping the badge presses "Start a chat"

**Receipt** (`--mobile`, 430×932, DPR 3, `pointer: coarse` confirmed by `matchMedia`; dialog 366px,
row 316px — `reports/tool-guard/cbse-mm.log`, `reports/snaps/cbse-mobile.png`):

| row | badges | name rendered width | name natural (`scrollWidth`) | last-badge.right | Start.left | overlap | `elementFromPoint(badge centre)` |
| - | - | - | - | - | - | - | - |
| Night Runners | 1 | **11px** | 88px | 112 | 118 | −6 (clear) | the badge |
| **Spire Trio** | **2** (has rules) | **0px** | 57px | 166 | 118 | **+48px** | **the Start button's `<svg>`** |

At `--viewport 768x900` both rows render their full names untruncated (overlap −135 / −101). So the
break is a narrow-width property, not a constant: it appears between 430 and 768.

**Why it hurts a user.** On a phone the picker cannot tell you *which* cast you are about to drop into
a room — the identifying text is gone. Worse, the thing that still looks tappable ("2 rules") hit-tests
to **Start a chat**, which mints a whole new room. And the B10 badge is the direct cause: with one badge
the name survives (barely, 11px); with the rules badge it goes to zero.

**Fix.** The action cluster must stop being `shrink-0` at narrow widths. Prescription in §15 grammar:
**adapt: `CastRow` in `packages/client/src/features/roster-preset/components/cast-picker.tsx` — receipt:
name `clientWidth > 0` and zero badge/button rect intersection at `--mobile` AND at 768px.** The house
already has the answer one file over: `components/cast-collection-rows.tsx` puts the destructive action
behind `LibraryRow.actions → RowActionsMenu`. Collapse Start/Add-to-chat/Delete into that kebab under a
container query, or stack the row (name+badges line, actions line). Name + badges own the first line
unconditionally.

**Law.** §0 container model (adapt at the real mount, not the viewport); §14 (a row inventing narrow-width
geometry); UX rule "same action = same home" — the sibling cast row already solved this differently.

### P1-2 — The "Start" door applies the cast's rules in total silence; three doors, three different levels of reporting

**Receipt (driven).** From the picker: `Add cast… → Start a chat with Spire Trio`, then
`--watch 6000 --every 800` polling `[data-slot=toast-root]` → **`[]` at all 8 ticks**
(`reports/tool-guard/cbse-sp.log`), while the console shows `rosterPreset.applyToChat` firing twice and
the resulting room `chat_01m18k108yfqdvwyjazswmc144` carries both rules `enabled: true` with the
carried `everyN: 12` (tRPC `automation.listRules`, `reports/tool-guard/cbse-final.log`). The *other*
door on the same component toasts `Added 0 · 3 already here · 2 rules on`
(`reports/tool-guard/cbse-toast.log`).

**Receipt (source).** `cast-picker.tsx` `onStart` reports only `result.skipped` ("N members skipped — a
character was deleted") and never touches `rulesMinted` / `rulesAlreadyPresent` / `rulesSkipped`.
`surfaces/cast-member-surface.tsx` `onStart` awaits `apply.mutateAsync` and reports **nothing at all**.

**Why it hurts a user.** B10's own acceptance test is "save a cast + rules; one click into a new chat" —
and that exact click is the one that says nothing. Per build record §6.4 a lore preset's book-attachment
consent gate refuses in a room without the book and lands in `rulesSkipped` *with a reason*; on this path
the reason and the count are both discarded, so the host's new room silently differs from the cast they
picked. The spec line "skipped rules are REPORTED" is satisfied on one of three doors.

**Fix.** `clarify: the three apply doors in `features/roster-preset`— receipt: all three call`applySentence(result)`, and `applySentence`renders each`rulesSkipped` entry's REASON, not a bare
count.` Consider naming the cast in the sentence.

**Not driven:** the lore-refusal arm itself. The stage and dev dbs hold **zero** lorebooks
(`worldInfo.listBooks → []`), so the refusal could not be provoked without authoring a book, attaching
it, minting the lore rule, saving a cast and applying to a bookless room — out of budget. The claim
above rests on the source path plus the driven silent-success arm.

### P2-1 — The rules count (and the member count) are never in an accessible name

**Receipt.** `--aria role=dialog` renders the row's badges as `text: 3 2 rules` — no roles, no names, no
units. The keyboard walk's nine stops are: `New cast name` → `Start a chat with Night Runners` →
`Add Night Runners to this chat` → `Delete Night Runners` → (same three for Spire Trio) → `Close` → wrap.
**No stop announces the rules.** In the editor the talkativeness datum measures
`talkTag: "SPAN", talkFs: "10.5px", talkAria: "NONE"` on the literal text `0.5`.

**Why it hurts a user.** Sam tabs the dialog, hears "Start a chat with Spire Trio", presses it, and two
automation rules he was never told about are switched on in his room. The consent information the
include-line provides on the SAVE side is visual-only on the APPLY side. And "3" alone is meaningless —
nothing on the surface says the first badge counts members.

**Fix.** `clarify: the two badges in CastRow — receipt: an --aria capture in which every row control's
name carries the counts.` Either label the badges (`aria-label={`${cast.memberCount} members`}`) or fold
both counts into the row buttons' names ("Start a chat with Spire Trio — 3 members, 2 rules"). Same for
the editor's bare `0.5`.

### P2-2 — A saved cast's rule KNOBS are invisible in every surface

**Receipt.** The stored bag is distinct and provable —
`rosterPreset.list → Spire Trio.rules[0] = {rulePresetId:"pacingNudge", knobs:{everyN:12, steer:"…"}}`
(default is 8) — yet all three renderings collapse it:

- picker badge: `2 rules`
- include-line: `Includes 2 enabled rules: Periodic pacing nudge, Offer chips after a beat`
- editor Rules block: two `<p>` at 13px reading `Periodic pacing nudge` / `Offer chips after a beat`
  (`reports/tool-guard/cbse-edm2.log`)

A cast carrying the same preset at `everyN: 8` would render byte-identically.

**Why it hurts a user.** The knob bag is the entire reason the rider stores more than an id. A host with
two casts both carrying "Periodic pacing nudge" cannot tell them apart, and cannot see what is about to
be imposed on the target room before pressing Start. The editor even tells them "To change them,
configure a room and save a new cast" — advice they cannot act on without knowing the current values.

**Fix.** `typeset: the editor's Rules block and the picker's include-line — receipt: each rule title
carries its resolved knobs as a gloss ("Periodic pacing nudge — every 12 beats").` The contracts adapter
`rulePresetKnobBagToInputs` is already imported in both files.

### P2-3 — The include-line has no zero arm and no loading arm; "Save current cast" can sit permanently dead

**Receipt.** In a room with zero enabled rules the include-line is **entirely absent**
(`--eval` → `{include: false}`, `reports/snaps/cbse-dev-control.png`) — visually identical to "the
capture has not loaded yet" and to "this build has no rules rider". Source, `cast-picker.tsx`
`SaveCurrentCast`: `disabled={props.busy || trimmed.length === 0 || capturedRules === null}` with no
spinner and no reason line; `hooks/use-saved-casts.ts` `useCastRuleCapture` returns `rules: null` for
**any** `rulesQuery.data === undefined` — including a **failed** `automation.listRules` (a plain
`useQuery`, no error boundary, no retry affordance). A listRules failure therefore disables "Save current
cast" forever, silently. *(The failure arm is structural — not driven.)*

**Why it hurts a user.** Riley's arm: the host names a cast, the button stays grey, nothing explains why,
and there is no retry. The zero arm is the ordinary case and it teaches nothing — a host in a rules-free
room never learns the feature exists.

**Fix.** `harden: SaveCurrentCast — receipt: shots of all three arms.` Render "No enabled rules to
include." at zero; render a skeleton or "Checking this room's rules…" while `null`; give the error arm a
message and a retry. `empty-states-are-load-bearing`.

### P2-4 — "Added 0" is how the idempotent re-apply reports success

**Receipt.** Toast on a second `Add Spire Trio to this chat`:
**`Added 0 · 3 already here · 2 rules on`** (`[data-slot=toast-root]` innerText via `--watch`).
Source: `applySentence` seeds `parts` unconditionally with `` `Added ${result.added.length}` ``.

**Why it hurts a user.** "Nothing duplicates on re-apply" is B10's stated correctness property, and the
UI reports that success with a leading zero that reads like a failure. The cast's name is absent, so with
several casts and a fast hand you cannot tell which one answered.

**Fix.** Drop the clause at zero; lead with the cast name — `Spire Trio: everything is already here · 2
rules on`.

### P2-5 — The editor's Members/Rules blocks carry no heading semantics, and talkativeness is spelled two different ways in two surfaces

**Receipt.** `kickerTag: "SPAN"` at 10.5px for both `MEMBERS` and `RULES`; the editor's only heading is
`heading level=2` (the cast name) — see the `--aria` capture in `reports/tool-guard/cbse-ed.log`. The
sibling "This chat" pane uses `heading level=3` for every section (`Field overrides`, `Injections`,
`Rules`, …). The same datum renders as `0.5` here and as
`Talkativeness: Sabine Veyra — talks at level 50 of 100` in the room's Members tab.

**Why it hurts a user.** Heading navigation gives an SR user exactly one stop in a two-section editor.
And one concept with two scales and two vocabularies across two surfaces is §13's single-homing rule
broken — a user cannot map `0.5` to "level 50 of 100" without being told.

**Fix.** Use `Section kicker` (which renders a real heading) or `<Heading level={3}>`; pick ONE
talkativeness spelling and use it in both places.

### P2-6 — The Configuration landing's Casts copy is stale after B10

**Receipt.** `--goto config` → `region "Casts"` → "Saved casts — a named group of characters with their
seat knobs, ready to drop into any chat." The rider is not mentioned. Build record §6.6 row 10 lists the
picker/editor as the client coupled sites; this card was missed.

**Fix.** Name the rules in the library description — it is the one place a user browsing the library
learns what a cast is.

### P3

- **P3-1 — the door's label and the surface's lead action disagree.** The Members toolbar button says
  **"Add cast…"** (an apply verb) and opens a modal titled **"Saved casts"** whose first and topmost
  affordance is **Save current cast**. A host who wants to add is met with a name field.
  (`reports/snaps/cbse-picker-empty.png`.) §13 flow.
- **P3-2 — the consent line is the smallest text in the dialog.** Measured 10.5px / line-height 13.125px
  / `oklch(0.74 0.008 65)`; contrast **7.34:1 PASS** (dark) and **7.05:1 PASS** (Light). It is the one
  sentence answering "what will this cast do to my room", and it renders below the input's placeholder
  and below every row's title. The sibling `automation/components/rule-preset-picker.tsx` lifted exactly
  this class of sentence with `prose={true}` and documents why. **This is a hierarchy judgment, not a
  rule breach** — see retraction 2.
- **P3-3 — Close is last in the tab order** though it is visually first (top-right); the house
  settings-dialog walk lands on Close first. Nine-stop walk, `fv=true` at every stop.
- **P3-4 — a room started from a cast is untitled** (`chat.title = null` on
  `chat_01m18k108yfqdvwyjazswmc144`). The cast's name is discarded the moment it is used; the room shows
  as its character list.
- **P3-5 — (stumbled-on, B2 not B10) the rule picker popover reopens on STEP 2.** Reopening "Add a rule"
  shows the **previously configured preset's knob form**, not the catalogue. Measured twice: (a) a chain
  of `Add a rule → <a different preset> → Add rule` minted a **duplicate of the previous preset** because
  the different preset was never on screen; (b) the working chain needs an explicit `Back` click first.
  A host adding a second, different rule adds a duplicate of the first by pressing the obvious button.
  Reported and returned to the target list per scope.
- **P3-6 — (stumbled-on, pre-existing) design-audit P3s on the same plane**, none B10's:
  `duplicate-action-door` 2× "more message actions" in the transcript; `flat-type-hierarchy` page-wide
  (10.5 / 13 / 15 / 16px, ratio 1.5:1); `inactive-control-legibility` 2.85:1 on the disabled Save
  (native-disabled, WCAG 1.4.3 exempt — **not** a finding).

## 4. ARIA-navigability recommendations

| Element | Problem | Exact fix |
| - | - | - |
| `CastRow` member badge (`<Badge>` with `{cast.memberCount}`) | renders as a bare digit with no accessible name; SR reads "3" | `aria-label={`${cast.memberCount} members`}` — or fold the counts into the row buttons' names |
| `CastRow` rules badge (`{n} rule(s)`) | visual-only; never announced at any tab stop | append to each row button's `aria-label`: `Start a chat with ${cast.name} — ${cast.memberCount} members, ${cast.rules.length} rules` |
| Editor "MEMBERS" / "RULES" (`<Text as="span" voice="kicker">`) | no heading semantics; the editor has one heading total | `<Heading level={3}>` (or `Section kicker`, which renders one) so heading navigation works |
| Editor talkativeness `0.5` (`SPAN`, no label) | unlabelled numeric datum | `aria-label={`${member.name} talks at level ${Math.round(t\*100)} of 100`}` — matching the room's own wording |
| `SaveCurrentCast` disabled button | disabled with no announced reason while `capturedRules === null` | render a live reason (`aria-describedby` on the button) instead of a silent `disabled` |
| The include-line | not associated with the control it describes | `aria-describedby` from the Save button to `[data-slot=cast-rules-include]` |

**What already passes and must not regress:** every tab stop reports `:focus-visible = true`; the dialog
traps focus and wraps; `Escape` closes and returns focus to the `Add cast…` trigger; the dialog is named
("Saved casts"); every row action button carries a name that includes the cast name.

## 5. Taste & flow verdict (the blunt call)

**The desktop picker looks good.** Calm, no ornament, rows breathe, actions right-aligned and consistent,
one hairline between rows, empty state designed rather than apologetic. Nothing here reads as AI slop —
no gradient, no glow, no icon-tile stack, no nested cards. In Light it is equally clean
(`reports/snaps/cbse-light.png`). I attacked the contrast in both themes with computed receipts and it
held.

**The two badges look like different kinds of thing.** Side by side: `Spire Trio (3) (2 rules)`. Same
component, same neutral/soft tone, but one is a bare digit in a circle and one is a labelled pill. The eye
reads the first as decoration and the second as data; nothing on the surface tells you the digit counts
members. Make them one grammar — either both labelled, or the member count moves into the subtitle line
where the member NAMES already are.

**On mobile it looks broken, plainly.** Not "tight" — broken. Row two shows `3` `2 rules` with the pill
sitting on top of the Start button and no cast name at all. It is the first thing your eye goes to and it
is wrong. See `reports/snaps/cbse-mobile.png`.

**The flow is right but the door is mislabelled.** "Add cast…" → a modal that leads with saving is a small
lie you have to read past every time. And the same concept has an asymmetry worth naming: the SAVE side
tells you exactly which rules ride ("Includes 2 enabled rules: Periodic pacing nudge, Offer chips after a
beat") and the APPLY side tells you "2 rules" — the informative sentence exists, it just is not shown at
the moment consent is actually given.

**Cold first-timer test.** From the desktop screenshot alone, a newcomer can name the surface ("my saved
groups of characters") and knows what to do (name it, save it). They will **not** know that "2 rules"
means automation that will start running in their room and can spend model calls — the word "rules" alone
carries none of that, and the row's own catalogue copy ("Costs a model call each time it fires") is two
surfaces away. That is the gap worth closing after the P1s.

**One concept, one home — clean.** No duplicated affordance found: save lives only in the picker header,
library management only in Configuration, apply only on the row. The editor correctly refuses to become a
second cast composer.

## 6. Retractions

1. **I read the editor's disabled "Save" as painting a full-strength primary amber fill** off
   `reports/snaps/cbse-editor.png` — which would have been the exact defect the sibling automation lane
   fixed and documented (#621 P1-4, "an amber-filled button that does nothing on click is the same dead
   end whether or not it is `disabled`"). **Wrong.** Measured: `saveDisabled: true`,
   `saveOpacity: "0.5"`, bg `oklch(0.72 0.175 52)` — the base `disabled:opacity-50` is applied and the
   control reads as inactive. My eye misread the PNG. *The eye is not a colorimeter.*
2. **I was about to file the include-line's 10.5px as "below the 11px functional floor"**, citing
   `rule-preset-picker.tsx`'s own comment. **Wrong as a rule breach.**
   `tooling/src/ui-audit/lib/checks-typography.ts:30,40` — `text-below-ramp` fires only *below*
   `TEXT_MICRO_PX` (10.5px **is** the ratified micro step) and `undersized-ui-text` fires only for
   **interactive** text below 11px. The include-line is non-interactive and on-ramp; design-audit
   correctly reported nothing. Re-filed as P3-2, a hierarchy/taste call with the precedent named.
3. **Not a retraction, a scope correction:** the boot-dead `:5173` finding stood and was fixed; my
   receipts therefore span two builds. I diffed them over every B10 path (§0, empty) before composing.

## 7. What is genuinely working (do not touch)

1. **The rider mechanism, verified by data.** `everyN: 12` (non-default; default 8) captured on save →
   stored on the cast (`rosterPreset.list`) → re-minted into a fresh room with the same bag and
   `enabled: true` (`automation.listRules`) — proven on **both** stacks. Re-apply mints nothing
   (`Added 0 · 3 already here · 2 rules on`). A rules-less cast stores `rules: []` and performs no
   automation work. Two live mints of one preset dedupe to one captured spec.
2. **The include-line's copy.** "Includes 2 enabled rules: Periodic pacing nudge, Offer chips after a
   beat" — says "rule" not "preset" (the 2026-08-24 vocabulary ruling), names them rather than counting
   them, pluralises correctly, and appears **before** the save press. That is the consent design working;
   the fixes above are about showing it in more places, never about changing these words.
3. **Keyboard and contrast.** Nine tab stops, `:focus-visible` true at every one, trap wraps, `Escape`
   closes and restores focus to the trigger. Contrast passes in both themes (include-line 7.34:1 dark /
   7.05:1 Light; badge 6.99:1; title 14.9:1). Opening the picker is `cls 0`, `worstBlocking 0`, zero
   compositor-dirty animations.

## 8. The single biggest opportunity

**Make the cast's rules read as CONFIGURATION, not as a count.** The rider already stores a resolved knob
bag per rule; every surface reduces it to "2 rules". Echo the knobs once — "Periodic pacing nudge — every
12 beats" — and the same words do triple duty: they identify the cast, they inform the consent at the
moment of applying, and they give the apply's skip report something specific to name when a rule refuses.
That one change also retires P2-2 outright and softens P2-1 and P1-2.

## 9. Instrument coverage

| # | Instrument | Status |
| - | - | - |
| 1 | `pnpm snap` — `--map` | **RAN** — `reports/tool-guard/cbse-mem2.log` (95 elements, 1 DOM fallback) |
| 1 | `pnpm snap` — `--aria` | **RAN** — dialog, details pane, editor, config landing (`cbse-pe/-tc/-ed/-cfg.log`) |
| 1 | `pnpm snap` — `--contrast` | **RAN** — dark + Light arms, 6 measurements, 0 fails (`cbse-meas/-light.log`) |
| 1 | `pnpm snap` — `--expect-*` | **RAN** — `--expect-no-overflow [role=dialog]` at `--mobile`: PASS (**and see the blind spot below**) |
| 1 | `pnpm snap` — `--matrix` | **SKIPPED** — the axes that mattered were driven individually (`--mobile`, `--viewport 768x900`, `--theme Light`, desktop); a matrix arm re-boots the surface without the multi-step fixture state and would not have reached the picker. |
| 1 | `pnpm snap` — `--json` | **SKIPPED** — terminal console never hit the 200-message cap on any judged run. |
| 2 | `pnpm design-audit <route>` | **RAN** — `reports/design-audit/root.json`, isolated stage, picker open: 2 P3, 0 P0/P1/P2 |
| 2 | `pnpm design-audit --mobile` | **RAN** — `pointer=coarse`, census 420, reached 21: 3 P3, **0 tap-target findings** (so the #797 corroboration step was not needed — nothing to corroborate) |
| 3 | `pnpm motion-audit` | **SKIPPED** — substituted by `__orb.motion()` + `__orb.animations()` around the only animated moment (the modal open); both clean, so a throttled trace had nothing to resolve. |
| 4 | `pnpm perf-meter --click` | **SKIPPED** — the surface's primary action (`Save current cast` / `Start`) is a server round-trip, not an interaction-responsiveness question; `worstBlocking 0` on open. |
| 5 | Lighthouse (MCP, desktop + mobile) | **SKIPPED** — the surface under review only exists behind a 3-step drive (open room → Members tab → Add cast…); Lighthouse's navigation mode cannot reach it and snapshot mode would have audited the landing shell. Stated rather than faked. |
| 6 | `__orb` suite via `--eval` | **RAN** — `.motion()` (cls 0 / blocking 0), `.animations()` (0 compositor-dirty), `.shell()`, `.queries()` |
| 7 | Console triage | **RAN** — see below |
| 8 | The PNGs, actually looked at | **RAN** — `cbse-picker-empty`, `cbse-saved`, `cbse-control`, `cbse-editor`, `cbse-mobile`, `cbse-light`, `cbse-dev-control` |
| 9 | Keyboard walk | **RAN** — 9 `--key Tab` stops + `Escape`, `reports/tool-guard/cbse-kbd.log` |
| 10 | Appearance presets | **SKIPPED** — no finding here is density- or typography-dependent in a way a preset would move; the two typography findings (P2-5, P3-2) are about *semantics and hierarchy*, which every preset shares. Named, not hidden. |
| 10 | Theme arms | **RAN** — `--theme Light` (computed `data-theme="light"`, body `oklch(0.98 0.004 75)`) + the owner default |
| 11 | Pane-state arms | **PARTIAL** — the picker is a modal and is width-driven by the viewport, not by pane state; measured at 1280 (desktop), 768, and 430 (`--mobile`). The context pane's own open/closed state does not move it. |

**Console triage (the picker flow, `reports/tool-guard/cbse-dev2.log` — the full fixture build):**

| Channel | Count | Disposition |
| - | - | - |
| `[trpc]` | 112 | dev instrumentation — request/response log, expected |
| `[perf]` slow commit | 18 | boot + pane mounts; none attributable to the picker (opening it is `blocking 0`) |
| `[drop]` frame | 9 | boot logo animation + toast entry; `__orb.animations()` reports zero compositor-dirty |
| `[cls]` | 7 | **INVESTIGATE (not B10's):** the long drive reached `CLS 0.3263 (virtualized 0.0240)` → non-virtualized ≈ 0.302, well over 0.1. Isolated to the "This chat" pane growing as rules were minted/toggled — the picker alone measures `cls 0`. Out of this review's scope; flagged for whoever owns B2's pane. |
| `[frame]` / `[reflow]` | 5 / 4 | boot-window long frames |
| `[bus]` | 5 | chat/automation room subscribe/unsubscribe, expected |
| **errors** | **0** | `console-errors=0`, `page-errors=0` on every judged run |

**Instrument blind spot worth a tooling row (the "fix tools as we find them lying" rule).**
`design-audit --mobile` walked the open Saved-casts dialog at `pointer=coarse` (census 420, reached 21)
and returned **zero P0/P1/P2** over a text node rendered at **0px width** with a 57px natural width, and
a badge overlapping an adjacent button by **48px** where `elementFromPoint` at the badge's own centre
returns the other button. `snap --expect-no-overflow [role=dialog]` also **PASSED** — nothing escapes the
dialog box; the collision is *inside* it. Two rule families are missing:

1. **truncated-to-nothing** — `clientWidth ≈ 0` while `scrollWidth > 0` on a text node (a label that
   exists in the DOM and is invisible to the user is not the same defect as overflow);
2. **sibling overlap** — two rendered siblings whose rects intersect, with an `elementFromPoint`
   disagreement at the loser's centre (the mis-tap signature).

Only the screenshot plus hand geometry caught this class. Two smaller instrument facts paid for during
the pass: `snap --fill 'sel=value'` splits on the **first `=`**, so any attribute selector is unusable
(I had to tag the input via `--eval` first); and `--map` accepts CSS only while `--aria` accepts `role=`
selectors, which reads as a bug when you chain them.

## 10. Issue-summary paragraphs (for the board)

**Cluster A — the mobile cast row (P1-1).** The saved-casts picker's `CastRow` collapses at coarse-pointer
widths: at 430×932 the cast name renders at 0px (natural 57px) and the B10 rules badge overlaps the Start
button by 48px, so `elementFromPoint` at the badge's centre returns Start — a mis-tap creates a room. One
badge degrades the name to 11px; the second badge zeroes it. Holds cleanly at 768px, so this is a
narrow-width property. Fix: stop `shrink-0`-ing the action cluster — collapse Start/Add-to-chat/Delete
into the house `RowActionsMenu` kebab (as `cast-collection-rows.tsx` already does) or stack the row under
a container query, so name+badges always own the first line. Receipts: `reports/snaps/cbse-mobile.png`,
`reports/tool-guard/cbse-mm.log`, `cbse-768.log`. Note the whole deterministic battery is blind to it —
`design-audit --mobile` and `--expect-no-overflow` both pass.

**Cluster B — apply reporting (P1-2, P2-4).** The rider's mechanism is verified correct (non-default
`everyN: 12` captured, stored, re-minted, enabled; re-apply idempotent), but the reporting is inconsistent
across the three doors that apply a cast: `cast-picker` `onAddToChat` toasts `Added 0 · 3 already here ·
2 rules on`; `cast-picker` `onStart` reports member skips only and never mentions rules (driven: zero
toasts over 8 ticks / 6s while `applyToChat` fired and both rules landed enabled); `cast-member-surface`
`onStart` reports nothing at all. The `rulesSkipped` reasons the build record §6.4 requires be reported
are therefore discarded on the primary "one click into a new chat" path. Also `applySentence`
unconditionally leads with "Added N", so the specified idempotent success reads as "Added 0". Fix: all
three doors call `applySentence`; `applySentence` renders skip reasons and drops the zero clause. The
lore-refusal skip arm was not driven — the dev/stage dbs hold zero lorebooks.

**Cluster C — the rules are a count, never configuration (P2-1, P2-2, P2-3, P2-6).** A cast stores a
resolved knob bag per rule, and no surface shows it: the badge says "2 rules", the include-line names
titles only, the editor lists titles only — two casts carrying the same preset at different knob values
are indistinguishable. Neither count is in any accessible name, so a keyboard/screen-reader user is never
told that applying a cast will switch on automation. The include-line has no zero arm and no loading arm,
and `capturedRules === null` disables "Save current cast" with no explanation — permanently, if
`automation.listRules` fails. The Configuration landing's Casts description still describes casts as
"characters with their seat knobs", omitting rules. Fix: echo resolved knobs beside each rule title; put
both counts in the row controls' accessible names; give the include-line its zero/loading/error arms;
update the library copy.

**Cluster D — editor and picker polish (P2-5, P3-1..P3-4).** The cast editor's MEMBERS/RULES kickers are
spans with no heading semantics (the sibling "This chat" pane uses `heading level=3`), and talkativeness
renders as a bare unlabelled `0.5` there versus "talks at level 50 of 100" in the room's Members tab — one
concept, two scales, two vocabularies. Smaller: the "Add cast…" door opens a modal that leads with saving;
Close is last in the picker's tab order though visually first; a room started from a cast is untitled.

**Cluster E — stumbled-on, not B10 (P3-5, P3-6, and the CLS note).** The B2 rule-preset picker popover
reopens on step 2 (the previously configured preset's knob form) instead of the catalogue — measured
twice, and it caused an accidental duplicate mint when a host tried to add a *different* rule. Separately,
the "This chat" pane accumulates a non-virtualized CLS of \~0.302 across a rules-editing session (the
picker itself measures 0). Both belong to whoever owns B2's surface.
