---
kind: review
status: active
updated: 2026-09-02
---

# CT corpus audit — L3 shard (rpg / refinery / preset / automation / workloads / imagery)

Lane `cb-ct-audit-L3`, #1229. Parallel shard alongside legs 1-3 (`2026-09-02-ct-corpus-audit-leg{1,2,3}.md`),
scoped to `tests/client/features/{rpg,refinery,preset,automation,workloads,imagery,gallery,tool-use}/**`,
same rubric (leg 1 §2: honesty, premise currency, coverage, harness correctness) and taxonomy (leg 1's
stale premise / luck-based coverage / decorative pins / `as unknown as` double-casts / oneshot live-read
asserts / literal `reports/` writes / accname substring traps / stand-in children / tabs-accumulate /
shared-render-tree reads, plus the ONESHOT-OK adjacency window and any `kill` binary spawn per leg 3).

No `gallery` or `tool-use` `.ct.tsx` files exist on this tree (`git ls-files` over those two dirs returned
nothing under this filter).

## 1. Population

`git ls-files` over the eight scoped directories filtered to `.ct.tsx`, minus (a) files legs 1-3 already
full-read (`rpg-context-section`, `rules-section`, `owner-automation-sections`, `params-deck`,
`preset-library-surface`, `preset-editor-surface`, `preset-structure-tabs`, `section-drill-in`,
`lane-run-control`, `image-edit-body`, `workloads-group`, `payload-view`, `image-detail-body`,
`refinery-content-surface`, `refinery-list-surface`) and (b) the concurrent sibling shard's explicit
exclusion list (`tracker-blocks`, `workloads-jobs-section`, `actions-view`, `face-strip`, `roster-picker`,
`regex-tab`, `schema-editor-dialog`, `turn-tool-calls-disclosure`, `plugin-scripted-surface`,
`connections-roles-section`, `persona-*`, `character-*`).

**Population: 35 files, 4,507 lines**, in directory order:

- automation (4): `clock-meter`, `needle-meter`, `quick-reply-chip-mount`, `suggestion-card-mount`
- imagery (1): `imagine-body`
- preset (12): `macro-text`, `message-handling-section`, `preset-macro-suggestions`,
  `prompt-assembly/section-row`, `readout/actions-readout`, `readout/prompt-readout`,
  `readout/readout-binding`, `readout/readout-parts`, `readout/transforms-readout`, `readout/usage-readout`,
  `user-macros-tab`, `variables-tab`
- refinery (7): `accept-review`, `rewrite-lane`, `run-controls-card`, `scope-editor-dialog`,
  `teaching-state`, `hooks/use-refinery-mutations`, `refinery-context-tabs`
- rpg (7): `rpg-actor-trackers`, `rpg-freshness-indicator`, `rpg-game-door`, `rpg-pack-rows`,
  `rpg-scene-cards`, `lib/dice-ask-source`, `lib/dice-tool-renderer`
- workloads (4): `backup-export-section`, `import-library-section`, `schedules-section`,
  `workloads-tuning-section`

All 35 read whole, top to bottom, no sampling. **100% of this shard's population.** Every file is well
under the Read tool's ~2000-line-per-call cap (largest is 327 lines), so every file was read in ONE call
with no offset/second read needed — no file in this shard required a multi-call read.

### 1a. Per-file line count + verdict (the coverage receipt)

