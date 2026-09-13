---
kind: review
status: active
updated: 2026-09-13
---

# cb-v-hit-geometry — adversarial CODE verification of the hit-geometry repair (`815741e6c` · `0b0fa1349` · `765dcdd71`)

Fresh-context CODE lens over #2300/#2301 as integrated on main. Read-and-run only; nothing was fixed. The
browser half (every `.ct.tsx`) is explicitly NOT COVERED — see §"WHAT I DID NOT COVER".

**Headline: the load-bearing claim is REFUTED.** The two hit-extent homes are NOT "pinned equal"; the
committed instrument proof stays 10/10 green when the walker's ancestor-credit predicate is reverted to the
exact pre-#2300 existence-only shape, and also when either home's credit clause is deleted outright. The
geometry arithmetic itself and every coupled-site claim (grant, eslint program, prose, causality) check out.

## 1. Base and root

- Worktree: `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-afaa3b219faef3320`
- `git -C <wt> rev-parse --short HEAD` → `765dcdd71`; `git status --short` empty at start and at finish.
- Baseline run before any probe:
  `pnpm test:scoped tests/support/iso/hit-extent-walk.test.ts tests/tooling/ui-audit/ops/walker/hit-extent.int.test.ts`
  → **10 passed (8 unit + 2 instrument-proof)**, slot
  `reports/runs/test/agent-afaa3b219faef3320-4064201-2026-09-13T05-33-42-495Z`.
- Probes were `cp f f.bak` / `mv f.bak f`, one command per call, announced to the orchestrator before and
  after; both files restored (`git status --short` and `git diff --stat` both empty — receipt at the end).

## 2. Verdicts, one per claim

### Claim 1 — ONE home for the credit rule; the walker is a hand mirror "pinned equal" — **REFUTED**

The pin is *structurally* real and better than the report needed to claim: `hit-extent.int.test.ts:70-77`
builds `CT_WALK_EVAL` from `HIT_EXTENT_WALK_SOURCE`, which `hit-extent-walk.ts:305-314` composes from the
kit functions' own `toString()`. So it is not "the walker vs a string of the kit's source" — it runs the
KIT's real rule inside the same page the walker is judging, in the same `snap` invocation. That half is
CONFIRMED.

What it does not do is pin the two EQUAL. Three probes, each with its own planted control:

| probe | change | expected if pinned | observed |
| - | - | - | - |
| A | delete the `pointerEvents === "none"` clause from the walker's `pseudoHitRect` (`hit-extent.ts:144`) | red | **10/10 GREEN** |
| B | replace the walker's `ancestorCreditAt` with the verbatim pre-#2300 `pseudoCarriesFloor` from `815741e6c^` (existence-only, ignores x/y) | red | **10/10 GREEN** |
| C | disable the kit's ancestor-credit clause in `walkFrom` (`hit.contains(el)` → unreachable) | red | **10/10 GREEN** |
| control 1 | walker `HIT_PROBE_RADII = [11]` | red | **RED** — `expected [ …floored-value…, …ringed-glyph… ] to not include '[data-slot=floored-value]'` |
| control 2 | kit `walkFrom` return `− 10` | red | **RED** — `the CT walk must clear the coarse floor: {"x":35,"y":34}: expected 34 to be >= 44` |

Logs: `cbv-probeA.log`, `cbv-probeB.log`, `cbv-probeC.log`, `cbv-control.log`, `cbv-control2.log`,
`cbv-controlC.log` in this session's scratchpad. Both controls prove the edited files are live in the run,
so all three zeros are verdicts and not dead probes.

**Mechanism (why the fixture cannot discriminate).** On `DOCUMENT` (`hit-extent.int.test.ts:37-61`):

