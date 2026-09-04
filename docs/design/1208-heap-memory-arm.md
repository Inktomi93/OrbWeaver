---
kind: design
status: active
updated: 2026-09-04
---

# 1208 heap and browser-memory arm

> Parent design: `docs/design/1208-instrument-substrate.md` · Issue: #1300

## Decision

Snap gains one page arm rooted at three spellings and no aliases:

- `--heap <label>` captures a garbage-collected V8 heap snapshot of the exact settled page Snap is
  already driving. It is repeatable and page-targetable (`--heap@1`).
- `--heap-compare <left=right>` compares two labels captured in the same browser context, or two absolute
  `.heapsnapshot` paths carrying Snap's adjacent provenance sidecars.
- `--heap-retainers <snapshot=selector>` resolves one retained object and files bounded retaining paths,
  its dominator chain, and its largest outgoing references. Selectors are `@<node-id>`, `detached`, or
  `class:<exact-class-name>`.

There are no `--memory-*`, `--heap-snapshot`, `--heap-diff`, `--retainer-tree`, or `--leaks` synonyms.
Capture labels are deliberately labels rather than caller-selected output paths: the raw snapshot and
every parsed derivative must remain inside the call's immutable run slot. Absolute paths are accepted
only as analysis inputs, and only when the raw bytes match a valid Snap sidecar.

The arm is a settled **page** arm, not a run arm and not an action dispatcher. `capture()` already runs
the same page-arm registry after navigation, the argv tape, and settlement for ordinary runs, named
sessions, scenario checkpoints, pages, contexts, and matrix cells. The heap arm therefore uses that one
rail without widening the run lifecycle or adding a scenario-only branch. A before/after investigation is
two named-session calls or two scenario checkpoints over the same BrowserContext. Multiple captures in
one checkpoint are sequential stability samples; they do not pretend that an interaction occurred between
them.

Every `ArmDef` declares a total `sessionCallBaseMs(opts)` operation budget. Null means the arm adds no
time beyond the ordinary non-navigation call floor; the registry takes the widest enabled declaration,
and the daemon applies the shared `budget()` load scaler once. Heap declares a 30-second quiet-box base.
The old fixed 5-second daemon watchdog killed a valid 6.259-second heap call after all heap artifacts and
`heap=measured` had already landed, turning passed evidence into overall exit 2. The arm-owned declaration
fixes that class without a heap branch or a raised global timeout. Navigation's existing 180-second outer
budget still wins when wider. A call beyond the selected/scaled budget still terminates execution and the
next call must survive (the existing T17 invariant).

The live label table is a `WeakMap<BrowserContext, HeapContextState>` owned only by the heap arm. It gives
ordinary scenarios and the session daemon label continuity without putting heap vocabulary on the shared
`ProbeSession` contract. Labels never cross browser contexts. Reusing a label in the same context refuses
instead of silently replacing evidence. Each state mints one `captureSessionId`; every sidecar also records
the CDP target id, browser-context id, page/context index, URL/title, browser product/protocol/JavaScript
version, parser engine/version, capture time, raw byte count and SHA-256. A comparison requires equal
capture-session, target, browser and parser identity. Different URLs on the same target are allowed and
reported because navigation within one page is a legitimate before/after sequence.

## Capture and parser ownership

Capture stays on Snap's page and CDP connection. The arm creates a page-scoped Playwright `CDPSession`,
enables `HeapProfiler`, calls `collectGarbage`, streams `addHeapSnapshotChunk` bytes into the active slot,
awaits `takeHeapSnapshot`, disables the domain and detaches. It never launches, attaches to, or closes a
browser or BrowserContext. Primary failure and disable/detach failures are preserved together; cleanup
cannot overwrite the reason capture failed.

The browser-free parser is the official DevTools engine already proven by the installed Chrome DevTools
MCP 1.8.0 implementation (`src/processors/HeapSnapshotManager.ts`), not a home-grown dominator algorithm.
`chrome-devtools-mcp` is exact-pinned at `1.8.0` as a tooling-only parser dependency. One adapter owns the
deep import of `build/src/processors/HeapSnapshotManager.js`; no MCP server, process, transport, Puppeteer
page, or browser launch is imported or started. The adapter verifies the installed package version, module
constructor and required method set before use and disposes every worker on every exit. Drift refuses
loudly. There is no fallback parser: silently losing retained-size, detachedness, dominators or retaining
paths would be a false-clean instrument.

