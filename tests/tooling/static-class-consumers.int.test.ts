import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { vi } from "vitest";
import { defineFact } from "../../tooling/src/verify/contract/fact.ts";
import { defineGate } from "../../tooling/src/verify/contract/policy.ts";
import { gate as lengthTokens } from "../../tooling/src/verify/gates/css-length-tokens.ts";
import { gate as lengthTokenGrants } from "../../tooling/src/verify/gates/css-length-tokens-grants.ts";
import { gate as lengthTokenHealth } from "../../tooling/src/verify/gates/css-length-tokens-health.ts";
import { gate as variableResolution } from "../../tooling/src/verify/gates/css-var-defined.ts";
import { gate as variableResolutionGrants } from "../../tooling/src/verify/gates/css-var-defined-grants.ts";
import { gate as variableResolutionHealth } from "../../tooling/src/verify/gates/css-var-defined-health.ts";
import { gate as polarity } from "../../tooling/src/verify/gates/no-tailwind-dark-variant.ts";
import { verifyPolicyProofs } from "../../tooling/src/verify/ops/policy-conformance.ts";

/** Three gate proofs over the real tree: measured 5.3s on a loaded box (2026-09-01 barrier), over vitest's 5s default. */
const PROOF_BUDGET_MS = 30_000;

// `css-family-ownership` and `css-selector-has-a-writer` LEFT this suite on 2026-09-13 (#2181, #2182): both
// converted and SPLIT by authority into five final policies under the `css-hook-provenance` family, whose
// declared rows the conformance stage runs and whose arms a row cannot express live in
// tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts. The two remaining consumers now also use
// final policies; this suite keeps the shared static-class proof entry point without calling the retired
// legacy verifier on final descriptors.
test(
  "no-tailwind-dark-variant retains every planted control under the final policy runtime",
  () => {
    expect(verifyPolicyProofs([polarity])).toEqual([]);
  },
  PROOF_BUDGET_MS,
);

test(
  "shared static class consumers retain every planted control",
  () => {
    expect(
      verifyPolicyProofs([variableResolution, variableResolutionGrants, variableResolutionHealth, lengthTokens, lengthTokenGrants, lengthTokenHealth]),
    ).toEqual([]);
  },
  PROOF_BUDGET_MS,
);

test("source proofs do not acquire a CSS native owner from a lookalike provider id", () => {
  const enumerate = Project.prototype.getSourceFiles;
  let reads = 0;
  const count = vi.spyOn(Project.prototype, "getSourceFiles").mockImplementation(function (this: Project) {
    reads += 1;
    return enumerate.bind(this)();
  });
  const measure = (id: string): number => {
    const provider = defineFact({
      id,
      population: "@frontend",
      analysis: "syntax",
      resources: [],
      create: (context) => ({
        finish: (): boolean => {
          context.receipt({ kind: "population", source: id, members: context.files.length });
          return true;
        },
      }),
    });
    const policy = defineGate({
      id: "css-source-proof-boundary",
      family: "css-source-proof-boundary",
      authority: "hard",
      severity: "error",
      population: "@frontend",
      analysis: "syntax",
      execution: "entire-population",
      facts: [provider],
      resources: [],
      message: "source proof boundary",
      create: (ctx) => ({
        evaluate: (): void => {
          ctx.fact(provider);
          const bad = ctx.files[0]?.getVariableDeclaration("bad");
          if (bad !== undefined) {
            ctx.report.node(bad);
          }
          ctx.receipt({ kind: "population", source: "css-source-proof-boundary", members: 1 });
        },
      }),
      mustFlag: [
        {
          mode: "source",
          files: { "packages/client/src/x.ts": "const bad=1;" },
          expect: { count: 1 },
          why: "the actual syntax assertion runs in both admission measurements",
        },
      ],
      mustPass: [
        { mode: "source", files: { "packages/client/src/x.ts": "const good=1;" }, why: "the actual syntax assertion runs in both admission measurements" },
      ],
    });
    const before = reads;
    expect(verifyPolicyProofs([policy])).toEqual([]);
    return reads - before;
  };
  try {
    const ordinary = measure("not-a-css-provider");
    const lookalike = measure("static-class");
    expect(ordinary).toBeGreaterThan(0);
    expect(lookalike).toBe(ordinary);
  } finally {
    count.mockRestore();
  }
});
