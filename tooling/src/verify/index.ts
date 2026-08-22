// verify's programmatic front door — the ONE surface the tooling suites import (five-slot template:
// tests import index.ts, cli.ts consumes it). The three systems it fronts: the GATE HARNESS (descriptor
// contract → loader → single-pass dispatcher → renderer → conformance), the STAGE REGISTRY (`pnpm verify`'s
// tiers/scoping/exit classification), and the standalone reconciliation stages (type/execution membership,
// the db baseline, the orphan-export ratchet).

export type {
  BaseUiBinding,
  Disposition,
  ExportKind,
  InstalledComponent,
  InstalledPart,
  InstalledSurface,
  ManifestComponent,
  ManifestPart,
  RenderSite,
  SurfaceManifest,
} from "./contract/baseui.ts";
export type {
  ExemptionRow,
  ExemptionTable,
  Finding,
  GateDescriptor,
  GateExample,
  GateRunCtx,
  GateScanDeclaration,
  GateStatus,
  Scope,
  ScopeSafety,
} from "./contract/gate.ts";
export type { Check, CheckContext, GateResult, Violation } from "./contract/harness.ts";
export type { DeclaredScan, GateIgnoreMarker, GatePassResult, GateScan, PassResult, ToolError } from "./contract/pass.ts";
export type { ConformanceFailure, SchemaBaselineComparison, ScopedResult } from "./contract/scoped.ts";
export type { CtView, Selection, SelectionRequest } from "./contract/selection.ts";
export type { ScopedArgv, StageDef, StageGroup, StageMode, StageResult, Tier, VerifyReport } from "./contract/stage.ts";

export { readStringValue, unwrapExpression } from "./lib/ast-read.ts";
export { signatureArity } from "./lib/baseui-expand.ts";
export {
  BASE_UI_MANIFEST_REL,
  BASE_UI_MODULE_PREFIX,
  BASE_UI_PKG_REL,
  baseUiBindings,
  blindParts,
  readInstalledSurface,
  readManifest,
  renderedPartsByComponent,
  renderedTagNames,
  resetBaseUiSurfaceCache,
  truncatedParts,
  UI_SRC,
} from "./lib/baseui-read.ts";
export { aggregateExit, asViolations, eslintScheme, ownScheme } from "./lib/exit-classifiers.ts";
export { findGateIgnoreMarkers, parseGateIgnoreMarker } from "./lib/gate-ignore.ts";
export { getProject } from "./lib/harness.ts";
export { loadGates } from "./lib/loader.ts";
export { canonicalSort, fileLoaded, projectCtx, repoRel, runPass, stripProbeFindings, zeroScanGates } from "./lib/pass.ts";
export { programsFor, staticPrograms } from "./lib/program-routing.ts";
export { manualStages, REGISTRY, stagesForTier } from "./lib/registry.ts";
export { renderPass } from "./lib/render.ts";
export type { Parsed } from "./lib/run-argv.ts";
export { parse } from "./lib/run-argv.ts";
export { failReason } from "./lib/run-render.ts";
export { resolveSelection } from "./lib/selection.ts";

export { verifyGateProofs } from "./ops/conformance.ts";
export { compareSchemaBaseline, runDbBaselineParity } from "./ops/db-baseline-parity.ts";
export { generateBaseuiSurface } from "./ops/gen/baseui-surface.ts";
export { generateDensityBaseline } from "./ops/gen/density.ts";
export { generateDuplicateActionDoorsBaseline } from "./ops/gen/duplicate-action-doors.ts";
export { generateFabricationBaseline } from "./ops/gen/fabrication.ts";
export { generateFindingOverloadProvenanceBaseline } from "./ops/gen/finding-overload-provenance.ts";
export { generateModelProseBaseline } from "./ops/gen/model-prose.ts";
export { generateProseBaseline } from "./ops/gen/prose.ts";
export { generateSuppressionsBaseline } from "./ops/gen/suppressions.ts";
export { generateTestBaselineManifest } from "./ops/gen/test-baseline-manifest.ts";
export { runNewGate } from "./ops/new-gate.ts";
export { runOrphanRatchet } from "./ops/orphan-export-ratchet.ts";
export { runVerify } from "./ops/run.ts";
export { runScopedCli, runScopedPass } from "./ops/scoped.ts";
export { runShow } from "./ops/show.ts";
export { runStructure } from "./ops/structure.ts";
export { findUnrunFiles, runTestsExecutionMembership } from "./ops/tests-execution-membership.ts";
export { findEscapees, runTestsTypeMembership } from "./ops/tests-type-membership.ts";
