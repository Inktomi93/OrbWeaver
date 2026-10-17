// Authority harnesses own this bounded premise rather than depending on an application policy's lifetime.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { SyntaxKind } from "ts-morph";
import type { GatePolicyProof } from "../../../../tooling/src/verify/contract/policy.ts";

export const ORDINARY_POLICY = "planted-ordinary";
export const ORDINARY_SUBJECT = "packages/client/src/lib/probe.ts";
export const ORDINARY_MARKER = "PLANTED_ORDINARY_SUBJECT";
export const ORDINARY_LINE = `export const marker = "${ORDINARY_MARKER}";\n`;
export const ORDINARY_COLUMN = ORDINARY_LINE.indexOf(ORDINARY_MARKER) + 1;
export const ORDINARY_MESSAGE = "planted ordinary finding";
export const ORDINARY_MUST_FLAG: readonly GatePolicyProof[] = [
  { mode: "source", files: { [ORDINARY_SUBJECT]: ORDINARY_LINE }, expect: { count: 1, token: ORDINARY_MARKER }, why: "the owned ordinary marker" },
];
export const ORDINARY_MUST_PASS: readonly GatePolicyProof[] = [
  { mode: "source", files: { [ORDINARY_SUBJECT]: "export const clean = true;\n" }, why: "the nearest source without the marker" },
];

export function ordinaryPolicyModule(repoRoot: string): string {
  const contract = pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href;
  return `import { defineGate } from ${JSON.stringify(contract)};
export const gate = defineGate({
  id: ${JSON.stringify(ORDINARY_POLICY)},
  family: ${JSON.stringify(ORDINARY_POLICY)},
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: ${JSON.stringify(ORDINARY_MESSAGE)},
  fix: "Remove the marker or waive with @orb-waive ${ORDINARY_POLICY}(position): reason",
  create: (ctx) => ({ visitors: [{
    kinds: [${String(SyntaxKind.StringLiteral)}],
    visit: (node) => {
      const literal = node.asKindOrThrow(${String(SyntaxKind.StringLiteral)});
      if (literal.getLiteralText() === ${JSON.stringify(ORDINARY_MARKER)}) {
        ctx.report.node(literal, { token: ${JSON.stringify(ORDINARY_MARKER)}, offset: 1 });
      }
    },
  }] }),
  mustFlag: ${JSON.stringify(ORDINARY_MUST_FLAG)},
  mustPass: ${JSON.stringify(ORDINARY_MUST_PASS)},
});
`;
}
