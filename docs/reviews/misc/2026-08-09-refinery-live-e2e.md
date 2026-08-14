---
kind: review
status: active
updated: 2026-08-14
---

# Refinery — EXHAUSTIVE live e2e against the real vLLM fleet (2026-08-09, lane #39 phase 4)

**VERDICT: the pipeline works end to end with real model output — after three fixes, two of which made the
feature unusable in production.** The side-eye's graduation review closed with "Engines adopt-only ⇒ NO
model-backed run exercised … e2e phase owes the live drive"; this is that drive. Every one of the three
defects below was invisible to `pnpm check`, to the whole CT suite, and to the graduation review, for the
same reason: **with no model payload the surface is short, cheap and green.** The first real payload broke it.

## Rig (why the receipts are trustworthy)

The shared dev stack on `:5173`/`:8788` serves **main**, so a lane cannot verify its own fix there. Every
run below was driven against an **isolated stage built from this lane's working tree** —
`snap --dirty`'s stage (`.cache/snap-stage/dirty`, a copy of the dev DB, assets symlinked, the SHARED vLLM
fleet ADOPTED) booted on lane-private ports **`:8988` / `:5373`** (the standard stage band `:8888`/`:5273`
was held by a sibling lane's stage, and `stack.sh` correctly refuses to fight an owner it did not spawn —
`reports/lane39/stage-up.sh`). RED and GREEN are therefore measured on the *identical* instrument.
Driver + logs: `reports/lane39/` (`drive-kit.ts`, `step1.ts`, `step2.ts`, `step3.ts`, `probe-*.ts`,
`run-*.log`). Model: `Qwen/Qwen3-VL-8B-Instruct` on `:8703`, 32 768-token window.

Screenshots: `reports/snaps/lane39-*.png` (31).

---

## The three defects (all fixed in this lane)

### D1 — every score run 503'd: the stage requested a smaller output budget than its own payload needs

**RED (twice on `:8788`/main, then reproduced on the stage):**

```
provider.structured-item … tokensIn:2736, tokensOut:768, finishReason:"length", hasResponseFormat:true
provider.structured-item … tokensIn:2743, tokensOut:768, finishReason:"length", hasResponseFormat:true
request POST /api/trpc/refinery.runStage status:503 durationMs:20594
```

Both the first attempt and the bounded structured retry hit `finish_reason:"length"` at **exactly 768** —
`SIDE_GEN_POSTURES.refine_score.maxOutputTokens`. The stage then threw the typed retryable error. On the
**default selection of an ordinary card**. So the refinery's headline verb was 100% broken against the
real fleet, and no test could see it because every test scripts the model reply.

**The smoking gun, verbatim from the surface, BEFORE the run:**

```
fit line   : in ≈ 2897 / 32768 · out ≈ 980 / 768 tok ⚠
preflight  : "The expected score output likely exceeds the resolved max output (768 tok) — a thinking
              model spends this budget on reasoning too. Raise max output in the preset, or narrow the
              selection."
```

The output-budget preflight **already knew** the run could not fit, printed it with a ⚠, and the run went
ahead and spent two model calls / 21s to fail exactly as predicted. Root cause is not the constant — it is
that **`preflight` and the engine were two unconnected numbers**: the §8 arithmetic lived privately inside
`verbs/preflight.ts`, and `runStage` re-resolved the posture ladder on its own and asked for the static
floor. A prediction the caller cannot act on is a spectator.

Measured with a probe budget of 8 192 (same card, same prompt): the run **needs 1 490 output tokens** and
returns `finish_reason:"stop"`. So the estimator was wrong too — it predicted 980.

**FIX** — one home for both numbers, `packages/server/src/domain/refinery/substrate/output-budget.ts`:

- the §8 arithmetic moves out of `preflight` into the substrate, and both callers evaluate **one**
  expression (`resolveStageSampling`);
