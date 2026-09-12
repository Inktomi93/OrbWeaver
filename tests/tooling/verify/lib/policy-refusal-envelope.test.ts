// The refusal envelope's own pins (#2111): the envelope is DERIVED from the same contract constants the runner and
// the dispatcher compose their refusals from, and these pins hold that two-sided — every member is text a real
// refusal carries (driven through `verifyPolicyProofs`), and the containment predicate refuses a generic needle
// while admitting an authored one. The per-member VALIDATOR arm lives in `policy-loader.test.ts`.
import { GATE_AUTHORITY_ALARM_KINDS, GATE_AUTHORITY_TOOL_ERROR_KINDS } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { POLICY_REFUSAL_PREFIXES } from "../../../../tooling/src/verify/contract/policy-conformance.ts";
import { GATE_FACT_PHASES, POLICY_PASS_REFUSALS, POLICY_PHASES } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { genericRefusalTextContaining, refusalEnvelope } from "../../../../tooling/src/verify/lib/policy-refusal-envelope.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function sourcePolicy(id: string, overrides: Partial<GatePolicy> = {}): GatePolicy {
  return defineGate({
    id,
    family: id,
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "syntax",
    execution: "selected-files",
    facts: [],
    resources: [],
    message: `${id} message`,
    create: (ctx) => ({
      visitFile: (sourceFile) => {
        if (sourceFile.getFullText().includes("planted")) {
          ctx.report.file(ctx.relativePath(sourceFile));
        }
      },
    }),
    mustFlag: [{ mode: "source", files: { "packages/client/src/proof.ts": "export const planted = true;\n" }, why: "the founding defect" }],
    mustPass: [{ mode: "source", files: { "packages/client/src/proof.ts": "export const clean = true;\n" }, why: "the nearest legal shape" }],
    ...overrides,
  } as GatePolicy);
}

test("the envelope carries every prefix, every phase and kind token, every dispatcher sentence, and nothing twice", () => {
  const envelope = refusalEnvelope();
  expect(new Set(envelope).size).toBe(envelope.length);
  for (const prefix of Object.values(POLICY_REFUSAL_PREFIXES)) {
    expect(envelope).toContain(prefix);
  }
  for (const sentence of Object.values(POLICY_PASS_REFUSALS)) {
    expect(envelope).toContain(sentence);
  }
  for (const phase of new Set([...POLICY_PHASES, ...GATE_FACT_PHASES])) {
    expect(envelope).toContain(`[${phase}]`);
    expect(envelope).toContain(`${POLICY_REFUSAL_PREFIXES.passToolError} [${phase}] `);
  }
  for (const kind of [...GATE_AUTHORITY_TOOL_ERROR_KINDS, ...GATE_AUTHORITY_ALARM_KINDS]) {
    expect(envelope).toContain(`[${kind}]`);
  }
  for (const spelling of ["OWNER not-applicable/complete", "OWNER failure/incomplete", "OWNER incomplete/incomplete"]) {
    expect(envelope).toContain(spelling);
  }
  expect(envelope).toContain(`${POLICY_PASS_REFUSALS.policyReceiptRefused}: population "`);
  expect(envelope).toContain(" is malformed: ");
});

test("containment, not equality: a needle inside any member is generic; authored text beside the generic words is not", () => {
  expect(genericRefusalTextContaining("ERROR")).toBe(POLICY_REFUSAL_PREFIXES.factToolError);
  expect(genericRefusalTextContaining("resolved zero members")).toBeDefined();
  expect(genericRefusalTextContaining("incomplete/incomplete: receipt:")).toBeDefined();
  expect(genericRefusalTextContaining("refused: population")).toBeDefined();
  expect(genericRefusalTextContaining("BLINDNESS")).toBeUndefined();
  expect(genericRefusalTextContaining('population "final policy modules" resolved zero members')).toBeUndefined();
  expect(genericRefusalTextContaining("OWNER incomplete/incomplete: evaluate: BLINDNESS")).toBeUndefined();
  // Case-sensitive, exactly as the runner's `includes` is: a lowercase spelling is not the wrapper's word.
  expect(genericRefusalTextContaining("pass tool error")).toBeUndefined();
});

test("every producible prefix is the text a REAL refusal starts with, driven through the conformance runner", () => {
  // The runner composes from the same constants, so this is the two-sided pin that the envelope's members are
  // emitted text and not a second spelling: each produced refusal's opening words are an envelope member.
  const thrown = sourcePolicy("hook-throw", {
    create: () => ({
      evaluate: () => {
        throw new Error("provider exploded");
      },
    }),
  });
  const badReceipt = sourcePolicy("bad-receipt", {
    create: (ctx) => ({ evaluate: () => ctx.receipt({ kind: "population", source: "subjects", members: 0 }) }),
  });
  const reviewed = sourcePolicy("bad-reviewed-finding", {
    authority: "reviewed-grant",
    create: (ctx) => ({ evaluate: () => ctx.report.file("packages/client/src/proof.ts") }),
  });
  const mismatch = sourcePolicy("population-mismatch", { population: "@server" });
  const details = new Map(
    verifyPolicyProofs([thrown, badReceipt, reviewed, mismatch]).map((failure) => [`${failure.policyId}:${failure.arm}`, failure.detail]),
  );
  const produced = [
    details.get("hook-throw:mustFlag"),
    details.get("bad-receipt:mustFlag"),
    details.get("bad-reviewed-finding:mustFlag"),
    details.get("population-mismatch:mustFlag"),
  ];
  expect(produced.every((detail) => detail !== undefined)).toBe(true);
  expect(produced[0]).toMatch(/^PASS TOOL ERROR \[evaluate\] provider exploded$/u);
  expect(produced[1]).toMatch(/^PASS TOOL ERROR \[receipt\] policy receipt refused: population "subjects" resolved zero members$/u);
  expect(produced[2]).toMatch(/^AUTHORITY TOOL ERROR \[invalid-reviewed-grant-identity\] /u);
  expect(produced[3]).toMatch(/^PASS TOOL ERROR \[population\] Invalid population resolution: expression admitted zero paths from 1 candidate\(s\)$/u);
  for (const detail of produced) {
    const generic = refusalEnvelope().filter((member) => detail?.startsWith(member));
    expect(generic.length).toBeGreaterThan(0);
  }
  // And the authored slot is what survives containment: the receipt SOURCE names the policy's own text.
  expect(genericRefusalTextContaining('population "subjects" resolved zero members')).toBeUndefined();
});
