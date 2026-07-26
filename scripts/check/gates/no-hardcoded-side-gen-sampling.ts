import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

// The side-gen sampling ladder seal (side-gen-posture program): a side-generation call site MUST resolve its
// sampling posture through the ONE ladder (`@orb/kit/side-gen-posture` folding `SIDE_GEN_POSTURES` ← the
// caller's preset params ← a per-action override), NEVER a hardcoded constant. A buried `temperature: 0.3` /
// `maxTokens: 24` at a call site is exactly the rot this program burned down — the user's own generation
// params can never override a literal. The floor values live ONCE, as DATA, in the `SIDE_GEN_POSTURES` catalog
// (`@orb/contracts/preset`); server code reads them through the resolver.
//
// SCOPE: `packages/server/src/domain/**` + `packages/server/src/entry/**` — the side-gen CALL SITES. `infra/`
// is EXEMPT: it is the wire/backend translation + usage-accounting layer that legitimately names these fields
// (a backend maps `maxOutputTokens`→a wire key; the usage accumulator counts a `maxOutputTokens: 0` running
// total). Tests are exempt (they assert on literals by design).
//
// KEY-NAME scoped (the sampling vocabulary) so an unrelated numeric never trips: a `PropertyAssignment` whose
// name is a sampling knob AND whose initializer is a numeric literal (incl. a unary-minus number) is RED.

const SAMPLING_KEYS: ReadonlySet<string> = new Set(["temperature", "maxOutputTokens", "maxTokens", "topP"]);
const TEST_RE = /\.test\.tsx?$/u;

/** A numeric-literal initializer — a bare `0.3`/`24`, or a `-1`/`+2` unary-prefixed number. */
function isNumericLiteralInit(node: Node): boolean {
  if (Node.isNumericLiteral(node)) {
    return true;
  }
  if (Node.isPrefixUnaryExpression(node)) {
    return Node.isNumericLiteral(node.getOperand());
  }
  return false;
}

export const gate: GateDescriptor = {
  name: "no-hardcoded-side-gen-sampling",
  docRow: "Core-Enforcement-Active-Gates.md — side-gen sampling ladder seal",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "hardcoded side-gen sampling literal — a side-generation call must resolve its posture through the ladder (resolveSideGenSampling + SIDE_GEN_POSTURES from @orb/contracts/preset), never a buried constant (the user's preset params could never override it).",
  fix: "Read the floor from SIDE_GEN_POSTURES.<kind> and fold it through resolveSideGenSampling(floor, presetParams, actionSampling); map to the seam with toSummarizeOptions where the seam takes `maxTokens`.",
  scanRoot: (p) => {
    if (TEST_RE.test(`/${p}`)) {
      return false;
    }
    return p.startsWith("packages/server/src/domain/") || p.startsWith("packages/server/src/entry/");
  },
  kinds: [SyntaxKind.PropertyAssignment],
  visit: (node, _sf, ctx) => {
    if (!Node.isPropertyAssignment(node)) {
      return;
    }
    if (!SAMPLING_KEYS.has(node.getName())) {
      return;
    }
    const init = node.getInitializer();
    if (init !== undefined && isNumericLiteralInit(init)) {
      ctx.report(node, { token: node.getName(), offset: 0 });
    }
  },
  mustFlag: [
    {
      files: "export const opts = { temperature: 0.3, maxTokens: 24 };\n",
      at: "packages/server/src/domain/chat/verbs/thing.ts",
      why: "hardcoded temperature + maxTokens at a domain side-gen call site",
    },
    {
      files: "export const opts = { maxOutputTokens: 1024 };\n",
      at: "packages/server/src/entry/compose/thing.ts",
      why: "hardcoded maxOutputTokens at a compose side-gen seam",
    },
  ],
  mustPass: [
    {
      files: "import { SIDE_GEN_POSTURES } from '@orb/contracts/preset';\nexport const p = SIDE_GEN_POSTURES.arbiter;\n",
      at: "packages/server/src/domain/chat/verbs/thing.ts",
      why: "reads the catalog floor — no literal",
    },
    {
      files: "export const usageAcc = { maxOutputTokens: 0, tokensIn: 0 };\n",
      at: "packages/server/src/infra/providers/backends/agent-sdk/runner.ts",
      why: "infra usage-accounting / wire-translation layer is exempt (scope excludes infra/)",
    },
    {
      files: "export const opts = { temperature: 0.3 };\n",
      at: "tests/server/domain/chat/thing.test.ts",
      why: "test file asserting on a literal is exempt",
    },
    {
      files: "export const opts = { model: 'x', topK: 40 };\n",
      at: "packages/server/src/domain/chat/verbs/thing.ts",
      why: "topK is not in the ladder vocabulary — unrelated numeric, not flagged",
    },
  ],
};
