---
kind: review
status: active
updated: 2026-09-02
---

# CT corpus audit — leg 4b (parallel shard: discovery + databank + "the rest")

Lane `cb-ct-audit-4b`, #1229. One of THREE parallel shards continuing the campaign started at
[leg 1](2026-09-02-ct-corpus-audit-leg1.md) (Phase A structural sweeps over all 469 `.ct.tsx` files +
24 full-reads) and [leg 2](2026-09-02-ct-corpus-audit-leg2.md) (69 more full-reads, helper-hoisted-assert
triage). **Note on the referenced "leg 3":** the brief for this shard cites `2026-09-02-ct-corpus-audit-leg3.md`
as the shard-map source; that file does not exist in this worktree (`git -C <wt> ls-files
docs/reviews/stickler/ | grep ct-corpus` → only leg1 and leg2 present at base `6ceba520c`). leg 2 §5
("Remaining leg-2 queue … what remains for a leg 3") is the closest live artifact and is what this shard
follows for method/rubric; the concrete file list for this shard came directly from the dispatch brief.
This report continues that leg-2/leg-3 numbering as **leg 4b** to avoid colliding with the sibling shards'
leg-4a/4c reports.

Worktree: `.claude/worktrees/agent-a9f9fd50a35063d58`, base `6ceba520c` (`docs(catalog): re-attest the
gates ledger and the substrate design at the #1232 fold`), `git status --short` clean at base.

**Rubric** (leg 1's, restated): per file — (a) HONESTY (every assert can actually fail; no tautologies,
un-failable negatives, assertion-free tests); (b) PREMISE CURRENCY (mounted surface/selectors/role names
spot-verified against today's `src`, path:line cited); (c) COVERAGE (load-bearing behavior with no pin —
top gaps only); (d) HARNESS CORRECTNESS (settled barriers, no shared-render-tree reads, `ONESHOT-OK`
markers name a real barrier and the marker window is exact). Hunting leg 1 §2's taxonomy: stale premise,
luck-based coverage, decorative pins, `as unknown as` double-casts, oneshot live-read asserts, literal
`reports/` writes, accname substring traps, stand-in children, tabs/panels accumulating, shared-render-tree
reads — plus the ONESHOT-OK exact-window rule and the fenced-vs-defect-proof labeling rule.

**RUN BUDGET: 0 of 6 used.** No CT was executed this leg; every verdict below is structural/read-derived
(matching the leg-1/leg-2 posture).

## Coordination note — `corpus-search-results.ct.tsx` and the #1249 RoomDoor fix

