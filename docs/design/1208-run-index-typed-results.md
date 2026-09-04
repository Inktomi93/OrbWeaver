---
title: "1208 typed run results and artifact scope"
status: implementation-design
date: 2026-09-04
parent: docs/design/1208-instrument-substrate.md
issue: 1301
---

# 1208 typed run results and artifact scope

## Decision

`resultPairs` remains the byte-stable printable RESULT transcript and nothing else. It is retained in
`run.json` for exact parity and terminal archaeology, but no run-index verdict, report, composite finding,
session client, or structured consumer may parse or percent-decode it. Snap gains a separate versioned
`results` population whose records are produced from the typed state that created the transcript.

Every `ArmDef` owns one required result declaration:

- a unique versioned `schema`;
- `source` and `lifetime` provenance;
- `enabled(opts)`, replacing the separate enabled-arm field/name table; and
- its lifecycle's required `facts()` method.

Page and run lifecycles return one or more strongly typed fact emissions with a discriminated evidence
scope and a small named object. Every fact object has a typed `state`
(`passed|failed|refused|withheld|absent|off`) and `detail`, then arm-owned named fields such as counts,
populations, action/window identity and artifact references.

**Owner overrule, 2026-09-04.** A generic `Record<string, JsonValue>` is not a sufficient public/trust-
boundary contract even when each record names a schema. `contract/run-facts.ts` therefore owns a total
`ARM_FACT_DATA_SCHEMAS` Zod record keyed by `Arm`; every schema extends the common state/detail base with
meaningful fields for that arm. `ArmFactDataByArm` is inferred from that record, never re-declared. A
total schema-id record is keyed by the same `Arm`, and `SnapArmFact` is a distributive mapped union: for
each arm A, `arm:A`, `schema:ArmFactSchemaIdByArm[A]` and `data:ArmFactDataByArm[A]` are correlated.
Wrong-arm data or schema is a compile error. This central type/schema map is not a duplicate execution
roster: `ARM_DEFS` remains the sole runtime lifecycle/ordering/enabled/source/lifetime registry; the map
is the wire/trust-boundary grammar its records must satisfy. A missing member fails `tsc`, and the
registry fixture proves the fence can bite.

Runtime readers never trust a predicate or cast. They parse the envelope, select the arm's schema from
the total record, and `safeParse` the data. Core facts likewise use a discriminated Zod schema union and
infer their TypeScript types. Tooling declares direct `zod` consumption through the existing catalog.

`ARM_DEFS: { [A in Arm]: ArmDef<A> }`, total Zod records, runtime lifecycle assertions, and registry completeness tests make
a new arm fail until it supplies result metadata, enablement and facts. The registry is the only aggregate:
it walks `ARMS` in execution order, wraps emissions with the owning metadata, and returns typed records.
The old `ARM_EVIDENCE`, enabled-arm field/name list and pair-value state parser are deleted.

Core facts are a separate closed union, not a fake arm:

- `snap-rate-posture-v1` carries the full typed `SnapRatePosture` (`id`, acceleration fields and error,
  numeric load/cpu count) instead of the percent-encoded pipe token;
- `snap-core-run-v1` carries terminal exit/state, capture/page/context counts, the typed failure summary,
  file-action count, diagnostic/request populations and session/scenario/matrix identity available at the
  owner seam.
- `snap-browser-retention-v1` embeds the shared `BrowserEvidenceRetentionBatch` grammar without
  re-spelling it. Its aggregate diagnostic/diagnostic-completeness rows feed the run-index completeness
  state and end-card dropped count, so retained-clean rows cannot contradict a ring eviction.

Core and terminal exit facts admit the complete house contract (`0 clean`, `1 violations`, `2 tool
error`, `3 misuse`). A pre-browser argv refusal therefore files exit 3 without completion throwing and
upgrading it to exit 2.

One invocation may register several batches: matrix cells and scenario checkpoints share a slot but own
distinct scopes. The in-process writer accumulates batches and writes them once. Named-session daemons
send the exact typed batches and the exact pair array on the versioned `done` event; the client validates
and registers both. The daemon no longer reconstructs pairs with `resultPairsOf(captured)`: the verdict
door's exact pair receipt crosses the wire directly. Administrative/refusal runs with no browser batch get
one synthesized core terminal fact and no invented arm measurement.

## Evidence scope

Current artifact declarations and fact records use one branded scope contract with a decision for **each** axis:

