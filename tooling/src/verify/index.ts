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
export type { CaughtFailurePopulation, CaughtFailureRow, CaughtFailureTotals, CaughtFailureVerdict } from "./contract/caught-failure.ts";
export { CAUGHT_FAILURE_VERDICTS } from "./contract/caught-failure.ts";
export type { GateFact, GateFactContext, GateFactHooks, GateFactValue } from "./contract/fact.ts";
export { defineFact } from "./contract/fact.ts";
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
export type { GateContractCode, GateContractFinding, GateContractReport } from "./contract/gate-contract.ts";
export { GATE_CONTRACT_CODES } from "./contract/gate-contract.ts";
export type { Check, CheckContext, GateResult, Violation } from "./contract/harness.ts";
export type { RunHistoryEntry, RunHistoryStage, SlowdownAdvisory } from "./contract/history.ts";
export type { HostSlotHolder, HostSlotLease, HostSlotPool } from "./contract/host-slots.ts";
export type { DeclaredScan, GateIgnoreMarker, GatePassResult, GateScan, PassResult, ToolError } from "./contract/pass.ts";
export type { GatePolicy, GatePolicyContext, GatePolicyHooks, GatePolicyProof } from "./contract/policy.ts";
export { defineGate, GATE_POLICY_EXECUTIONS, GATE_POLICY_PROOF_MODES } from "./contract/policy.ts";
export type {
  GateFactOwnerResult,
  GateFactPhase,
  GateFactToolError,
  PolicyOwnerPlan,
  PolicyOwnerPlanMode,
  PolicyOwnerResult,
  PolicyPassInput,
  PolicyPassResult,
  PolicyPopulationReceipt,
} from "./contract/policy-pass.ts";
export { GATE_FACT_PHASES, POLICY_OWNER_PLAN_MODES } from "./contract/policy-pass.ts";
export type {
  PlannedPolicy,
  PolicyCommandParseResult,
  PolicyCommandPlan,
  PolicyCommandRequest,
  PolicyInspectionPlan,
  PolicyPlanExecutionInput,
  PolicyPlanExecutionResult,
  PolicyPlannerCorpus,
  PolicyPlannerInput,
  PolicyPlanningResult,
  PolicyRosterEntry,
  PolicyRunPlan,
  PolicyRunTier,
  PolicySelector,
} from "./contract/policy-plan.ts";
export { POLICY_RUN_TIERS } from "./contract/policy-plan.ts";
export type { GatePolicyReceipt } from "./contract/policy-primitives.ts";
export { GATE_POLICY_ANALYSES } from "./contract/policy-primitives.ts";
export type { CompilerProgram, PolicyScopeRequest, PolicyScopeResolution, PolicySemanticPath } from "./contract/policy-scope.ts";
export { POLICY_SCOPE_KINDS, POLICY_SEMANTIC_PATH_STATUSES } from "./contract/policy-scope.ts";
export type { GateResourceRequest } from "./contract/resource-declaration.ts";
export { GATE_RESOURCE_REQUEST_KINDS } from "./contract/resource-declaration.ts";
export type { RunManifest } from "./contract/run-manifest.ts";
export type {
  AssetRefsCoverage,
  AssetRefsRegistryRow,
  BootChunkVerdict,
  ConformanceFailure,
  LedgerFreshness,
  SchemaBaselineComparison,
  ScopedResult,
} from "./contract/scoped.ts";
export type { ScopedTestCollection, ScopedTestRunner } from "./contract/scoped-test.ts";
export { SCOPED_TEST_RUNNERS } from "./contract/scoped-test.ts";
export type { CtView, Selection, SelectionRequest } from "./contract/selection.ts";
export type { ScopedArgv, StageDef, StageGroup, StageMode, StageResult, Tier, TranscriptAudit, VerifyReport } from "./contract/stage.ts";
export type { TestBaselineDeletion, TestBaselineManifest } from "./contract/test-baseline.ts";
export { TEST_BASELINE_REL } from "./contract/test-baseline.ts";
export type { MembershipOutcome, MembershipReport, MembershipRow } from "./contract/tests-type-membership.ts";
export { MEMBERSHIP_OUTCOMES } from "./contract/tests-type-membership.ts";
export type { VerifyVerb } from "./contract/verbs.ts";
export { VERIFY_VERBS } from "./contract/verbs.ts";
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
export { auditBiomeTranscript, biomeStageAudit, controlProbeCount, parseCheckedFileCount } from "./lib/biome-verdict.ts";
export { aggregateExit, asViolations, eslintScheme, ownScheme } from "./lib/exit-classifiers.ts";
export { inspectGateContract } from "./lib/gate-contract.ts";
export { findGateIgnoreMarkers, parseGateIgnoreMarker } from "./lib/gate-ignore.ts";
export { getProject } from "./lib/harness.ts";
export { appendHistory, currentSha, previousAtTier, readHistory, slowdownLines, slowdowns } from "./lib/history.ts";
export type { ContractBannedShape, SchemaBannedShape } from "./lib/ledger-banned-shapes.ts";
export { bannedMessage, CONTRACT_BANNED_SHAPES, contractBanHome, SCHEMA_BANNED_SHAPES } from "./lib/ledger-banned-shapes.ts";
export type { GateCorpus } from "./lib/loader.ts";
export { loadGateCorpus, loadGates } from "./lib/loader.ts";
export { canonicalSort, fileLoaded, projectCtx, repoRel, runPass, stripProbeFindings, zeroScanGates } from "./lib/pass.ts";
export { parsePolicyCommand } from "./lib/policy-command.ts";
export type { GatePolicyCorpus } from "./lib/policy-loader.ts";
export { loadPolicies, loadPolicyCorpus } from "./lib/policy-loader.ts";
export { runPolicyPass } from "./lib/policy-pass.ts";
export { executePolicyPlan, planPolicyArgv, planPolicyCommand, policyPassExitCode } from "./lib/policy-plan.ts";
export { readCompilerPrograms } from "./lib/policy-program-membership.ts";
export { resolvePolicyScope } from "./lib/policy-scope.ts";
export { isPolicySourceCandidate, policySourceCandidates } from "./lib/policy-source-candidate.ts";
export { programsFor, staticPrograms, touchesTestsDom } from "./lib/program-routing.ts";
export { manualStages, REGISTRY, stagesForTier } from "./lib/registry.ts";
export { renderPass } from "./lib/render.ts";
export { canonicalResourceDeclarations, resolvePolicyResourcePaths, resolveResourceDeclarations, resourceRequestIdentity } from "./lib/resource-declaration.ts";
export { REVIEWED_GRANTS, reviewedGrantsFor } from "./lib/reviewed-grants.ts";
export type { Parsed } from "./lib/run-argv.ts";
export { parse } from "./lib/run-argv.ts";
export { failReason, printSummary } from "./lib/run-render.ts";
export { resolveSelection } from "./lib/selection.ts";
export { refuseVerbTail } from "./lib/verb-tail.ts";