- for `floored-value` / `floored-status` the hit pseudo SELF-REPORTS, so ownership clause 1 answers and
  clause 2 — the entire subject of #2300 — never runs. This is stated in the kit's own header
  (`hit-extent-walk.ts`, "for every hit-eligible pseudo on this tree this is the clause that answers, and
  clause 2 never runs"), and it is exactly why probe C is invisible;
- for `ringed-glyph` the wrapper `<div>` is only 25px tall and `<main>` above it carries text, so
  `hitForwards` refuses the r=21.5 rung under BOTH predicates. The control caps at the r=16 rung and is
  reported as a `tap-target` finding pre-fix and post-fix alike.

So the "#2300 negative control the class never had" passes against the DEFECT it was written to catch. The
prose that asserts otherwise is at `tooling/src/ui-audit/ops/walker/hit-extent.ts:126-127` ("pinned EQUAL …
Change one and that proof reds") and mirrored in `tests/support/iso/hit-extent-walk.ts` ("that pin is the
only thing keeping them from drifting apart again"). Ledger row 1.

Two further inequalities the pin cannot see, found by reading: the kit guards border widths
(`px(geometry.borderLeftWidth) || 0`) where the walker does not (`parseFloat(own.borderLeftWidth)`), so a
non-numeric border width makes the kit CREDIT and the walker REFUSE (case Q below); and the walker carries
`isVisuallyHidden`, `hitForwards`, `sharedCompositeOwns` and `forwardingLabelOwns`, which the kit does not
(declared, and they agree in effect on containing hits).

### Claim 2 — credit is bounded by the MEASURED outward rect and refused for an unreachable pseudo — **CONFIRMED (with two residual over-credit inputs)**

The 8 committed unit cases pass (baseline run). I constructed 17 more resolved-string cases against the real
`pseudoHitRect`/`pseudoHitEnvelope` (scratch `cbv-arith.mts`, run through `pnpm exec node`). The arithmetic
answers correctly everywhere I could falsify it:

| case | input | answer | verdict |
| - | - | - | - |
| matrix, x-only (`matrix(1,0,0,1,-27.5,0)`) | asymmetric shift | `{105,132.5,160,187.5}` | correct — y is untranslated |
| `translate: "-50%"` (single token, Chrome's form for an x-only translate) | | same as above | correct — `translate[1]` undefined → 0 |
| `translate: "-50% -50% 0px"` (3 tokens) | | `{105,105,160,160}` | correct |
| `translate: "-27.5px -27.5px"` | px branch | `{105,105,160,160}` | correct |
| `left: auto` alone / `right: auto` alone | one inset unresolvable | `null` | correct refusal |
| `translate` AND a translate matrix together | | shift −55 (additive) | correct — CSS applies both |
| `matrix3d(…)` pure translation | | `null` | correct refusal (under-reports) |
| outward by exactly 0.5px / by 0.6px | slack boundary | `null` / credited | matches the documented 0.5 slack |
| inverted rect (`left: 40px; right: 40px`) | left > right | credited, band empty | harmless: `walkFrom`'s half-open test can never be satisfied |

Two inputs are credited that the header says are refused, both in the OVER-report direction the header calls
"the direction that hides defects":

- **an ancestor `scale()`** (case K). `getBoundingClientRect` is post-transform while the resolved insets are
  local CSS px, and neither home checks an ancestor transform (only `facts.scale`/`facts.rotate` on the
  pseudo itself). With a 0.5-scaled ancestor the function answers `{111.25,111.25,153.75,153.75}` for a truth
  of `{112.5,112.5,140,140}` — the credit band runs ~14px past the pseudo's real reach on the right/bottom.
- **`visibility: collapse`** (case H) and **`display: contents`** (case I) are both credited; only
  `hidden`/`none` are refused. Neither spelling is on the tree today, so this is a fence-completeness note,
  not a live defect.

Ledger row 7. Both homes share the miss (the walker's arithmetic is byte-equivalent here).

### Claim 3 — credit is never reached when the hit pseudo self-reports; a stage wrapper can no longer be credited — **CONFIRMED on the code; the +20px measurements NOT COVERED**

`walkFrom.owns` (`hit-extent-walk.ts`) asks clause 1 (`hit === el || el.contains(hit)`) first and returns
before any ancestor logic; clause 2 requires `envelope !== null` AND the point inside the half-open rect AND
`hit.contains(el)`. So an isolated stage wrapper is creditable only where the pseudo actually reaches — the
\#2300 defect is closed in the code. The walker mirrors it (`ancestorCreditAt` gates `ownsPoint` before
`hit.contains(el)`). The report's `self` / `div:ancestor` table at ±20px came from a `snap --eval` browser
run and I did not reproduce it. Note that claim 1's finding does not touch this: the FIX is right, its PROOF
is what does not hold it down.

### Claim 4 — the node-side proof, and the reconstructed pre-#1843 fixture — **CONFIRMED**

- `pnpm test:scoped tests/support/iso/hit-extent-walk.test.ts tests/tooling/ui-audit/ops/walker/hit-extent.int.test.ts`
  → **10 passed**, reproduced by me (slot above). The red-first 161/26/56 table is browser-sourced: NOT COVERED.
- Fixture fidelity: `git show 183e49714:packages/ui/src/primitives/button/variants.ts:21-22` is
  `after:absolute after:top-1/2 after:left-1/2 after:size-touch-target after:-translate-x-1/2
  after:-translate-y-1/2 after:content-['']`, and `packages/ui/src/styles/globals.css:363-369` is the CTA ring
  (`content ""`, `absolute`, `inset: 0`, `z-index: 1`, `pointer-events: none`, 1px transparent border). The
  fixture's `.ringed::after` pair reproduces both faithfully, including the per-property collision. The
  hardcoded 28px/44px is right: `--spacing-touch-target` IS pointer-conditional
  (`theme.css:94` = 2.75rem, `theme.css:226` = 1.75rem under `@media (pointer: fine)`).

### Claim 5 — #807's differential re-pointed without weakening #662/#1067/#1829 — **CONFIRMED (code), CT numbers NOT COVERED**

`git show 815741e6c^:tests/tooling/design-audit-walker.ct.tsx` diffed against the tip: the #1067 and #1829
arms are untouched (no hunk), the #662/#665 arms changed only their prose and one message string (from "the
coarse touch floor" to "the fine-pointer floor" — the constant was `FINE_POINTER_FLOOR` both before and
after, so the message was wrong before and is right now; no assertion weakened). #807 keeps a `<` that can
fail, re-pointed onto the new `glyph-in-tight-row` arm, and the retired arm became a new #2300 `toBe`
equality rather than being deleted. The new arm's geometry is sound by arithmetic: prose at `1.3rem`
(20.8px) sits inside a `1.75rem` fine pseudo centred on a `1.25rem` box, so it contests pixels the pseudo
reaches while the `+30px` arm does not.

**Fragility note (unverified — needs the CT numbers).** With the walker's rungs `[11,12,16,22]`, my
arithmetic puts the isolated arm at exactly the rung-12 value (24px) at a fine pointer and the tight arm one
rung below (22px). If that derivation is right the arm passes by one rung, and any change to the glyph ramp,
the root size or the rung list flips it. Worth a CT print of both numbers rather than only the comparison.

### Claim 6 — `TEST_TREE_PROJECTS += tsconfig.tests-iso.json`, and no second program claims the files — **CONFIRMED, with a planted control**

- `pnpm exec eslint tests/support/iso/hit-extent-walk.ts tests/support/iso/hit-extent-walk.test.ts` → EXIT 0,
  no output.
- Positive control (a bare zero is not a measurement): planted
  `tests/support/iso/cbv-lint-control.ts` with two floating promises → EXIT 1, `2 problems`, both
  `@typescript-eslint/no-floating-promises` — a TYPE-AWARE rule, so the iso program is genuinely wired, not
  silently skipped. File `rm`ed; `git status --short` empty.
- Root ownership is single: `tsconfig.tests-iso.json` includes `tests/support/iso/**/*`, and BOTH
  `tsconfig.json` (line 33) and `tsconfig.tests-dom.json` (line 27) EXCLUDE it explicitly. The helper is of
  course pulled into an importer's program as a non-rooted member (that is the mechanism the eslint comment
  documents), which is not what type-ownership polices. I did not need `pnpm check:type-ownership` for this
  and did not run it.

### Claim 7 — the deleted `tsconfig-entry-liveness:tests-iso-helpers` grant — **CONFIRMED**

`pnpm check:structure --check tsconfig-entry-liveness --check eslint-grant-liveness` → EXIT 0:
`✓ tsconfig-entry-liveness · final reviewed-grant/error · … granted 8`, `✓ eslint-grant-liveness`,
`raw 8 = waived 0 + granted 8 + effective 0 · 0 alarm(s) · 0 tool error(s)`. The grant row is gone from
`tooling/src/verify/lib/reviewed-grants.ts` and nothing alarms stale.

### Claim 8 — the rpg CT red was PRE-EXISTING — **CONFIRMED (causality); the CT pass NOT COVERED**

- `git show 765dcdd71^:tests/client/features/rpg/lib/rpg-context-section.ct.tsx` contains 7 `"::after"`
  reads; the tip reads `"::before"` at lines 3656/3679/3704/3729/3755/3780/3809.
- `9ad17fb5a` (#1843) is the move: at `9ad17fb5a^` `variants.ts:21` is `after:size-touch-target`; at
  `9ad17fb5a` `glyphBox` returns `TOUCH_TARGET_PSEUDO` (`before:…`, `selection-control.ts:11-12`) and the
  `inline` arm is `before:` at `variants.ts:113-114`.
- `git diff --name-only 815741e6c^..765dcdd71 | grep ^packages/` → EMPTY (13 files, all under `tests/`,
  `tooling/` and `eslint.config.js`). The value the CT asserts comes only from `packages/`, so the red cannot
  be this branch's.

### Claim 9 — the pseudo-move reader sweep is complete — **REFUTED**

The prescribed grep plus a `::before` positive control (both non-empty, so the instrument measured) leaves
readers of the moved pseudo still on the tree. Two, and the first is the same shape `765dcdd71` fixed:

1. **`tests/client/components/setting-teach-row.ct.tsx:353-360` — a live RED by the identical mechanism.**
   ```
   const trigger = row.locator('[data-slot="hint-trigger"]');
   const after = getComputedStyle(el, "::after");
   return [Math.round(Number.parseFloat(after.width)), Math.round(Number.parseFloat(after.height))];
   … await expect.poll(async () => (await readHit())[0]).toBeGreaterThanOrEqual(44);
   ```
   Its own comment names the arm: *"The `i`'s hit area is its LAYOUT-NEUTRAL `::after` (Button's `inline`
   arm: `h-touch-target`, `min-w-touch-target`, centred on the box)"*. `HintTrigger`
   (`packages/ui/src/primitives/hint-trigger/hint-trigger.tsx:35`) defaults to Button `size="inline"` and
   `intent="ghost"`, and #1843 moved the `inline` arm's pseudo to `::before` — so `::after` is un-generated,
   `width` resolves to `auto`, `Math.round(Number.parseFloat("auto"))` is `NaN`, and `NaN >= 44` is false
   forever. Exactly `765dcdd71`'s sentence, at another path. (CT execution NOT COVERED; this is derived from
   the source and the same mechanism the lane itself documented.)
