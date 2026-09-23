// Work item 66 (docs/work/0066-give-the-chat-activity-list-a-live-in.md) owns the one known freshness debt. It is never downgraded into a reviewed grant.
// The inlined value was `QUERY_FRESHNESS_DEBT` from the sibling `query-freshness-coverage` gate;
// inlined here to eliminate the policy-legacy-imports violation (#2365, #2147 ARM B).
import { defineGate } from "../contract/policy.ts";
import { queryFreshnessFact } from "../lib/query-freshness-fact.ts";

const QUERY_FRESHNESS_DEBT = "automation.listChatActivity";

const MESSAGE =
  "automation.listChatActivity lacks a live in-view freshness driver; work item 66 owns adding the bus signal and reachable invalidation row. (tooling/src/verify/gates/GATE-AUTHORING.md)";
const FIX = "resolve work item 66 by adding the activity signal and its seam invalidation, then delete this debt owner in the same change.";
export const gate = defineGate({
  id: "query-freshness-coverage-debt",
  family: "query-freshness-coverage",
  authority: "hard",
  severity: "warning",
  workItem: 66,
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
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) { return [trpc.other.thing.pathFilter()]; }\n",
        "packages/client/src/features/automation/activity.tsx": 'export const q = trpc["automation"]["listChatActivity"]["queryOptions"]({});\n',
      },
      expect: { count: 1, line: 1 },
      why: "THE CONSUMED READ, BRACKET-SPELLED (#2353): the chain reader keyed every hop on `PropertyAccessExpression`, so this read contributed nothing to `consumed`, the debt owner saw its own key as unconsumed and BOTH freshness owners stopped flagging their own fixtures. `lib/query-freshness-fact.ts` now reads each hop through `lib/symbol-reference.ts#readMemberAccess` and subscribes `MEMBER_ACCESS_KINDS`",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/data/invalidation.ts":
          'export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) { return [trpc["automation"]["listChatActivity"]["pathFilter"]()]; }\n',
        "packages/client/src/features/automation/activity.tsx": "export const q = trpc.automation.listChatActivity.queryOptions({});\n",
      },
      expect: { count: 1, messageIncludes: "stale" },
      why: "THE COVERAGE FILTER, BRACKET-SPELLED — the acquitting half of the same widening. `stale` in the message is the only observable that the seam's bracket-spelled `pathFilter` row COVERED the dotted read: leave the filter side keyed on `PropertyAccessExpression` while the read side widens and a correctly invalidated query is reported as uncovered by the error owner. That is the false positive this row forbids",
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
