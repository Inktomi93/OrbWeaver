// Hard blindness owner for the anchored invalidation seam.
import { defineGate } from "../contract/policy.ts";
import { queryFreshnessFact } from "../lib/query-freshness-fact.ts";

const MESSAGE = "the Invalidation anchor is present but createInvalidation is absent, so the freshness coverage side would be vacuous.";
const FIX = "restore or re-point the canonical createInvalidation factory together with the shared graph fact.";
export const gate = defineGate({
  id: "query-freshness-coverage-health",
  family: "query-freshness-coverage",
  authority: "hard",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [queryFreshnessFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(queryFreshnessFact);
      ctx.receipt({ kind: "population", source: "query-freshness-health-sources", members: ctx.files.length });
      if (fact.anchor !== undefined && fact.seam === undefined) {
        ctx.report.node(fact.anchor, { message: MESSAGE, fix: FIX });
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function buildInvalidation(trpc: Trpc) { return [trpc.other.thing.pathFilter()]; }\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.frozenRead.queryOptions({});\n",
      },
      expect: { count: 1, messageIncludes: "anchor is present" },
      why: "the paired anchor makes a factory rename fail loudly",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/data/invalidation.ts":
          "export type Invalidation = { readonly invalidate: () => void };\nexport function buildInvalidation(trpc: Trpc) { return [trpc.other.thing.pathFilter()]; }\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.aliasAnchor.queryOptions({});\n",
      },
      expect: { count: 1, messageIncludes: "anchor is present" },
      why: "the legacy tripwire keyed on any Invalidation identifier; a type-alias anchor must not disappear behind interface-only seam pairing",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) { return [trpc.other.thing.pathFilter()]; }\n",
      },
      why: "the anchored factory exists",
    },
  ],
});