- the stage's posture FLOOR becomes payload-aware: `max(shipped floor, estimate × headroom)`, clamped so
  prompt + output still fit the resolved window (reserve for the retry's longer prompt);
- the ladder is untouched — a user's preset `maxOutputTokens` still wins outright;
- `preflight.maxOutputTokens` now reports **the number the next run will actually request**.

Estimator constants truth-repaired against the live runs (each carries its receipt in the file):
`SCORE_TOKENS_PER_TARGET` 140 → 220 + a new `SCORE_ENVELOPE_TOKENS` 200 (summary + priorities are not
per-target); `ANALYZE_OUTPUT_TOKENS` 400 → 700 (measured 581/606). `OUTPUT_BUDGET_HEADROOM = 2` — argued
in-file from the measured spread (score actuals 1 490 / 1 619 / 1 852 / 2 026 against a 1 740 prediction,
i.e. a 1.25× cap was already one verbose card from truncating) plus the fact that `maxTokens` is a **cap,
not an allocation**: unused budget costs nothing, a short budget costs a truncation + a retry + a failed run.

Precedent cited: `schema_forge` was raised 768 → 2 048 on 2026-08-09 for the byte-identical symptom, its
comment reading *"768 truncated it — `finish_reason:"length"`, i.e. a failed forge that looked like a bad
model."* Same defect class, now killed at the class level rather than constant by constant.

**GREEN:** `fit: in ≈ 3088 / 32768 · out ≈ 1740 / 3480 tok` (no ⚠) · `runStage 200` · every subsequent
score/rewrite/analyze run `finishReason:"stop"`.

### D2 — the CONTENT pane did not scroll, so the terminal act was unreachable

The moment a real payload lands, the refinery workspace is **3 981px tall inside a 952px box** and
**no ancestor in the chain is scrollable** (every one `overflow-y: visible` or `clip`);
`scrollIntoView` is a provable no-op (element top 3 985 before *and* after). Measured:
`reports/lane39/probe-applyrow.ts`.

Unreachable by mouse, keyboard or script: **`Apply N kept`**, **`Save as copy`**, the guidance textarea,
the fit line, `Hand-edit`, and `Run/Iterate`. That is the feature's entire terminal half.

`refinery-content-surface.tsx` declared `h-full outline-none` where the house pattern — stated verbatim in
`databank/surfaces/databank-detail-surface.tsx`'s own header, and used by config/preset/home/analytics/chat
— is `h-full min-h-0 overflow-y-auto`. **FIX:** declare it. Post-fix `overflow-y: auto`, `scrollable: true`,
`scrollIntoView` lands the button at y=956 in a 1000px viewport, and the full apply flow completes.

Invisible to every prior review for the stated reason: engines were adopt-only, so the pane was always short.

### D3 — the hero-gauge count-up never played, and when it did it printed a negative score

Polish item 5, "the money shot". Live, the printed numeral's **entire** mutation history for a real score
run was one entry: `["0ms=8.7"]`. No ramp, ever.

`useCountUp`'s mount guard ("a number already on screen when the gauge mounted did not arrive") was inferred
from the hook's own state, and that inference is false in exactly the case the animation exists for: on a
session's first run the pane shows `RunningPane` — a *different component* — so the gauge **mounts with the
settled score already in hand**. First value + `from === target` ⇒ ramp skipped. It could only ever fire on
a re-run whose score differed. No CT could catch it: a story mounts with a value and asserts the settled
text, which is the skipped path.

**FIX (the guard is preserved, not weakened — it is given the fact it was guessing at):** `useCountUp` takes
an `arrived` flag; the surface tracks the run ids **its own mutations produced** and passes it down
(`StagePane` → `PayloadView` → `HeroGauge`). A run you produced animates; a session you merely opened does
not — which is precisely what the original §3.8 comment asked for.

Turning it on immediately exposed a second, latent bug: the first live ramp printed
`0 → **-5** → 2 → 4 → 5 → …` — a **negative character score**. A rAF callback receives the *frame's*
timestamp, which can predate the `performance.now()` the effect captured, so `t` went negative and the
cubic ease kept going below zero. **FIX:** clamp `t` at both ends. Post-fix sequence, three consecutive
runs: `0→1→2→3→4→5→6→7→8→9` in \~225ms, monotonic, no negative frame.

---

## Per-checklist results

| # | Item | Result | Receipt |
| - | - | - | - |
| 1 | pick character → SCORE → live assay renders | **PASS** (after D1+D3) | `lane39-05-score-settled.png` — hero 9/10 + meter, docked summary, 7 assay rows with per-field meters, priority improvements. 23.6s. |
| 1 | hero gauge count-up (the money shot) | **PASS** (after D3) | count-up sequence `0…9` / 225ms; `lane39-04-countup-t*.png` |
| 1 | verdict banner + axes | **PASS** (on analyze) | `lane39-20-analyze-verdict.png`, `data-tone="good"`, soul 9/10 pill |
| 1 | REWRITE → arm-B accept review with REAL CompareBlocks | **PASS** | 7 blocks: 5 before/after pairs + 2 `greetings [new]` ADDED blocks; per-block Keep/Discard with accessible names ("Keep description"). `lane39-08-accept-review.png` |
| 1 | tri-state consent, collapse, undecided fail-closed | **PASS** | `0 kept / 0 discarded / 7 undecided` at open; after 2 keeps + 1 discard → 3 collapsed rows, note *"4 blocks have no verb pressed — undecided blocks are NOT applied…"*, CTA `Apply 2 kept` |
| 1 | APPLY → outcome panel + snapshot line | **PASS** | *"2 fields written. A snapshot was taken first — 'auto: before refinery apply · refinery\_session\_…' — reversible from the character's History tab."* + REPLACED rows. `lane39-10-apply-outcome.png` |
| 1 | read-back the card (belt-9) | **PASS** | header flips to `COMPLETED` / `APPLIED · SNAPSHOT TAKEN`; `lane39-11-card-readback.png` |
| 2 | ANALYZE verdict + tri-axis | **PASS** | ACCEPT / soul 9 / preserved·lost·gained populated, issues + recommendations "none listed" (the designed empty state) |
| 2 | ITERATE (refine-rewrite → analyze) | **PASS** | `refinery.iterate 200` (\~29s); ledger gains a second rewrite+analyze pair; stepper shows both cells `running…` mid-round |
| 2 | runs ledger + economics | **PASS** | 5 rows, newest first, each `model · N in / M out · Xs` — e.g. `ANALYZE · round 0 · ACCEPT · Qwen/Qwen3-VL-8B-Instruct · 4899 in / 581 out · 8.2s`. `lane39-30-ledger-settled.png` |
| 2 | step-back (view-back) | **PASS** | chip `VIEWING ROUND 0 · SUPERSEDED`; `lane39-31-step-back.png` |
| 2 | operate-back (arm a rewrite for apply) | **PASS** | ledger chip `IN FORCE FOR APPLY`, and the armed (older) rewrite's block set loads into the pane. `lane39-32-operate-back.png` |
| 2 | save-as-copy | **PASS** | *"1 field written to the copy 'Kohaku (refined)'. The live card is untouched — no snapshot was needed…"* `lane39-34-save-as-copy.png` |
| 2 | regression stop condition | **NOT REACHED** | both analyze rounds returned ACCEPT; no REGRESSION verdict was produced by the model, so the stop condition never armed. Not a defect — an unexercised branch. |
| 2 | run-ledger stagger animation | **NOT MEASURED** | the ledger renders correctly; the stagger-fade was not instrumented (needs a per-row mutation trace like the count-up one). |
| 3 | greeting APPEND arm end-to-end via a model rewrite | **PASS** | the model emitted appends unprompted in 3 of 3 rewrite runs. ADDED block renders its state panel + consequence copy *"A new greeting is added at the end — no existing greeting is touched."*; Keep → `Apply 1 kept` → outcome `ADDED · greetings [new]`. `lane39-33-append-kept.png` |
| 4 | custom schema (NL generate / flat-language / transpile / use / guided / two-stage / needsRaw / raw-door) | **NOT EXERCISED** | ran out of lane budget after the three fixes + their gate fallout. Nothing here is blocked — the schema-forge posture was already raised to 2 048 by task #36 — it simply was not driven. This is the largest remaining gap. |
| 5 | run-ERROR arm | **PASS — exercised naturally** | D1 gave a real 503 without contrivance. Toast `"That stage didn't finish — try again."`, pane reverts to the designed not-run arm, all three stepper cells `data-running="false"`, no stuck spinner. `lane39-e2-after-503.png`. (I initially reported this as BROKEN and retracted it — see "Instrument errors" below.) |
| 6 | strippedKeys warn line | **NOT REACHED** | zero invented keys across 9 live structured runs, so the warn line never had cause to render. The render path is CT-covered; the live arm is unexercised. |
| 6 | manual-rewrite dialog with content | **NOT EXERCISED** | budget. |
| 6 | vehicle knob at response-format (wire receipt) | **PARTIAL** | server-side receipt only: every structured run logs `hasResponseFormat:true` against `backend:"vllm"`, `role:"structured"`. A *body-level* receipt is not obtainable from `/api/_debug/wire/captures` — that ring is CHAT-backend-scoped and returns `{"count":0}` for the summarize/structured lane. |
| 6 | reasoning × structured probe on the OR key | **NOT EXERCISED** | still open. |
| 7 | vllm metrics debug route under load | **PASS** | `/api/_debug/vllm/metrics` returns all three engines with `running / waitingCapacity / preemptionsTotal / kvCacheUsagePerc / maxConcurrency / kvHeadroomOk`, `warnings: []`. Raw gauges moved under load: `num_requests_running 0.0 → 1.0 → 0.0`. |
| 7 | summarize still fast | **PASS** | a memory-digest-shaped chat-completion returned in **≲2s** (running gauge back to 0 by t+2s), 65 in / 76 out, `finish_reason:"stop"`. |

## Instrument errors I made, and the lesson

- **I reported "the client never surfaces the run error" — WRONG, retracted before it was acted on.** My
  poll only ever looked for the *success* selector (`refinery-payload-view`); when it timed out I inferred
  the surface was stuck. It was not: the toast had fired and the pane had reverted. **A poll for the
  success selector is not an observation of the failure state** — re-read the DOM in the failure arm.
- **I nearly filed "the CONTEXT ledger's row actions are unclickable" as a P1.** They are not. The
  `__orb.nav.contextTab()` bridge selects a tab but does **not open the detail panel**; with the panel
  closed its content lays out at x≈1470 in a 1440px viewport, `elementFromPoint` → `null`. Clicking
  "Show detail panel" first makes View / Use-for-apply work. A geometry probe that had checked **x** as
  well as **y** would have caught my own bad harness in one step. (Minor real finding underneath: the nav
  bridge arguably *should* open the panel it targets — orchestrator's call, not fixed here.)

## Open forks for the owner (mechanism landed, policy not)

1. **A guaranteed-overrun run still proceeds.** `preflight` gates nothing — `runStage` never reads it. With
   D1 fixed the ordinary case no longer overruns, so the remaining case is a user's own explicit preset
   cap. Whether that should require a confirm, or refuse with the fit receipt, is policy. Not built.
2. **The rewrite estimator does not model the APPEND arm.** `REWRITE_MODE_FACTORS` scales a factor over the
   SELECTED input; fork F-T1 appends whole new greetings that have no selected input to scale from. The
   2× budget headroom absorbs it today; modelling it properly is a follow-up.
3. **`scoreSweep` still runs on the raw `refine_score` floor** (bulk, mixed-owner, `quick` mode — a smaller
   payload, and out of this lane's scope). It shares the class and should be checked.

## Rendered observations, not fixed (no lane authority)

- Assay rows for greetings read `greetings 0 9` / `greetings 1 9` — the greeting INDEX and the SCORE are
  two bare numerals side by side with nothing distinguishing them (`RowsBlock` renders header keys
  generically). Legible once you know; ambiguous cold.
- The teaching state at 1440×1000 is \~70% empty below the three step cards — the side-eye's P3 "62% CONTENT
  void", still true.
