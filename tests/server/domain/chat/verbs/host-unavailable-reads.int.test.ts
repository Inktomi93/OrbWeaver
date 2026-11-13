// A member's composer reads in a room whose host is disabled: the send-availability read answers unavailable with the
// host-unavailable cause, the next-turn connection read describes no binding, and none of them reads the disabled
// host's connection. A stranger and an unknown room read the same plain not found, with no cause, on those two reads
// and on the context-fit read. Re-enabling the host restores the endpoint's verdict.
// @subject packages/server/src/domain/chat/verbs/read.ts

import { TURN_HOST_UNAVAILABLE_OP_CODE } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { AuthModeRoot, SignedIn } from "@orb/testkit/node/auth";
import { createAuthModeRoot, mintMember, signIn } from "@orb/testkit/node/auth";
import { seedChat, seedChatInvite, seedInvitedChatParticipant, servePhysicalPeer } from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { z } from "zod";

const ENGINE_PROVIDER = "vllm";
const ENGINE_MODEL = "room-model";
const AVAILABILITY_ROUTE = "/api/trpc/chat.checkSendAvailability";
const CONTEXT_FIT_ROUTE = "/api/trpc/chat.previewContextFit";
const NEXT_TURN_ROUTE = "/api/trpc/chat.getNextTurnConnection";
const answerSchema = z.union([
  z.strictObject({ result: z.strictObject({ data: z.unknown() }) }),
  z.strictObject({ error: z.looseObject({ message: z.string(), data: z.looseObject({ code: z.string(), reason: z.string().optional() }) }) }),
]);

// Well past the window in which availability reads share one endpoint verdict, so every read below asks afresh.
const PAST_SHARED_VERDICT_MS = 60_000;

type WireAnswer = z.infer<typeof answerSchema>;

async function readOverWire(root: AuthModeRoot, who: SignedIn, route: string, chatId: ChatId): Promise<WireAnswer> {
  root.timers.advance(PAST_SHARED_VERDICT_MS);
  const response = await root.http.request(route, {
    method: "POST",
    headers: { ...who.headers, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify({ chatId }),
  });
  return answerSchema.parse(await response.json());
}

interface DisabledHostRoom extends AsyncDisposable {
  readonly root: AuthModeRoot;
  readonly room: ChatId;
  readonly asPlayer: SignedIn;
  /** Every path the host's endpoint has been asked for. */
  readonly dialled: readonly string[];
  readonly setHostEnabled: (enabled: boolean) => Promise<unknown>;
}

/** A local-mode room hosted by a second account whose chat role is bound to a loopback engine, with a third seated. */
async function disabledHostRoom(): Promise<DisabledHostRoom> {
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
    modelCheck: "listed",
    allowBackground: true,
  });
  await root.services.connection.setBinding({ principal: hostPrincipal, task: "chat", connectionId: row.id });
  const room = (await seedChat(root, { principal: hostPrincipal, characterIds: [] })).view.chat.id;
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

test("a member's send-availability read names the unavailable host without dialling its endpoint, and reads the endpoint again once re-enabled", async () => {
  await using box = await disabledHostRoom();
  const { root, room, asPlayer, dialled } = box;

  // Positive control: an enabled host's endpoint answers the member's read.
  const beforeRead = dialled.length;
  expect(await readOverWire(root, asPlayer, AVAILABILITY_ROUTE, room)).toEqual({ result: { data: { available: true } } });
  expect(dialled.length).toBeGreaterThan(beforeRead);

  await box.setHostEnabled(false);
  const beforeDisabled = dialled.length;
  expect(await readOverWire(root, asPlayer, AVAILABILITY_ROUTE, room)).toEqual({
    result: { data: { available: false, cause: TURN_HOST_UNAVAILABLE_OP_CODE } },
  });
  expect(dialled).toHaveLength(beforeDisabled);

  await box.setHostEnabled(true);
  const beforeResume = dialled.length;
  expect(await readOverWire(root, asPlayer, AVAILABILITY_ROUTE, room)).toEqual({ result: { data: { available: true } } });
  expect(dialled.length).toBeGreaterThan(beforeResume);
});

