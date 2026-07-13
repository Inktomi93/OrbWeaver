// Gate: no-array-literal-querykey (UI-Gates-and-Lessons.md §11.1 — "queryKeys are 100%
// tRPC-codegen-derived"). Every read key in the client is minted by the tRPC options proxy
// (`trpc.<router>.<proc>.queryKey()` / `.queryFilter()` / `.pathFilter()` / `.queryOptions()`); an
// ad-hoc `queryKey: ["...", ...]` array is the neo drift this locks out — a hand-written key silently
// diverges from the key the reader/invalidator uses and the two never match again. Physics-adjacent to
// `no-inline-invalidate-outside-seam`: filters are proxy-derived, so keys must be too.
//
// WHAT IT FLAGS: a `queryKey:` PROPERTY whose value (unwrapped through `as`/`satisfies`/parens) is an
// inline ARRAY LITERAL — AST only, comments/strings don't count. Scoped to packages/client/src/**.
//
// WHAT IT DELIBERATELY DOES NOT FLAG:
//   • the proxy passthroughs the data/ factories carry — `queryKey: readKey`,
//     `queryKey: GATED_OFF_KEY as unknown as TKey` (use-gated-query.ts), `queryKey: filter.queryKey`:
//     the value is an IDENTIFIER / property access, never an inline array (we do NOT resolve an
//     identifier to its declaration, so a `const K = ["..."]` mint stays a legal proxy-shaped seam).
//   • `.queryKey()` / `.queryFilter()` / `.pathFilter()` proxy calls — those are call expressions, not
//     a `queryKey:` property at all.
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
  while (
    Node.isAsExpression(n) ||
    Node.isSatisfiesExpression(n) ||
    Node.isParenthesizedExpression(n)
  ) {
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
