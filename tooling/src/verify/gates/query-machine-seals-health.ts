// Hard liveness sibling for the named data seam. Mini-trees without the data public anchor do not activate health.
import { defineGate } from "../contract/policy.ts";
import { queryMachineFact } from "../lib/query-machine-fact.ts";

const ANCHOR = "packages/client/src/data/index.ts";
const COLLECTION = "packages/client/src/data/create-collection-surface.ts";
const MESSAGE =
  "the data public anchor exists but the sole paginated-browse factory is absent or no longer imports useInfiniteQuery; query-machine authority points at stale law. (tooling/src/verify/gates/GATE-AUTHORING.md)";
const FIX = "restore the collection factory and its useInfiniteQuery import, or move the seal and central grant together.";

export const gate = defineGate({
  id: "query-machine-seals-health",
  family: "query-machine-seals",
  authority: "hard",
  severity: "error",
  population: { in: ["@client", "@tests"], notNamed: ["*.test.ts", "*.test.tsx"] },
  analysis: "syntax",
  execution: "entire-population",
  facts: [queryMachineFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(queryMachineFact);
      ctx.receipt({ kind: "population", source: "query-machine-health-sources", members: fact.paths.size });
      const anchor = fact.sources.get(ANCHOR);
      if (anchor === undefined) {
        return;
      }
      const collection = fact.sources.get(COLLECTION);
      if (collection === undefined) {
        ctx.report.node(anchor, { message: `${MESSAGE} Missing: ${COLLECTION}.`, fix: FIX });
        return;
      }
      if (!fact.imports.some(({ file, names }) => file === COLLECTION && names.includes("useInfiniteQuery"))) {
        ctx.report.node(collection, { message: `${MESSAGE} ${COLLECTION} no longer imports useInfiniteQuery.`, fix: FIX });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { [ANCHOR]: "export const QueryBoundary = null;\n", [COLLECTION]: "export const createCollectionSurface = null;\n" },
      expect: { count: 1, messageIncludes: "useInfiniteQuery." },
      why: "the named factory remains but stopped owning the raw infinite-query machine",
    },
    {
      mode: "source",
      files: { [ANCHOR]: "export const QueryBoundary = null;\n" },
      expect: { count: 1, messageIncludes: "Missing" },
      why: "the named collection factory disappeared while the data tier remains live",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [ANCHOR]: "export const QueryBoundary = null;\n",
        [COLLECTION]: "import { useInfiniteQuery } from '@tanstack/react-query';\nexport const c = useInfiniteQuery;\n",
      },
      why: "the collection factory remains present and owns the raw machine",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.ts": "export const x = true;\n" },
      why: "a partial tree without the data public anchor does not activate health",
    },
  ],
});
