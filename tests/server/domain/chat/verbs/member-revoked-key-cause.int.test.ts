// A member's send-availability read in a room whose host's chat key is revoked: the wire carries one cause for every
// revocation reason, so a member never learns whether the host's key was rejected, unreachable or revoked by the host.
// The host's own read of the same room carries its reason's cause.
// @subject packages/server/src/domain/chat/verbs/read.ts

import type { CredentialHealth, CredRevokedReason } from "@orb/contracts/credentials";
import { CRED_REVOKED_REASONS } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { UnavailableCause } from "@orb/contracts/inference";
import type { ChatId, UserCredentialId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { AuthModeRoot, SignedIn } from "@orb/testkit/node/auth";
import { createAuthModeRoot, mintMember, signIn } from "@orb/testkit/node/auth";
import { seedChat, seedChatInvite, seedInvitedChatParticipant } from "@orb/testkit/node/composed";
import { SECRET_BOX_TEST_KEY } from "@orb/testkit/node/helpers";
import { z } from "zod";

const AVAILABILITY_ROUTE = "/api/trpc/chat.checkSendAvailability";
// Past the probe throttle window, so each recorded failure is its own probe.
const PROBE_GAP_MS = 2 * 60_000;
// Far past any strike limit: the loop stops at the first probe that revokes.
const STRIKES_MAX = 10;
// Well past the window in which availability reads share one endpoint verdict, so every read below asks afresh.
const PAST_SHARED_VERDICT_MS = 60_000;

// The one cause a member reads for any revocation of the host's key: the contract this case pins.
const MEMBER_CAUSE: UnavailableCause = "key-rejected";
// The cause the host reads for its own key, one per stored reason.
const HOST_CAUSES: Record<CredRevokedReason, UnavailableCause> = {
  ["auth_failed"]: "key-rejected",
  unreachable: "key-revoked-unreachable",
  user: "key-revoked-by-user",
};

// Each reason through the production path that writes it, under the key's owner.
const REVOKE: Record<CredRevokedReason, (root: AuthModeRoot, principal: Principal, credentialId: UserCredentialId) => Promise<void>> = {
  ["auth_failed"]: async (root, principal, credentialId) => {
    const result = { status: "revoked", checkedAt: 0, reason: "scripted provider rejection" } satisfies CredentialHealth;
    await root.services.credentials.recordProbeOutcome({ principal, credentialId, localEndpoint: false, result });
  },
  unreachable: async (root, principal, credentialId) => {
    const result = { status: "unreachable", checkedAt: 0, reason: "scripted remote transport failure" } satisfies CredentialHealth;
    for (let strike = 0; strike < STRIKES_MAX; strike += 1) {
      if ((await root.services.credentials.recordProbeOutcome({ principal, credentialId, localEndpoint: false, result })).status === "revoked") {
        return;
      }
      root.clock.advance(PROBE_GAP_MS);
    }
    throw new Error("the remote failure streak never revoked the key");
  },
  user: async (root, principal, credentialId) => {
    await root.services.credentials.markRevokedByUser({ principal, credentialId });
  },
};

const answerSchema = z.strictObject({ result: z.strictObject({ data: z.unknown() }) });

async function readAvailability(root: AuthModeRoot, who: SignedIn, chatId: ChatId): Promise<unknown> {
  root.timers.advance(PAST_SHARED_VERDICT_MS);
  const response = await root.http.request(AVAILABILITY_ROUTE, {
    method: "POST",
    headers: { ...who.headers, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify({ chatId }),
  });
  return answerSchema.parse(await response.json()).result.data;
}

test.for(CRED_REVOKED_REASONS)("a member reads the host's key revoked for %s as the one member cause, and the host reads its own", async (reason) => {
  await using root = await createAuthModeRoot("local", {
    secretBoxKey: SECRET_BOX_TEST_KEY,
    providerFetch: () => Promise.reject(new Error("no provider is dialled by an availability read")),
  });
  const host = await mintMember(root);
  const player = await mintMember(root);
  const hostPrincipal = await root.principalFor(host.userId);
  const playerPrincipal = await root.principalFor(player.userId);
  const key = await root.services.credentials.add({ principal: hostPrincipal, provider: "openai", key: "sk-host-fixture-key-000000000000" });
  const row = await root.services.connection.create({
    principal: hostPrincipal,
    providerId: "openai",
    credentialId: key.id,
    baseUrl: null,
    model: "gpt-5-mini",
  });
  await root.services.connection.setBinding({ principal: hostPrincipal, task: "chat", connectionId: row.id });
  const room = (await seedChat(root, { principal: hostPrincipal, characterIds: [] })).view.chat.id;
  const invite = await seedChatInvite(root, { principal: hostPrincipal, chatId: room, input: { invitedHandle: player.handle } });
  await seedInvitedChatParticipant(root, { principal: playerPrincipal, inviteId: invite.invite.id });
  await REVOKE[reason](root, hostPrincipal, key.id);

  expect(await readAvailability(root, await signIn(root, player), room)).toEqual({ available: false, cause: MEMBER_CAUSE });
  expect(await readAvailability(root, await signIn(root, host), room)).toEqual({ available: false, cause: HOST_CAUSES[reason] });
});