2. **`tests/client/features/preset/components/params-deck.ct.tsx:578, 606, 635, 956, 982` — blinded, not
   red.** `Math.max(box.width, Number.parseFloat(after.width) || 0)` swallows the `NaN` into `0`, so the
   floor assertion now rests entirely on the border box while its comment still claims *"A `size="inline"`
   trigger carries its floor in the pseudo"*. The pseudo arm of that assertion is dead — an instrument
   reporting green for a reason that no longer exists.

Scope of my sweep: `getComputedStyle(…"::after")` across `tests/`, `tooling/src/ui-audit`, `packages/ui/src`
(28 hits). The other 26 are other components' decorations (skeleton sweep, progress bar, caret,
selection ring, app-shell washes), the CTA-ring reads in `button.ct.tsx:597-645` (correct — the RING is still
`::after`), or historical comments recording a pre-#1843 measurement
(`character-create-actions.ct.tsx:156`, `room-overrides-form.ct.tsx:114` — archaeology, not readers). The
broader literal `::after` population in `tests/` is 115 occurrences across 28 floor-adjacent files; I judged
the `getComputedStyle` readers only and did not audit CSS-selector mentions.

### Claim 10 — prose truth and the two ledger rows — **PARTIAL**

- `hit-extent.ts` header, the parts I could falsify: the `inline`/`glyph-*` pseudo IS pointer-conditional and
  IS `::before` since #1843 (receipts under claim 4); the "reads BOTH" claim is true
  (`pseudoHitEnvelope` reads `::before` and `::after`); the resolved-inset reasoning matches the arithmetic I
  exercised. **The one sentence that is false on the tree is `:126-127`** — the "pinned EQUAL … change one and
  that proof reds" claim refuted above, and its twin in the kit header. Same class as the drifted `::after`
  prose this lane swept: a comment asserting a property nothing holds.
