import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readStringValue } from "../lib/ast-read.ts";

/** Does this `data-testid` initializer carry a FREEFORM string value — a bare `="foo"` StringLiteral, or a
 *  braced `={"foo"}` / `={"foo" as string}` / a braced template literal — as opposed to the typed
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

export const gate = defineGate({
  id: "testid-typed-only",
  family: "testid-typed-only",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message:
    'freeform data-testid string — use the typed registry: data-testid={testId("key")} (lib/test-ids.ts); a typo becomes a tsc error instead of a silently-broken e2e selector. See UI-Gates-and-Lessons.md §11.5.',
  fix: 'use the typed registry: data-testid={testId("key")}',
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.JsxAttribute],
        visit: (node) => {
          if (Node.isJsxAttribute(node) && node.getNameNode().getText() === "data-testid" && freeformTestidValue(node.getInitializer())) {
            ctx.report.node(node, { token: "data-testid", offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/components/foo.tsx": "export const A = () => <div data-testid='foo' />;\n" },
      why: "freeform string literal testid",
    },
    {
      mode: "source",
      files: { "packages/client/src/components/foo.tsx": "export const A = () => <div data-testid={'foo' as string} />;\n" },
      why: "a braced freeform testid wrapped in an AsExpression (`{'foo' as string}`) — the wrapped/braced-literal shape the plain StringLiteral reader silently PASSED before hardening",
    },
    {
      mode: "source",
      files: { "packages/client/src/components/foo.tsx": "export const A = () => <div data-testid={(`foo` satisfies string)} />;\n" },
      why: "a no-substitution template remains a freeform testid through satisfies and parentheses",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/components/foo.tsx": "export const A = () => <div data-testid={testId('foo')} />;\n" },
      why: "typed testid with expression",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/components/clean.tsx": "export const Clean = () => <div />;\n",
        "packages/server/src/foo.tsx": "export const A = () => <div data-testid='foo' />;\n",
      },
      why: "outside client scope",
    },
    {
      mode: "source",
      files: { "packages/client/src/components/foo.tsx": "export const A = () => <div {...{ 'data-testid': 'foo' }} />;\n" },
      why: "DECLARED LIMIT: a data-testid arriving through a JSX spread is outside the direct-attribute spelling policy",
    },
    {
      mode: "source",
      files: { "packages/client/src/components/foo.tsx": "const ID = 'foo';\nexport const A = () => <div data-testid={ID} />;\n" },
      why: "DECLARED LIMIT: a freeform value reached through a resolved constant is not a literal at the attribute position",
    },
  ],
});
