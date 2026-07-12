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
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Check, Violation } from "../harness.ts";

const CLIENT_SRC = "/packages/client/src/";

const MESSAGE =
  "inline array-literal queryKey — client query keys are 100% tRPC-proxy-derived " +
  "(trpc.<router>.<proc>.queryKey()/.queryFilter()/.pathFilter()); a hand-written key array silently " +
  "diverges from the reader/invalidator's key. Mint it from the proxy (UI-Gates-and-Lessons.md §11.1).";

function clientRel(path: string): string | undefined {
  const idx = path.indexOf(CLIENT_SRC);
  if (idx === -1) {
    return;
  }
  return `packages/client/src/${path.slice(idx + CLIENT_SRC.length)}`;
}

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

function violationsIn(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    if (pa.getName() !== "queryKey") {
      continue;
    }
    if (Node.isArrayLiteralExpression(unwrap(pa.getInitializerOrThrow()))) {
      out.push({ file: rel, line: pa.getStartLineNumber(), message: MESSAGE });
    }
  }
  return out;
}

export const noArrayLiteralQuerykey: Check = {
  name: "no-array-literal-querykey",
  run: ({ project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const rel = clientRel(sf.getFilePath());
      if (rel !== undefined) {
        violations.push(...violationsIn(sf, rel));
      }
    }
    return violations;
  },
};

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (a)) ──────────────────────────────────────────────
// The legacy predicate as a PropertyAssignment subscription: a `queryKey:` property whose (unwrapped)
// initializer is an inline array literal, in packages/client/src/**. scanRoot mirrors the legacy
// clientRel filter (the parity oracle). Per-occurrence (each inline-array queryKey property). Kept
// ALONGSIDE the legacy Check. The offending token is `queryKey` (the property name that violated).
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
  ],
};
