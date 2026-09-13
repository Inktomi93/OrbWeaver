// THE REFUSAL ENVELOPE (#2111, #2109 item 3) — every piece of GENERIC text a conformance refusal carries, derived
// from the contract tuples the runner and the dispatcher compose their messages from, so a `mustRefuse` row whose
// `expect.messageIncludes` sits INSIDE that text can be refused at load.
//
// WHY. `ops/policy-conformance.ts#refusalFailure` proves a refusal row by `refusal.includes(messageIncludes)`, and
// every refusal is wrapped in the runner's own words: `PASS TOOL ERROR [evaluate] …`, `OWNER incomplete/incomplete:
// receipt: policy receipt refused: population "…" resolved zero members`. A row naming `"ERROR"`, `"OWNER"`,
// `"[evaluate]"` or `"resolved zero members"` therefore holds on EVERY refusal of that shape — a fixture that fails
// to parse, a population that admits nothing, a receipt of any policy going to zero — which is the dead-arm shape
// §4.5b built the arm to end. The envelope is the CLOSED set of those generic pieces; a needle contained in any
// member discriminates nothing and is refused. A needle that carries policy-AUTHORED text beside the generic words
// (`policy receipt refused: population "final policy modules" resolved zero members`, `BLINDNESS: …`) is contained in
// no member and is admitted — the generic pieces are its prefix or suffix, never its whole.
//
// DERIVED, NEVER RE-SPELLED. The prefixes are `contract/policy-conformance.ts#POLICY_REFUSAL_PREFIXES` (the runner
// composes from them); the dispatcher sentences are `contract/policy-pass.ts#POLICY_PASS_REFUSALS` (the emitters
// compose from them); the `[<phase>]` tokens come from `POLICY_PHASES`/`GATE_FACT_PHASES`, the `[<kind>]` tokens
// from the authority tool-error and alarm kind tuples, the `OWNER <status>/<population>` spellings from a mapped
// `Record` over the non-success completions and the resource-status spellings from a `Record` over the non-ready
// statuses — so a new phase, kind, status or sentence is one row in its own contract home and `tsc` names this
// module if the mapped record falls behind.
//
// COMPLETE OVER THE TABLE IS NOT COMPLETE OVER THE EMITTERS (#2155). This module derives from
// `POLICY_PASS_REFUSALS`, so a sentence the dispatcher spells by LITERAL instead of composing is invisible here
// and a `mustRefuse` row naming it reads as authored while holding on every refusal of that shape. Eleven such
// literals lived in `lib/policy-pass-context.ts`. What closes the loop is not this module but the census in
// `tests/tooling/verify/lib/policy-refusal-envelope.test.ts`: every `throw new Error(...)` in the dispatcher
// pair is a composed refusal or a declared invariant, two-sided, with a planted literal as the control.
//
// WHAT IT CANNOT SEE, stated: a policy's OWN throw text that happens to be generic in spirit ("something went
// wrong") is authored and is admitted — the shared-source verdict over a module's refusal sources is the static
// arm §2.3 of the audit records as deferred, and it is not this module's question.
import type { GateOwnerCompletion } from "../contract/gate-authority.ts";
import { GATE_AUTHORITY_ALARM_KINDS, GATE_AUTHORITY_TOOL_ERROR_KINDS } from "../contract/gate-authority.ts";
import { POLICY_REFUSAL_PREFIXES } from "../contract/policy-conformance.ts";
import { GATE_FACT_PHASES, POLICY_PASS_REFUSALS, POLICY_PHASES } from "../contract/policy-pass.ts";
import type { ResourceLoad } from "../contract/resource.ts";

type NonSuccessCompletion = Exclude<GateOwnerCompletion, { readonly status: "success" }>;
type NonReadyStatus = Exclude<ResourceLoad<never>["status"], "ready">;

/** The `OWNER <status>/<population>` spellings `toolFailure` prints — a mapped record over the non-success
 *  completion statuses, each with the population word the contract pairs it with. */
const OWNER_SPELLINGS = {
  "not-applicable": "complete",
  failure: "incomplete",
  incomplete: "incomplete",
} as const satisfies Record<NonSuccessCompletion["status"], NonSuccessCompletion["population"]>;