The package is Apache-2.0 and self-contained in its published bundle. The catalog note records why the
dependency exists, the deep-import compatibility obligation, the exact-pin rule, and the planted package
subpath parse test required on any bump.

## Evidence and limits

Every successful capture retains two primary artifacts:

1. the lossless `.heapsnapshot` raw bytes; and
2. an adjacent `snap-heap-snapshot-v1` JSON sidecar with identity, parser provenance, DevTools statistics,
   native-context and retained-by-context totals, object/node/self-size denominators, the largest classes,
   and the largest detached DOM nodes.

The terminal prints a bounded table and exact immutable paths. Top-class and detached-node displays are
bounded, with total/shown/omitted counts in the artifact and terminal. The raw snapshot remains lossless.
Malformed or truncated JSON, a missing raw file or sidecar, a byte/hash disagreement, an empty node/object
population, parser drift, and a CDP stop/detach failure are instrument refusals (exit 2), never empty clean
summaries.

Comparison files (`snap-heap-comparison-v1`) retain both complete snapshot identities, total/native/V8/
self-size deltas, detached count/self/retained deltas, and bounded class growth/removal rows. Class rows
carry count, self-size and maximum-retained-size values for both sides; the official class-diff engine owns
added/removed counts and sizes. Positive growth and detached objects become analyzer-owned structured
problem rows and indexed composite findings, but **never vote the process exit**. There is no universal
memory budget or arbitrary byte threshold. The evidence tells an agent what grew and why it remains;
the caller decides whether that growth is expected.

Retainer files (`snap-heap-retainers-v1`) contain the selector, candidate denominator, selected object
identity/type/distance/self/retained/detachedness, bounded retaining paths, the full returned dominator
chain, and bounded largest outgoing edges. Defaults are depth 12, 200 path nodes and 8 siblings so ordinary
DOM retainers reach their GC root while remaining bounded. Any engine limit is an explicit structured receipt. A selector matching
zero objects refuses; a selector matching several chooses the greatest retained size and reports the
candidate count rather than pretending uniqueness.

All three JSON families carry `problems: SnapAnalyzerProblem[]`. The existing browser-free analyzer reader
is widened from motion/perf to heap and validates `snap-heap-*-v1`. Heap growth rows are annotations;
detached-DOM and malformed-evidence rows are errors in the display layer. Findings never change the arm's
exit. Run-index artifact declarations name producer/arm/channel/schema/page/context/window, completeness,
record counts and exact limit events. The final `RESULT` pairs, `run.json` pairs, arm verdict, end-card
artifact pointers and `pnpm snap --report <index> --problems --arm heap` output must agree byte-for-byte on
paths and state.

## Rejected alternatives

- A custom V8 snapshot graph parser is rejected. Capture is simple, but dominators, retained sizes,
  weak-edge reachability, native-context attribution and retaining paths are a large correctness engine.
  Reimplementing them beside the exact DevTools engine would create a plausible-but-wrong second truth.
- Importing or spawning the MCP server is rejected. Only its browser-free parser bundle is used; Snap's
  existing browser/page/CDP/run-slot rail remains the sole capture path.
- A separate `pnpm heap` or `pnpm browser` tool is rejected by the parent design's one rendered-instrument
  CLI ruling.
- A run arm is rejected because scenario checkpoints deliberately do not host run arms. The existing page
  registry already reaches the exact settled checkpoint in every required host.
- A heap action in the argv tape is rejected for this iteration. It would add a fourth action kind and a
  second meaning for settlement. Named sessions and scenarios already express before/after checkpoints
  without widening the drive dispatcher.
- Caller-selected raw output paths are rejected because they escape the immutable run slot and make the
  index reference mutable external evidence.
- A memory-size pass/fail threshold is rejected. There is no application-independent correct heap size;
  positive retained growth is evidence, not a gate.
- Inferring compatibility from filenames, labels, URLs, or timestamps is rejected. Sidecar identity and
  raw hashes are the only analysis boundary.

