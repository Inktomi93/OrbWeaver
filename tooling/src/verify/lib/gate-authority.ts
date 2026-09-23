/** Central gate authority coordinator. Detectors never select their own severity or exception door. */

import type {
  AuthorityConsumption,
  CoordinatedGateFinding,
  GateAuthorityAlarm,
  GateAuthorityBatchInput,
  GateAuthorityBatchResult,
  GateAuthorityToolError,
  GateOwnerCompletion,
  GateOwnerCoverage,
  GateOwnerResult,
  GrantedGateFinding,
  RawGateFinding,
  SelectedGatePolicy,
  UnjudgedReviewedGrant,
  WaivedGateFinding,
} from "../contract/gate-authority.ts";
import { GATE_OWNER_COVERAGES } from "../contract/gate-authority.ts";
import type { ValidatedReviewedGrants } from "./gate-authority-validation.ts";
import { isGateAuthority, isGateAuthorityIdentity, isGateSeverity, reviewedGrantIdentity, validateReviewedGrants } from "./gate-authority-validation.ts";
import { createOrdinaryWaiverEngine } from "./ordinary-waiver.ts";

function findingOrder(left: CoordinatedGateFinding, right: CoordinatedGateFinding): number {
  return (
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.column - right.column ||
    (left.token ?? "").localeCompare(right.token ?? "") ||
    (left.message ?? "").localeCompare(right.message ?? "") ||
    left.policyId.localeCompare(right.policyId)
  );
}
function alarmOrder(left: GateAuthorityAlarm, right: GateAuthorityAlarm): number {
  const leftId = left.kind === "ordinary-waiver" ? (left.waiverId ?? "") : left.grantId;
  const rightId = right.kind === "ordinary-waiver" ? (right.waiverId ?? "") : right.grantId;
  return left.policyId.localeCompare(right.policyId) || left.kind.localeCompare(right.kind) || leftId.localeCompare(rightId);
}
function toolErrorOrder(left: GateAuthorityToolError, right: GateAuthorityToolError): number {
  return (
    (left.policyId ?? "").localeCompare(right.policyId ?? "") ||
    (left.findingIndex ?? -1) - (right.findingIndex ?? -1) ||
    left.kind.localeCompare(right.kind) ||
    (left.grantId ?? "").localeCompare(right.grantId ?? "")
  );
}
function toConsumption(counts: ReadonlyMap<string, number>): readonly AuthorityConsumption[] {
  return [...counts].map(([id, count]) => ({ id, count })).toSorted((left, right) => left.id.localeCompare(right.id));
}
function policyTable(policies: readonly SelectedGatePolicy[], errors: GateAuthorityToolError[]): Map<string, SelectedGatePolicy> {
  const counts = Map.groupBy(policies, ({ id }) => id);
  const table = new Map<string, SelectedGatePolicy>();
  for (const [id, candidates] of [...counts].toSorted(([left], [right]) => left.localeCompare(right))) {
    if (!isGateAuthorityIdentity(id) || candidates.some(({ authority, severity }) => !(isGateAuthority(authority) && isGateSeverity(severity)))) {
      errors.push({ kind: "invalid-policy", policyId: id, message: `selected policy has an invalid identity, authority, or severity: ${id}` });
      continue;
    }
    if (candidates.length !== 1) {
      errors.push({ kind: "duplicate-policy", policyId: id, message: `selected policy must be unique: ${id}` });
      continue;
    }
    const policy = candidates[0];
    if (policy !== undefined) {
      table.set(id, policy);
    }
  }
  return table;
}

