// Gate: test-mock-doctrine — vi.mock is banned for internal modules; legitimate only for an
// unavoidable third-party node edge. Fakes should be injected at the composition root.
import type { CallExpression } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

/** Is this `vi.mock(...)` call on an internal (relative / packages/ / @orb/) target? The node overload
 *  carries the report — this predicate only needs a boolean, never a Finding-shaped record. */
function isInternalMockCall(call: CallExpression): boolean {
  const expr = call.getExpression();
  if (expr.getKind() !== SyntaxKind.PropertyAccessExpression || expr.getText() !== "vi.mock") {
    return false;
  }
  const arg0 = call.getArguments()[0];
  if (arg0?.getKind() !== SyntaxKind.StringLiteral) {
    return false;
  }
  const mockTarget = arg0.getText().replace(/['"]/gu, "");
  return mockTarget.startsWith(".") || mockTarget.startsWith("packages/") || mockTarget.startsWith("@orb/");
}

const MOCK_MESSAGE = "vi.mock on an internal module — fake at the edges, inject at the composition root (core/Spine-Testing.md §3).";

export const gate: GateDescriptor = {
  name: "test-mock-doctrine",
  docRow: "core/Spine-Testing.md §3",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MOCK_MESSAGE,
  fix: "inject the fake at the composition root; vi.mock is legal only for an unavoidable third-party node edge.",
  scanRoot: (p) => p.includes("tests/"),
  kinds: [SyntaxKind.CallExpression],
  visit: (node, _sf, ctx) => {
    if (!node.isKind(SyntaxKind.CallExpression)) {
      return;
    }
    if (isInternalMockCall(node)) {
      ctx.report(node, { token: "vi.mock(internal)", offset: 0 });
    }
  },
  mustFlag: [
    {
      files: 'vi.mock("../../packages/server/x.ts");\n',
      at: "tests/tooling/x.test.ts",
      why: "vi.mock on an internal (relative) module — the ban §3 enforces",
    },
    {
      files: 'vi.mock("packages/server/src/foo");\n',
      at: "tests/tooling/pkg.test.ts",
      why: "vi.mock on a raw packages/ internal target — banned",
    },
    {
      files: 'vi.mock("@orb/server/domain/chat");\n',
      at: "tests/tooling/alias.test.ts",
      why: "vi.mock on the @orb/ workspace alias — the closed blind spot (every internal import uses it)",
    },
  ],
  mustPass: [
    {
      files: 'vi.mock("node:fs");\n',
      at: "tests/tooling/y.test.ts",
      why: "vi.mock on a third-party node edge (node:fs) — the one legitimate use, passes",
    },
    {
      files: 'vi.mock("better-sqlite3");\n',
      at: "tests/tooling/bare.test.ts",
      why: "vi.mock on a third-party bare-name package — a legal node edge, passes",
    },
  ],
};
