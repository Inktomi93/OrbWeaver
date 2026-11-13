// The owner-only refusal of a workload reaches the wire as a forbidden answer carrying its own code, so a client says it
// by the code and not by the status. Every other forbidden answer stays codeless.
// @subject packages/server/src/transport/trpc/error-mapping.ts
// @subject packages/server/src/domain/workloads/substrate/params.ts

import { WORKLOAD_ASKER_NOT_OWNER } from "@orb/contracts/workloads";
import { domainReason } from "@orb/server/transport/trpc";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

/** What the error formatter would put on the wire for a refused call: its status and its reason. */
async function refusalOf(call: Promise<unknown>): Promise<{ readonly code: unknown; readonly reason: string | undefined }> {
  const error = await call.then(
    () => {
      throw new Error("the call was not refused");
    },
    (refused: unknown) => refused,
  );
  if (typeof error !== "object" || error === null || !("code" in error)) {
    throw new Error("the refusal is not a tRPC error");
  }
  return { code: error.code, reason: domainReason({ cause: "cause" in error ? error.cause : undefined }) };
}

test("a member asking for a run only the box owner may start is refused as forbidden with the owner-only code, and another forbidden answer has none", async () => {
  await using root = await createServerHarness();
  const member = await root.internalCallerFor((await root.actor()).id);

  const ownerOnly = await refusalOf(member.workloads.estimateModelCalls({ input: { kind: "import-st", params: {} }, mode: "singular" }));
  // The control: a member's bulk run is forbidden too, by another rule, and that answer carries no code.
  const bulk = await refusalOf(member.workloads.estimateModelCalls({ input: { kind: "distill-characters", params: {} }, mode: "bulk" }));

  expect(ownerOnly).toEqual({ code: "FORBIDDEN", reason: WORKLOAD_ASKER_NOT_OWNER });
  expect(bulk).toEqual({ code: "FORBIDDEN", reason: undefined });
});