```text
context = exact N | aggregate all/[N…] | not-applicable(reason)
page    = exact N | aggregate all/[N…] | not-applicable(reason)
window  = exact id | aggregate all/[id…] | not-applicable(reason)
```

The current outer discriminant is `scope-v1`. No current metadata field accepts null and no producer may
omit an axis. `exact` means the bytes/fact intrinsically describe that one axis, not merely that the run
happened to contain one page. `aggregate` remains aggregate in a one-page run. `not-applicable` is only
for facts/artifacts genuinely outside that axis (for example run/source identity), never shorthand for
unknown.

Mixing-prone primitives are branded at this boundary and minted only through checked Zod parsers/helpers:
`ContextIndex`, `PageIndex`, `EvidenceWindowId`, run-relative `ArtifactRef`, and fact-batch identity. A
page index cannot assign to a context index; an arbitrary absolute/string path cannot assign to
`ArtifactRef`. Schema literals remain discriminants rather than acquiring decorative brands.
`.test-d.ts` controls pin wrong-arm data, wrong schema, page/context swaps, unbranded artifact paths and
a missing arm schema member as compile failures.

Legacy immutable-v1 indices are normalized only by the browser-free reader into
`{kind:"legacy", context:number|null, page:number|null, window:string|null}`. The writer and allocation
API cannot construct legacy scope. An old null therefore remains visibly missing/ambiguous; it is never
relabelled aggregate or N/A.

Scope rulings for current producers:

- screenshots and one-page Lighthouse/CPU/boot/heap artifacts are exact; pages mode uses `c0/pN`, while
  isolated-context mode uses `cN/p0` from the host-owned scope passed into screenshot allocation;
- capture manifests, core capture, scenario, matrix, React multi-page profiles, request batches and
  session trace/HAR exports are aggregate even when their observed population has one member;
- global run/diagnostic-completeness/daemon-log facts use N/A only where the artifact truly has no page,
  context or evidence-window subject;
- diagnostic rows retain exact record identity internally; their batch artifact is aggregate;
- raw fallbacks inherit the scope of the capture that produced them rather than defaulting to null.

`--page`, `--context` and `--window` filters use scope dimensions: exact matches its value; aggregate
matches a requested value only when its declared set contains it or is `all`; N/A never matches a scoped
filter; legacy matches only a surviving exact legacy value and null never matches. Composite finding
evidence references carry the same scope object and use the same matcher. There is one scope interpreter.

## Schema and reader behavior

`SnapRunIndex.v` remains 1 because current program artifacts are uncommitted; `results.v = 1` and
`scope-v1` provide the new compatibility seams. Current writers always emit both. Readers accept absent
`results` and old artifact/finding triples only as explicit legacy-v1 compatibility. If `results` exists,
unknown arm schemas, duplicate singleton arm records, Zod-invalid data, invalid states, malformed scope,
source/lifetime disagreement with the live arm registry, or an artifact reference outside the inventory
refuse the whole index. No fallback parses pairs.

The default report prints concise typed FACT rows before artifacts. It shows schema, arm/core owner, state,
scope and bounded JSON data. `--arm` filters arm facts. Page/context/window filters use the scope matcher.
The report may still render producer artifacts and detailed findings, but it never derives a typed number
from `k=v` text.

## Coupled sites

- `snap/contract/run-facts.ts` — total Zod schema/schema-id records, inferred `ArmFactDataByArm`, the
  distributive arm-fact union, branded fact-batch/core schemas and results v1.
- `_shared/artifact-scope.ts` — branded scope dimensions/current/legacy shapes, Zod parsers and checked
  mint helpers shared by allocation and Snap.
- `snap/contract/arms.ts` + every `ops/arms/*.ts` — required result metadata/enablement and lifecycle
  facts; `ops/arms/registry.ts` is the sole aggregator/schema registry.
- `snap/lib/rate-posture.ts` — the strongly typed core posture fact source (no new reading).
- `snap/ops/run.ts`, `contexts.ts`, `scenario.ts`, `matrix.ts` — register typed batches at the same seams
  that already own outcomes/rate posture; no second page read.
- `snap/ops/run-bundle.ts` / `lib/run-bundle-verdict.ts` — accumulate/take facts, synthesize terminal-only
  core facts, write results and derive arm verdicts without pairs.
- `snap/contract/session.ts`, `lib/session-wire.ts`, `ops/session-daemon-request.ts`,
  `ops/session-client.ts` — typed pair/fact done-event handoff.
