import { Node, SyntaxKind } from "ts-morph";
import { readStringValue } from "../ast-read.ts";
import type { GateDescriptor } from "../contract.ts";

const SCOPE = /\/packages\/client\/src\//u;

/** Does this `data-testid` initializer carry a FREEFORM string value — a bare `="foo"` StringLiteral, or a
 *  braced `={"foo"}` / `={"foo" as string}` / `={\`foo\`}` literal — as opposed to the typed
 *  `={testId("key")}` call (a non-literal expression, undefined) which is the sanctioned shape. */
function freeformTestidValue(init: Node | undefined): boolean {
  if (init === undefined) {
    return false;
  }
  if (Node.isStringLiteral(init)) {
    return true; // bare attribute string: data-testid="foo"
  }
  if (!Node.isJsxExpression(init)) {
    return false;
  }
  const expr = init.getExpression();
  return expr !== undefined && readStringValue(expr) !== undefined; // braced literal (through any wrapper)
}

export const gate: GateDescriptor = {
  name: "testid-typed-only",
  docRow: "UI-Gates-and-Lessons.md §11.5",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    'freeform data-testid string — use the typed registry: data-testid={testId("key")} (lib/test-ids.ts); a typo becomes a tsc error instead of a silently-broken e2e selector. See UI-Gates-and-Lessons.md §11.5.',
  fix: 'use the typed registry: data-testid={testId("key")}',
  scanRoot: (p) => SCOPE.test(`/${p}`),
  kinds: [SyntaxKind.JsxAttribute],
  visit: (node, _sf, ctx) => {
    if (!Node.isJsxAttribute(node)) {
      return;
    }
    if (node.getNameNode().getText() === "data-testid" && freeformTestidValue(node.getInitializer())) {
      ctx.report(node, { token: "data-testid", offset: 0 });
    }
  },
  mustFlag: [
    {
      files: "export const A = () => <div data-testid='foo' />;\n",
      at: "packages/client/src/components/foo.tsx",
      why: "freeform string literal testid",
    },
    {
      files: "export const A = () => <div data-testid={'foo' as string} />;\n",
      at: "packages/client/src/components/foo.tsx",
      why: "a braced freeform testid wrapped in an AsExpression (`{'foo' as string}`) — the wrapped/braced-literal shape the plain StringLiteral reader silently PASSED before hardening",
    },
  ],
  mustPass: [
    {
      files: "export const A = () => <div data-testid={testId('foo')} />;\n",
      at: "packages/client/src/components/foo.tsx",
      why: "typed testid with expression",
    },
    {
      files: "export const A = () => <div data-testid='foo' />;\n",
      at: "packages/server/src/foo.tsx",
      why: "outside client scope",
    },
  ],
};
