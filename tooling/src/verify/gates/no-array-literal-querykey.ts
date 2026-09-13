// Gate: no-array-literal-querykey (UI-Gates-and-Lessons.md §11.1 — "queryKeys are 100%
// tRPC-codegen-derived"). Every read key is minted by the tRPC options proxy
// (`trpc.<router>.<proc>.queryKey()`/etc); an ad-hoc `queryKey: ["...", ...]` array silently diverges
// from the key the reader/invalidator uses and the two never match again. Flags a `queryKey:` property
// whose value is an inline array literal, scoped to packages/client/src/**. Does not flag an identifier/property-access value.
// FAMILY: singleton — this policy owns its own local `queryKey`-name check; it shares no `lib/` reader
// with any sibling gate. POPULATION PORT: `@client` only, byte-identical to the legacy scope
// (packages/client/src/**) — a `queryKey:` literal anywhere else (server, contracts) is out of reach by
// design, since the tRPC options proxy this gate protects is a client-only concept.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-array-literal-querykey` descriptor at 073520068d3305dfedbb481153cadfef6b30f847, the parent of the conversion
// `45743d76d` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,006 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 1,287 and final `population` admits 1,287. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by both.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";

const MESSAGE =
  "inline array-literal queryKey — client query keys are 100% tRPC-proxy-derived " +
  "(trpc.<router>.<proc>.queryKey()/.queryFilter()/.pathFilter()); a hand-written key array silently " +
  "diverges from the reader/invalidator's key. Mint it from the proxy (UI-Gates-and-Lessons.md §11.1).";

export const gate = defineGate({
  id: "no-array-literal-querykey",
  family: "no-array-literal-querykey",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "mint the key from the tRPC options proxy: trpc.<router>.<proc>.queryKey() / .queryFilter() / .pathFilter(). " +
    "A deliberately hand-written key is waived with `// @orb-waive no-array-literal-querykey(queryKey): <reason>` " +
    'on the line above — the position is always the literal property name `queryKey` (`token: "queryKey", offset: 0`).',
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.PropertyAssignment],
        visit: (node) => {
          if (!Node.isPropertyAssignment(node) || node.getName() !== "queryKey") {
            return;
          }
          if (Node.isArrayLiteralExpression(unwrapExpression(node.getInitializerOrThrow()))) {
            ctx.report.node(node, { token: "queryKey", offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/features/a/data.ts": 'export const q = { queryKey: ["users", 1] };\n' },
      expect: { count: 1, token: "queryKey" },
      why: "an inline array-literal queryKey — the neo drift a proxy-minted key locks out",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/wrapped.ts":
          'type Key = readonly unknown[];\nexport const a = { queryKey: (["users"] satisfies Key) };\nexport const b = { queryKey: ((["chats"] as const)) };\n',
      },
      expect: { count: 2 },
      why: "satisfies, as-const, and parentheses wrappers cannot hide the inline array literal",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/a/data2.ts": "export const ok = { queryKey: readKey };\n" },
      why: "an identifier passthrough (proxy-shaped mint) — never resolved to its declaration, so it passes",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/data3.ts": "export const ok = { queryKey: GATED_OFF_KEY as unknown as TKey };\n" },
      why: "a queryKey wrapped in `as` over a NON-array identifier — unwrap strips casts but never resolves the identifier, passes",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/data4.ts": "export const ok = trpc.users.list.queryKey();\n" },
      why: "a `.queryKey()` proxy CALL (not a `queryKey:` property) — the sanctioned mint, passes",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/indirect.ts":
          'const RESOLVED = ["users"] as const;\ndeclare const props: object;\nexport const indirect = { queryKey: RESOLVED };\nexport const factory = { queryKey: () => ["users"] };\nexport const spread = { ...props };\n',
      },
      why: "declared limits: resolved constants, arrow factories, and a queryKey hidden behind object spread are not inline array initializers on the delivered property",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/data.ts":
          '// @orb-waive no-array-literal-querykey(queryKey): the proof\'s stand-in reason; ends when this fixture stops flagging.\nexport const q = { queryKey: ["users", 1] };\n',
      },
      why: 'POSITIONAL IDENTITY: the report anchors the PropertyAssignment with an explicit `token: "queryKey", offset: 0`, so an author waives the PROPERTY NAME — never the array literal or its first element. The fixture is mustFlag[0] (:43, count 1) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes',
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/other-name.ts": 'export const q = { otherKey: ["users", 1] };\n' },
      why: 'THE NAME FENCE (§4.1): an inline array literal on a property that is NOT named `queryKey` must not flag — widening `node.getName() !== "queryKey"` to every PropertyAssignment reds this row',
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/anchor.ts": "export const anchor = true;\n",
        "packages/server/src/features/a/data.ts": 'export const q = { queryKey: ["users", 1] };\n',
      },
      why: "THE POPULATION FENCE (§4.1): the exact mustFlag[0] shape, but outside `@client`, must not flag — an in-population anchor file keeps the fixture non-empty (a population falsifier holding only the out-of-population file tool-errors instead of passing); widening `population` to admit `@server` reds this row",
    },
  ],
});
