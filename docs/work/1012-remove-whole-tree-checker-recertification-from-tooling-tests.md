---
kind: tooling
status: open
updated: 2026-10-13
priority: P1
area: tooling
plan: test-foundation
---

# Remove whole-tree checker recertification from tooling tests

## What

Remove live-tree gate reruns and repeated checker pipeline certification. Start with real-corpus liveness partitions, caught-failure census replay, spelling-twin census, dangling-reference repository replay and broad AST CLI scans. Preserve useful decision and lifecycle controls on bounded inputs.

Include static tooling-certification gates. Separate marker and proof-roster requirements from actual failure, process, import and verdict behavior. Move covered restrictions to maintained tools or canonical runtime contracts before deleting custom enforcement.

## Why

The foundation plan requires fast verdict and lifetime tests. Replaying the repository duplicates CI structure work and builds another expensive proof population.

## Done when

No targeted test reruns the live repository merely to certify its checker. Mixed suites retain discriminating local parser, refusal, scope and lifecycle cases. Remove obsolete runner, manifest, ledger and registration consumers coherently after checking their actual ownership. Record affected checks and measured historical costs; do not claim unmeasured savings or run whole-tree recertification.

## Evidence

The [weekly GitHub run](https://github.com/Inktomi93/OrbWeaver/actions/runs/38132978683) supplies completed reports on revision `e88487bf62cb7b8ef5275955f751539013e531c3`. These are historical suite durations, not current-tree benchmarks or predicted savings.

Real-corpus shards take 27m41s and 20m33s including job overhead. Their runners load the repository and repeat baseline and overlaid policy passes.

Completed non-corpus suite durations: dangling-reference repository replay 616.64s; broad AST CLI scans 566.88s; spelling-twin census 553.94s; caught-failure census replay 299.07s; policy-soundness family 140.96s. Mixed suites retain useful local controls; whole-file duration is not deletion savings.

Source inspection separates repeated live-tree runs from bounded parser, refusal, selection, cache and lifetime cases. Remove the obsolete liveness-manifest requirement with its runner; do not leave a gate requiring deleted certification. Product dangling-reference and failure-ownership rules are not deletion candidates merely because their repository tests are redundant. No tests or whole-tree checks ran during this inspection.

The instrument-proof gate treats named comments as proof presence; this does not inspect test assertions. Its verdict-door restriction is a separate claim. Proof expectations, refusal coverage, family readers, binding resolution and policy soundness require claim-by-claim adjudication, not automatic retention because they certify tools. Preserve genuine error and resource refusal semantics.
