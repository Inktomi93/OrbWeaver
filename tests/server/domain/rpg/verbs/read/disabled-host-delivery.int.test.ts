// A member's game reads judge the room host's chat connection only while that host consents: a disabled host stands as
// a departed one, so the reads answer the hostless verdict and never resolve the host's connection, even on a cold
// model catalog. Re-enabling the host reads the connection again.
// @subject packages/server/src/domain/rpg/verbs/read/get-game.ts
// @subject packages/server/src/domain/rpg/verbs/read/get-tracker-view.ts

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { ChatId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { AuthModeRoot, SignedIn } from "@orb/testkit/node/auth";
import { createAuthModeRoot, mintMember, signIn } from "@orb/testkit/node/auth";
import { seedChat, seedChatInvite, seedInvitedChatParticipant, servePhysicalPeer } from "@orb/testkit/node/composed";
import { z } from "zod";

const ENGINE_PROVIDER = "vllm";
const ENGINE_MODEL = "room-model";
const GAME_READS = ["/api/trpc/rpg.getGame", "/api/trpc/rpg.getTrackerView"] as const;
const answerSchema = z.strictObject({ result: z.strictObject({ data: z.looseObject({}) }) });

interface GameRoom extends AsyncDisposable {
  readonly root: AuthModeRoot;
  readonly room: ChatId;
  readonly asPlayer: SignedIn;
  /** Every path the host's endpoint has been asked for. */
  readonly dialled: readonly string[];
  readonly setHostEnabled: (enabled: boolean) => Promise<unknown>;
}

/** A local-mode game room hosted by a second account whose chat role is bound to a loopback engine, with a third seated. */
async function gameRoom(): Promise<GameRoom> {
  const dialled: string[] = [];
  const answer = (request: Request): Promise<Response> => {
    dialled.push(new URL(request.url).pathname);
    return Promise.resolve(Response.json({ object: "list", data: [{ id: ENGINE_MODEL, object: "model" }] }));
  };
  await using construction = new AsyncDisposableStack();
  const engineOrigin = construction.use(await servePhysicalPeer(answer)).origin;
  const root = construction.use(await createAuthModeRoot("local", { providerFetch: fetch }));
  const admin = await root.principalFor(root.ownerId);
  const host = await mintMember(root);
  const player = await mintMember(root);
  const hostPrincipal = await root.principalFor(host.userId);
  const playerPrincipal = await root.principalFor(player.userId);
  // A multi-user install admits no private endpoint until its admin names one.
  await root.services.settings.updateAppSettings({ principal: admin, partial: { privateEndpointAllowlist: [new URL(engineOrigin).host] } });
  const row = await root.services.connection.create({
    principal: hostPrincipal,
    providerId: ENGINE_PROVIDER,
    credentialId: null,
    baseUrl: `${engineOrigin}/v1`,
    model: ENGINE_MODEL,
    modelCheck: "unchecked",
    allowBackground: true,
  });
  await root.services.connection.setBinding({ principal: hostPrincipal, task: "chat", connectionId: row.id });
  const room = (await seedChat(root, { principal: hostPrincipal, characterIds: [] })).view.chat.id;
  await root.services.rpg.createGame({ principal: hostPrincipal, chatId: room, mode: "lite" });
  const invite = await seedChatInvite(root, { principal: hostPrincipal, chatId: room, input: { invitedHandle: player.handle } });
  await seedInvitedChatParticipant(root, { principal: playerPrincipal, inviteId: invite.invite.id });
  const asPlayer = await signIn(root, player);
  const lifetime = construction.move();
  return {
    root,
    room,
    asPlayer,
    dialled,
    setHostEnabled: (enabled) => root.services.admin.setEnabled({ principal: admin, userId: host.userId, enabled }),
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

/** One member read over the wire. The connection was made unchecked, so its model catalog stays cold until a resolve lists it. */
async function memberRead(box: GameRoom, route: (typeof GAME_READS)[number]): Promise<z.infer<typeof answerSchema>> {
  const response = await box.root.http.request(route, {
    method: "POST",
    headers: { ...box.asPlayer.headers, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify({ chatId: box.room }),
  });
  return answerSchema.parse(await response.json());
}

test.for(GAME_READS)("a member's %s in a disabled host's room answers without resolving the host's connection", async (route) => {
  await using box = await gameRoom();
  const { dialled } = box;

  await box.setHostEnabled(false);
  const beforeDisabled = dialled.length;
  const withheld = await memberRead(box, route);
  expect(dialled).toHaveLength(beforeDisabled);

  // Control: once the host is enabled again, the same cold read lists the host's models.
  await box.setHostEnabled(true);
  const beforeEnabled = dialled.length;
  const consenting = await memberRead(box, route);
  expect(dialled.length).toBeGreaterThan(beforeEnabled);
  expect(withheld.result.data).toMatchObject(route === GAME_READS[0] ? { canPopulate: false } : { trackersReadOnly: true });
  expect(Object.keys(consenting.result.data).toSorted()).toEqual(Object.keys(withheld.result.data).toSorted());
});