- The four `::after`→`::before` prose sites in the diff are all true on the tree.
- `packages/ui/src/tokens/tokens.json` `spacing.glyph-xs` `$description` — **CONFIRMED** still says "carried
  by Button's `glyph-*` ::after touch-target pseudo"; it is the only stale `::after` in the vault (1 hit).
- `pnpm check:structure --check dangling-refs` → EXIT 1 with **3 findings, not the 2 the report states**:
  2× `Core-Path-Registry.md:146` (`domain/hub`) plus `Core-Enforcement-Active-Gates.md:242`
  (`EXPECTED_DIRECT_CLIENT_UI_MECHANISMS`, a symbol retired at #2181 that now exists only inside comments —
  grep finds it in 5 files, zero declarations). Slot
  `reports/runs/structure/agent-afaa3b219faef3320-4146417-2026-09-13T05-48-27-535Z`.
- **The `domain/hub` row IS #2068's class, and #2068 is CLOSED.** Its closing comment reads: *"CONFIRMED on
  re-derivation by claude-b at 9ad17fb5a on main checkout: `pnpm check:structure --check dangling-refs` → EXIT
  0, zero findings … primary two-sided control at the same sha: restoring the `domain/hub` ARM3_ALLOW row REDS
  the stale-exemption arm. cb-v-wave-10 read 2 at 5045a6a68 on the D61 prose cites
  (`Core-Path-Registry.md:146`) — a different tree/arm state; the refute is withdrawn."* So filing it fresh
  re-opens litigated ground; what IS new is that the count went 0 → 3 between `9ad17fb5a` and `765dcdd71`,
  which makes this a regression against a closed row rather than a new finding. The D61 line itself is
  untouched since `53273609e`, so the change is on the exemption/arm side, not the prose side.

