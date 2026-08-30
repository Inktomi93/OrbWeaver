---
kind: review
status: archived
updated: 2026-08-30
---

# Stickler review — reading-surface theme engine, commit d42d25a39 (#204)

Range: the single commit `d42d25a39` on `wt/agent-ac5ef69dc0f7cf780` (base `main` @ `5d106998d`).
Charge: pre-merge review of the #204 fix — scrim retirement (`--color-backdrop` split +
`--color-reading-plate` derivation), the §7a prose-ink auto-correction, kit `safe-color` numeric
parsing, the 12px guillotine (`blockPaddingToken`), the phantom-band zero-height action slot, and the
carried-background room paint. Reviewed cold from the worktree; every touched file read in full except
where noted in §4.

**Verdict: MERGEABLE with one substantive engine gap (F1, P2) and two doc-law drift repairs (F2/F3).
No P0/P1. All hard constraints from the charge verified held.**

## 1. Findings (ranked)

### F1 · P2 — the §7a auto-correction is a NO-FIX for a translucent failing ink (its output still fails AA, and re-fails its own judge)

- **Where:** `packages/ui/src/content/theme-scope/clamp.ts:288-290` (the emission
  `oklch(from ${picked} ${clampedL} c h)`) + `packages/kit/src/theme-derivation/index.ts:229-236`
  (`proseInkLightness`).
- **Defect:** CSS relative-color syntax keeps the ORIGIN's alpha when the alpha slot is omitted — the
  code's own comment says so ("and alpha, the relative default, kept", clamp.ts:289). So when an
  authored prose ink fails AA *because of its alpha* (judged correctly — `proseInkLightness`
  composites the translucent ink over the base before judging), the "corrected" ink re-derives L but
  still composites at the author's alpha, and the maximal derived lightness at low alpha cannot reach
  the floor over the base it was derived for.
- **Failure scenario (measured, this session, with kit's own math):** base `oklch(0.158 0.006 60)`
  (Hearth-class dark), authored `dialogueColor: oklch(0.75 0.05 60 / 0.35)` — the exact vector the
  shipped test `clamp.test.ts` "a TRANSLUCENT authored ink is composited…" pins. The clamp fires
  (verdict L = 0.96) and emits `oklch(from oklch(0.75 0.05 60 / 0.35) 0.96 c h)`. That output,
  composited at α 0.35 over the base, measures **2.89:1** — below the 4.5 AA floor the engine claims
  to guarantee. Re-judging the corrected ink through `proseInkLightness` returns 0.96 again: a fixed
  point that never passes. Reproduction:
  `reports/stickler/scratch/stickler-reading-translucent-ink.ts` (run via `pnpm tsx` from the
  worktree root) — output: `verdict 0.96 · corrected contrast 2.89 · re-verdict 0.96`.
- **Consequence:** an imported/carried theme whose prose ink is translucent (`#rrggbbaa`, `rgba()`,
  `hsla()`, `oklch(… / a)` — ST themes are rgba-heavy, the exact population the owner authorization
  named) renders dialogue/narration/body at \~2.9:1 over its own base while the engine reports itself
  as the legibility guarantee. This is the #204 unreadability class surviving inside the fix, on the
  alpha subclass only. Opaque inks (all shipped palettes + Birdie, the demo corpus) are correctly
  handled — hence P2, not P1.
- **Test reality:** both shipped pins assert the MECHANISM, not the guarantee — kit's
  `proseInkLightness` test asserts the verdict number; the clamp test asserts the emitted string.
  Neither closes the loop by re-judging the corrected output. That is the missing test.
- **Safe remediation:** when `clampedL !== null` and the parsed ink's alpha < 1, emit the alpha slot
  explicitly — `oklch(from ${picked} ${clampedL} c h / 1)` (or a computed compliant alpha if the
  translucency is wanted) — and add a regression test that runs the corrected emission back through
  the judge (`proseInkLightness(corrected…) === null`).

### F2 · P3 — the D71 ledger row now cites the retired `color.scrim` token path (twice)

- **Where:** `docs/architecture/core/Core-Path-Registry.md:202` (D71, clause 1): "the build validates
  each set to EXACTLY the `THEME_SCOPE_EMIT_VARS` colors + `color.scrim`" — the same spelling appears
  twice in the row.
- **Defect:** this commit retires `color.scrim` and the build now validates against
  `color.backdrop` (+ `color.reading-plate` via the emit set) — `packages/ui/tokens.build.ts:44-46`.
  The D-ledger wins every conflict; a ledger row naming a dead token path is exactly the drift the
  house "truth-repair the doc in the same commit" rule exists to prevent. A future agent reading D71
  will hunt for `color.scrim` and find nothing.
- **Evidence:** `grep -n "color.scrim" docs/architecture/core/Core-Path-Registry.md` → line 202 (two
  occurrences); `grep "color.scrim" packages/` → comments only (the code is fully migrated).
- **Remediation:** amend the D71 row's wording to `color.backdrop` (and note the #204 split /
  `color.reading-plate` emit addition), in the merge train or a docs follow-up commit.