## Coupled sites

- `pnpm-workspace.yaml`, `tooling/package.json`, `pnpm-lock.yaml`: exact parser pin and provenance note.
- `snap/contract/heap.ts`: all capture/summary/comparison/retainer shapes and bounded-limit vocabulary.
- `snap/lib/heap-devtools.ts`: the sole deep-import adapter and official-engine normalization.
- `snap/lib/heap-analysis.ts`: labels, provenance/hash validation, comparison and selector rules.
- `snap/ops/arms/heap.ts`: CDP capture, the BrowserContext-owned label table, filing/reporting/refusal.
- `snap/contract/types.ts`: heap args and capture outcome; `snap/contract/arms.ts`: roster and owned fields.
- `snap/ops/arms/registry.ts`: row/default composition only; all scanner/handler/help wiring remains derived.
- `snap/ops/capture.ts`: initializes the heap outcome only; it gains no heap branch.
- `snap/lib/run-bundle-verdict.ts`: enabled-arm/source/lifetime projection.
- `snap/contract/run-index.ts`, `snap/lib/run-report-problems.ts`,
  `snap/lib/run-finding-analyzers.ts`, `snap/lib/run-report-analyzers.ts`, `snap/ops/run-bundle.ts`:
  structured heap problems, completeness and browser-free display.
- `snap/index.ts`: curated programmatic exports needed by tests/readers.
- `tests/tooling/snap/ops/arms/heap.suite.int.test.ts`: the exact #1300 definition-of-done suite;
  additional pure adapter/model tests may sit at their mirrors.

`flags-classes.ts`, `flags-handlers.ts` and `contract/help.ts` require no hand-wired heap rows: the arm
registry derives those surfaces. `actions.ts`, `drive.ts`, the browser launcher and session protocol do not
change. The existing request ring and run index are consumed, not forked.

## Red-first and planted controls

The consolidated suite first runs against the missing arm and must fail on the unknown `--heap` flag.
It then proves:

1. A real file-page control captures a non-empty official snapshot, retains raw+sidecar bytes, and makes
   the exact installed parser subpath report positive node/object denominators. This is the zero-result
   non-vacuity control.
2. A retained `OrbHeapLeak` object plus detached DOM node grows between session/scenario checkpoints;
   comparison names the class/detached growth, retainers resolve the detached node, and raw paths,
   dominators and retaining paths are non-empty.
3. The clean twin releases all references before the second garbage-collected capture; the planted class
   and detached population do not grow. The assertion is class-specific rather than demanding a perfectly
   noise-free browser heap.
4. A truncated copy refuses in the official parser. Missing label/raw/sidecar, hash mismatch, wrong parser
   version, different capture-session id and different target id each refuse with the owned reason.
5. A named-session first call captures `before`; a later call on the same live page captures `after`,
   compares, queries retainers, and leaves the session usable. A two-checkpoint scenario proves the same
   label continuity through the ordinary page-arm registry. A second BrowserContext cannot resolve the
   first one's label.
6. More rows than each display cap retain highest retained size/severity, exact totals and omissions, and
   the immutable JSON recovers every row.
7. Capture failure plus disable/detach failure preserves both errors and closes no daemon-owned context.
8. The last terminal `RESULT`, run-index `resultPairs`, heap arm state, artifact declaration identities,
   end-card pointers and browser-free `--report --problems --arm heap` agree.

Focused graduation is the exact Project #1300 command:

```text
pnpm test:scoped tests/tooling/snap/ops/arms/heap.suite.int.test.ts --maxWorkers=1
```

Then run the touched pure tests, tooling and graph TypeScript programs, targeted Biome, dependency cruise
for the new imports, knip, and the structure floor. The orchestrator owns the final whole-tree battery.

## Prior lessons used

- `MEMORY.md`'s unified Snap program note: a zero is untrusted without a planted positive, artifacts must
  round-trip writer → immutable index → browser-free reader, and completion includes cold-agent usability.
- `MEMORY.md`'s instrumentation-proof note: source review is not runtime certification; exact page/target,
  population denominators and failure apparatus must be exercised through a real browser.
