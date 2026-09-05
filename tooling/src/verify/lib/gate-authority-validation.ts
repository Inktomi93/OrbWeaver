/** Runtime validation for the authority coordinator's policy and reviewed-grant boundaries. */

import type { GateAuthority, GateAuthorityToolError, GateSeverity, ReviewedGateGrant, SelectedGatePolicy } from "../contract/gate-authority.ts";

export function isGateAuthorityIdentity(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }
  const c0End = 0x1f;
  const deleteControl = 0x7f;
  return [...value].every((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && codePoint > c0End && codePoint !== deleteControl;
  });
}

export function isGateAuthority(value: unknown): value is GateAuthority {
  return value === "hard" || value === "ordinary" || value === "reviewed-grant";
}

export function isGateSeverity(value: unknown): value is GateSeverity {
  return value === "error" || value === "warning";
}

export function reviewedGrantIdentity(grant: Pick<ReviewedGateGrant, "policyId" | "subject" | "operation">): string {
  return JSON.stringify([grant.policyId, grant.subject, grant.operation]);
}

interface GrantValidationPart {
  readonly errors: GateAuthorityToolError[];
  readonly invalidIds: Set<string>;
  readonly invalidPolicyIds: Set<string>;
}

interface GrantRowValidation extends GrantValidationPart {
  readonly valid: ReviewedGateGrant[];
  readonly wrongAuthorityPolicyIds: Set<string>;
}

function validateGrantRows(reviewedGrants: readonly ReviewedGateGrant[], policies: ReadonlyMap<string, SelectedGatePolicy>): GrantRowValidation {
  const valid: ReviewedGateGrant[] = [];
  const errors: GateAuthorityToolError[] = [];
  const invalidIds = new Set<string>();
  const wrongAuthorityPolicyIds = new Set<string>();
  for (const grant of reviewedGrants) {
    if (![grant.id, grant.policyId, grant.subject, grant.operation, grant.why, grant.endsWhen].every(isGateAuthorityIdentity)) {
      errors.push({
        kind: "invalid-grant",
        grantId: grant.id,
        policyId: grant.policyId,
        message: `reviewed grant has a blank or control-bearing identity or rationale: ${grant.id}`,
      });
      continue;
    }
    const policy = policies.get(grant.policyId);
    if (policy === undefined) {
      invalidIds.add(grant.id);
      errors.push({
        kind: "invalid-grant",
        grantId: grant.id,
        policyId: grant.policyId,
        message: `reviewed grant targets an unknown policy: ${grant.policyId}`,
      });
      continue;
    }
    valid.push(grant);
    if (policy.authority !== "reviewed-grant") {
      invalidIds.add(grant.id);
      wrongAuthorityPolicyIds.add(grant.policyId);
      errors.push({
        kind: "invalid-grant-authority",
        grantId: grant.id,
        policyId: grant.policyId,
        message: `reviewed grant targets selected ${policy.authority} policy: ${grant.policyId}`,
      });
    }
  }
  return { valid, errors, invalidIds, invalidPolicyIds: new Set<string>(), wrongAuthorityPolicyIds };
}

function duplicateGrantIds(valid: readonly ReviewedGateGrant[]): GrantValidationPart {
  const errors: GateAuthorityToolError[] = [];
  const invalidIds = new Set<string>();
  const invalidPolicyIds = new Set<string>();
  for (const [id, candidates] of [...Map.groupBy(valid, ({ id: grantId }) => grantId)].toSorted(([left], [right]) => left.localeCompare(right))) {
    if (candidates.length > 1) {
      invalidIds.add(id);
      for (const { policyId } of candidates) {
        invalidPolicyIds.add(policyId);
      }
      errors.push({ kind: "duplicate-grant-id", grantId: id, message: `reviewed grant id must be unique: ${id}` });
    }
  }
  return { errors, invalidIds, invalidPolicyIds };
}

interface DuplicateGrantIdentities extends GrantValidationPart {
  readonly invalidIdentities: Set<string>;
}

function duplicateGrantIdentities(valid: readonly ReviewedGateGrant[]): DuplicateGrantIdentities {
  const errors: GateAuthorityToolError[] = [];
  const invalidIds = new Set<string>();
  const invalidPolicyIds = new Set<string>();
  const invalidIdentities = new Set<string>();
  for (const [identity, candidates] of [...Map.groupBy(valid, reviewedGrantIdentity)].toSorted(([left], [right]) => left.localeCompare(right))) {
    if (candidates.length > 1) {
      invalidIdentities.add(identity);
      for (const candidate of candidates) {
        invalidIds.add(candidate.id);
        invalidPolicyIds.add(candidate.policyId);
      }
      const candidate = candidates[0];
      errors.push({
        kind: "duplicate-grant-identity",
        ...(candidate === undefined ? {} : { grantId: candidate.id, policyId: candidate.policyId }),
        message: `reviewed grant policy/subject/operation identity must be unique: ${identity}`,
      });
    }
  }
  return { errors, invalidIds, invalidPolicyIds, invalidIdentities };
}

export interface ValidatedReviewedGrants {
  readonly grants: readonly ReviewedGateGrant[];
  readonly byIdentity: ReadonlyMap<string, ReviewedGateGrant>;
  readonly invalidPolicyIds: ReadonlySet<string>;
  readonly wrongAuthorityPolicyIds: ReadonlySet<string>;
  readonly errors: readonly GateAuthorityToolError[];
}

export function validateReviewedGrants(
  reviewedGrants: readonly ReviewedGateGrant[],
  policies: ReadonlyMap<string, SelectedGatePolicy>,
): ValidatedReviewedGrants {
  const rows = validateGrantRows(reviewedGrants, policies);
  const ids = duplicateGrantIds(rows.valid);
  const identities = duplicateGrantIdentities(rows.valid);
  const invalidIds = rows.invalidIds.union(ids.invalidIds).union(identities.invalidIds);
  const grants = rows.valid.filter((grant) => !(invalidIds.has(grant.id) || identities.invalidIdentities.has(reviewedGrantIdentity(grant))));
  return {
    grants,
    byIdentity: new Map(grants.map((grant) => [reviewedGrantIdentity(grant), grant])),
    invalidPolicyIds: ids.invalidPolicyIds.union(identities.invalidPolicyIds),
    wrongAuthorityPolicyIds: rows.wrongAuthorityPolicyIds,
    errors: [...rows.errors, ...ids.errors, ...identities.errors],
  };
}