function selectedPolicyTable(
  selectedPolicies: readonly SelectedGatePolicy[],
  knownPolicies: ReadonlyMap<string, SelectedGatePolicy>,
  errors: GateAuthorityToolError[],
): ReadonlyMap<string, SelectedGatePolicy> {
  const selected = policyTable(selectedPolicies, errors);
  for (const [id, policy] of selected) {
    const known = knownPolicies.get(id);
    if (known === undefined || known.authority !== policy.authority || known.severity !== policy.severity) {
      errors.push({ kind: "invalid-policy", policyId: id, message: `selected policy disagrees with the known policy roster: ${id}` });
      selected.delete(id);
    }
  }
  return selected;
}
interface RuntimeOwnerCompletion {
  readonly status?: unknown;
  readonly population?: unknown;
  readonly reason?: unknown;
}
function isValidCompletion(owner: GateOwnerCompletion): boolean {
  const candidate: RuntimeOwnerCompletion = owner;
  if (candidate.status === "success") {
    return candidate.population === "complete";
  }
  if (candidate.status === "not-applicable") {
    return candidate.population === "complete" && isGateAuthorityIdentity(candidate.reason);
  }
  return (
    (candidate.status === "failure" || candidate.status === "incomplete") && candidate.population === "incomplete" && isGateAuthorityIdentity(candidate.reason)
  );
}
function coordinatedFinding(policy: SelectedGatePolicy, finding: RawGateFinding): CoordinatedGateFinding {
  const { file, line, column, token, message, fix, subject, operation } = finding;
  return {
    file,
    line,
    column,
    ...(token === undefined ? {} : { token }),
    ...(message === undefined ? {} : { message }),
    ...(fix === undefined ? {} : { fix }),
    ...(subject === undefined ? {} : { subject }),
    ...(operation === undefined ? {} : { operation }),
    policyId: policy.id,
    severity: policy.severity,
  };
}

