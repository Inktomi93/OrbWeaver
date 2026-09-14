// Policy: query-freshness-coverage — every client-observed tRPC query needs a reachable invalidation
// row or an exact central reviewed grant documenting its independent freshness driver. The shared fact
// follows only the canonical createInvalidation + Invalidation seam and one-hop invalidation siblings.
import { defineGate } from "../contract/policy.ts";
import { queryFreshnessFact } from "../lib/query-freshness-fact.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

export const QUERY_FRESHNESS_OPERATION = "uncovered-query-freshness";
export const QUERY_FRESHNESS_DEBT = "automation.listChatActivity";
const MESSAGE =
  "a client-consumed tRPC query key appears in zero reachable invalidation rows, so with staleTime:Infinity " +
  "and no focus refetch its surface freezes at the first fetch. The token and subject are the query key.";
const FIX =
  "add the narrowest reachable pathFilter/queryFilter row in the invalidation seam, or take one exact central " +
  "reviewed grant documenting the independent freshness driver. automation.listChatActivity is warning debt owned by #1965.";

export const gate = defineGate({
  id: "query-freshness-coverage",
  family: "query-freshness-coverage",
  authority: "reviewed-grant",
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
      ctx.receipt({ kind: "population", source: "query-freshness-source-files", members: ctx.files.length });
      if (fact.seam === undefined) {
        return;
      }
      reportReviewedGrantCandidates(
        ctx.report,
        [...fact.consumed].flatMap(([key, node]) =>
          !fact.covered(key) && key !== QUERY_FRESHNESS_DEBT
            ? [{ node, token: key, offset: node.getText().indexOf(key), subject: key, operation: QUERY_FRESHNESS_OPERATION }]
            : [],
        ),
        { message: MESSAGE, fix: FIX, unreadableMessage: MESSAGE },
      );
    },
  }),
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "ghost.frozenRead", operation: QUERY_FRESHNESS_OPERATION },
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) { return [trpc.other.thing.pathFilter()]; }\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.frozenRead.queryOptions({});\n",
      },
      expect: { count: 1, token: "ghost.frozenRead" },
      why: "the founding consumed literal has no reachable seam row",
    },
    {
      mode: "types",
      grant: { subject: "ghost.pagedRead", operation: QUERY_FRESHNESS_OPERATION },
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) { return [trpc.other.thing.pathFilter()]; }\n",
        "packages/client/src/features/x/surfaces/deep/nested/y.tsx": "export const q = deps.trpc.ghost.pagedRead.infiniteQueryOptions({});\n",
      },
      expect: { count: 1, token: "ghost.pagedRead" },
      why: "nested deps.trpc infiniteQueryOptions remains a consumption",
    },
    {
      mode: "types",
      grant: { subject: "ghost.frozenRead", operation: QUERY_FRESHNESS_OPERATION },
      files: {
        "packages/client/src/a-impersonator.ts": "export function createInvalidation(trpc: Trpc) { return [trpc.ghost.frozenRead.pathFilter()]; }\n",
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) { return [trpc.other.thing.pathFilter()]; }\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.frozenRead.queryOptions({});\n",
      },
      expect: { count: 1, token: "ghost.frozenRead" },
      why: "an unrelated same-named factory cannot impersonate the anchored seam",
    },
    {
      mode: "types",
      grant: { subject: "ghost.orphanRead", operation: QUERY_FRESHNESS_OPERATION },
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nfunction deadHelper(trpc: Trpc) { return [trpc.ghost.orphanRead.pathFilter()]; }\nexport function createInvalidation(trpc: Trpc) { return [trpc.other.thing.pathFilter()]; }\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.orphanRead.queryOptions({});\n",
      },
      expect: { count: 1, token: "ghost.orphanRead" },
      why: "a dead helper is not reachable coverage",
    },
    {
      mode: "types",
      grant: { subject: "ghost.propertyCollision", operation: QUERY_FRESHNESS_OPERATION },
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nfunction deadHelper(trpc: Trpc) { return [trpc.ghost.propertyCollision.pathFilter()]; }\nexport function createInvalidation(trpc: Trpc) { return [{ deadHelper: false }, trpc.other.thing.pathFilter()]; }\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.propertyCollision.queryOptions({});\n",
      },
      expect: { count: 1, token: "ghost.propertyCollision" },
      why: "an object property collision is not a callable declaration edge",
    },
    {
      mode: "types",
      grant: { subject: "ghost.notTheSeam", operation: QUERY_FRESHNESS_OPERATION },
      files: {
        "packages/client/src/data/invalidation.ts":
          "import { somethingElse } from './use-upload-asset.ts';\nexport interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) { return somethingElse(trpc); }\n",
        "packages/client/src/data/use-upload-asset.ts": "export function somethingElse(trpc: Trpc) { return [trpc.ghost.notTheSeam.pathFilter()]; }\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.notTheSeam.queryOptions({});\n",
      },
      expect: { count: 1, token: "ghost.notTheSeam" },
      why: "only invalidation-named one-hop siblings join the seam",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nfunction canonReads(trpc: Trpc) { return [trpc.ghost.livingRead.pathFilter()]; }\nconst MAP = { x: (trpc: Trpc) => canonReads(trpc) };\nexport function createInvalidation(trpc: Trpc) { return MAP.x(trpc); }\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.livingRead.queryOptions({});\n",
      },
      why: "helper and map composition is reachable from the factory",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nfunction livingHelper(trpc: Trpc) { return [trpc.ghost.calledHelper.pathFilter()]; }\nexport function createInvalidation(trpc: Trpc) { return livingHelper(trpc); }\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.calledHelper.queryOptions({});\n",
      },
      why: "a direct resolved helper call supplies coverage",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/data/invalidation.ts":
          "import { canonReads } from './invalidation-reads.ts';\nexport interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) { return canonReads(trpc); }\n",
        "packages/client/src/data/invalidation-reads.ts": "export function canonReads(trpc: Trpc) { return [trpc.ghost.splitRead.pathFilter()]; }\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.splitRead.queryOptions({});\n",
      },
      why: "a resolved helper in one imported invalidation sibling supplies coverage",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) { return [trpc.ghost.pathFilter()]; }\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.anyProc.queryOptions({});\n",
      },
      why: "router-root pathFilter covers every procedure under the router",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) { return [trpc.other.thing.pathFilter()]; }\n",
        "packages/client/src/features/x/components/x.tsx": "export const k = trpc.ghost.peeked.queryKey({});\n",
      },
      why: "queryKey alone creates no observer and is not a consumption",
    },
  ],
});
