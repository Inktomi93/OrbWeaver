// The shared bus fact must produce a complete nonempty census before any bus policy verdict is trusted.
// Missing, empty, dynamic, written, cyclic, ambiguous, or unsupported identities fail hard here.
//
// FAMILY `bus-fact` — the shared reader is `lib/bus-fact.ts` (`busProducerFact`), the same provider its
// ordinary sibling `bus-producer-coverage` and the hard/warning `user-bus-deferred-member` read. This is the
// `-health` half of that family: the three policies SPLIT by authority and severity, not by subject, so the
// `family` string is identical by construction and this module owns no identity logic of its own.
//
// THIS POLICY REPORTS A NON-READY FACT; IT DOES NOT THROW ON ONE, AND THAT ASYMMETRY IS THE DESIGN (§12.3).
// Its two siblings go through `recordReadyBusFact` and throw, because a consumer must never render a verdict
// on evidence it could not gather. A `-health` policy is the DESIGNATED ACCUSER of exactly that condition, so
// applying the consumer protection here would silence the accuser with the thing it accuses. It throws only
// on a genuinely broken runtime guarantee — an EMPTY effective source population, which is a different
// condition from the one it reports. For the same reason its receipt is the CONSTANT `members: 1` ("I
// measured one fact") and never the census: `receiptFailures`' `count === 0` predicate would turn its own
// finding into a receipt tool error before it could ever be reported (§4.5b corollary 2). Both literals were
// re-probed by planted break and both are correct. Do not "fix" either.
//
// POPULATION PORT: an intentional correction, not byte-identical. The legacy `bus-coverage` descriptor
// (f287dc6dbb2dc4959a0bf4bd5698fea70fa03df8) declared no `scanRoot` at all — it was `scopeSafety:
// "whole-project"` with a `run` hook that walked `ctx.project` and carried its own `emitScope` regex
// (`/\/packages\/server\/src\/(?:domain|transport|entry\/compose)\//`) inline. The final population names the
// two roots the subject actually inhabits: bus unions and their belts are declared in `@contracts`, their
// producers in `@server`. The producer-side narrowing the regex expressed did not move into the population —
// it is the shared fact's question now, which is why this policy holds no path predicate.
//
// The legacy `bus-coverage` descriptor held its own per-bus identity/census logic inline before this
// conversion extracted it into the shared bus fact this policy now guards.
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