interface FindingValidationInput {
  readonly policy: SelectedGatePolicy;
  readonly finding: RawGateFinding;
  readonly findingIndex: number;
  readonly population: ReadonlySet<string>;
  readonly errors: GateAuthorityToolError[];
}
function validateFinding({ policy, finding, findingIndex, population, errors }: FindingValidationInput): boolean {
  let valid = true;
  if (Object.hasOwn(finding, "policyId") || Object.hasOwn(finding, "severity") || Object.hasOwn(finding, "authority")) {
    errors.push({
      kind: "finding-spoofed-policy",
      policyId: policy.id,
      findingIndex,
      message: `raw finding attempted to supply policy metadata for ${policy.id}`,
    });
    valid = false;
  }
  if (!isGateAuthorityIdentity(finding.file)) {
    errors.push({ kind: "invalid-finding", policyId: policy.id, findingIndex, message: `finding has a blank file identity for ${policy.id}` });
    valid = false;
  }
  if (!(Number.isInteger(finding.line) && finding.line >= 1 && Number.isInteger(finding.column) && finding.column >= 1)) {
    errors.push({
      kind: "invalid-finding-coordinate",
      policyId: policy.id,
      findingIndex,
      message: `finding has invalid coordinates for ${policy.id}: ${finding.line}:${finding.column}`,
    });
    valid = false;
  }
  if (isGateAuthorityIdentity(finding.file) && !population.has(finding.file)) {
    errors.push({
      kind: "finding-outside-population",
      policyId: policy.id,
      findingIndex,
      message: `finding falls outside ${policy.id}'s declared population: ${finding.file}`,
    });
    valid = false;
  }
  if (policy.authority === "reviewed-grant" && !(isGateAuthorityIdentity(finding.subject) && isGateAuthorityIdentity(finding.operation))) {
    errors.push({
      kind: "invalid-reviewed-grant-identity",
      policyId: policy.id,
      findingIndex,
      message: `reviewed-grant finding requires nonempty subject and operation: ${policy.id}`,
    });
    valid = false;
  }
  return valid;
}
function validateResult(policy: SelectedGatePolicy, result: GateOwnerResult, errors: GateAuthorityToolError[]): readonly CoordinatedGateFinding[] | null {
  if (!(isGateAuthorityIdentity(result.policyId) && isValidCompletion(result.owner) && (GATE_OWNER_COVERAGES as readonly string[]).includes(result.coverage))) {
    errors.push({ kind: "invalid-owner-result", policyId: policy.id, message: `owner result is malformed for ${policy.id}` });
    return null;
  }
  const population = new Set(result.populationFiles);
  if (population.size !== result.populationFiles.length || result.populationFiles.some((file) => !isGateAuthorityIdentity(file))) {
    errors.push({ kind: "invalid-population", policyId: policy.id, message: `owner population is malformed for ${policy.id}` });
    return null;
  }
  if (result.owner.status === "success" && population.size === 0) {
    errors.push({ kind: "invalid-population", policyId: policy.id, message: `successful owner declared an empty population for ${policy.id}` });
    return null;
  }
  if (result.owner.status === "not-applicable" && result.findings.length > 0) {
    errors.push({ kind: "not-applicable-with-findings", policyId: policy.id, message: `not-applicable owner returned findings for ${policy.id}` });
  }
  const coordinated = result.findings.map((candidate) => coordinatedFinding(policy, candidate));
  let findingsValid = true;
  for (const [index, candidate] of result.findings.entries()) {
    if (!validateFinding({ policy, finding: candidate, findingIndex: index, population, errors })) {
      findingsValid = false;
    }
  }
  if (result.owner.status === "failure") {
    errors.push({ kind: "owner-failure", policyId: policy.id, message: `owner failed for ${policy.id}: ${result.owner.reason}` });
  } else if (result.owner.status === "incomplete") {
    errors.push({ kind: "owner-incomplete", policyId: policy.id, message: `owner was incomplete for ${policy.id}: ${result.owner.reason}` });
  }
  return findingsValid && result.owner.status === "success" ? coordinated.toSorted(findingOrder) : null;
}
function selectedResults(
  policies: ReadonlyMap<string, SelectedGatePolicy>,
  ownerResults: readonly GateOwnerResult[],
  errors: GateAuthorityToolError[],
  withheld: Set<string>,
): ReadonlyMap<string, GateOwnerResult> {
  const grouped = Map.groupBy(ownerResults, ({ policyId }) => policyId);
  const selected = new Map<string, GateOwnerResult>();
  for (const [policyId] of [...policies].toSorted(([left], [right]) => left.localeCompare(right))) {
    const candidates = grouped.get(policyId) ?? [];
    if (candidates.length === 0) {
      errors.push({ kind: "missing-owner-result", policyId, message: `selected policy has no owner result: ${policyId}` });
      withheld.add(policyId);
    } else if (candidates.length > 1) {
      errors.push({ kind: "duplicate-owner-result", policyId, message: `selected policy has multiple owner results: ${policyId}` });
      withheld.add(policyId);
    } else {
      const candidate = candidates[0];
      if (candidate !== undefined) {
        selected.set(policyId, candidate);
      }
    }
  }
  for (const [policyId] of [...grouped].toSorted(([left], [right]) => left.localeCompare(right))) {
    if (!policies.has(policyId)) {
      errors.push({ kind: "unselected-owner-result", policyId, message: `owner result was returned for an unselected policy: ${policyId}` });
    }
  }
  return selected;
}
interface CoordinationState {
  readonly input: GateAuthorityBatchInput;
  readonly knownPolicies: ReadonlyMap<string, SelectedGatePolicy>;
  readonly results: ReadonlyMap<string, GateOwnerResult>;
  readonly grants: ValidatedReviewedGrants;
  readonly effectiveFindings: CoordinatedGateFinding[];
  readonly waivedFindings: WaivedGateFinding[];
  readonly grantedFindings: GrantedGateFinding[];
  readonly ordinaryFindings: CoordinatedGateFinding[];
  readonly ordinaryCounts: Map<string, number>;
  readonly grantCounts: Map<string, number>;
  readonly completedOrdinary: Set<string>;
  readonly completedReviewed: Set<string>;
  readonly subsetReviewed: Set<string>;
  readonly toolErrors: GateAuthorityToolError[];
  readonly withheld: Set<string>;
}
const COVERAGE_JUDGES_STALE: Readonly<Record<GateOwnerCoverage, boolean>> = { whole: true, subset: false };

