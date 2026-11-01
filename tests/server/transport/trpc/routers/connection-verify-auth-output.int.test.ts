// @subject packages/server/src/transport/trpc/routers/connection.ts
// @subject packages/contracts/src/providers/index.ts
import type { VerifyAuthResult } from "@orb/contracts/providers";
import { verifyAuthAccountSchema } from "@orb/contracts/providers";
import { ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { vi } from "vitest";

const VERIFIED: VerifyAuthResult = { ok: true, apiKeySource: "none", reply: "ok", costUsd: 0 };

test("the verify-auth result refuses a key the wire does not declare instead of dropping it", async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const connectionId = createSeededIds().typeId(ID_PREFIX.userConnection);
  const verify = vi.spyOn(root.services.connection, "verifyAuth");
  try {
    verify.mockResolvedValueOnce(VERIFIED);
    await expect(caller.connection.verifyAuth({ connectionId })).resolves.toEqual(VERIFIED);
    const leaked = { ...VERIFIED, apiKey: "must-not-cross-the-wire" };
    verify.mockResolvedValueOnce(leaked);
    await expect(caller.connection.verifyAuth({ connectionId })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    const accountLeak = { ...VERIFIED, account: { email: "owner@example.test", token: "secret" } };
    verify.mockResolvedValueOnce(accountLeak);
    await expect(caller.connection.verifyAuth({ connectionId })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  } finally {
    verify.mockRestore();
  }
});

test("the SDK account projection drops a field the SDK adds rather than losing the whole account", () => {
  expect(verifyAuthAccountSchema.parse({ email: "owner@example.test", seatTier: "team" })).toEqual({ email: "owner@example.test" });
});