- `docs/design/1208-request-result-truth-repair.md`: a run arm/page arm reads one lifetime owner and files
  exact normalized terminal truth; it does not install a second capture path or infer success from argv.

## Owner ruling

The orchestrator approved the exact-pinned `chrome-devtools-mcp@1.8.0` parser-engine default on
2026-09-04 with these constraints: one adapter owns the deep import; catalog note plus Apache-2.0
provenance; no MCP server/process/browser launch; capture remains Snap's CDP/page/run-slot path; module and
type compatibility drift fails loud; and a planted test loads the installed package subpath and parses a
known snapshot. No bespoke fallback may silently downgrade retained-size/dominator truth.

## Implementation receipt

Implemented on 2026-09-04 in the shared, uncommitted #1292 program tree. The delivered vocabulary is
exactly `--heap`, `--heap-compare`, and `--heap-retainers`. A live ordinary file-page capture completed in
2.6 seconds with no stderr, a non-empty official parser population, lossless raw bytes, a bounded sidecar,
exact artifact declarations, and matching terminal/index/end-card paths.

The first live capture exposed two parser-integration defects before acceptance. Concurrent first reads of
one path created six DevTools workers because the upstream manager caches only completed loads; Snap now
primes that cache once and every parse disposes one worker. The official worker also printed 81 weak-root
problem-report lines to stderr. The exact-version pnpm patch changes no graph algorithm: it diverts those
reports to a per-parse JSONL sink. Snap retains 20 rows plus an exact 61-row omission receipt in the
sidecar, so agent output stays concise without discarding parser truth.

The serial combined battery exposed a third defect after the first acceptance pass: the named-session
watchdog used a fixed 5-second base for every non-navigating call. Surviving run
`reports/runs/snap/main-1917088-2026-09-04T02-54-20-953Z/run.json` proved heap itself passed
(`heap=measured`, one snapshot/comparison/retainer, zero heap errors) while the daemon returned overall
exit 2 after 6.259 seconds. The red-first heap suite now plants 5.5 seconds of pre-capture work; it fails
under the old watchdog and passes under heap's registry-owned 30-second base. The ordinary T17 hung-call
control continues to use the 5-second floor and proves timeout plus next-call survival.

Fresh behavioral receipts:

- exact Project #1300 DoD: `tests/tooling/snap/ops/arms/heap.suite.int.test.ts` — 1 file, 4 tests, zero
  type errors; retained leak/detached plant, released twin, named-session continuity/survival, scenario
  continuity, retaining paths/dominators, parser/hash/provenance refusals, report/index/terminal parity,
  and aggregate capture/disable/detach failure all passed;
- arm registry plus CLI help/parse: 2 files, 56 tests, then the explicit heap registry row rerun at 18/18;
- immutable run bundle: 1 file, 13 tests;
- unified analyzer migration: 1 file, 9 tests;
- tooling, graph, tests-DOM and per-package TypeScript programs passed; the complete dependency cruise
  passed 4,397 modules / 25,217 dependencies; targeted Biome and `git diff --check` passed.

The fresh complete structure run is
`reports/runs/structure/main-1832239-2026-09-04T02-39-53-413Z/check-structure.json`: 254/254 gates ran.
It reports zero findings in heap, its test, the parser patch/loader, `_shared/proc.ts`, or the decomposed
run-bundle files. Its seven remaining violations are outside #1300: one rate-posture caught-failure row,
two rate-posture test-fabrication rows, and four concurrent CLI files over the tooling-size cap
(`session-plan.ts`, `matrix.ts`, `parse.ts`, `run-report.ts`). `run-bundle.ts` is now 445 lines and its
former cognitive-complexity/size violation is gone.

One exploratory `pnpm verify --changed` was intentionally interrupted with Ctrl-C after 16 minutes when
the shared 156-file dirty program expanded the scoped request into the whole `tests/client` CT set. It
therefore left an abandoned `.inflight` verify slot and no `verify.json`; it is not cited as a verdict.
Its completed stage logs showed no heap ESLint/type failure, and the exact required/focused receipts above
were rerun afterward. The orchestrator owns the quiesced final program battery, doc-catalog attestation,
commit, and Project transition.