- `_shared/artifact-out.ts`, every artifact allocation site, `lib/run-bundle-files.ts`,
  `lib/run-index-artifacts.ts` — current scope declarations and legacy normalization.
- `lib/run-report-query.ts`, `ops/run-report.ts`, `ops/run-report-render.ts`,
  `lib/run-finding-common.ts`, `contract/run-index.ts` — validation, filtering and display over typed facts
  and scopes.
- exact DoD: `tests/tooling/snap/ops/run-index-typed-results.suite.int.test.ts`; existing registry,
  run-bundle, report, session-wire, session-HAR, scenario/matrix, analyzer and heap suites are coupled.
- type DoD: `tests/tooling/snap/contract/run-facts.test-d.ts` proves the brand and arm/schema/data fences.

## Red-first and planted controls

1. Writer → immutable index → cold browser-free reader carries full numeric/string/object rate posture,
   representative core/request/motion/perf/heap facts, schema/source/lifetime and direct artifact paths
   without reading or parsing `resultPairs`.
2. A planted pair value disagrees with typed facts; report/verdict follows facts while terminal pair bytes
   remain byte-identical. A spy makes any pair parser/percent decoder throw.
3. Type tests prove a synthetic/missing arm member, wrong arm data, wrong schema, page/context swap and
   unbranded artifact ref fail. Runtime completeness refuses an arm missing metadata/facts.
4. Exact screenshot/heap facts, aggregate one-page core/manifest/request/React facts and genuine N/A facts
   keep their distinctions through allocation, run index and filters. Aggregate-one remains aggregate.
5. Current declarations with any null/omitted axis fail TypeScript/runtime validation. Legacy v1 null
   triples normalize to `legacy` and remain readable; a current `legacy` declaration refuses.
6. Unknown fact schema, source/lifetime drift, non-JSON data, malformed dimensions, duplicate invalid
   records and stale fact artifact references refuse browser-free.
7. Named-session wire preserves facts, rate posture and exact pairs; scenario, matrix and multi-page runs
   retain distinct scopes rather than last-writer wins.
8. Typed facts never change exit. Pass/fail/refusal/withhold and the final RESULT transcript remain exactly
   what the producer verdict door returned.

Exact graduation command:

```text
pnpm test:scoped tests/tooling/snap/ops/run-index-typed-results.suite.int.test.ts --maxWorkers=1
```

Then run the coupled run-bundle/report/session/arm suites, all TypeScript programs, targeted Biome/ESLint,
knip/depcruise for the new files and a fresh complete structure pass after the concurrent #1307 rename.

## Alternatives rejected

- Parsing `resultPairs` into a typed object is rejected: it makes a presentation encoding the database,
  preserves percent-decoding and key-coercion ambiguity, and lets transcript wording change schema truth.
- A hand-maintained central map of roughly seventy terminal keys is rejected: it is the drift class the
  arm registry removed. The owner-required total Zod map is accepted because it is the inferred public
  data grammar keyed by arm, not a second execution/flag/pair roster, and no type is re-spelled beside it.
- A generic schema-labelled `Record<string, JsonValue>` is explicitly rejected by owner ruling: it cannot
  make wrong-arm data or a page/context swap fail compilation and moves trust to prose/schema strings.
- Only adding full rate posture is rejected: motion/perf/heap/request/core would remain string-only and
  every future consumer would add another bespoke parser.
- Dumping complete analyzer artifacts into `run.json` is rejected: the immutable artifact is already the
  lossless home; facts are bounded summaries and pointers.
- Treating `null` as aggregate is rejected: existing null means both aggregate and unknown/N/A, so the
  inference would fabricate provenance in immutable old evidence.
- Treating a one-page aggregate as exact is rejected: population cardinality does not change what the
  artifact intrinsically describes.
- Bumping the whole run-index to v2 is rejected for this uncommitted program; nested result/scope versions
  give explicit compatibility while preserving the already-tested v1 identity envelope.

## Prior lessons used

- The unified Snap memory note requires writer/index/reader truth, cold-agent legibility, explicit
  completeness and a planted positive for every clean zero.
- The request-result repair proved exact terminal pairs and structured evidence need separate typed
  handoffs; a transcript is not the source of truth merely because it prints last.
- The heap/session watchdog repair proved current run facts may disagree with a later outer exit unless
  ownership is explicit; typed core facts retain both without rewriting either.