function processReviewed(policy: SelectedGatePolicy, result: GateOwnerResult, findings: readonly CoordinatedGateFinding[], state: CoordinationState): void {
  state.completedReviewed.add(policy.id);
  if (!COVERAGE_JUDGES_STALE[result.coverage]) {
    state.subsetReviewed.add(policy.id);
  }
  const candidatesByGrant = new Map<string, { readonly grant: ValidatedReviewedGrants["grants"][number]; readonly findings: CoordinatedGateFinding[] }>();
  for (const finding of findings) {
    const grant = state.grants.byIdentity.get(
      reviewedGrantIdentity({ policyId: policy.id, subject: finding.subject ?? "", operation: finding.operation ?? "" }),
    );
    if (grant === undefined) {
      state.effectiveFindings.push(finding);
    } else {
      const candidates = candidatesByGrant.get(grant.id) ?? { grant, findings: [] };
      candidates.findings.push(finding);
      candidatesByGrant.set(grant.id, candidates);
    }
  }
  for (const { grant, findings: candidates } of candidatesByGrant.values()) {
    state.grantCounts.set(grant.id, candidates.length);
    const [candidate] = candidates;
    if (candidates.length === 1 && candidate !== undefined) {
      state.grantedFindings.push({ finding: candidate, grantId: grant.id });
    } else {
      state.effectiveFindings.push(...candidates);
    }
  }
}
function processPolicy(policy: SelectedGatePolicy, state: CoordinationState): void {
  const result = state.results.get(policy.id);
  if (result === undefined) {
    return;
  }
  const findings = validateResult(policy, result, state.toolErrors);
  if (findings === null || state.grants.invalidPolicyIds.has(policy.id)) {
    state.withheld.add(policy.id);
    return;
  }
  const wrongGrantAuthority = state.grants.wrongAuthorityPolicyIds.has(policy.id);
  if (wrongGrantAuthority) {
    state.withheld.add(policy.id);
  }
  if (policy.authority === "hard") {
    state.effectiveFindings.push(...findings);
    return;
  }
  if (policy.authority === "ordinary") {
    state.ordinaryFindings.push(...findings);
    if (!wrongGrantAuthority) {
      state.completedOrdinary.add(policy.id);
    } else {
      state.withheld.add(policy.id);
    }
    return;
  }

  processReviewed(policy, result, findings, state);
}
function processOrdinary(state: CoordinationState): ReturnType<ReturnType<typeof createOrdinaryWaiverEngine>["reconcile"]> {
  const engine = createOrdinaryWaiverEngine({ sources: state.input.ordinaryWaiverSources, knownPolicies: [...state.knownPolicies.values()] });
  const findings = state.ordinaryFindings.toSorted(findingOrder);
  const matched = engine.match(findings);
  for (const [index, finding] of findings.entries()) {
    const waiverId = matched.waiverIds[index] ?? null;
    if (waiverId === null) {
      state.effectiveFindings.push(finding);
    } else {
      state.waivedFindings.push({ finding, waiverId });
    }
  }
  for (const [id, count] of matched.consumption) {
    state.ordinaryCounts.set(id, count);
  }
  return engine.reconcile({ completedPolicyIds: [...state.completedOrdinary].toSorted(), match: matched });
}

interface GrantReconciliation {
  readonly alarms: readonly GateAuthorityAlarm[];
  readonly unjudged: readonly UnjudgedReviewedGrant[];
}