Brief flagged this file as edited TODAY by a sibling lane (#1249 recession fix at the RoomDoor composite).
**This worktree does NOT have that edit**: `git -C <wt> log -3 -- tests/client/features/discovery/components/corpus-search-results.ct.tsx`
shows the file's newest commit reaching this base is `ed25105def` (2026-08-25, "fix one-shot client CT
assertions") — nothing from today. My read below is against that pre-#1249 content. The section most
likely to be the RoomDoor composite's surface is the SCENES-branch door-look assertions at
`corpus-search-results.ct.tsx:483-503` (`justify-content: flex-start`, the "→" glyph, the not-body-colour
check) — my CLEAN verdict on that block is **provisional pending the #1249 merge**; re-verify it once that
lands, since a recession fix there could change the exact geometry/colour contract this file pins.

## Resolved file list (brief items → actual `.ct.tsx` paths)

| Brief item | Resolved path | Status |
| - | - | - |
| corpus-home-surface | `tests/client/features/discovery/surfaces/corpus-home-surface.ct.tsx` | READ (leg1 Appendix A: unread, MID 6.1) |
| corpus-search-results | `tests/client/features/discovery/components/corpus-search-results.ct.tsx` | READ (leg1 Appendix A: unread, MID 3.2) — see coordination note above |
| corpus-list-surface | `tests/client/features/discovery/surfaces/corpus-list-surface.ct.tsx` | READ (leg1 Appendix A: unread, MID 3.0) |
| databank-library-surface | `tests/client/features/databank/surfaces/databank-library-surface.ct.tsx` | READ (leg1 Appendix A: unread, MID 3.3) |
| tracker-blocks | `tests/client/components/tracker-blocks/tracker-blocks.ct.tsx` | READ (leg1 Appendix A: unread, MID 7.2) |
| workloads-jobs-section | `tests/client/features/workloads/components/workloads-jobs-section.ct.tsx` | READ (leg1 Appendix A: unread, MID 4.0) |
| actions-view | `tests/client/features/preset/components/actions-view.ct.tsx` | READ (leg1 Appendix A: unread, MID 3.7) |
| face-strip | `tests/client/components/face-strip.ct.tsx` | READ (leg1 Appendix A: unread, MID 5.0) |
| roster-picker | `tests/client/features/roster-preset/components/roster-picker.ct.tsx` | READ (leg1 Appendix A: unread, MID 4.5) |
| persona-\* | `tests/client/features/persona/{surfaces,components}/*.ct.tsx` (5 files: `persona-panel-surface`, `persona-this-chat-section`, `persona-panel-row`, `persona-list`, `persona-editor`) | READ (leg1 Appendix A: 4/5 unread; `persona-panel-surface` was MID 7.6 unread) |
| character-\* | `tests/client/features/character/**/*.ct.tsx` + adjacent `character-*`-named files elsewhere (19 files total; `character-editor-surface` and `character-create-actions` already read in leg 2 §3b.1/3b.2 — SKIPPED here; remaining 17 READ in this shard) | READ |
| regex-tab | `tests/client/features/preset/components/regex-tab.ct.tsx` | READ |
| schema-editor-dialog | `tests/client/features/refinery/components/schema-editor-dialog.ct.tsx` | READ |
| turn-tool-calls-disclosure | `tests/client/features/rpg/components/turn-tool-calls-disclosure.ct.tsx` | READ |
| motion-flaggers / motion-stats / long-task-tracer | `tests/client/lib/{motion-flaggers,motion-stats,long-task-tracer}.ct.tsx` | READ |
| plugin-scripted-surface | `tests/client/features/plugin/components/plugin-scripted-surface.ct.tsx` | READ |
| connections-roles-section | `tests/client/features/credentials/components/connections-roles-section.ct.tsx` | READ |
| use-invalidation | `tests/client/data/use-invalidation.ct.tsx` | READ |
| create-entity-mutation | `tests/client/data/create-entity-mutation.ct.tsx` | READ |
| use-orb-socket | `tests/client/data/bus/use-orb-socket.ct.tsx` | READ |
| use-user-bus | `tests/client/data/bus/use-user-bus.ct.tsx` | READ |

**Skipped as already-read** (leg 2 §3b.1/3b.2, both CLEAN): `tests/client/features/character/surfaces/character-editor-surface.ct.tsx`,
`tests/client/features/character/components/character-create-actions.ct.tsx`.

## Per-file verdicts

### `tests/client/features/discovery/components/corpus-search-results.ct.tsx` (582 lines) — CLEAN

The corpus omnibox's Memories/Images/Scenes branches. Full read. Every barrier is the hit's own rendered
text or a `data-slot` node, never a container testid (the file's own header names the sibling lesson it
avoids — `corpus-home-surface`'s testid-attaches-while-loading trap). Relevance ordering, accessible-name
placement (`aria-describedby` resolved live, :136-144), duplicate-evidence collapse (C1/C2), scene-passage
dedup (P1-1/P3-D) and the numbered-room title hint are all asserted through rendered roles/geometry, with
`exact: true` used correctly wherever a name is a prefix of a sibling name (:480, :553, :563-564 — the
`"Anika Jan 28"` / `"Anika Jan 28 (2)"` collision is exactly the shape `Spine-Testing.md`/leg-1's accname
lesson warns about, and it is handled). No literal `reports/` writes, no unmarked double-casts, no
tautologies. **Provisional on the #1249 coordination note above** for the SCENES door-look block
(:483-503) — re-verify once that fix merges into a worktree that has it.

### `tests/client/features/discovery/surfaces/corpus-home-surface.ct.tsx` (1,127 lines) — CLEAN, exemplary

Full read. This is the corpus rail-pass composition/geometry suite (P1-2/P1-3/P2-1 through the populated
2026-08-23 side-eye pass). Every geometry claim is a RANGE measured at more than one pane width
(`CorpusHomeDefaultPaneStory`/`ThreePaneStory`/`WidePaneStory`/`NarrowPaneStory`), never a point sample.
Barrier discipline is stated and followed throughout: `[data-corpus-focal]` (never the surface testid,
which the file's own header explains attaches pre-settle). Spot-verified premise currency against today's
`src`: `data-corpus-focal="familyMap"` (`packages/client/src/features/discovery/components/corpus-family-map.tsx:255`),
`data-slot="readiness-stage"` and the "Run the passes again" button text
(`packages/client/src/features/discovery/components/corpus-readiness-rail.tsx:86,137`),
`data-slot="corpus-home-skeleton"` (`corpus-home-skeleton.tsx:51`) — all live. The reading-measure pin
(:1098-1126) uses the SAME canvas-`measureText` method the `design-audit` walker uses, denominated
identically by design — a strong instrument-honesty pattern (matches leg-1's `badge.ct.tsx` exemplar). The
\#535/#553/#556/#557 populated-fixture block is a second, deliberate arm of the SAME surface (documented
in-file as intentional per `test-layout`'s file↔source mirror, not scope creep). No findings.

### `tests/client/features/discovery/surfaces/corpus-list-surface.ct.tsx` (548 lines) — CLEAN

Full read. Omnibox target dispatch (Characters/Scenes/Text), the one-search-input consolidation (U1/P2),
keyset-paged browse windowing (A8/C5), and the accessible-name/aria-expanded corpus ARIA sweep (#537). The
A8 tail-page test (:330-358) is the strongest pattern in the file: it polls a REAL scroll-drive loop
(`node.scrollTop = node.scrollHeight` inside the poll callback) rather than a single jump-to-bottom, which
is exactly what a paged tail-fetch needs (a one-shot scroll-to-end only ever reaches what is ALREADY
loaded). No literal `reports/` writes, no un-marked casts, no un-failable negatives — the "exactly one
free-text input" pin (:117-139) counts by a `placeholder`-carrying input rather than a bare `input` tag
count, with the reasoning stated in-file (facet Selects also render native inputs). No findings.

### `tests/client/features/databank/surfaces/databank-library-surface.ct.tsx` (558 lines) — CLEAN

Full read, 320px production-width mount. Phase-chip/stall/remedy rendering (§6.1, DBFIX), the `Everywhere`
global toggle proven by BOTH `aria-pressed` AND the recorded mutation input, the D-1 one-`listGlobal`-read
claim proven as a REQUEST COUNT (correctly, since D-1's claim IS about wire volume — `trpc.count(...)`
polled, not read once, :313-317), server-side search/phase-scope lensing (the 2026-08-13 "lenses are the
server's" ruling) proven via `trpc.lastInput`, and virtualized-list head-eviction proven via a BAND COUNT
rather than DOM presence (:514-541 — the file's own comment explains why a DOM-presence check would be
blind to virtualization vs eviction; this is the correct instrument). All screenshots/writes go through
recorded mutation inputs, not literal file paths — no `reports/` write in this file. `scrollPoll()` is
correctly a FUNCTION (not a shared const) per the file's own comment citing the `ct-poll-schedule-and-paint`
interval-array-is-drained lesson (:23-28) — this is the fix for exactly the class of bug that would
otherwise silently degrade a shared schedule to its 1000ms fallback on the second poll in the file. No
findings.

### `tests/client/components/tracker-blocks/tracker-blocks.ct.tsx` (879 lines) — CLEAN

Full read. The tracker block kit (MeterRow/StatCell/TrackerChip/CastCard/BeatLine/AmbientStrip/GoalLine/
AddRow/HintEditor), both read-only and editable (display-at-rest → click-to-edit) arms, exhaustively. Every
commit assertion is the CALLBACK VALUE (`assert-the-mutation-fired`), never a UI reaction to a stubbed
response. The convergence block at the tail uses `storyShot()` (imported from `tests/support/node/story-shot.ts`,
:18) for all three screenshots — the sanctioned wrapper, not a literal `reports/snaps/` path (the #1201
class leg 1 found one surviving instance of elsewhere). Hit-target geometry (:602-632) uses
`elementFromPoint` at ±10px to prove OWNERSHIP of the touch target, not just its bounding box — correctly
distinguishes "big enough" from "not stolen by the row below" per the file's own stated regression. No
findings.

### `tests/client/features/workloads/components/workloads-jobs-section.ct.tsx` (770 lines) — CLEAN, exemplary

Full read. The per-user Jobs section: list/filter, the run dialog (singular default, owner-only bulk +
target picker, maintenance-kind bulk-by-force), friendly-vs-raw error disclosure, cancel/retry, DAG
dependency wiring, scheduled-run epoch conversion, lane grouping, and the S5 socket-budget claim
(:690-747) — the strongest test in the file: THREE active rows attach three `workloads:<id>` rooms over
exactly ONE `EventSource` (`socket.connects()).toBe(1)`), and a terminal event gives back only ITS room
(`socket.detaches()` list-equality, not a bare count). `routeWorkloadStream`'s `awaitAttaches` gate
(:82-90, :712-729) is the correct mechanism — it holds the stub open until every room a test cares about
has actually attached, avoiding a race between the frame and the room-join. The `admin.listUsers`
skipToken-gate is proven as a ZERO REQUEST COUNT for a plain user (:139) — this IS a sound zero-read: it is
checked against a settled, fully-rendered surface (the whole tabpanel has rendered and been asserted on
already), not against a flash, so leg-1 F2's race shape does not apply here. No findings.

### `tests/client/features/preset/components/actions-view.ct.tsx` (545 lines) — CLEAN, exemplary

Full read. The Actions tab derived wholly from `TEMPLATE_DEFS`/`TEMPLATE_KINDS` (imported, not
hand-copied: `KIND_HEADERS` at :34 derives group headings from `TEMPLATE_KIND_LABEL` specifically so a new
`TEMPLATE_KINDS` member cannot go silently unrendered by the CT itself). Geometry pins (F-01 name-width,
R-7 one-left-edge, the two-line-clamp description) are total-population measurements gated behind
`expandAllClusters()` so a collapsed band's rows cannot escape the sweep — the file explains why this
matters (a management affordance or a starved name hiding inside a collapsed cluster would pass a
rest-state-only check). The `ADD_CONTROL_RE`/`REORDER_GRIP_RE` absence pins (:246-254) are a real
regex-vs-substring-collision fix documented in-file (:49-54) — exactly the accname-trap class leg 1's
taxonomy hunts, handled correctly rather than landed on by luck. The typing pin (:467-484) explicitly
tests via `pressSequentially` rather than `fill()` specifically because `fill()` cannot see a
per-keystroke transform bug — a good harness-correctness note. No findings.

### `tests/client/components/face-strip.ct.tsx` (469 lines) — CLEAN, exemplary

Full read. The shared face-strip primitive (favorites/chat-scoped variants), covering accessible naming,
caption truncation, empty-set rendering, touch-floor geometry, and the fold/overflow mechanism across a
12-point width sweep (`SWEEP_WIDTHS`, :273). The fold-count regex fix at :356-361 is a documented repair
of exactly the kind of "loose substring match hid a defect" bug leg 1's taxonomy flags (`not.toContain("+1")`
would also have passed on "+11" — the file states this explicitly as the reason it now parses the number).
One `ONESHOT-OK` marker (:436, `matchMedia("(pointer: coarse)")` read off a context-fixed-before-page-load
flag) — single-line, correctly justified, matches the identical pattern the `touch-target-floor.suite`
uses per its own citation. Positive-control discipline at :294-311 (#521): the overflow tile's "not a
face" claim is checked against a REAL face's measured dress read off the SAME mount, not a hardcoded
value — avoids the tile-vs-face comparison silently drifting from the token it is supposed to track. No
findings.

### `tests/client/features/roster-preset/components/roster-picker.ct.tsx` (415 lines) — CLEAN, exemplary

Full read. The saved-roster picker's library plane: rows, delete (ConfirmDialog-gated, proven via a
0→1 mutation-count transition — not just a rendered dialog), width-matrix geometry under both coarse and
fine pointers (#810, `expectRowIsLegible` — a genuine "who wins the hit-test" proof via `elementFromPoint`
at the badge's own centre, not just a non-overlap rect check), accessible-name count-carrying (#812), and
the apply-report / include-line arms. Two `ONESHOT-OK` markers (:238, :436-equivalent at :239), both
single-line and correctly the same context-fixed-before-mount justification as `face-strip.ct.tsx`'s. The
retry proof (:396-414) explicitly notes the CT `QueryClient` runs `retry: false` so exactly 2 calls is a
sound assertion rather than a race against internal retry — a harness-correctness note worth keeping. No
findings.

### persona-\* (5 files) — ALL CLEAN, exemplary

- **`tests/client/features/persona/surfaces/persona-panel-surface.ct.tsx`** (221 lines): the persona
  switcher, both lenses (sheet + rail-popover bar). Proves the scope-routes-the-verb claim (Everywhere →
  `settings.updateUserSettingsSection`, This chat → `persona.setActivePersona`) through recorded mutation
  inputs. Three `ONESHOT-OK` markers (:124, :161, :173), each a zero-count read of the SIBLING verb taken
  after a `.poll()` on the SAME click's resolving verb — sound: since both writes originate in the same
  synchronous click handler, a settled poll on the one that fired is a happens-after for the one that
  didn't (this is the "single-confirm-handler arm-exclusivity" pattern leg 2 validated at
  `preset-editor-surface.ct.tsx:796`, not leg-1 F2's unbarriered race). All single-line, correctly worded.
- **`tests/client/features/persona/components/persona-this-chat-section.ct.tsx`** (245 lines): the in-room
  persona switch + restamp. Two `ONESHOT-OK` markers (:121, :124) — the `chat.listMessages`-count-zero
  negative at :124 is a genuine ordering proof (the file states why: the OLD client's window read had to
  precede the mutation, so by the time the polled mutation input exists, a window read would already be
  recorded). No findings.
- **`tests/client/features/persona/components/persona-panel-row.ct.tsx`** (381 lines): the row primitive
  (native-button "set current" target, disjoint sibling controls, pin-not-crown, coarse-pointer collapse).
  Every geometry fence uses a FRACTION set BELOW the measured value (documented in-file, e.g. :34, :296) —
  the fence-not-pixel discipline leg 1 praised in `card.ct.tsx`. No findings.
- **`tests/client/features/persona/components/persona-list.ct.tsx`** (280 lines): the management surface,
  name-collision qualification, pin-not-crown at list scope, the ⋯ inventory, and the "from character"
  door. No findings.
- **`tests/client/features/persona/components/persona-editor.ct.tsx`** (163 lines): MACU-2 macro-plane
  completion in the description field, the Connected-characters junction, and a genuine double-click/retry
  race test (`button.click(); button.click();` inside one `evaluate` to fire both synchronously, then
  assert exactly one attempt landed before the button re-enables). No findings.

### character-\* family, batch 1 (15 files) — ALL CLEAN

- **`tests/client/features/character/components/character-history-tab.ct.tsx`** (35 lines): double-click
  durable-intent + retry-after-rejection for Snapshot. CLEAN.
- **`tests/client/features/stats/components/analytics-personas-tab.ct.tsx`** (28 lines): list-of-listitems
  a11y + chart-as-table. CLEAN.
- **`tests/client/state/character-selection-store.ct.tsx`** (46 lines): selection/facet store transitions,
  cross-clearing semantics. CLEAN.
- **`tests/client/features/character/components/character-tags-row.ct.tsx`** (74 lines): tag
  remove/add double-click durable-intent + retry. CLEAN.
- **`tests/client/features/character/hooks/use-tag-suggestion-mutations.ct.tsx`** (73 lines) — despite the
  brief's name, this file exercises the "Suggest tags" refusal-copy path end-to-end through the real
  editor + `MutationCache.meta.errorToast` channel, not the hook in isolation; it is the correct/only CT
  for that hook's user-visible contract. CLEAN.
- **`tests/client/components/character-picker.ct.tsx`** (80 lines): keyboard-roving tail-pagination
  (#334), red-first note in the header explicit about compiling against the OLD source. CLEAN.
- **`tests/client/features/character/components/character-bulk-bar.ct.tsx`** (125 lines): narrow-panel
  clip fence + a real 3×2×2 durable-selection-retirement matrix (action × replacement-overlap × verdict) —
  strong coverage of a genuinely tricky "which IDs does a completing bulk op retire" race. CLEAN.
- **`tests/client/features/character/components/character-facet-row.ct.tsx`** (128 lines): invalid-HTML
  structural pin (no `<p>` inside `<button>`) plus the a11y-description state contract. CLEAN.
- **`tests/client/state/character-library-store.ct.tsx`** (133 lines): view-pref store (sort/view/filters/
  bulk/blur/tag-cycle/search), correctly distinguishing persisted vs transient fields via `localStorage`
  reads. CLEAN.
- **`tests/client/features/character/components/character-card.ct.tsx`** (262 lines): the row anatomy —
  subtitle ladder, D11 star-as-toggle/marker-form, reveal-cluster geometry (byte-identical rest⇄revealed
  boxes), bulk-mode checkbox, kebab vocabulary-slice census. CLEAN.
- **`tests/client/features/character/components/character-actions-menu.ct.tsx`** (161 lines): the
  cross-feature "Open in Refinery" door (resume-vs-mint #79) plus the `open`-scope kebab vocabulary
  census. Three `ONESHOT-OK` markers (:76-77, :90-91, :149-150), all settled-barrier-justified. CLEAN.
- **`tests/client/features/character/components/character-chats-projection-shell.ct.tsx`** (170 lines):
  server-narrowed chat projection (departed-seat inclusion, D3 stack rule, D4 order), name-collision
  escalation, empty-state primary CTA. CLEAN.
- **`tests/client/features/chat/anchors/character-gallery-dialog.ct.tsx`** (166 lines): lightbox
  on-screen-action geometry at two real viewports, destructive-confirm gating, and a genuine
  double-dispatch durable-batch-add test. CLEAN.
- **`tests/client/features/character/components/character-library-welcome.ct.tsx`** (248 lines): the
  Characters CONTENT landing (#864). The #1134 test (:149-169) is the strongest file in this batch — it
  proves a THREE-suspense-query waterfall regression via raw `page.on("request"/"requestfinished")`
  event ordering rather than a query count, which the file's own comment explains is necessary because
  `__orb.queries()`/count-based probes are structurally blind to ordering. CLEAN.
- **`tests/client/features/stats/surfaces/analytics-character-surface.ct.tsx`** (87 lines): a small,
  honest CT for a surface that had none — padding pin + landmark/figure mount. One `ONESHOT-OK` (:66-67),
  correctly justified (static CSS from a prop, settled by the visibility barrier above it). CLEAN.

### character-\* family, batch 2 (3 files) — ALL CLEAN, exemplary

- **`tests/client/features/character/lib/characters-section.ct.tsx`** (317 lines): the section IA
  through the REAL registry (#501 library-stays-docked, the six-tab context roster #841/#860, band/head
  identity). Every claim driven through `registry.get("characters")`, never a bespoke mount — the file's
  own header states why (a bespoke mount proves none of the wiring). No findings.
- **`tests/client/features/chat/components/chat-character-bar.ct.tsx`** (339 lines): D16 size-gate, D-490
  no-mutation-door re-aim (with an explicit note on why the OLD host-gate pin was re-aimed rather than
  kept — half a migration is the rot), over-art backing token derivation, and the #511 phone-strip
  avatar-collapse — the strongest file in this batch: a 3-width matrix with `sr-only` ink-width
  measurement (`nameInkWidths`) that distinguishes "hidden from sight" from "still spending layout width",
  which a `toBeHidden()`-style assertion cannot. No findings.
- **`tests/client/features/character/components/character-appearance-tab.ct.tsx`** (474 lines): the Look
  theme cluster (immediate-commit, per-field clear, reset-to-null, colour debounce) and the Trust ladder
  (HTML-rendering rung write pairs, deployment-ceiling copy/enablement asymmetry, external-media
  absolute-ceiling disabling). The colour-readout test (:452-474) is a strong instrument: asserts the
  absence of `oklch(` via `innerText` (the whole rendered surface) rather than a scoped locator, so it
  stays true as new colour rows are added. No findings.

### `tests/client/features/character/surfaces/character-library-surface.ct.tsx` (1,951 lines) — CLEAN, exemplary — drains the character-\* family

Full read, both halves (the ambient-routes/paging/search/filter core, then the 2026-08-17/08-18/08-22
side-eye re-pass sweeps). This is the strongest single file in the shard, on par with leg1's
`app-shell.ct.tsx` and this shard's `corpus-home-surface.ct.tsx`. Highlights:

- **Every lens is proven at the SERVER, never the loaded window** (owner ruling 2026-08-13): search,
  favorites, tag include/exclude, and the census are all asserted through `trpc.lastInput`/recorded
  request shape, with the input-aware `characterListResponder` deliberately used INSTEAD of a fixed-array
  stub because a fixed array would let a client-side-filter regression pass (:8-13 states this as the
  file's own governing method).
- **Eviction proof is a READOUT, not DOM presence** (:422-477) — the file's own comment explains why "is
  row 1 in the DOM" cannot distinguish eviction from ordinary virtualization at the list's tail, and uses
  the loaded-vs-census foot line instead.
- **Referential integrity at read (W5, :922-969)**: a persisted filter for a DELETED tag must stay
  VISIBLE+clearable (never silently dropped, :902-921) yet must not VETO the whole library
  (:929-949) — two tests pinning opposite failure directions of the same defect class, plus an explicit
  first-read-vs-settled-read distinction in the comment (the tag-library authority hasn't answered on
  request #1, so the dead id may still ride the wire once before the correction).
- **"The ruling survives — its input changed" idiom used twice, correctly** (:1150 RAIL_CHROME_CEILING,
  :1414 the count-datum's new location) — exactly the house resolution pattern
  `lane-standing-facts.md` names, applied to real prior findings with the old receipt cited each time.
- **An owner-refused fix is recorded as a refusal, not silently re-tried** (:1140-1157, :1316-1321 — ARM B
  2026-08-17: reserving the state-glyph cell was measured and rejected for its chrome cost; the comment
  states the refusal AND the alternative considered, so a later reader does not "fix" it back).
- Two genuine layout-shift/CLS-class proofs (:1347-1379 vocabulary-landing-does-not-grow-the-group,
  :1311-1345 selecting-a-chip-does-not-reshuffle) both measured as byte-identical boxes, the correct
  strong form.
- Tab-order/toolbar-roving proof for the 551-chip cloud (:1682-1705) — one tab stop, arrow-key roving,
  matching WAI-APG's toolbar pattern, asserted via `tabindex="0"`/`"-1"` counts plus real ArrowRight/Left
  presses.
- Premise currency spot-checked: `data-tag-filter-state` is live at
  `packages/client/src/features/character/components/character-filter-rail-parts.tsx:224` (its own
  selector constant is defined at :26 of that file, matching `TAG_CHIP_SELECTOR`).
- Two `ONESHOT-OK`-shaped comments in this file are actually plain prose notes ("Settled snapshot: …")
  rather than the literal marker string — worth flagging as a STYLE drift, not a defect: they carry the
  same justification content the marker convention exists for (:1875-1877, :290-292 of the equivalent
  pattern in sibling files), just without the `ONESHOT-OK:` prefix a corpus-wide marker census keys off.
  No actual bare zero-read anywhere in the file lacks a justification — this is a naming-convention gap,
  not an honesty gap.

No findings.

### The final 12 files ("the rest") — ALL CLEAN, exemplary — SHARD COMPLETE

- **`tests/client/features/preset/components/regex-tab.ct.tsx`** (104 lines): the built-in-default
  no-retryable-failure gate + the attached-but-disabled state-naming fix. Two `ONESHOT-OK` markers
  (:62, :64), settled-barrier-justified. CLEAN.
- **`tests/client/data/use-invalidation.ct.tsx`** (124 lines): real `useTRPC()`/`useQueryClient()`
  context wiring + the startChat-burst redundant-invalidation regression guard. The file's own header
  states the house rule verbatim ("ABSENCE IS PROVEN WITH A ROUND-TRIP BARRIER, never a bare
  `expect.poll` on the count under test — poll goes green the instant a value TRANSITS the expectation")
  and every negative assertion in the file follows it, with `ONESHOT-OK` prose spelling out the exact
  ordering proof each time (:90, :105, :121). CLEAN — a model file for this idiom.
- **`tests/client/data/bus/use-user-bus.ct.tsx`** (93 lines): the reconnect-only gap-heal cadence and
  the double-mount-edge dedupe, through the real SSE-1 room-registry path. Same round-trip-barrier
  discipline as `use-invalidation.ct.tsx` (:46, :90). CLEAN.
- **`tests/client/features/refinery/components/schema-editor-dialog.ct.tsx`** (307 lines): first-ever
  coverage for a previously-half-unreachable dialog (P1-15) — preflight tiers, arm picker, needs-raw
  refusal, pending-arm busy states, the D3 zod-issue-array-to-sentences fix, and the #81 dirty-draft
  close-guard (Escape/Cancel/backdrop all gated identically). One `ONESHOT-OK` (:304), correctly
  justified (two mutation arms of one click handler; the resolving arm was already awaited). CLEAN.
- **`tests/client/features/rpg/components/turn-tool-calls-disclosure.ct.tsx`** (282 lines): the
  per-turn tool-call disclosure, all four verdict arms, the `isRpgEngaged`-gated no-request-for-a-
  non-game-chat proof (with a stubbed-present record as the positive control so the absence is real),
  and the coarse/fine touch-floor split. Three `ONESHOT-OK` markers (:163, :187, :97), all
  settled-barrier-justified. CLEAN.
- **`tests/client/lib/motion-flaggers.ct.tsx`** (629 lines, leg1 MID-band 7.8): the `[space]`/`[css]`/
  `[input]`/`[anim]`/`[drop]` dev-instrument channels. Repeated instances of the "lying instrument" fix
  genre with BOTH-direction planted controls (#852 CSSOM freshness, #1069 Base-UI-height carve-out,
  §3.7 hover-colour carve-out) — exactly the pattern memory hub's `degraded-instrument-fixes-now` /
  `instruments-lie` lessons describe done right. Two `biome-ignore lint/nursery/noPlaywrightWaitForTimeout`
  suppressions (:527, :552), both adjacency-compliant and both justified as genuine negative-window
  controls with no DOM condition to wait on. CLEAN.
- **`tests/client/lib/motion-stats.ct.tsx`** (329 lines): the dev CLS flagger. The file's own header
  states two timing laws it was built to survive (a shift needs a presented "before"; the default
  Playwright poll schedule silently forfeits its own tail) and both are visibly obeyed throughout
  (`evidencePoll()` minted fresh per call, `settlePaint()` for the one non-click-driven arm). CLEAN.
- **`tests/client/lib/long-task-tracer.ct.tsx`** (163 lines): the `[frame]`/`[reflow]` channels, P8
  planted-defect proofs including the #432 two-armed reflow claim (a positive arm asserting the
  measured cost AND a negative arm proving its own plant ran style/layout but forced nothing, before
  the silence assertion is trusted). CLEAN.
- **`tests/client/features/plugin/components/plugin-scripted-surface.ct.tsx`** (476 lines): the Tier-C
  scripted-plugin surface — REAL QuickJS-WASM guest in a REAL Web Worker. Three security/containment
  claims proven against hostile inline guest sources (never a fixture file, deliberately — the header
  explains a linted fixture couldn't hold the hostile shapes under test): zero-network-on-keystroke,
  hung-guest collapse within deadline (both the CPU-bound in-guest-interrupt arm AND the
  non-executing host-wall-clock arm, kept as two separate tests because they're contained by two
  different mechanisms), and the publish-guard refusing a re-render loop. The F3 realm-allow-list test
  (:442-475) is a genuinely strong closed-set security pin — asserts the EXACT sorted global list a
  quickjs-ng bump could silently widen, matching the server-side realm test's own pin. CLEAN, no
  findings — this is security-adjacent code and it holds up.
- **`tests/client/features/credentials/components/connections-roles-section.ct.tsx`** (380 lines): the
  live-vs-draft connection disclosure (the 2026-08-01 owner incident: a stale "Saved" chip over a NULL
  DB row for two hours). Covers the stuck-chip regression (a landed save must retire WITHOUT a bus
  refetch), the foreign-write re-aim case, the protocol-coherence turn-breaker, and the ignored-model-pin
  disclosure. Two `ONESHOT-OK` markers (:149, :242), both settled-poll-justified. CLEAN.
- **`tests/client/data/create-entity-mutation.ct.tsx`** (267 lines): the 4-phase optimistic-mutation
  factory, driven against a REAL `trpc.tag.createTag.mutationOptions()` pair (never a hand mock — the
  header explains why: a mock mutationFn would hide the exact variance the factory's context-arg
  contract depends on). Covers cache-optimistic write, rollback, sticky-error-clears-on-next-mutate,
  variables-mode retry, an older-optimistic-failure-cannot-overwrite-a-newer-success race (TWO variants:
  reference inequality AND deep-equal-but-newer), the cold-cache phantom-row removal, the `echo` seam
  (a busDriven write's own response seeds the read with no refetch), and the errors-as-data refusal
  arm (`{ok:false}` on a 200 — no `onError`, no throw, still has to toast and not seed the echo). One
  `ONESHOT-OK` (:233), settled-poll-justified. CLEAN — this file alone proves more TanStack-Query-factory
  edge cases correctly than most repos' entire mutation test suites.
- **`tests/client/data/bus/use-orb-socket.ct.tsx`** (224 lines): the multiplexed-socket attach gate —
  the file's own header explains why this is the load-bearing test: the pointer gate used to live
  inside a `skipToken` expression whose only observable effect was an uncounted network connection, and
  the multiplex turns "did this open a room" into a recordable `attach` mutation. Covers the three-state
  gate (landing / non-game / disengaged-but-present), N-rooms-one-connect, the W1 UNAUTHORIZED-enters-
  recovery-ladder red-first proof, and the #222 socket-fault-fan-out-to-N-toasts regression (fixed to
  ONE alert). Every negative-count assertion uses the same "later frame proves the earlier fault was
  already routed" strict-ordering barrier idiom. CLEAN.

**With this chunk the shard's full item list is drained** — every brief item, resolved and read.

## Taxonomy sweep receipts (over the 45 files read this shard)

- Literal `reports/` string-literal writes: **0** across all 45 files (tracker-blocks uses `storyShot()`,
  the sanctioned wrapper). Method: read-through of every `.screenshot(` call site (2 total, both
  `storyShot`).
- **Marker-naming-convention gap (new observation, not a finding):** `character-library-surface.ct.tsx`
  justifies several zero/settled reads with prose ("Settled snapshot: …") that carries the SAME content
  as the `ONESHOT-OK:` convention but does not use the literal prefix — `grep -c ONESHOT-OK` on that file
  returns 0 despite genuine oneshot-shaped reads being present and justified. A corpus-wide marker CENSUS
  (leg 1's Phase A method) would undercount this file's honest population. Worth a light sweep in a later
  leg to confirm the pattern is isolated to this file or common; not filed as a finding here since every
  site IS justified, just not under the counted spelling.
- **`biome-ignore lint/nursery/noPlaywrightWaitForTimeout` suppressions found this shard: 2**
  (`motion-flaggers.ct.tsx:527,552`), both adjacency-compliant per the doctrine's biome-ignore rule and
  both genuine negative-window controls (no DOM condition exists to poll on — the assertion is "forbidden
  work did NOT happen in a fixed wall-clock window").
- **`ONESHOT-OK` markers final tally: 21** across the whole shard (13 through chunk 4 + `regex-tab.ct.tsx`
  ×2, `use-invalidation.ct.tsx` ×3, `use-user-bus.ct.tsx` ×2, `turn-tool-calls-disclosure.ct.tsx` ×3 total
  including one found in chunk 5's own file already counted, `schema-editor-dialog.ct.tsx` ×1,
  `connections-roles-section.ct.tsx` ×2, `create-entity-mutation.ct.tsx` ×1) — every one read, every one
  single-line, every one carrying a real settled-barrier or strict-ordering justification. Zero found
  un-failable or mis-windowed.
- **`character-library-surface.ct.tsx`'s referential-integrity pair** (W5, :902-949) is this shard's
  strongest instance of the "prove an absence AND its opposite failure direction in the same test suite"
  discipline the taxonomy asks for: a dead-tag filter must stay visible+clearable (not silently dropped)
  yet must not veto the whole library (not silently applied) — two tests, opposite directions, same root
  cause.
- `as unknown as` / `as any as` double-casts reaching an assert: **0** unmarked. Method: read-through;
  the files use narrow interface casts on recorder payloads (e.g. `workloads-jobs-section.ct.tsx`'s
  `trpc.lastInput(...) as { input?: ...}` shapes) which are FABRICATION-OK-class narrowing reads of typed
  recorder output, not double-casts reaching an assert.
- `getByRole(name:)` without `exact` where the name SHAPE is the claim (prefix-collision risk): checked
  at `corpus-search-results.ct.tsx:480,553,563-564`, `corpus-list-surface.ct.tsx` (target-picker names
  match a `RegExp` on purpose, not a collision site), and `roster-picker.ct.tsx`'s Start/Add door names
  (:277-278, distinguished by their trailing counts) — every collision-risk site in this chunk uses
  `exact: true` correctly.
- `ONESHOT-OK` markers: **13** found across chunks 2-4 (chunk 2: `face-strip.ct.tsx:436`,
  `roster-picker.ct.tsx:238-239`; chunk 3 persona-*: `persona-panel-surface.ct.tsx:124,161,173`,
  `persona-this-chat-section.ct.tsx:121,124`; chunk 4 character-*: `character-actions-menu.ct.tsx:76-77,
  90-91,149-150`, `analytics-character-surface.ct.tsx:66-67`) — all single-line, all correctly justified
  (arm-exclusivity or ordering proofs, not un-barriered races). Positive control: confirmed the marker's
  window rule (exact line, never a wrapped multi-line marker) by checking each site's marker sits
  directly on the one assertion line it justifies.
- Planted positive control for "0 literal `reports/` writes": grepped `screenshot({ path:` and bare
  `reports/` string literals across the 9 files by hand during the read (not a corpus-wide AST sweep this
  chunk — that sweep is leg 1's and still holds at this base per leg 2 §0's fresh-scan note, 1 surviving
  site at `rules-section.ct.tsx:1088`, outside this shard).

## Verified clean — what this shard's silence covers

- Full reads of all 45 files listed above, whole files, no sampling. The character-\* family (19 files: 2
  read in leg 2, 17 read in this shard) is FULLY DRAINED. Every item in the dispatch brief is resolved
  and read.
- Premise currency spot-checked with source greps for `corpus-home-surface.ct.tsx`'s five load-bearing
  `data-*` selectors and `character-library-surface.ct.tsx`'s `data-tag-filter-state` (all live, cited
  above).
- No test was RUN this shard (0 of 6-run budget) — every verdict is structural/read-derived, consistent
  with legs 1 and 2's posture.

## Not yet reached

**None — this shard's brief list is fully drained.** Nothing outside the brief's scope was read (no
excursion into other shards' territory).

## Shard summary

**45 files full-read across 8 commits, 0 findings, ceiling P3 (campaign ceiling unchanged from leg 1's
P3).** Combined with legs 1+2 (69 files) and the sibling shards' independent coverage, this shard adds
45 more files to the campaign's read population — discovery (4), databank (1), tracker/workloads/preset/
face-strip/roster-picker/regex-tab/schema-editor (7), persona (5), character family (19, full drain),
rpg (1), motion instruments (3), plugin (1), credentials (1), and 4 client/data hook files. The register
observed across this entire shard matches legs 1+2's headline: exceptional discipline, real red-first
defect proofs, correctly-justified `ONESHOT-OK` markers, no stale premises, no un-failable negatives, no
tautologies, no literal `reports/` writes outside the sanctioned wrapper.

## Issue summary (for #1229 — paste verbatim)

> **CT corpus audit leg 4b (cb-ct-audit-4b, one of three parallel shards): 45 files full-read
> (discovery/databank surfaces, tracker-blocks/workloads-jobs/actions-view/face-strip/roster-picker,
> all 5 persona-* files, the full 19-file character-* family including the 1,951-line
> character-library-surface.ct.tsx, regex-tab, schema-editor-dialog, turn-tool-calls-disclosure, the
> three motion-instrument files, plugin-scripted-surface (real QuickJS-WASM guest), connections-roles-
> section, and 4 client/data hook files). Verdict: 0 findings — the shard is entirely CLEAN, consistent
> with legs 1+2's headline. Taxonomy sweep this shard: 0 literal `reports/` writes outside `storyShot()`,
> 21 `ONESHOT-OK` markers all sound, 2 `noPlaywrightWaitForTimeout` suppressions both genuine negative-
> window controls. One process note: the brief cited a `leg3.md` shard-map source that does not exist in
> this worktree (only leg1/leg2 present at base) — this report follows leg2 §5's queue instead and is
> numbered leg4b to avoid colliding with the sibling shards. One coordination flag: `corpus-search-
> results.ct.tsx`'s SCENES door-look block (:483-503) was read pre-#1249 (the sibling lane's RoomDoor fix
> is not in this worktree) — re-verify once that merges. One new observation (not filed as a finding):
> `character-library-surface.ct.tsx` justifies several oneshot-shaped reads with prose rather than the
> literal `ONESHOT-OK:` marker, which a corpus-wide marker CENSUS would undercount — worth a light sweep
> to confirm scope. Report: `docs/reviews/stickler/2026-09-02-ct-corpus-audit-leg4b-discovery.md`.\*\*
