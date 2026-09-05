// The shared bus fact must produce a complete nonempty census before any bus policy verdict is trusted.
// Missing, empty, dynamic, written, cyclic, ambiguous, or unsupported identities fail hard here.
import { describeBusFactFailure } from "../contract/bus-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { createBusFactQuery } from "../lib/bus-fact.ts";

const SELF = "tooling/src/verify/gates/bus-fact-health.ts";
const MESSAGE =
  "shared bus fact is incomplete — bus policy verdicts are withheld until every union, belt, member, emitter, consumer, and coverage-policy identity resolves.";

export const gate = defineGate({
  id: "bus-fact-health",
  family: "bus-fact",
  authority: "hard",
  severity: "error",
  population: { in: ["@authored"], ext: ["ts", "tsx"] },
  analysis: "types",
  execution: "entire-population",
  message: MESSAGE,
  fix: "restore the missing canonical declaration or rewrite the dynamic/ambiguous shape through the supported typed bus seams.",
  create: (ctx) => {
    const query = createBusFactQuery(ctx);
    return {
      visitors: query.visitors,
      evaluate: () => {
        const fact = query.finish();
        ctx.receipt({ kind: "population", source: "bus-fact-health", members: 1 });
        if (fact.status !== "ready") {
          ctx.report.file(SELF, { message: `${MESSAGE} ${describeBusFactFailure(fact)}` });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [SELF]: "export const healthAnchor = true;\n",
        "packages/contracts/src/probe/index.ts": "export const noBusUnion = true;\n",
      },
      expect: { count: 1, messageIncludes: "shared bus fact is incomplete" },
      why: "an authored corpus with no bus union is a blind instrument, not a clean policy verdict",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [SELF]: "export const healthAnchor = true;\n",
        "packages/contracts/src/probe/index.ts":
          'export type ProbeBusEvent = { type: "changed" };\nexport const PROBE_EVENT_TYPES = { changed: true } satisfies Record<ProbeBusEvent["type"], true>;\n',
      },
      why: "a nonempty fully resolved bus census is healthy; policy-level semantic gaps are judged by sibling ids",
    },
  ],
});
