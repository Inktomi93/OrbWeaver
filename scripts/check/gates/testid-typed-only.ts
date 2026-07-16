import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const SCOPE = /\/packages\/client\/src\//u;

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
    const init = node.getInitializer();
    if (node.getNameNode().getText() === "data-testid" && init && Node.isStringLiteral(init)) {
      ctx.report(node, { token: "data-testid", offset: 0 });
    }
  },
  mustFlag: [
    {
      files: "export const A = () => <div data-testid='foo' />;\n",
      at: "packages/client/src/components/foo.tsx",
      why: "freeform string literal testid",
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