## LEDGER ROWS (7 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `ui-audit` walker + CT kit | n/a · `tooling/src/ui-audit/ops/walker/hit-extent.ts:126-127` (twin in `tests/support/iso/hit-extent-walk.ts` header) | the "two homes pinned EQUAL — change one and that proof reds" claim is false: reverting the walker to the verbatim pre-#2300 existence-only predicate, deleting its `pointer-events` clause, or disabling the kit's ancestor credit each leave the instrument proof 10/10 green. The shared fixture cannot exercise clause 2 in either home (the floored values self-report; the ringed glyph is capped by `hitForwards` and a 25px-tall wrapper under both predicates) | unpinned invariant / prose asserting a property nothing holds | **OPEN — none** | probes A/B/C + two planted controls that DID red, this session; baseline 10/10 slot `…/test/agent-afaa3b219faef3320-4064201-…` |
| `tests/client` | n/a · `tests/client/components/setting-teach-row.ct.tsx:353-360` | a live reader of the pseudo #1843 moved away from: reads `getComputedStyle(el, "::after").width/height` on a `[data-slot="hint-trigger"]`, which is Button `size="inline"` (`hint-trigger.tsx:35`) whose hit pseudo is `::before` since `9ad17fb5a`. `parseFloat("auto")` = `NaN`, so `expect.poll(...).toBeGreaterThanOrEqual(44)` can never pass — the exact shape `765dcdd71` fixed | missed coupled site of the #2301 sweep | **OPEN — none** | source + `hint-trigger.tsx:35` + `variants.ts:113`; CT execution owed |
| `tests/client` | n/a · `tests/client/features/preset/components/params-deck.ct.tsx:578,606,635,956,982` | same moved pseudo, guarded by `Number.parseFloat(after.width) \|\| 0`, so the touch-floor assertion silently falls back to the border box while the comment still claims the `inline` trigger "carries its floor in the pseudo". Green for a reason that no longer exists | blinded instrument / drifted comment | **OPEN — none** | source read; the `\|\| 0` is at `:961-962` and `:989-990` |
| both hit-extent homes | n/a · `tests/support/iso/hit-extent-walk.ts` `pseudoHitRect` + `tooling/src/ui-audit/ops/walker/hit-extent.ts:140-159` | the rect mixes a POST-transform border rect with LOCAL-px resolved insets, so under a scaled ancestor the credit band runs past the pseudo's real reach (0.5 scale: answers `{111.25,…,153.75}` for a truth of `{112.5,…,140}`); `visibility: collapse` and `display: contents` are likewise credited. All three are OVER-report, the direction the header says it never takes | incomplete refusal fence | **OPEN — none** | `cbv-arith.mts` cases K/H/I against the real exported functions |
| docs | n/a · `docs/architecture/core/Core-Enforcement-Active-Gates.md:242` | `dangling-refs` finding the lane's report does not name: backticked `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS` has no declaration (retired at #2181; survives only in comments in 5 tooling files) | drifted law-doc cite | **OPEN — none** | `pnpm check:structure --check dangling-refs`, slot `…/structure/agent-afaa3b219faef3320-4146417-…` |
| docs | n/a · `docs/architecture/core/Core-Path-Registry.md:146` | the lane's own row (2× `domain/hub`) — real, but it is the class **#2068** closed with a two-sided control at `9ad17fb5a` (EXIT 0, zero findings there). Count went 0 → 3 by `765dcdd71`, so the honest framing is a regression of a closed row, not a new one; the D61 prose is unchanged since `53273609e`, so the change is on the exemption/arm side | re-filed closed class / exemption regression | **OPEN — #2068** | `gh issue view 2068` last comment, quoted in §Claim 10; same structure run |
| `@orb/ui tokens` | n/a · `packages/ui/src/tokens/tokens.json` (`spacing.glyph-xs` `$description`) | the lane's second row, independently CONFIRMED: still describes the hit area as "Button's `glyph-*` ::after touch-target pseudo"; the only stale `::after` in the vault | drifted comment (#2301 class) | **OPEN — none** | `/usr/bin/grep -n '::after' packages/ui/src/tokens/tokens.json` → 1 hit, line 1027 |