export type { AssetRefsCoverageInput } from "./ops/asset-refs-coverage.ts";
export { AssetRefsCoverageRefusal, compareAssetRefsCoverage, runAssetRefsCoverage } from "./ops/asset-refs-coverage.ts";
export { BASELINE_HELP, runBaseline } from "./ops/baseline.ts";
export { BOOT_CHUNK_CEILING_BYTES, measureBootChunk, runBootChunkRatchet } from "./ops/boot-chunk-ratchet.ts";
export { verifyGateProofs } from "./ops/conformance.ts";
export { compareSchemaBaseline, runDbBaselineParity } from "./ops/db-baseline-parity.ts";
export type { Ledger } from "./ops/debt.ts";
export { LEDGERS, readLedgerRows, reconcileLedgers, runDebtWalk } from "./ops/debt.ts";
export { runGateContract } from "./ops/gate-contract.ts";
export { generateBaseuiSurface } from "./ops/gen/baseui-surface.ts";
export { deriveCaughtFailurePopulation, generateCaughtFailurePopulation, POPULATION_REL } from "./ops/gen/caught-failure-population.ts";
export { generateDensityBaseline } from "./ops/gen/density.ts";
export { generateDuplicateActionDoorsBaseline } from "./ops/gen/duplicate-action-doors.ts";
export { generateOverArtPlateBaseline } from "./ops/gen/over-art-plate-arm.ts";
export { generateProseBaseline } from "./ops/gen/prose.ts";
export { deriveSnapFlagsIndexMarkdown, generateSnapFlagsIndex, SNAP_FLAGS_INDEX_REL } from "./ops/gen/snap-flags-index.ts";
export { generateSuppressionsBaseline } from "./ops/gen/suppressions.ts";
export { deriveTestBaselineManifest, generateTestBaselineManifest } from "./ops/gen/test-baseline-manifest.ts";
export { generateTestPresenceBaseline } from "./ops/gen/test-presence.ts";
export { generateUiVariantAxesStampedBaseline } from "./ops/gen/ui-variant-axes-stamped.ts";
export { censusDrift, LEDGER_CHECKS, ledgerFreshness, ledgerReport, manifestDrift, runLedgersFresh, snapFlagsIndexDrift } from "./ops/ledgers-fresh.ts";
export { runNewGate } from "./ops/new-gate.ts";
export { runOrphanRatchet } from "./ops/orphan-export-ratchet.ts";
export type { RatchetClassification, RatchetExclusion } from "./ops/ratchet-gate.ts";
export { classifyRatchetFiles, discoverTestFiles, isRatchetShaped, runRatchetGateCli } from "./ops/ratchet-gate.ts";
export { auditedExit, auditLine, auditOf, noticesIn, runVerify } from "./ops/run.ts";
export { runScopedCli, runScopedPass, SCOPED_USAGE } from "./ops/scoped.ts";
export { runScopedTest, SCOPED_TEST_USAGE } from "./ops/scoped-test.ts";
export { runShow, SHOW_HELP } from "./ops/show.ts";
export { runStructure } from "./ops/structure.ts";
export { findMultiMembershipFiles, findUnrunFiles, runTestsExecutionMembership, unclassifiedVitestProjects } from "./ops/tests-execution-membership.ts";
export { classifyMembership, findEscapees, findTripleSlashLibLeaks, runTestsTypeMembership } from "./ops/tests-type-membership.ts";
