// The owner-only refusal of a workload reaches the wire as a forbidden answer carrying its own code, so a client says it
// by the code and not by the status. Every other forbidden answer stays codeless.
// @subject packages/server/src/transport/trpc/error-mapping.ts
// @subject packages/server/src/transport/trpc/trpc.ts
// @subject packages/server/src/domain/workloads/substrate/params.ts

import { CSRF_HEADER } from "@orb/contracts/identity";
import { WORKLOAD_ASKER_NOT_OWNER } from "@orb/contracts/workloads";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createAuthModeRoot, mintMember, signIn } from "@orb/testkit/node/auth";
import { z } from "zod";

const refusalSchema = z.object({ error: z.object({ data: z.object({ code: z.string(), httpStatus: z.number(), reason: z.string().optional() }) }) });

test("a member asking for a run only the box owner may start is refused as forbidden with the owner-only code, and another forbidden answer has none", async () => {
  // A public peer, so no request rides the owner fallback: the member's own sign-in is the credential.
  await using root = await createAuthModeRoot("local", { physicalPeer: () => PUBLIC_PEER_ADDRESS });
  const member = await signIn(root, await mintMember(root));
  // What the error formatter puts on the wire for a refused estimate, read off the real HTTP answer.
  const refusalOf = async (input: unknown): Promise<{ readonly status: number; readonly code: string; readonly reason: string | undefined }> => {
    const response = await root.http.request(`/api/trpc/workloads.estimateModelCalls?input=${encodeURIComponent(JSON.stringify(input))}`, {
      headers: { ...member.headers, [CSRF_HEADER]: "1" },
    });
    const { code, reason } = refusalSchema.parse(await response.json()).error.data;
    return { status: response.status, code, reason };
  };

  const ownerOnly = await refusalOf({ input: { kind: "import-st", params: {} }, mode: "singular" });
  // The control: a member's bulk run is forbidden too, by another rule, and that answer carries no code.
  const bulk = await refusalOf({ input: { kind: "distill-characters", params: {} }, mode: "bulk" });

  expect(ownerOnly).toEqual({ status: 403, code: "FORBIDDEN", reason: WORKLOAD_ASKER_NOT_OWNER });
  expect(bulk).toEqual({ status: 403, code: "FORBIDDEN", reason: undefined });
});