const STRANGER_READS = [
  { route: AVAILABILITY_ROUTE, hostDisabled: true },
  { route: NEXT_TURN_ROUTE, hostDisabled: true },
  // The context-fit read answers not found to a disabled host's own members, so only an enabled host's room tells its
  // seat check from its consent check: without the seat check the stranger would be answered.
  { route: CONTEXT_FIT_ROUTE, hostDisabled: false },
] as const;

test.for(STRANGER_READS)("a stranger's $route read reads exactly as an unknown room does", async ({ route, hostDisabled }) => {
  await using box = await disabledHostRoom();
  const { root, room, dialled } = box;
  if (hostDisabled) {
    await box.setHostEnabled(false);
  }
  const asStranger = await signIn(root, await mintMember(root));
  const unknown = root.idSource.typeId(ID_PREFIX.chat);

  const beforeReads = dialled.length;
  const stranger = await readOverWire(root, asStranger, route, room);
  const missing = await readOverWire(root, asStranger, route, unknown);
  if ("result" in stranger || "result" in missing) {
    throw new Error(`a stranger's read answered ${JSON.stringify(stranger)} and an unknown room's ${JSON.stringify(missing)}`);
  }
  expect(stranger.error.data.code).toBe("NOT_FOUND");
  expect(stranger.error.data.reason).toBeUndefined();
  expect(stranger.error.data).toEqual({ ...missing.error.data });
  expect(stranger.error.message.replace(room, unknown)).toBe(missing.error.message);
  expect(dialled).toHaveLength(beforeReads);
  // Positive control: the same room, read by its member, answers.
  expect(await readOverWire(root, box.asPlayer, route, room)).toMatchObject({ result: { data: expect.any(Object) } });
});

test("a member's next-turn connection read in a disabled host's room describes no binding and reads none", async () => {
  await using box = await disabledHostRoom();
  const { root, room, asPlayer } = box;
  const bindingReads = vi.spyOn(root.services.connection, "getBoundConnection");
  try {
    // Positive control: an enabled host's binding is read and described, its own label withheld from a member.
    const configured = await readOverWire(root, asPlayer, NEXT_TURN_ROUTE, room);
    expect(configured).toMatchObject({ result: { data: { state: "configured", connectionLabel: null, providerLabel: expect.any(String) } } });
    expect(bindingReads).toHaveBeenCalledTimes(1);

    await box.setHostEnabled(false);
    expect(await readOverWire(root, asPlayer, NEXT_TURN_ROUTE, room)).toEqual({ result: { data: { state: "unset" } } });
    expect(bindingReads).toHaveBeenCalledTimes(1);

    await box.setHostEnabled(true);
    expect(await readOverWire(root, asPlayer, NEXT_TURN_ROUTE, room)).toEqual(configured);
    expect(bindingReads).toHaveBeenCalledTimes(2);
  } finally {
    bindingReads.mockRestore();
  }
});

test("a member's context-fit read in a disabled host's room refuses before it dials the host's endpoint", async () => {
  await using box = await disabledHostRoom();
  const { root, room, asPlayer, dialled } = box;

  // Positive control: an enabled host's fit read reaches the endpoint.
  const beforeRead = dialled.length;
  expect(await readOverWire(root, asPlayer, CONTEXT_FIT_ROUTE, room)).toMatchObject({ result: { data: { ceilingTokens: expect.any(Number) } } });
  expect(dialled.length).toBeGreaterThan(beforeRead);

  await box.setHostEnabled(false);
  const beforeDisabled = dialled.length;
  expect(await readOverWire(root, asPlayer, CONTEXT_FIT_ROUTE, room)).toMatchObject({ error: { data: { code: "NOT_FOUND" } } });
  expect(dialled).toHaveLength(beforeDisabled);
});