// Over-broad is judged on any complete owner: two matches inside a subset are two matches on the whole tree.
// Stale is judged only on whole coverage; a subset owner names its unconsumed grants unjudged instead.
function reconcileAuthority(state: CoordinationState, ordinaryAlarms: readonly GateAuthorityAlarm[]): GrantReconciliation {
  const alarms: GateAuthorityAlarm[] = [];
  const unjudged: UnjudgedReviewedGrant[] = [];
  alarms.push(...ordinaryAlarms);
  for (const grant of state.grants.grants) {
    const count = state.grantCounts.get(grant.id) ?? 0;
    if (state.completedReviewed.has(grant.policyId) && count === 0 && state.subsetReviewed.has(grant.policyId)) {
      unjudged.push({ policyId: grant.policyId, grantId: grant.id });
    } else if (state.completedReviewed.has(grant.policyId) && count === 0) {
      alarms.push({
        kind: "stale-reviewed-grant",
        policyId: grant.policyId,
        grantId: grant.id,
        subject: grant.subject,
        operation: grant.operation,
        message: `reviewed grant was unused after a complete owner run: ${grant.id}`,
      });
    } else if (state.completedReviewed.has(grant.policyId) && count > 1) {
      alarms.push({
        kind: "over-broad-reviewed-grant",
        policyId: grant.policyId,
        grantId: grant.id,
        subject: grant.subject,
        operation: grant.operation,
        count,
        message: `reviewed grant matched ${count} findings after a complete owner run: ${grant.id}`,
      });
    }
  }
  return {
    alarms: alarms.toSorted(alarmOrder),
    unjudged: unjudged.toSorted((left, right) => left.policyId.localeCompare(right.policyId) || left.grantId.localeCompare(right.grantId)),
  };
}

export function coordinateGateAuthority(input: GateAuthorityBatchInput): GateAuthorityBatchResult {
  const toolErrors: GateAuthorityToolError[] = [];
  const withheld = new Set<string>();
  const knownPolicies = policyTable(input.knownPolicies, toolErrors);
  const policies = selectedPolicyTable(input.selectedPolicies, knownPolicies, toolErrors);
  for (const { id } of input.selectedPolicies) {
    if (!policies.has(id)) {
      withheld.add(id);
    }
  }
  const grants = validateReviewedGrants(input.reviewedGrants, knownPolicies);
  toolErrors.push(...grants.errors);
  const results = selectedResults(policies, input.ownerResults, toolErrors, withheld);
  const effectiveFindings: CoordinatedGateFinding[] = [];
  const waivedFindings: WaivedGateFinding[] = [];
  const grantedFindings: GrantedGateFinding[] = [];
  const ordinaryFindings: CoordinatedGateFinding[] = [];
  const ordinaryCounts = new Map<string, number>();
  const grantCounts = new Map(grants.grants.map(({ id }) => [id, 0]));
  const completedOrdinary = new Set<string>();
  const completedReviewed = new Set<string>();
  const subsetReviewed = new Set<string>();
  const state: CoordinationState = {
    input,
    knownPolicies,
    results,
    grants,
    effectiveFindings,
    waivedFindings,
    grantedFindings,
    ordinaryFindings,
    ordinaryCounts,
    grantCounts,
    completedOrdinary,
    completedReviewed,
    subsetReviewed,
    toolErrors,
    withheld,
  };
  for (const [, policy] of [...policies].toSorted(([left], [right]) => left.localeCompare(right))) {
    processPolicy(policy, state);
  }
  const ordinaryAlarms = processOrdinary(state);

  const sortedEffective = effectiveFindings.toSorted(findingOrder);
  const errors = sortedEffective.filter(({ severity }) => severity === "error").length;
  const warnings = sortedEffective.length - errors;
  const { alarms: authorityAlarms, unjudged: unjudgedReviewedGrants } = reconcileAuthority(state, ordinaryAlarms);
  const alarmErrors = authorityAlarms.length;
  return {
    effectiveFindings: sortedEffective,
    waivedFindings: waivedFindings.toSorted((left, right) => findingOrder(left.finding, right.finding) || left.waiverId.localeCompare(right.waiverId)),
    grantedFindings: grantedFindings.toSorted((left, right) => findingOrder(left.finding, right.finding) || left.grantId.localeCompare(right.grantId)),
    authorityAlarms,
    unjudgedReviewedGrants,
    toolErrors: toolErrors.toSorted(toolErrorOrder),
    withheldPolicyIds: [...withheld].filter(isGateAuthorityIdentity).toSorted(),
    ordinaryConsumption: toConsumption(ordinaryCounts),
    reviewedGrantConsumption: toConsumption(grantCounts),
    verdict: {
      errors: errors + alarmErrors,
      warnings,
      blocking: errors + alarmErrors + (input.failOnWarnings ? warnings : 0),
      failOnWarnings: input.failOnWarnings,
    },
  };
}
