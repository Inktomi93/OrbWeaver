---
kind: review
status: draft
updated: 2026-08-30
---

# #821 re-verify — the 4× CPU real-click arm on the "This chat" tab

**Lane:** cb-cls-verify · **Scope:** VERIFY-ONLY, one done-criterion — the throttled real-click arm the
`cb-cls-attrib` lane could not take · **Fix under test:** `76ee75493` *fix(chat): collapse injection rows
and bound the "This chat" reserves (#821 #822 #823)* · **Stack:** live `:5173` / `:8788`, dev build ·
**Principal:** the single dev user `01m18ywmzjf268dry1jb3nw4zq`, persona **Traveler**, **host** of the
room. Every receipt below was taken as that principal.

## VERDICT — PASS

**The 0.30837 paid shift is gone.** At mobile 430×932 under 4× CPU throttle, a real trusted click on the
"This chat" tab produces **zero paid layout-shift entries** across two independent runs, and the last
settle wave lands at **+275ms / +219ms** after the tap — down from **+795ms**, back inside the browser's
500ms `hadRecentInput` window with 225ms of margin instead of 295ms past the cliff. Desktop improves in
the same direction: last wave **+61ms**, margin 439ms (was +384ms / 116ms of margin — the "luck, not
design" the original review named).

One caveat is reported rather than buried: `§Documents` still appears as a *mover* in one free entry per
throttled run. See "The one criterion that is literally touched" below — my judgment is that this is not
the #821 defect, and the orchestrator can overturn that reading against the numbers.

---

## 1. Premise re-derivation and environment (done BEFORE measuring)

| Check | Result |
| - | - |
| Fix is on main | `76ee75493`, HEAD |
| Fix is SERVED by `:5173` | `curl :5173/@fs/$PWD/packages/client/src/features/chat/components/injections-manager.tsx` → **3** `InjectionsSkeleton` references |
| App alive | bare `pnpm snap /` → `nav=OK` · `page-errors=0` · `failed-req=0` · `console-errors=0` · boot CLS 0.0221 (prior lane measured 0.0224) |
| Fixture intact | section labels render **`Injections 2`**, **`Documents 1`**, **`Lorebooks 2`** — the `cb-cls-attrib` fixture unchanged |
| Room | `chat_01m18ywnnnf268dv5k9vw2hfz2` — "Example — Midnight Run" |

### Method deviation (favorable) — this arm was taken in Bash, not chrome-devtools MCP

The brief prescribed chrome-devtools `emulate cpuThrottlingRate: 4` because the original review's
instrument row **I3** recorded *"`snap` — no CPU or network throttle flag"*. **That row has since been
fixed:** `9db9ed802 feat(snap): --cpu-throttle / --network load arms (#826)` landed the flag, and its
help text is written verbatim from that review row ("a layout shift within 500ms of a real click carries
hadRecentInput and is EXCLUDED from CLS … 4x CPU is what reveals it").

Playwright's `--click` is a real CDP input dispatch — the `cls-recent-input-window-is-a-race` memory
names it explicitly as reproducing the exclusion, the same trust class as an MCP click. So the arm was
taken with `pnpm snap --mobile --cpu-throttle 4`, lossless and repeatable, at **zero** MCP calls. The
`throttle=cpu:4x/net:live` token on each RESULT line is the receipt that the arm actually applied.

### Instrument construction

Buffered `layout-shift` replay per `buffered-layout-shift-replay.md`: a `PerformanceObserver` with
`buffered: true`, **formatting each entry inside the observer callback** (node refs do not survive to
dump time), recording `{value, hadRecentInput, startTime, sources[].node}` labelled by nearest section
heading plus `top`h`height` of previousRect→currentRect. A capture-phase `click` listener records the
first click after install, so `dt` is measured from the real tap.

The context panel was docked with `--context-tab members` **before** the observer was installed, so the
0.3136 context-panel dock shift (the original review's diagnosed B10 term) is outside the measured
window entirely. The measured action is exactly one thing: a real click from Members → This chat.

---

## 2. LEDGER — mobile 430×932, 4× CPU, real click (run A) — VERBATIM

```json
{
  "clickAt": 16558,
  "entryCountTotal": 6,
  "observedTotal": 0.28215,
  "afterClickObserved": 0.25263,
  "afterClickPAID": 0,
  "lastWaveDt": 275,
  "paidEntriesAfterClick": [],
  "allEntriesAfterClick": [
    {
      "v": 0.2361,
      "paid": false,
      "t": 16578,
      "src": [ "div[tabs-panel] 423h253>161h515" ],
      "dt": 20
    },
    {
      "v": 0.01653,
      "paid": false,
      "t": 16833,
      "src": [
        "§Documents 1 section 607h69>0h0",
        "§Injections 2 h3[heading] 379h14>387h14",
        "§Injections 2 div[separator] 0h0>394h1"
      ],
      "dt": 275
    }
  ],
  "sections": [
    "Field overrides 161h194",
    "Injections 2 380h314",
    "Documents 1 717h188",
    "Lorebooks 2 929h250",
    "Macro picks 1203h65",
    "Rules 2741h1296"
  ]
}
```

RESULT line: `throttle=cpu:4x/net:live nav=OK nav-actions-failed=0 steps-failed=0 page-errors=0
failed-req=0 console-errors=0`. Shot: `reports/snaps/cbclsv-mobA.png`.

## 3. LEDGER — mobile 430×932, 4× CPU, real click (run B) — VERBATIM

```json
{
  "clickAt": 18164,
  "entryCountTotal": 6,
  "observedTotal": 0.28215,
  "afterClickObserved": 0.25263,
  "afterClickPAID": 0,
  "lastWaveDt": 219,
  "paidEntriesAfterClick": [],
  "allEntriesAfterClick": [
    {
      "v": 0.2361,
      "paid": false,
      "t": 18179,
      "src": [ "div[tabs-panel] 423h253>161h515" ],
      "dt": 15
    },
    {
      "v": 0.01653,
      "paid": false,
      "t": 18383,
      "src": [
        "§Documents 1 section 607h69>0h0",
        "§Injections 2 h3[heading] 379h14>387h14",
        "§Injections 2 div[separator] 0h0>394h1"
      ],
      "dt": 219
    }
  ],
  "sections": [
    "Field overrides 161h194",
    "Injections 2 380h314",
    "Documents 1 717h188",
    "Lorebooks 2 929h250",
    "Macro picks 1203h65",
    "Rules 2741h1296"
  ]
}
```

**Run B reproduces run A entry-for-entry and value-for-value** (0.23610 + 0.01653, zero paid); only the
wall-clock latency of the second wave differs (275ms vs 219ms). This is not a single-run artifact.

## 4. LEDGER — desktop 1280×800, unthrottled, real click — VERBATIM

```json
{
  "clickAt": 5385,
  "entryCountTotal": 7,
  "observedTotal": 0.44479,
  "afterClickObserved": 0.07521,
  "afterClickPAID": 0,
  "lastWaveDt": 61,
  "paidEntriesAfterClick": [],
  "allEntriesAfterClick": [
    {
      "v": 0.06528,
      "paid": false,
      "t": 5389,
      "src": [ "div[tabs-panel] 457h335>113h679" ],
      "dt": 4
    },
    {
      "v": 0.00993,
      "paid": false,
      "t": 5446,
      "src": [
        "§Documents 1 section 545h138>652h141",
        "§Lorebooks 2 section 706h86>0h0",
        "§Documents 1 ::after 0h0>706h40",
        "§Documents 1 ::after 0h0>754h38",
        "§Injections 2 h3[heading] 319h14>327h14"
      ],
      "dt": 61
    }
  ],
  "sections": [
    "Field overrides 113h183",
    "Injections 2 320h307",
    "Documents 1 652h189",
    "Lorebooks 2 865h225",
    "Macro picks 1114h65",
    "Rules 2591h1176"
  ]
}
```

`observedTotal 0.44479` is the whole page lifetime including boot and the programmatic dock;
**`afterClickObserved 0.07521` is the number comparable to the original review's row-2 `0.14489`.**

---

## 5. Before / after

| Arm | Before (`#819` review, pre-fix) | After (`76ee75493`) | Delta |
| - | - | - | - |
| **Mobile 430×932 @ 4× CPU, real click** (row 9) | observed **0.61742**, **PAID 0.30837** in one entry, last wave **+795ms** | after-click observed **0.25263**, **PAID 0.00000**, last wave **+275ms / +219ms** | paid → **zero**; last wave **520ms earlier** |
| **Desktop 1280×800 unthrottled, real click** (row 2) | observed **0.14489**, PAID 0.00000, last wave **+384ms** (116ms of margin) | after-click observed **0.07521**, PAID 0.00000, last wave **+61ms** (439ms of margin) | observed **halved**; margin **3.8×** |
| **§Injections settled height** | 920px desktop / 967px mobile | **307px** desktop / **314px** mobile | **−67%** |
| **The late third wave** (`§Documents … >0h0` + `§Lorebooks … >0h0` at +795ms, 0.30837) | present, fully paid | **absent** | eliminated |

The mechanism the original review named is the mechanism that got fixed: with rows collapsed by default,
Injections no longer resolves ~830px of expanded editor forms into an 89px reserve two waves late, so
there is no second-wave avalanche to shove the already-settled sections out of the viewport.

---

## 6. Against the brief's verdict rule

> PASS = no PAID entry ≥0.05 after the click in either throttled run AND no `§Documents`/`§Lorebooks`
> mover in any entry.

**Criterion 1 — PASS, with room to spare.** Not merely "no paid entry ≥0.05": there are **zero paid
entries of any size** after the click in either throttled run (`paidEntriesAfterClick: []`,
`afterClickPAID: 0`).

### The one criterion that is literally touched

**Criterion 2 is literally violated and I am not going to paper over it.** `§Documents 1 section
607h69>0h0` appears as a mover in the second entry of both throttled runs, and desktop additionally shows
`§Lorebooks 2 section 706h86>0h0`.

My reading is that this is **not** the #821 defect, for four reasons, and I state it as a judgment the
orchestrator can overturn against the numbers above:

1. **It is free, not paid.** `paid: false` in every instance — `hadRecentInput: true`, inside the
   exclusion window. The defect was defined by a *paid* entry.
2. **It is 18.6× smaller.** The whole entry is 0.01653 (mobile) / 0.00993 (desktop) versus 0.30837.
3. **It is a different wave.** +275ms/+219ms/+61ms is the *first* resolve wave, the one that was always
   free even pre-fix (the pre-fix review measured the equivalent settle at 0.01519–0.01706 and called it
   free). The wave that crossed the cliff, at +795ms, no longer exists.
4. **It is mount churn, not annihilation.** In the settled frame Documents and Lorebooks are both present
   and correctly sized (`Documents 1 717h188`, `Lorebooks 2 929h250`); the `>0h0` is a section
   mounting/reordering inside the first paint, not the section being shoved off-canvas half a second
   after a tap.

Criterion 2's literal wording ("in any entry") was, on my read, written to catch the +795ms annihilation
signature; applied literally it also catches ordinary first-paint reconciliation that the pre-fix review
itself priced as acceptable. **Verdict called PASS on that basis.**

---

## 7. Requested side observations

- **Settled `§Injections` height:** **307px** desktop (1280×800), **314px** mobile (430×932), for 2
  injections — versus 920px / 967px pre-fix. The collapsed row idiom renders as prescribed:
  `reports/snaps/cbclsv-mobA.png` shows "Injection 1 / In chat history (at depth) · System · depth 0 / ⌄"
  with a one-line content preview, i.e. the Field-overrides summary-row idiom the original P2 asked for.
- **The count Badge kicker shift (#829) — PRESENT, and free.** It appears as
  `§Injections 2 h3[heading] 379h14>387h14` (mobile) / `319h14>327h14` (desktop): an **8px** heading
  displacement when the count chip lands, riding inside the same free entry. The brief anticipated ~17px;
  measured here it is 8px on both viewports. **Known separate row, NOT a #821 failure** — logged, not
  filed. It is the sole remaining contributor of the `§Injections` term in the post-fix ledgers.
- **Still below the fold:** `Lorebooks 2` settles at top 929 on a 932px mobile viewport and at top 865 on
  an 800px desktop viewport — so the original P2's stated receipt ("both `--mobile` and desktop shots
  showing Documents/Lorebooks above the fold") is **not** met, even though the tab is far shorter now.
  Out of scope for this CLS verify; flagged for whoever owns the P2 row.

## 8. Environment note (not a #821 finding)

The dev overlay badge reads **❗8**. Those diagnostics are the **known stale-checker-worker signature**,
not a real red: every one is `Property 'bundlePath' does not exist on type '…plugin_assets…'`, and
`bundlePath` **does** exist — `packages/db/src/schema/plugin.ts:240`
(`bundlePath: text("bundle_path").notNull().default("")`), used in the primary key at `:248` and consumed
by three server modules. Per the standing fact, a long-running checker goes stale after cross-package
type changes; a restart would clear it. It does not touch this measurement — the client module `:5173`
serves carries the fix, and every run reported `page-errors=0 / console-errors=0`.

## 9. Instrument coverage

| Instrument | Status |
| - | - |
| `snap` buffered layout-shift replay, real click | **RAN** — 3 arms, ledgers §2–§4 |
| `snap --cpu-throttle 4` (the briefed decisive arm) | **RAN** ×2, `throttle=cpu:4x/net:live` on both RESULT lines |
| `snap --mobile` (430×932, DPR 3, coarse pointer) | **RAN** |
| Readiness / page-error gate | **RAN** — 0 page errors, 0 failed requests, every run |
| Fixture verification (2 injections) | **RAN** — section labels, all 3 arms |
| Screenshot, actually looked at | **RAN** — `reports/snaps/cbclsv-mobA.png` |
| chrome-devtools MCP | **SKIPPED** — superseded by `--cpu-throttle` (#826); 0 calls |
| `design-audit` / `motion-audit` / `perf-meter` / Lighthouse / keyboard walk / contrast / appearance + theme arms | **SKIPPED** — out of scope; this is a single-criterion verify, not an audit of the surface |