/** The non-ready resource statuses `resolveResourceDeclarations` names in ` is <status>: `. */
const RESOURCE_REFUSAL_STATUSES = { missing: true, empty: true, unresolved: true, malformed: true } as const satisfies Record<NonReadyStatus, true>;

const RECEIPT_KINDS = ["population", "resource"] as const;
const RECEIPT_LABELS = ["members", "resources"] as const;

function bracketed(tokens: readonly string[]): readonly string[] {
  return tokens.map((token) => `[${token}]`);
}

function buildEnvelope(): readonly string[] {
  const prefixes = Object.values(POLICY_REFUSAL_PREFIXES);
  const sentences = Object.values(POLICY_PASS_REFUSALS);
  const phases = [...new Set<string>([...POLICY_PHASES, ...GATE_FACT_PHASES])];
  const phaseTokens = [...bracketed(phases), ...phases.map((phase) => `:${phase}]`)];
  const kindTokens = bracketed([...GATE_AUTHORITY_TOOL_ERROR_KINDS, ...GATE_AUTHORITY_ALARM_KINDS]);
  const ownerSpellings = Object.entries(OWNER_SPELLINGS).map(([status, population]) => `${POLICY_REFUSAL_PREFIXES.owner} ${status}/${population}`);
  const composed: string[] = [
    ...phases.map((phase) => `${POLICY_REFUSAL_PREFIXES.passToolError} [${phase}] `),
    `${POLICY_REFUSAL_PREFIXES.factToolError} [`,
    ...[...GATE_AUTHORITY_TOOL_ERROR_KINDS].map((kind) => `${POLICY_REFUSAL_PREFIXES.authorityToolError} [${kind}] `),
    ...[...GATE_AUTHORITY_ALARM_KINDS].map((kind) => `${POLICY_REFUSAL_PREFIXES.authorityAlarm} [${kind}] `),
    ...ownerSpellings.map((spelling) => `${spelling}: `),
    ...phases.map((phase) => `${POLICY_REFUSAL_PREFIXES.owner} incomplete/${OWNER_SPELLINGS.incomplete}: ${phase}: `),
    `${POLICY_REFUSAL_PREFIXES.owner} not-applicable/${OWNER_SPELLINGS["not-applicable"]}: ${POLICY_PASS_REFUSALS.emptyIntersection}`,
    `${POLICY_REFUSAL_PREFIXES.owner} not-applicable/${OWNER_SPELLINGS["not-applicable"]}: ${POLICY_PASS_REFUSALS.entireDeferred}`,
    ...RECEIPT_KINDS.flatMap((kind) => [
      `${POLICY_PASS_REFUSALS.policyReceiptRefused}: ${kind} "`,
      `${POLICY_PASS_REFUSALS.factReceiptRefused}: ${kind} "`,
      `${kind} "`,
    ]),
    ...RECEIPT_LABELS.map((label) => `${POLICY_PASS_REFUSALS.receiptResolvedZero} ${label}`),
    ...RECEIPT_LABELS.map((label) => `" ${POLICY_PASS_REFUSALS.receiptResolvedZero} ${label}`),
    `" ${POLICY_PASS_REFUSALS.receiptLeftUnresolvedHead} `,
    ` ${POLICY_PASS_REFUSALS.receiptLeftUnresolvedTail}`,
    ...Object.keys(RESOURCE_REFUSAL_STATUSES).map((status) => ` is ${status}: `),
    `${POLICY_PASS_REFUSALS.resourceDeclaration} `,
    `${POLICY_PASS_REFUSALS.populationAdmittedZero} `,
  ];
  return Object.freeze([...new Set([...prefixes, ...sentences, ...phaseTokens, ...kindTokens, ...ownerSpellings, ...composed])]);
}

const ENVELOPE = buildEnvelope();

/** Every generic refusal text the runner or the dispatcher can emit, for the pins that hold this module two-sided. */
export function refusalEnvelope(): readonly string[] {
  return ENVELOPE;
}

/** The envelope member that CONTAINS `needle`, or undefined when the needle carries text no generic refusal
 *  carries whole. Containment, not equality: `"ERROR"` sits inside `"PASS TOOL ERROR"`, `"incomplete: evaluate:"`
 *  inside `"OWNER incomplete/incomplete: evaluate: "`, and each holds on every refusal of that shape. */
export function genericRefusalTextContaining(needle: string): string | undefined {
  return ENVELOPE.find((generic) => generic.includes(needle));
}
