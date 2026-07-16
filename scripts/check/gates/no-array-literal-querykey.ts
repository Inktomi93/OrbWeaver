// Gate: no-array-literal-querykey (UI-Gates-and-Lessons.md §11.1 — "queryKeys are 100%
// tRPC-codegen-derived"). Every read key is minted by the tRPC options proxy
// (`trpc.<router>.<proc>.queryKey()`/etc); an ad-hoc `queryKey: ["...", ...]` array silently diverges
// from the key the reader/invalidator uses and the two never match again. Flags a `queryKey:` property
// whose value is an inline array literal, scoped to packages/client/src/**. Does not flag an identifier/property-access value.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const MESSAGE =
  "inline array-literal queryKey — client query keys are 100% tRPC-proxy-derived " +
  "(trpc.<router>.<proc>.queryKey()/.queryFilter()/.pathFilter()); a hand-written key array silently " +
  "diverges from the reader/invalidator's key. Mint it from the proxy (UI-Gates-and-Lessons.md §11.1).";

/** Strip `as` / `satisfies` / parens so the underlying initializer is reachable — but NEVER resolve an
 *  identifier to its declaration (a `const K = [...]` proxy-shaped mint is legal). */
function unwrap(node: Node): Node {
  let n = node;
  while (Node.isAsExpression(n) || Node.isSatisfiesExpression(n) || Node.isParenthesizedExpression(n)) {
    n = n.getExpression();
  }
  return n;
}

export const gate: GateDescriptor = {
  name: "no-array-literal-querykey",
  docRow: "UI-Gates-and-Lessons.md §11.1",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "mint the key from the tRPC options proxy: trpc.<router>.<proc>.queryKey() / .queryFilter() / .pathFilter().",
  scanRoot: (p) => p.includes("packages/client/src/"),
  kinds: [SyntaxKind.PropertyAssignment],
  visit: (node, _sf, ctx) => {
    if (!Node.isPropertyAssignment(node) || node.getName() !== "queryKey") {
      return;
    }
    if (Node.isArrayLiteralExpression(unwrap(node.getInitializerOrThrow()))) {
      ctx.report(node, { token: "queryKey", offset: 0 });
    }
  },
  mustFlag: [
    {
      files: 'export const q = { queryKey: ["users", 1] };\n',
      at: "packages/client/src/features/a/data.ts",
      why: "an inline array-literal queryKey — the neo drift a proxy-minted key locks out",
    },
  ],
  mustPass: [
    {
      files: "export const ok = { queryKey: readKey };\n",
      at: "packages/client/src/features/a/data2.ts",
      why: "an identifier passthrough (proxy-shaped mint) — never resolved to its declaration, so it passes",
    },
    {
      files: "export const ok = { queryKey: GATED_OFF_KEY as unknown as TKey };\n",
      at: "packages/client/src/features/a/data3.ts",
      why: "a queryKey wrapped in `as` over a NON-array identifier — unwrap strips casts but never resolves the identifier, passes",
    },
    {
      files: "export const ok = trpc.users.list.queryKey();\n",
      at: "packages/client/src/features/a/data4.ts",
      why: "a `.queryKey()` proxy CALL (not a `queryKey:` property) — the sanctioned mint, passes",
    },
  ],
};
