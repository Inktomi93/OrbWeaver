---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: verify
---

# Independent review of the zod-export-membership reader repair and factory ownership repairs

## What

A reviewer who did not write the repairs reads four things. First, the membership reader's property-access change in tooling/src/verify/gates/zod-export-membership.ts, which now resolves the concrete receiver value instead of following property symbols into unrelated schema declarations. Second, the factory ownership repairs to pluginCommandArgsSchema in packages/contracts/src/plugin/ui.ts, payloadSchemaFor with RefineryPayloadSchemaFor in packages/contracts/src/refinery/index.ts, and buildAnalysisPayloadSchema in packages/server/src/domain/automation/contract/analysis.ts. Third, the property-access counterexample controls. Fourth, the remaining schema-only grant list. Do this in the same review pass as the sibling rows finding:zod-authored-twin-exact-parity and finding:zod-twin-rationale-comment-drift, which wait on the same review.

## Why

The pass that wrote the reader fix and the factory repairs also judged the gate closed. For a structural gate that other lanes' edits keep tripping, a closure with no outside check is not proof that the reader is right or that the overload contracts tell the truth.

## Done when

A reviewer who did not write the repairs has checked the reader change, the factory repairs, the property-access controls and the schema-only grants. They then either confirm them or file a new finding for each defect. After that, program:zod-export-membership-current in world-tools-running-finding-ledger.json is resolved and cites that review, or it carries a new disposition that names the reviewer's findings.

## Evidence

Filled at landing: what ran and where its output is.
