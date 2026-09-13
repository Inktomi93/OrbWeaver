// ast's programmatic front door — what tests, the push-tier orphan ratchet and sibling tools import;
// the cli fronts this surface. One tool, one API (docs/architecture/core/Core-Tooling-Law.md §2.5). The pure
// collectors are exported so the ratchet judges the SAME candidate sets the verbs print (one
// definition of "orphan"/"swallowed"/…, never a parallel one).
export type {
  ApiClass,
  ApiSurfaceEntry,
  ChainAudit,
  ChainCandidate,
  ChainLink,
  ColumnAudit,
  ColumnCandidate,
  ContractField,
  DeadEvidence,
  DeadVerdict,
  FieldReadSites,
  Flags,
  Hit,
  Liveness,
  LivenessOptions,
  NearPairCandidate,
  OrphanCandidate,
  PublicMarker,
  StringyAudit,
  StringyCandidate,
  StringyLink,
  SubsetAudit,
  SubsetCallSite,
  SubsetDoorCensus,
  SubsetFinding,
  SubsetSiteScan,
  SubsetUnjudgedFire,
  SwallowedCandidate,
  TestOnlyClass,
  TypeOnlyCandidate,
  ViewFieldCandidate,
} from "./contract/types.ts";
export { collectColumnCandidates, rawSqlBlob, scanRowReads } from "./lib/column-reads.ts";
export { collectSchemaTables, isColumnExempt, scanColumnWrites } from "./lib/columns.ts";
export { loadProject, parseFlags } from "./lib/emit.ts";
export { addFileLocalParts, addRegistryValues, contractDeclarations, modelProjectedSchemas } from "./lib/field-seeds.ts";
export { contractFieldsOf, fieldClass, fieldHit, fieldIndexes, isCompositionAlias } from "./lib/fields.ts";
export { AstToolError, beginRun, CORPUS_DEPCRUISE, CORPUS_SYNTACTIC, CORPUS_TYPED, CORPUS_WIDE_SYNTACTIC, finishRun, noteToolError } from "./lib/ledger.ts";
export { buildLiveness } from "./lib/liveness.ts";
export { isPublicTagged, publicMarkerOf } from "./lib/public-markers.ts";
export { ownExports } from "./lib/scope.ts";
export { USAGE } from "./lib/usage.ts";
export { collectViewFieldCandidates, isViewServerOnly, viewFieldsOf, viewGapHit } from "./lib/view-fields.ts";
export { collectApiSurface } from "./ops/apisurface.ts";
export { collectChainAudit, collectChainCandidates } from "./ops/chains.ts";
export { deadEvidenceFor } from "./ops/dead.ts";
export { DEPCRUISE_VERBS, runDepcruise } from "./ops/depcruise.ts";
export { collectOrphanCandidates, isProdConsumed, testOnlyClassOf } from "./ops/orphans.ts";
export { scriptEntryPaths, toolingConfigNames } from "./ops/prodonly.ts";
export { collectRegistryCandidates } from "./ops/registry-candidates.ts";
export { collectRegistries, qualifiedAccessIndex, regKeyHitsFor, spellingIndex } from "./ops/regkeys.ts";
export { assignabilityChecker, isNearPairExempt, respellHitsFor, respellNearCandidatesFor } from "./ops/respell.ts";
export { rotChainHits, rotOrphanHits, rotSwallowedHits, rotTestOnlyHits, rotTypeOnlyHits } from "./ops/rot.ts";
export { collectStringyAudit } from "./ops/stringy.ts";
export { collectSubsetCallers, collectSubsetCallSites, crossClassNote, objectKeys, sameClassFirst } from "./ops/subset-callers.ts";
export { collectSwallowedCandidates, isSwallowedExempt } from "./ops/swallowed.ts";
export { collectTypeOnlyCandidates, isTypeOnlyExempt } from "./ops/typeonly.ts";
export { ARGLESS_VERBS, TYPED_VERBS, VERBS, WIDE_SYNTACTIC_VERBS } from "./ops/verbs.ts";
export { collectClientConsumed, collectServerProcedures, isUnwiredExempt } from "./ops/wiring.ts";