ledger rows OWED: 0

## WHAT I DID NOT COVER

The **entire browser half**. I ran no `pnpm test:ct`, no `snap`, no page of my own; the only chromium in my
session was the one `hit-extent.int.test.ts` spawns for itself. Specifically unverified:

- the report's red-first table (pre-#1843 161/26, post-fix 161/56) and the `self` / `div:ancestor`
  receiving-target table — both `snap --eval` measurements;
- the report's CT runs A (105 passed), B (248 passed / 1 failed) and C (143 passed). I reproduced none of
  them and take none of them as evidence.

**A CT/side-eye pass owes these files, by path:**

- `tests/support/browser/touch-floor.ct.tsx` — the #2300 negative control, both pointers.
- `tests/tooling/design-audit-walker.ct.tsx` — and it should PRINT `alone` and `tight`, not only compare
  them (the fragility note under claim 5).
- `tests/ui/primitives/button/button.ct.tsx` — the new `inline` hit arms at both pointers.
- `tests/client/features/rpg/lib/rpg-context-section.ct.tsx` — `765dcdd71`'s repair.
- **`tests/client/components/setting-teach-row.ct.tsx`** — my ledger row 2; run it and I expect the coarse
  `i` test RED at the poll, on the tree, today.
- **`tests/client/features/preset/components/params-deck.ct.tsx`** — my ledger row 3; green either way, so
  the check is a print of the pseudo arm's contribution (expect 0).

