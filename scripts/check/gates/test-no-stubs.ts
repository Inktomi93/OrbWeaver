// Gate: test-no-stubs (anti-gaming for test-presence)
// A test block must contain at least one assertion (expect or expectTypeOf).
// Empty tests or tests with no assertions are banned to prevent gaming the presence rules.
import type { CallExpression } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const TEST_CALL_NAMES = new Set(["test", "it", "test.skip", "it.skip"]);

function callHasAssertion(call: CallExpression): boolean {
  return call.getDescendantsOfKind(SyntaxKind.CallExpression).some((c) => {
    // Collapse whitespace: a formatter-broken chain (`expect\n  .poll(...)`) must still read as `expect.poll`.
    const innerExprText = c.getExpression().getText().replaceAll(/\s+/gu, "");
    return (
      innerExprText === "expect" ||
      innerExprText === "expectTypeOf" ||
      innerExprText.startsWith("expect.")
    );
  });
}

const STUB_MESSAGE =
  "stub test contains no assertions (expect/expectTypeOf) — tests must assert behavior, not just satisfy presence rules (Spine-Testing.md §5).";

export const gate: GateDescriptor = {
  name: "test-no-stubs",
  docRow: "Spine-Testing.md §5",
  status: "active",
  scopeSafety: "incremental-safe",
  message: STUB_MESSAGE,
  fix: "add at least one expect()/expectTypeOf() assertion to the test body (or delete the stub).",
  scanRoot: (p) => p.includes("tests/"),
  kinds: [SyntaxKind.CallExpression],
  visit: (node, _sf, ctx) => {
    if (!node.isKind(SyntaxKind.CallExpression)) {
      return;
    }
    if (!TEST_CALL_NAMES.has(node.getExpression().getText()) || callHasAssertion(node)) {
      return;
    }
    const arg0 = node.getArguments()[0];
    const name = arg0?.getKind() === SyntaxKind.StringLiteral ? arg0.getText() : "unnamed test";
    ctx.report(node, { token: `stub ${name}`, offset: 0 });
  },
  mustFlag: [
    {
      files: 'test("does nothing", () => {\n  const x = 1;\n});\n',
      at: "tests/tooling/x.test.ts",
      why: "a test with no expect/expectTypeOf — a stub that games the presence rules (§5)",
    },
  ],
  mustPass: [
    {
      files: 'test("asserts", () => {\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/y.test.ts",
      why: "a test with a real expect() assertion — asserts behavior, passes",
    },
  ],
};
