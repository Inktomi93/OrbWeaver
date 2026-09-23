---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: verify
---

# Get an independent review of the Zod output-twin parity gate and the product changes it required

## What

A reviewer who did not write the change reviews the zod-output-twin-parity gate and the product code it changed. The files are: the runtime-generated schema brand in packages/kit/src/json-schema/lift.ts and the pass-through in packages/kit/src/json-schema/index.ts; the capability schema map in packages/contracts/src/inference/capability/capability.ts; REFINERY_STAGE_PAYLOADS in packages/contracts/src/refinery/index.ts; the extraction schema map in packages/contracts/src/rpg/extraction.ts; and the brand recognition and pairing logic in tooling/src/verify/lib/zod-output-twin.ts and tooling/src/verify/gates/zod-output-twin-parity.ts. The review checks two things. First, the gate accepts a runtime-generated schema only through the real branded type from lift.ts, and rejects a same-named copy, a bare member and an erased output. Second, none of the product changes altered what a schema accepts or what its inferred output type is. The review covers the current intersected brand shape, not the earlier shape the closure evidence describes.

## Why

The gate, the shared reader and every product change were written and proven by one author, with no second reader. A brand check that a lookalike type can pass would let an authored type drift from its schema while the gate still reports green. A product change that widened or narrowed a schema would change behaviour at a trust boundary without anyone seeing it.

## Done when

The reviewer runs pnpm check:structure and the zod-output-twin-parity stage reports no findings, no unresolved members and no tool error. The reviewer runs pnpm test:scoped on tests/tooling/verify/gates/zod-output-twin-parity.suite.test.ts, tests/tooling/verify/lib/zod-output-twin.test.ts, tests/kit/json-schema/lift.test.ts and tests/kit/json-schema/index.test.ts, and all pass. The reviewer adds a scratch type that copies the brand's name without importing it from lift.ts, runs the gate, sees it reported as a finding, and removes the scratch type. The reviewer records in this item's evidence which files were read and whether any schema's accepted input or inferred output changed. Any defect found is either fixed or filed as its own work item.

## Evidence

Filled at landing: what ran and where its output is.