Also not covered: `pnpm check` / whole-tree structure / `check:type-ownership` (out of lane by instruction;
type ownership answered from the three tsconfigs instead).

## PROPOSED LESSONS

Index line:

- [mirror pin needs a discriminating fixture](mirror-pin-needs-a-discriminating-fixture.md)·[hit-pseudo move = 3 reader homes](hit-pseudo-move-sweeps-three-reader-homes.md)

Body — `mirror-pin-needs-a-discriminating-fixture.md` (type: verification):

> Two hand-mirrored implementations "pinned equal" by a shared-fixture test prove nothing until the FIXTURE
> is shown to exercise the clause that differs. **Why:** #2300 moved both hit-extent homes from
> existence-based to geometry-scoped ancestor credit and pinned them with an instrument proof that runs the
> kit's real rule inside the page the walker judges — genuinely one DOM, one run — yet reverting the walker
> to the verbatim pre-fix predicate left it 10/10 green, because on that fixture the hit pseudo SELF-REPORTS
> (ownership clause 1 answers and the credit clause never runs) and the one control that could reach clause 2
> was capped by an unrelated wrapper height. **How to apply:** when a diff claims "these two agree", plant the
> OLD predicate back and re-run before believing it; a fixture whose verdict is identical pre- and post-fix is
> a fence, not a proof. Pair it with a planted control in the same file so a green probe cannot be a dead one.

Body — `hit-pseudo-move-sweeps-three-reader-homes.md` (type: project/architecture):

