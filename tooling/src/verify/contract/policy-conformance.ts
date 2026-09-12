// Stable failures emitted while proving final policy descriptors against their own examples — and the
// runner's own REFUSAL ENVELOPE, homed here so the validator can police a `mustRefuse` row against the exact
// text the runner wraps every refusal in (#2111, #2109 item 3).
//
// WHY THE ENVELOPE IS DATA. `ops/policy-conformance.ts#toolFailure` labels every non-success outcome with a
// fixed prefix (`PASS TOOL ERROR [<phase>] …`, `OWNER <status>/<population>: …`, …). A `mustRefuse` row proves
// its refusal by `refusal.includes(expect.messageIncludes)`, so a row whose substring lives INSIDE that wrapper
// (`"ERROR"`, `"OWNER"`, `"[evaluate]"`) holds on ANY refusal — a fixture that fails to parse, a population that
// admits nothing — which is the dead-arm shape the arm exists to end. The validator refuses such a substring at
// LOAD (`lib/policy-validation.ts`, through `lib/policy-refusal-envelope.ts`), and it can only do so honestly if
// it reads the SAME spelling the runner emits: one home, two consumers, `tsc` finds both.
import type { PolicyProofArm } from "./policy.ts";

export type { PolicyProofArm } from "./policy.ts";

export interface PolicyConformanceFailure {
  readonly policyId: string;
  readonly arm: PolicyProofArm;
  readonly exampleIndex: number;
  readonly why: string;
  readonly detail: string;
}

/** The fixed words the conformance runner puts in FRONT of a refusal — the generic half of every refusal
 *  text, which no `mustRefuse` row may name as its whole discriminator. The `[<phase>]` / `[<kind>]` tokens
 *  and the `OWNER <status>/<population>` spellings the runner composes beside these are derived from their own
 *  tuples in `lib/policy-refusal-envelope.ts`. */
export const POLICY_REFUSAL_PREFIXES = Object.freeze({
  factToolError: "FACT TOOL ERROR",
  passToolError: "PASS TOOL ERROR",
  authorityToolError: "AUTHORITY TOOL ERROR",
  authorityAlarm: "AUTHORITY ALARM",
  ownerMissing: "OWNER RESULT missing",
  owner: "OWNER",
  ownerWithheld: "OWNER complete result was withheld by authority coordination",
  findingOutsideExample: "FINDING OUTSIDE EXAMPLE",
  passThrew: "PASS THREW",
});
