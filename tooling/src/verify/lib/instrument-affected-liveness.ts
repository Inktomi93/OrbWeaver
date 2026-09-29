// The affected-run policy-roster codec. This is deliberately a one-way narrowing protocol: absence means
// FULL, while malformed or empty payloads refuse instead of turning a broken launcher into a clean zero.
// The suite filters its already-authored arm roster by these IDs; an ID that has no arm is valid because
// not every final gate declares a real-corpus arm.
import type { InstrumentAffectedArm } from "../contract/instrument-affected.ts";
import { INSTRUMENT_AFFECTED_POLICIES_ENV } from "../contract/instrument-affected.ts";

function isPolicyIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((id: unknown) => typeof id === "string" && id.length > 0);
}

export function encodeInstrumentAffectedPolicyIds(policyIds: readonly string[]): string {
  if (policyIds.length === 0 || policyIds.some((id) => id.length === 0)) {
    throw new Error("instrument-affected policy scope must name at least one non-empty policy ID");
  }
  return JSON.stringify([...new Set(policyIds)].toSorted());
}

/** Absent means the suite was not launched by the affected stage and must run its complete roster. */
export function decodeInstrumentAffectedPolicyIds(value: string | undefined): ReadonlySet<string> | undefined {
  if (value === undefined) {
    return;
  }
  const parsed: unknown = JSON.parse(value);
  if (!isPolicyIdList(parsed)) {
    throw new Error(`${INSTRUMENT_AFFECTED_POLICIES_ENV} must be a non-empty JSON array of policy IDs`);
  }
  return new Set(parsed);
}

export function selectInstrumentAffectedArms<T extends InstrumentAffectedArm>(arms: readonly T[], policyIds: ReadonlySet<string> | undefined): readonly T[] {
  return policyIds === undefined ? arms : arms.filter((arm) => policyIds.has(arm.policy.id));
}

/** Full runs include every runner control; narrowed runs include a control when one of the policies it
 * specifically exercises is affected. Shared runner changes never reach this function narrowed because
 * the stage classifies their source paths as full-roster infrastructure. */
export function instrumentAffectedIncludes(policyIds: ReadonlySet<string> | undefined, controlPolicyIds: readonly string[]): boolean {
  return policyIds === undefined || controlPolicyIds.some((id) => policyIds.has(id));
}

export function selectedInstrumentAffectedPolicyIds(policyIds: ReadonlySet<string> | undefined, candidates: readonly string[]): readonly string[] {
  return policyIds === undefined ? candidates : candidates.filter((id) => policyIds.has(id));
}

/** A coupled control may need a companion policy in the opened runner. Expand only the group containing an
 * affected policy; unrelated groups stay absent. Full runs remain represented by undefined. */
export function includeInstrumentAffectedControlPolicies(
  policyIds: ReadonlySet<string> | undefined,
  controlGroups: readonly (readonly string[])[],
): ReadonlySet<string> | undefined {
  if (policyIds === undefined) {
    return;
  }
  const expanded = new Set(policyIds);
  for (const group of controlGroups) {
    if (group.some((id) => policyIds.has(id))) {
      for (const id of group) {
        expanded.add(id);
      }
    }
  }
  return expanded;
}