> Moving a Button hit-area pseudo (`::after` → `::before`, #1843) has THREE reader homes, and the CT tree is
> the one that hides: the instrument kit, the ui-audit walker, and every `getComputedStyle(el, "::after")`
> in `tests/**` that measures a touch floor. **Why:** two readers survived the #2301 sweep —
> `setting-teach-row.ct.tsx` (NaN → a poll that can never pass, a hard red nobody sees because
> `pnpm check` is static) and `params-deck.ct.tsx` (`|| 0` → silently blinded, green forever). **How to
> apply:** on any pseudo move, grep `getComputedStyle(` + the OLD pseudo across all of `tests/`, and triage
> each hit by whether the value is guarded — an unguarded read is a red, a guarded one is a blinded
> assertion, and the guarded one is worse.

## Issue summaries

**For a new row (REFUTED, claim 1) — P2, area tooling/verification.** *The #2300 "two homes pinned equal"
proof does not hold either home down.* `tests/tooling/ui-audit/ops/walker/hit-extent.int.test.ts` composes the
CT kit's real rule from its own `toString()` and runs it inside the audited page — the structure is right —
but its fixture cannot exercise the clause #2300 changed. Measured at `765dcdd71`: reverting
`ancestorCreditAt` to the verbatim pre-#2300 `pseudoCarriesFloor` (`815741e6c^`) leaves the suite 10/10;
deleting the walker's `pointer-events` clause leaves it 10/10; disabling the kit's ancestor credit leaves it
10/10. Two planted controls (`HIT_PROBE_RADII = [11]`; kit walk `− 10`) DID red the same suite, so the file is
live and the zeros are verdicts. Cause: on that DOM the hit pseudos self-report, so ownership clause 1 answers
and clause 2 never runs, while `ringed-glyph` is capped by `hitForwards` against a 25px-tall wrapper under
both predicates. Fix owed: a fixture where ancestor credit is the ONLY thing that can answer (a hit pseudo
CLIPPED by an ancestor's overflow, which is the shape the credit exists for) plus an arm that compares the two
homes' NUMBERS on the same element, not just their verdicts — and until then `hit-extent.ts:126-127` and the
kit header's equal-pin sentences are false prose.

**For a new row (REFUTED, claim 9) — P2, area client/tests.** *Two readers of the pseudo #1843 moved away
from survived the #2301 sweep.* `tests/client/components/setting-teach-row.ct.tsx:353-360` reads
`getComputedStyle(el, "::after").width/height` on a `[data-slot="hint-trigger"]` — Button `size="inline"`,
whose hit pseudo has been `::before` since `9ad17fb5a` — so the value is `parseFloat("auto")` = `NaN` and
`expect.poll(...).toBeGreaterThanOrEqual(44)` can never pass: the same defect, at another path, that
`765dcdd71` fixed for the rpg CT. `tests/client/features/preset/components/params-deck.ct.tsx`
(`:578,606,635,956,982`) reads the same dead pseudo behind `|| 0`, so it is not red but blinded — the floor
assertion silently rests on the border box while the comment claims the pseudo carries it. Both need the
`::before` swap; the params-deck one also needs its comment corrected and, ideally, the `|| 0` replaced with a
loud refusal so a future move reds instead of going quiet.

**For the lane's own two rows.** The `tokens.json` `spacing.glyph-xs` row is CONFIRMED as written. The
`Core-Path-Registry.md:146` `domain/hub` row should be re-pointed at **#2068**, which closed this exact class
with a two-sided control at `9ad17fb5a` (zero findings there); the tree now reads THREE findings, the third
being `Core-Enforcement-Active-Gates.md:242` (`EXPECTED_DIRECT_CLIENT_UI_MECHANISMS`, retired at #2181), which
neither the lane's report nor #2068 names.

## Integration appendix — 2026-09-13

This appendix preserves the verifier's seven rows and records their current owners without treating assignment as a fix.

- The two surviving `::after` readers are tracked by #2311, owned by Codex: `setting-teach-row.ct.tsx` is the predicted live red and `params-deck.ct.tsx` is the blinded assertion. The stale token description is tracked separately by #2313, also owned by Codex. The implemented lane passed67/67 CT cases and its dead-pseudo mutation failed exactly one geometry assertion; independent review accepted its mechanics and requested one coupled Button comment repair. Integration remains pending, so these issues remain open.
- The two dangling-reference rows are tracked by #2312. Main commit `037356d74` repairs the citations in `Core-Path-Registry.md` and `Core-Enforcement-Active-Gates.md`; the selected dangling-reference gate passed over199/199 docs at `reports/runs/structure/main-72765-2026-09-13T06-11-26-874Z/check-structure.json`, exact-blob catalog landed at `1b80182a7`, and #2312 completed its lifecycle with terminal exit0. The existing two-sided control worked; the earlier zero described its then-current corpus.
- The B hit lane owns the remaining geometry proof work as one coupled repair: a discriminator that reaches ancestor-credit clause 2 in both homes, an assertion comparing the two homes' numeric answers on the same element, and the scale-mixing refusal fence. The report's `visibility: collapse` / `display: contents` observations remain declared fence-completeness limits unless that lane explicitly adopts them. No issue closure is implied.
- The baseline source-only verifier receipt remains 10/10 at `reports/runs/test/agent-afaa3b219faef3320-4064201-2026-09-13T05-33-42-495Z/`; the report explicitly omitted the CT/browser floor, which remains owed for the named component files.