| File | Lines | Verdict |
| - | -: | - |
| `automation/components/clock-meter.ct.tsx` | 88 | CLEAN |
| `automation/components/needle-meter.ct.tsx` | 117 | CLEAN |
| `automation/components/quick-reply-chip-mount.ct.tsx` | 167 | CLEAN |
| `automation/components/suggestion-card-mount.ct.tsx` | 159 | CLEAN |
| `imagery/components/imagine-body.ct.tsx` | 143 | CLEAN |
| `preset/components/macro-text.ct.tsx` | 121 | CLEAN |
| `preset/components/message-handling-section.ct.tsx` | 47 | CLEAN |
| `preset/components/preset-macro-suggestions.ct.tsx` | 65 | CLEAN |
| `preset/components/prompt-assembly/section-row.ct.tsx` | 55 | CLEAN |
| `preset/components/readout/actions-readout.ct.tsx` | 134 | CLEAN |
| `preset/components/readout/prompt-readout.ct.tsx` | 144 | CLEAN |
| `preset/components/readout/readout-binding.ct.tsx` | 272 | CLEAN |
| `preset/components/readout/readout-parts.ct.tsx` | 327 | CLEAN |
| `preset/components/readout/transforms-readout.ct.tsx` | 102 | CLEAN |
| `preset/components/readout/usage-readout.ct.tsx` | 122 | CLEAN |
| `preset/components/user-macros-tab.ct.tsx` | 43 | CLEAN |
| `preset/components/variables-tab.ct.tsx` | 33 | CLEAN |
| `refinery/components/accept-review.ct.tsx` | 172 | CLEAN |
| `refinery/components/rewrite-lane.ct.tsx` | 94 | CLEAN |
| `refinery/components/run-controls-card.ct.tsx` | 56 | CLEAN |
| `refinery/components/scope-editor-dialog.ct.tsx` | 61 | CLEAN |
| `refinery/components/teaching-state.ct.tsx` | 135 | CLEAN |
| `refinery/hooks/use-refinery-mutations.ct.tsx` | 220 | CLEAN |
| `refinery/components/refinery-context-tabs.ct.tsx` | 303 | CLEAN |
| `rpg/components/rpg-actor-trackers.ct.tsx` | 47 | CLEAN |
| `rpg/components/rpg-freshness-indicator.ct.tsx` | 72 | CLEAN |
| `rpg/components/rpg-game-door.ct.tsx` | 66 | CLEAN |
| `rpg/components/rpg-pack-rows.ct.tsx` | 48 | CLEAN |
| `rpg/components/rpg-scene-cards.ct.tsx` | 29 | CLEAN |
| `rpg/lib/dice-ask-source.ct.tsx` | 150 | CLEAN |
| `rpg/lib/dice-tool-renderer.ct.tsx` | 88 | CLEAN |
| `workloads/components/backup-export-section.ct.tsx` | 154 | CLEAN |
| `workloads/components/import-library-section.ct.tsx` | 293 | CLEAN |
| `workloads/components/schedules-section.ct.tsx` | 320 | CLEAN |
| `workloads/components/workloads-tuning-section.ct.tsx` | 60 | CLEAN |
| **Total** | **4,507** | **35/35 CLEAN** |

## 2. Findings

**None.** Every file is CLEAN against the full rubric. This is the strongest-condition register the
campaign has found so far — no P3/P4 findings, no observations rising to a defect.

## 3. Taxonomy sweep receipts (grep over exactly these 35 files, counts printed)

