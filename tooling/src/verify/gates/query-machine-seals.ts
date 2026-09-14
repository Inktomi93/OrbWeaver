// Policy: query-machine-seals — raw TanStack mutation and infinite-query machines are named
// architecture seams. Every admitted named import is an exact reviewed-grant candidate; the central
// table, rather than path regexes or private comments, owns the production and CT homes.
import { defineGate } from "../contract/policy.ts";
import type { QueryMachineName } from "../lib/query-machine-fact.ts";
import { QUERY_MACHINE_POPULATION, queryMachineFact } from "../lib/query-machine-fact.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const operationFor = (name: QueryMachineName): string => `raw-${name}-import`;
const MESSAGE =
  "useMutation or useInfiniteQuery is imported directly from @tanstack/react-query. Every mutation rides " +
  "createEntityMutation and createCollectionSurface is the sole paginated-browse factory; an additional raw " +
  "machine hand-rolls or skips the data belt (client-architecture-lockdown.md §14/§16 G9).";
const FIX = "use createEntityMutation or createCollectionSurface; permanent seam homes require one exact central reviewed grant for that hook and file.";

export const gate = defineGate({
  id: "query-machine-seals",
  family: "query-machine-seals",
  authority: "reviewed-grant",
  severity: "error",
  population: QUERY_MACHINE_POPULATION,
  analysis: "syntax",
  execution: "entire-population",
  facts: [queryMachineFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(queryMachineFact);
      ctx.receipt({ kind: "population", source: "query-machine-source-files", members: ctx.files.length });
      reportReviewedGrantCandidates(
        ctx.report,
        fact.imports.flatMap(({ node, file, names }) =>
          names.map((name) => ({ node, token: name, offset: node.getText().indexOf(name), subject: file, operation: operationFor(name) })),
        ),
        { message: MESSAGE, fix: FIX, unreadableMessage: MESSAGE },
      );
    },
  }),
  mustFlag: [
    {
      mode: "source",
      grant: { subject: "packages/client/src/components/foo.tsx", operation: "raw-useMutation-import" },
      files: { "packages/client/src/components/foo.tsx": "import { useMutation } from '@tanstack/react-query';\n" },
      expect: { count: 1, token: "useMutation" },
      why: "the founding raw mutation outside the data seam is an exact hook-and-file grant candidate",
    },
    {
      mode: "source",
      grant: { subject: "packages/client/src/data/other.ts", operation: "raw-useInfiniteQuery-import" },
      files: { "packages/client/src/data/other.ts": "import { useInfiniteQuery } from '@tanstack/react-query';\n" },
      expect: { count: 1, token: "useInfiniteQuery" },
      why: "an infinite query outside the sole collection factory is an exact hook-and-file grant candidate",
    },
    {
      mode: "source",
      grant: { subject: "packages/ui/src/raw.tsx", operation: "raw-useMutation-import" },
      files: {
        "packages/client/src/data/index.ts": "export const QueryBoundary = null;\n",
        "packages/ui/src/raw.tsx": "import { useMutation } from '@tanstack/react-query';\n",
      },
      expect: { count: 1, token: "useMutation" },
      why: "the legacy-wide population includes UI source; a client anchor keeps the population proof non-vacuous",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/components/foo.test.tsx": "import { useMutation, useInfiniteQuery } from '@tanstack/react-query';\n",
        "packages/client/src/data/index.ts": "export const QueryBoundary = null;\n",
      },
      why: "ordinary unit-test files remain outside the production architecture population",
    },
    {
      mode: "source",
      files: { "packages/client/src/components/foo.tsx": "import { useQuery } from '@tanstack/react-query';\n" },
      why: "other TanStack imports are not mutation or infinite-query machines",
    },
  ],
});
