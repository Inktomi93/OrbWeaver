# tooling-unwired

- Path: `tooling/src/unwired/`
- Band: M (8,747 code lines, 35 files — tokei)
- Status: in-progress
- Law above the axes: `docs/plans/unwired-code/design.md` (rank 7, active, updated 2026-11-06).
  It REJECTS a CI gate on scan output, a baseline of accepted findings, and uncited "looks
  deliberate" keeps — so no finding here may propose any of the three. Board items 2276–2281
  already own: committed-table location prose (2276), constant-built tuple elements (2277),
  per-home removed-key counting (2278), per-stage wall time (2279), logger-call reach (2280),
  PCRE chunking (2281) — not re-filed here.
- Design claims to truth: removed-keys "now fails a deletion branch when a removed contract key
  still has literal hits in the client, plugins or e2e"; two-engine field scan with engine one
  judging; port census follows member/lambda/spread/destructure but NOT a `let` hop (test-holding
  the limit: `tests/tooling/eslint-derived-port-member.test.ts`).

## Sweeps

- Hatch sweep (`any|eslint-disable|@ts-|TODO|FIXME`): all hits are the English word "any" in prose.
  Zero suppressions, zero TODOs. `catch`: exactly one match unit-wide and it is the zod API name
  (`fields.ts:128` `"catch"` in `ZOD_OPTIONAL`) — the 35-file unit has zero catch blocks; errors
  propagate (gitGrep throws with args + child error, `literal-hits.ts:30`, header claim true).
- Sideways/upward relative imports: zero. Legacy cites: zero. (First pass at the import sweep ate
  the `-rn` trap again — 7th occurrence, this one on this very unit: `rg -rn 'TEST_WORLDS'`
  printed replaced `n`s and nearly faked a finding; re-derived with long flags.)
- Weak asserts: one `length).toBeGreaterThan(0)` (`ruled-ops.test.ts:35`) — a census floor
  guarding the ADR-table parser against a vacuous `toEqual([])`; legitimate.
- D141 archaeology: ZERO dated files, ZERO issue-number cites — the first unit of the sweep with
  no archaeology at all.
- Design claims trued against code: removed-keys exits 1 on a live sender (`run.ts:165`,
  `removed-keys.ts:129`); the let-hop limit is held by a named case in
  `tests/tooling/eslint-derived-port-member.test.ts:246`; engine adjudication is conservative
  (engine-two use removes the finding and records a disagreement, `scan.ts:200-202`); test plan's
  false-positive controls are present in the fields/unions/shapes/flows/params int suites.
- Deliberate-keep discipline: `deliberate.ts` carries 7 entries, every one with a cited reason —
  the design's "no uncited keep" holds.
- Empirical probes: `pnpm unwired scan` → ARG ERROR (finding 2); bare invocation runs the member
  scan against `/tmp/opencode` and writes its report.
- Cluster/`areaOfCluster` colon assumption: safe — `cluster` is always `${area}:${concept}`
  (`port-targets.ts:166`).

## Findings

- \[P3] `tooling/src/unwired/worlds.ts:1-2,13` — the `TEST_WORLDS` header claims "the same set `scripts/typecheck.ts` checks" and that is false: typecheck also checks `tsconfig.tests-iso.json` (`scripts/typecheck.ts:23`), plus tooling/codemod worlds the tuple never carries. The omission looks like drift, not ruling — `brand-flow/scan.ts:35` explicitly appends `"tsconfig.tests-iso.json"` beside the same imported `TEST_WORLDS`, so the repo's other consumer treats iso as a world these scans need. No door couples the tuple to typecheck's set. The iso files (`tests/support/iso/**`) do enter the node world via `tests/**/*.ts`, so this costs scan fidelity under iso resolution, not correctness. Fix: either state why unwired skips iso (the node-world coverage argument above is undocumented) or add the world; either way fix the false "same set" sentence.
- \[P3] `tooling/src/unwired/run.ts:23,30,125-128` — the `scan` verb is half-adopted: it sits in `SCAN_VERBS`, in `SCANS`, and in the comment "scan, the bare verb, is the member scan," but `parseArgs` refuses the word — `pnpm unwired scan` dies with "scan: unknown argument" (probed live: ARG ERROR, exit 3), because `named` stays undefined and the leftover `"scan"` fails the flag regex. The usage line prints the other four verbs and silently omits it. Loud, not silent, but the natural invocation of the flagship member scan should work or the word should leave the vocabulary. Fix: accept `scan` (slice(1) when `first === "scan"`) or drop it from `SCAN_VERBS` and key `SCANS` by the bare-verb name.

## Verdict

reviewed (0 P2, 2 P3, zero fixed in-unit — log-only kept). The prediction this unit was walked
with — "unwired is either the honest graveyard or another dead-door crime scene" — is a miss, and
the miss is the finding that matters: this is the freshest-written module in the sweep (8.7K lines
with ZERO archaeology, zero dead cites, zero empty catches) and nearly every dense header claim
verified TRUE on first probe. That confirms the thesis's mechanism rather than denting it: rot is
a function of neglect, and this code is rank-7 active plan work whose prose its authors re-read
weekly. The two P3s are both fresh drift-by-one-step, not old rot: a world list claiming to equal
typecheck's set while typecheck grew an iso world (and brand-flow already compensates for it), and
a half-adopted verb word. It also ships the sweep's second generate-and-diff door over a human
ledger (`ruled-ops.test.ts` parses ADR 0337's table and diffs the rulings tuple) — the
enum-tuples habit spreading to the decision record itself, which is exactly the direction the
triage integrity item preaches.
