// Gate: test-mock-doctrine (core/Spine-Testing.md §3)
// vi.mock is effectively banned for internal modules; its only legitimate use is an unavoidable third-party node edge.
// Fakes should be injected at the composition root.
import type { CallExpression } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

function checkMockCall(call: CallExpression, filePath: string): Violation | null {
  const expr = call.getExpression();
  if (expr.getKind() !== SyntaxKind.PropertyAccessExpression || expr.getText() !== "vi.mock") {
    return null;
  }
  const arg0 = call.getArguments()[0];
  if (arg0?.getKind() !== SyntaxKind.StringLiteral) {
    return null;
  }
  const mockTarget = arg0.getText().replace(/['"]/gu, "");
  // Internal targets: a relative path, a raw `packages/…` path, OR the `@orb/*` workspace alias — the last
  // is how EVERY internal cross-package import is actually written, so omitting it left the gate blind to
  // `vi.mock("@orb/server/…")` (the whole point of the ban). Third-party node edges (bare names, `node:`)
  // stay legal.
  if (
    !(
      mockTarget.startsWith(".") ||
      mockTarget.startsWith("packages/") ||
      mockTarget.startsWith("@orb/")
    )
  ) {
    return null;
  }
  return {
    file: filePath,
    line: call.getStartLineNumber(),
    message: `vi.mock on internal module '${mockTarget}'. Fake at the edges, inject at the root (core/Spine-Testing.md §3).`,
  };
}

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (b)) ──────────────────────────────────────────────
// The legacy predicate as a CallExpression subscription: a `vi.mock("<internal>")` call (relative /
// packages/ / @orb/ target) in a /tests/ file. scanRoot mirrors the legacy `/tests/` filter. The message
// names the mock target (varies), so each finding carries a per-occurrence override. The node-anchored
// finding lands on the vi.mock call. Per-occurrence.
const MOCK_MESSAGE =
  "vi.mock on an internal module — fake at the edges, inject at the composition root (core/Spine-Testing.md §3).";

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
    const v = checkMockCall(node, "");
    if (v !== null) {
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
