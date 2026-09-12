// The shared bus fact must produce a complete nonempty census before any bus policy verdict is trusted.
// Missing, empty, dynamic, written, cyclic, ambiguous, or unsupported identities fail hard here.
//
// The legacy `bus-coverage` descriptor (f287dc6dbb2dc4959a0bf4bd5698fea70fa03df8) held its own per-bus
// identity/census logic inline before this conversion extracted it into the shared bus fact this policy
// now guards.
import { describeBusFactFailure } from "../contract/bus-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { busProducerFact } from "../lib/bus-fact.ts";

const MESSAGE = "shared bus fact is incomplete — bus policy verdicts are withheld until every union, belt, member, and emitter identity resolves.";

export const gate = defineGate({
  id: "bus-fact-health",
  family: "bus-fact",
  authority: "hard",
  severity: "error",
  population: { in: ["@contracts", "@server"] },
  analysis: "types",
  execution: "entire-population",
  facts: [busProducerFact],
  resources: [],
  message: MESSAGE,
  fix: "restore the missing canonical declaration or rewrite the dynamic/ambiguous shape through the supported typed bus seams.",
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(busProducerFact);
      ctx.receipt({ kind: "population", source: "bus-fact-health", members: 1 });
      if (fact.status !== "ready") {
        const anchor = ctx.files[0];
        if (anchor === undefined) {
          throw new Error("bus fact health received an empty effective source population");
        }
        ctx.report.file(ctx.relativePath(anchor), { message: `${MESSAGE} ${describeBusFactFailure(fact)}` });
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/probe/index.ts": "export const noBusUnion = true;\n",
      },
      expect: { count: 1 },
      why: "an authored corpus with no bus union is a blind instrument, not a clean policy verdict",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/probe/index.ts":
          'export type ProbeBusEvent = { type: "changed" };\nexport const PROBE_EVENT_TYPES = { changed: true } satisfies Record<ProbeBusEvent["type"], true>;\n',
      },
      why: "a nonempty fully resolved bus census is healthy; policy-level semantic gaps are judged by sibling ids",
    },
  ],
});
