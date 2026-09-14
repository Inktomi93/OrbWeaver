// #1965 owns the one known freshness debt. It is never downgraded into a reviewed grant.
import { defineGate } from "../contract/policy.ts";
import { queryFreshnessFact } from "../lib/query-freshness-fact.ts";
import { QUERY_FRESHNESS_DEBT } from "./query-freshness-coverage.ts";

const MESSAGE = "automation.listChatActivity lacks a live in-view freshness driver; #1965 owns adding the bus signal and reachable invalidation row.";
const FIX = "resolve #1965 by adding the activity signal and its seam invalidation, then delete this debt owner in the same change.";
export const gate = defineGate({
  id: "query-freshness-coverage-debt",
  family: "query-freshness-coverage",
  authority: "hard",
  severity: "warning",
  workItem: 1965,
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
      ctx.receipt({ kind: "population", source: "query-freshness-debt-source-files", members: ctx.files.length });
      if (fact.seam === undefined) {
        return;
      }
      const consumption = fact.consumed.get(QUERY_FRESHNESS_DEBT);
      if (consumption !== undefined) {
        ctx.report.node(consumption, {
          message: fact.covered(QUERY_FRESHNESS_DEBT) ? `${MESSAGE} The debt gained coverage and this owner is stale.` : MESSAGE,
          fix: FIX,
        });
        return;
      }
      if (fact.consumed.has("chat.listMessages") || fact.consumed.has("sessions.me")) {
        ctx.report.node(fact.seam, { message: `${MESSAGE} The cited key is no longer consumed and this owner is orphaned.`, fix: FIX });
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) { return [trpc.other.thing.pathFilter()]; }\n",
        "packages/client/src/features/automation/activity.tsx": "export const q = trpc.automation.listChatActivity.queryOptions({});\n",
      },
      expect: { count: 1 },
      why: "the known uncovered Activity read remains visible as warning debt",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) { return [trpc.automation.listChatActivity.pathFilter()]; }\n",
        "packages/client/src/features/automation/activity.tsx": "export const q = trpc.automation.listChatActivity.queryOptions({});\n",
      },
      expect: { count: 1, messageIncludes: "stale" },
      why: "adding coverage cannot make the tracked debt disappear before its owner is retired",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) { return [trpc.chat.listMessages.pathFilter()]; }\n",
        "packages/client/src/features/chat/messages.tsx": "export const q = trpc.chat.listMessages.queryOptions({});\n",
      },
      expect: { count: 1, messageIncludes: "orphaned" },
      why: "the real-tree sentinel keeps a vanished deferred consumption loud",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) { return [trpc.other.thing.pathFilter()]; }\n",
        "packages/client/src/features/x/x.tsx": "export const q = trpc.ghost.read.queryOptions({});\n",
      },
      why: "unrelated uncovered keys belong to the error owner, never this one debt owner",
    },
  ],
});
