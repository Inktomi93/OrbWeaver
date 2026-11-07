// What a client may send to the start family: every kind but the route-started one, and no spelling of a staged upload.
// @subject packages/contracts/src/workloads/params.ts

import { ROUTE_STARTED_WORKLOAD_KIND, startWorkloadEnvelope, WORKLOAD_KINDS, wireStartWorkloadEnvelope } from "@orb/contracts/workloads";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const DIGEST = "0".repeat(64);

forEachNonEmpty(
  WORKLOAD_KINDS.filter((kind) => kind !== ROUTE_STARTED_WORKLOAD_KIND),
  "wire kinds",
  (kind) => {
    test(`${kind} has a wire form`, () => {
      expect(wireStartWorkloadEnvelope.parse({ kind, params: {} })).toEqual({ kind, params: {} });
    });
  },
);

test.for<{ name: string; input: unknown }>([
  { name: "the route-started kind", input: { kind: ROUTE_STARTED_WORKLOAD_KIND, params: {} } },
  { name: "the route-started kind with its params", input: { kind: ROUTE_STARTED_WORKLOAD_KIND, params: { token: "x", stagedDigest: DIGEST } } },
  { name: "a staged handle on import-st", input: { kind: "import-st", params: { stagedDir: "x" } } },
  { name: "a digest on import-st", input: { kind: "import-st", params: { stagedDigest: DIGEST } } },
  { name: "a handle beside a real tunable", input: { kind: "import-st", params: { dryRun: true, stagedDir: "x", stagedDigest: DIGEST } } },
  { name: "an unknown import-st param", input: { kind: "import-st", params: { stagedDirectory: "x" } } },
  { name: "an unknown kind", input: { kind: "import-anything", params: {} } },
])("$name has no wire form", ({ input }) => {
  expect(wireStartWorkloadEnvelope.safeParse(input).success).toBe(false);
});

test("import-st keeps its tunables on the wire", () => {
  const input = { kind: "import-st", params: { dryRun: true, personaCollisions: { bob: "merge" } } };
  expect(wireStartWorkloadEnvelope.parse(input)).toEqual(input);
});

test("the domain door's envelope still names the staged kinds an upload route starts", () => {
  const input = { kind: ROUTE_STARTED_WORKLOAD_KIND, params: { token: "x", stagedDigest: DIGEST } };
  expect(startWorkloadEnvelope.parse(input)).toEqual(input);
});