### F3 · P4 — the Active-Gates catalog row for `ui-skin-fragment-purity` still documents the `bg-scrim` signature

- **Where:** `docs/architecture/core/Core-Enforcement-Active-Gates.md:181` — the row's signature
  table says "`bg-scrim`→`SCRIM(tier)`/`SCRIM_BASE`" and "a prose `bg-scrim` can't trip it".
- **Defect:** the gate now carries the `bg-backdrop` signature
  (`scripts/check/gates/ui-skin-fragment-purity.ts:35`, changed in this commit). The enforcement
  catalog is an index doc agents random-access; it now describes a signature that no longer exists.
  No gate checks this prose (D-citation integrity checks links, not token spellings) — reviewer-only
  territory.
- **Remediation:** one-word doc fix (`bg-scrim` → `bg-backdrop`) in the catalog row.

### F4 · P4 — "named colors remain the only fail-open" is an overclaim (test title + commit message)

- **Where:** commit message ("Named colors remain the only fail-open"); test title
  `tests/ui/content/theme-scope/clamp.test.ts` "the ink clamp judges EVERY numeric color format, and
  fails open only where no static value exists".
- **Defect:** `oklab(…)` values are `isSafeColor`-legal (safe-color/index.ts:14) and carry a static
  value, but neither `parseOklch` (oklch-only) nor `parseCssColorToSrgb` (hex/rgb/hsl-only, by
  design) reads them → they fail open. So do legal-but-unparsed spellings: negative-hue `hsl()`,
  modern unitless-s/l `hsl(30 40 20)`, `oklch(0.5 0.1 60deg)`. All fail in the SAFE direction
  (pass-through, the pre-#204 behavior for everything), so this is claim accuracy, not a behavioral
  defect — but the clamp.ts header's own wording ("fail-open when either side is not
  statically-readable oklch") is the accurate spelling and the test title/commit claim should match
  it. An `oklab`-authored ST import silently keeps the old no-guarantee behavior.
- **Remediation:** reword the test title; optionally teach `toOklch` the `oklab()` form later (its
  L is OKLab L directly — cheap), as a separate scoped change, not a merge blocker.

## 2. Hard-constraint verification (all HELD)

| Constraint | Verdict | Evidence |
| - | - | - |
| Glass recipe sacred (`--blur-*`, backdrop-filter rules, #135/#137) | HELD | diff sweep `^[+-].*(--blur\|backdrop-filter\|reduced-transparency)` → zero hits; the plate constants retain the pre-existing `backdrop-blur-sm`; no blur token file touched |
| Byte-identity of every `--color-backdrop` value vs retired `--color-scrim` | HELD | diff old/new lines: `:root` `oklch(0.12 0.006 60 / 0.6)`, light `oklch(0.3 0.01 60 / 0.4)`, mocha `oklch(0.1 0.015 250 / 0.6)` — identical in theme.css, themes.gen.ts, themes/\*.json, TOKENS map; the 0.6→0.65 alpha delta exists ONLY on the new plate token (deliberate, measured floor) |
| Zero surviving `--color-scrim`/`bg-scrim`/`color.scrim` in live code | HELD | `grep -r` across `packages/ tests/ scripts/` (node\_modules excluded): every remaining hit is a comment/`$description` narrating the retirement; zero identifiers (`BG_PHOTO_*_SCRIM` → zero); the deleted `TOKENS["color.scrim"]` key would red tsc — graph typecheck clean (positive control: the sweep DID return the comment hits, so the instrument scanned) |
| One home for readingPlate constants | HELD | `-0.038`/`0.65` grep: the kit declaration (`theme-derivation/index.ts:49`), tokens.json prose descriptions, and the generated seed VALUES (0.942/0.112, which the palette-contrast suite pins as `derive(background)` to the digit) — no re-spelled deltas in logic anywhere; clamp emits via `KIT_THEME_DERIVATION.readingPlate.*` |
| Kit safe-color purity / package cake | HELD | `packages/kit/src/safe-color/index.ts` + `theme-derivation/index.ts` read in full: ZERO imports of any kind (no `node:*`, no domain, no deps); clamp.ts imports flow ui←kit only |
| #106 no-sampling | HELD | the plate is a pure derivation off `--color-background` (relative-color CSS); nothing reads art pixels |
| D44 §12.1 carried takeover / D71 pipeline | HELD in code (D71 prose drifted — F2) | seed sets regenerate byte-identically (`pnpm -C packages/ui tokens:build` re-run → `git status` clean); `tokens.build.ts` validates the emit-set + `color.backdrop`; ThemeScope emits the identical derivation for carried themes (pinned by clamp.test) |
| #167/#168/#113 pins | HELD | `STICKY_ATTRIBUTION_CHROME` stays `bg-card` opaque (+ paired `text-card-foreground`); supersede-not-stack logic unchanged; #168 CT re-run green (the floor-clip change is sound: fractional-height sticky + element-screenshot ceil would compare a row the band cannot paint — the clip floors the height, viewport-relative coords correct for `page.screenshot`) |
| Dark-art rooms byte-similar | HELD (α 0.6→0.65 plate-only, deliberate) | Hearth plate keeps the retired L/C/H exactly (0.12 0.006 60); the 5-point alpha lift is the commit's measured floor and applies only to the plate token, never the smoke jobs |
| Central tests mirror / no colocated tests | HELD | all new/changed tests live under `tests/<pkg>/<mirror>`; the one new fixture rides the existing `message-list.fixtures.tsx` |
| No banned escape hatches | HELD | diff sweep for added `biome-ignore`/`eslint-disable`/`TODO`/`FIXME`/`any` → zero (the one `biome-ignore` visible in the gate file is pre-existing context) |

## 3. Verified clean (what my silence covers, with the receipts)

- **Cold runs from the worktree (all this session):**
  - `pnpm vitest run` on the six touched unit suites (`tests/kit/safe-color`,
    `tests/kit/theme-derivation`, `tests/ui/content/theme-scope/clamp.test.ts`,
    `palette-contrast.suite`, `token-classification.suite`, `tests/ui/tokens/index.test.ts`):
    **6 files, 95 tests, all passed**.
  - `node scripts/ts7.cjs --noEmit -p tsconfig.json` (the graph program): **exit 0**.
  - `pnpm test:ct tests/ui/primitives/message-list/message-list.ct.tsx` (cache-clear in-script):
    **25 passed / 0 failed / 0 flaky** — includes the new `blockPaddingToken` sticky-flush CT.
  - `pnpm test:ct tests/client/features/chat/components/message-row.ct.tsx`:
    **99 passed / 0 failed / 0 flaky** — includes all new #204 CTs (chip-hug, ink pairing,
    metadata step-up, sticky card-foreground, the re-clipped #168 pair).
  - `pnpm -C packages/ui tokens:build` re-run → `git status --short` **empty**: the committed
    generated artifacts (theme.css, tokens/index.ts, themes.gen.ts) are byte-exact regen output —
    no token-edit-without-regen drift.
- **safe-color math verified against references:** the HSL piecewise ramp is the classic
  hue2rgb (+120°/0°/−120° offsets — hand-checked `hsl(0,100%,50%)` → (255,0,0); the shipped test's
  `hsl(180,50%,40%)` → (51,153,153) matches browser resolution). `srgbToOklch` matrices match
  Ottosson's published linear-sRGB→LMS and LMS'→OKLab coefficients term-for-term (signs baked in the
  expressions), EOTF threshold 0.04045 correctly kept separate from the WCAG 0.03928 spelling;
  round-trip pinned in-suite. Hex parsing covers 3/4/6/8 arity exactly as the `HEX` shape regex
  admits (no 5/7-digit leak path).
- **`proseInkLightness` judgment side is correct** (composite-before-judge for translucent inks —
  the defect is only in the EMISSION keeping alpha, F1).
- **`flatInner` system-row override is deterministic, not cascade-luck:** receipted through the
  configured merger — `cn(plate, "… in-data-[has-bg-image]:text-muted-foreground")` drops the
  plate's `text-prose-body` (conflicting text-color group, same variant, later wins) —
  `reports/stickler/scratch/stickler-reading-cn-merge.ts` output: `prose-body survived: false`.
- **`MessageList` padding move is byte-identical for the other consumer:** `gapPxFor(undefined) = 0`
  (`packages/ui/src/lib/virtual-gap.ts:21-26`), and the only two `<MessageList>` mounts repo-wide
  (ast-grep, scannedFileCount=632: `log-viewer.tsx:169`, `message-list-surface.tsx:307`) — log-viewer
  passes no `blockPaddingToken` → paddingStart/End 0 + the pre-existing pinSpacer term. isAtEnd /
  follow / pin math all ride virtualizer totals which include the padding, so thresholds are
  unaffected.
- **`chat-room-surface` carried paint gating:** the `bg-background` Stack sits inside the
  `ThemeScope` (`className="contents"`), so the var resolves to the CARRIED background; gated on
  `roomTheme?.background !== undefined` and `not-in-data-[has-bg-image]:` — no-carried and over-art
  arms are unchanged; the elevation=ramp card re-fill is only overridden in the carried-takeover case
  (which is the D44 §12.1 semantic).
- **globals.css metadata step-up rule:** unlayered author CSS (client globals.css carries no
  `@layer`), so it beats layered utilities on every `message-metadata-*` slot; the five live slots
  (`-row`, `-timestamp`, `-cost`, `-cost-trigger`, `-model`) are all gloss-voice datums the rule is
  meant for; the no-wallpaper arm is untouched (CT-pinned both arms).
- **Zero-height action slot:** `args.actions === null` short-circuit matches both call sites
  (ghost passes explicit `null`); overflow stays visible; the A3 width reservation and full button
  hit-box are CT-pinned (chip-hug + never-starve tests in the green run above).
- **Gate edits** (`no-color-literals` message, `no-raw-color-in-css` fixture,
  `ui-skin-fragment-purity` signature + probes) are value-consistent with the rename; the fragment
  gate's scan scope (packages/ui minus lib) is unchanged, so the client-side plate constants remain
  out of scope by design (their one home is `message-row-backing.ts`).
- **Whole-tree `pnpm check` NOT run** (orchestrator's, per the charge).

## 4. Regions not read in full

- `message-row.tsx`, `message-metadata-row.tsx`, `message-list-surface.tsx`, `shell.css`,
  `globals.css` (client): read the full diff hunks plus the surrounding interaction regions
  (nameRowFrame call sites, metadata slot inventory, layer structure, the dismiss/halo rules), not
  every line of each file.
- `tests/client/features/chat/surfaces/message-list-surface.ct.tsx` was not executed this session
  (its #113 assertions ride the same mechanism the two executed CT files prove); all other touched
  test files were executed cold.

## 5. Unconfirmed suspicions

None. (Everything suspected was either confirmed as a finding above or refuted with a receipt in §3.)

## Issue summary (paste-ready)

Stickler review of d42d25a39 (reading-surface derive law, #204) — outcome: **mergeable, 4 findings,
severity ceiling P2**. All hard constraints held: glass recipe untouched, backdrop byte-identity
verified across all three palette homes, zero live scrim spellings, one-home derivation constants,
kit purity, regen-consistent token artifacts; 95 unit tests + 124 CTs re-run cold and green, graph
typecheck clean. P2 (F1): the §7a prose-ink auto-correction is a no-fix for TRANSLUCENT failing inks
— the emitted `oklch(from … L c h)` keeps the author's alpha, so the corrected ink measures 2.89:1
(< 4.5 AA) over the base it was corrected for and re-fails the clamp's own judge (numerically
reproduced with kit's math); remediate by emitting `/ 1` on the corrected arm + a close-the-loop
test. P3 (F2): D71 ledger row still cites the retired `color.scrim` (twice) — truth-repair to
`color.backdrop`. P4 (F3): Active-Gates catalog row still documents the `bg-scrim` fragment
signature. P4 (F4): "named colors are the only fail-open" overclaims — `oklab()` and exotic legal
spellings also fail open (safe direction). Full report:
`docs/history/reviews/stickler/2026-08-18-reading-surface-d42d25a39.md`.