- `screenshot({ path` (the #1201 evidence-corruption class) — **0**.
- Any `reports/` literal — **1 hit**, and it is a PROSE citation, not a write:
  `readout/actions-readout.ct.tsx:3` references `reports/snaps/readout-update-party.png` as the historical
  side-eye receipt that motivated the fix, inside a comment. No `screenshot`/`page.route` call touches
  `reports/` anywhere in the shard.
- `kill(` spawns (#1254) — **0**.
- `as unknown as` double-casts — **0** (none in this shard; contrast with legs 1-3 where several marked
  sites existed — this shard's fixtures are typed throughout, e.g. `ReviewEntry`, `ToolCallRecord`,
  `WorkloadEvent`).
- `test.skip` / `.fixme` / `.todo` / `.only` — **0**.
- `biome-ignore` / `eslint-disable` — **0**.
- `ONESHOT-OK` markers — **6 sites, 4 files**: `quick-reply-chip-mount.ct.tsx` (1), `imagine-body.ct.tsx`
  (3), `readout/transforms-readout.ct.tsx` (1), `lib/dice-ask-source.ct.tsx` (1). Every one sits on the
  line immediately above its `expect(...)`/`await expect...` call (verified by direct read, not just
  grep-adjacency) — the ONESHOT-OK adjacency window (leg 3's class) is satisfied at every site, no wrapped
  multi-line marker found.
- Sanity check that the sweep is a real scan and not a silent zero: grepping a bogus string
  (`TOTALLY_BOGUS_CONTROL_STRING_XYZ`) over the same file list also returns 0 hits, confirming the tool
  ran (the earlier hits — the `reports/` prose citation and the 6 ONESHOT-OK markers — prove the grep is
  live, not silently failing).

## 4. Per-file notes (all CLEAN; load-bearing shapes only)

- **`clock-meter.ct.tsx` / `needle-meter.ct.tsx`** — meter widgets with a real absent-data contract:
  every "renders nothing" arm asserts `innerHTML().trim() === ""`, not just a role-count zero, so a leaked
  wrapper element cannot hide behind a narrower selector. `needle-meter`'s #685 dial-vs-card ratio pin is
  measured as a RATIO (never px), which survives a copy change in the label row that sizes the card.
- **`quick-reply-chip-mount.ct.tsx` / `suggestion-card-mount.ct.tsx`** — real socket-attach handshake
  (LIFO gate registered after `routeOrbSocket`), every send/compose arm barriers on a rendered settle, the
  send-mode zero-read (`chat.send` count 0 in compose mode) rides a synchronous-click-path argument
  identical to leg 2's accepted shape (no F2-style bare zero with no rendered consequence — here the
  settled composer draft + focus IS the consequence).
- **`imagine-body.ct.tsx`** — the #623 cost-boundary suite: null `costUsd` asserted NOT to render `$0.0000`
  (falsy-trap coverage), the double-spend notice's ON/OFF transition proven both ways, and the in-flight
  arm uses `trpcHold()` (a real held network state) rather than a raced flash.
- **`macro-text.ct.tsx`** — alpha-channel color assertions are computed off whichever notation Chromium
  resolved to (`oklch`/`rgba`/`color()`), not a hardcoded string; the copy-preserves-macro test drives a
  real DOM Selection/Range round-trip rather than asserting a CSS class.
- **readout family (`actions-readout`, `prompt-readout`, `readout-binding`, `readout-parts`,
  `transforms-readout`, `usage-readout`)** — this is the strongest cluster in the shard. `readout-binding`
  and `readout-parts` in particular carry the same instrument-grade discipline legs 1-3 praised in
  `home-surface`/`config-list-surface`: `readout-parts.ct.tsx` pins THREE failure arms by their EARNED
  cause (`BAD_REQUEST` routing verdict vs `NOT_FOUND` missing-preset vs a causeless transport failure) with
  the wrong-cause regression named in-file at each; `readout-binding.ct.tsx`'s honesty pin
  (`{{user}}` resolves to "Nate", `{{person}}`/`{{input}}` survive as tokens) is the same
  fabrication-vs-passthrough discipline the campaign has flagged as load-bearing elsewhere.
  `transforms-readout.ct.tsx`'s pipeline-order pin is DERIVED from `PROMPT_LANE_STEPS`/`REPLY_LANE_STEPS`
  (the same tuples the server iterates) rather than hand-spelled, so a server-side reorder breaks it too.
- **`user-macros-tab.ct.tsx` / `variables-tab.ct.tsx`** — CT-4 array-op persistence pins (savedLen through
  the actual store driver, zero call-site flush) plus the X-3 remove-confirms regression guard.
- **refinery cluster** — `accept-review.ct.tsx` and `rewrite-lane.ct.tsx` are the workbench reshape's
  belt-preservation suite: every queue state read is off `data-queue-state` (not a class), the destructive-
  consent copy is pinned on the VERB itself in the queued state (not just the open pane), and the CD3 focal
  glow is asserted via `getComputedStyle(el, "::before").boxShadow` (a real pseudo-element paint read, not
  a class check). `use-refinery-mutations.ct.tsx`'s bus-freshness test is the campaign's clean answer to
  the "second-tab staleness" class: it presses a hand-fired bus tick with no local mutation involved at
  all, and the three discriminated-failure-copy tests correctly refuse to collapse three server error
  shapes into one generic toast. `refinery-context-tabs.ct.tsx`'s accessible-name-uniqueness pin
  (`new Set(names).size === names.length`) is a real distinctness proof, not a sampled pair.
- **rpg cluster** — `rpg-actor-trackers.ct.tsx` and `rpg-pack-rows.ct.tsx` are touch-floor pins that
  measure the PITCH between tiled targets rather than each target's own box (correctly avoiding the
  shared-boundary undercounting the file itself documents), with the coarse-pointer emulation landing
  proven before any geometry is trusted. `rpg-freshness-indicator.ct.tsx`'s EFF-3 guarded-arm test is the
  exact "a lying pill" class other legs flagged elsewhere, caught and fixed here. `dice-ask-source.ct.tsx`'s
  ruleset-gates-the-row test (#862) is a real product-contract pin, not a UI nicety — a freeform game
  publishing dice chips would be a broken affordance, and the test proves the empty-set collapse.
- **workloads cluster** — `backup-export-section.ct.tsx`'s two-step stage/confirm pin explicitly re-derives
  from a prior test that described a flow the product no longer has (#1197 self-correction, logged
  in-file) — the network-touched-nothing negative is asserted alongside the positive POST, which is the
  house pattern. `import-library-section.ct.tsx`'s epoch tests (`an older import completion cannot replace
  the newer batch outcome`, stale workload terminal callback) are real out-of-order-resolution proofs, not
  decorative. `schedules-section.ct.tsx`'s one-action-one-home test and the owner/plain-user
  `admin.listUsers` never-fired pin are real authorization-surface proofs.

## 5. What this shard's silence covers

- Full read of all 35 files in the shard's real population, top to bottom, no sampling — **35/35, 100%**.
- The taxonomy sweep receipts in §3, each printed as a count over exactly this file list.
- No test was RUN this shard (0 of the run budget) — every verdict is read-derived; nothing here depended
  on execution.

**Not covered:** anything in `gallery`/`tool-use` (no `.ct.tsx` files exist there on this tree — confirmed
by the `git ls-files` population query, not assumed); the files legs 1-3 already own; the files the
concurrent sibling shard owns (see §1's exclusion list) — those are its shard, not double-audited here.

## 6. Issue summary (for #1229 — paste verbatim)

> **CT corpus audit L3 shard (cb-ct-audit-L3, stickler): `rpg`/`refinery`/`preset`/`automation`/
> `workloads`/`imagery` fully drained.** 35 files / 4,507 lines read whole — 100% of this shard's real
> population after excluding legs 1-3's prior reads and the concurrent sibling shard's exclusion list (no
> `gallery`/`tool-use` `.ct.tsx` files exist on this tree). **Verdict: 35 CLEAN, zero findings.** Taxonomy
> sweep over exactly these files: 0 literal `reports/` writes (1 hit is a prose citation of a historical
> screenshot receipt in a comment), 0 `kill` spawns, 0 `as unknown as` casts, 0 skip/fixme/only, 0
> suppressions, 6 ONESHOT-OK markers across 4 files all inside the adjacency window (verified by direct
> read). The readout family (`actions-readout`/`prompt-readout`/`readout-binding`/`readout-parts`/
> `transforms-readout`/`usage-readout`) is the shard's strongest cluster — three-arm discriminated failure
> copy, a derived (not hand-spelled) pipeline-order pin, and the honesty pin proving fire-time macros
> survive as tokens while identity macros resolve for real. Report:
> `docs/reviews/stickler/2026-09-02-ct-corpus-audit-L3-rpg-refinery.md`.
