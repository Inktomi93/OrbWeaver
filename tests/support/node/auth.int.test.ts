import { chatListPageSchema } from "@orb/contracts/chat";
import { AUTH_MODES } from "@orb/contracts/identity";
import type { ChatId, UserId } from "@orb/kit/ids";
import { resolveBindPosture } from "@orb/server/foundation/env";
import { z } from "zod";
import type { AuthModeRoot, SignedIn } from "./auth.ts";
import {
  AUTH_MODE_CAPABILITIES,
  beginOidcLogin,
  createAuthModeRoot,
  forEachAuthMode,
  mintMember,
  ownerSubject,
  SignInRefusal,
  signIn,
  trySignIn,
} from "./auth.ts";
import { expect, test } from "./fixtures.ts";

const OFF_BOX_PEER = "93.184.215.14";
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const REFUSED = "SignInRefusal";
const OK = 200;
const LOOPBACK_PEER = "127.0.0.1";
const VIEWER_ROUTE = "/api/trpc/sessions.me";
const FALLBACK_MODES = AUTH_MODES.filter((mode) => AUTH_MODE_CAPABILITIES[mode].ownerFallback);
const MEMBERLESS_MODES = AUTH_MODES.filter((mode) => !AUTH_MODE_CAPABILITIES[mode].members);
const listEnvelopeSchema = z.object({ result: z.object({ data: chatListPageSchema }) });

// A room enters the chat list only once claimed; starring it is a row write that claims it.
async function claimedRoom(root: AuthModeRoot, userId: UserId): Promise<ChatId> {
  const caller = await root.internalCallerFor(userId);
  const { chat } = await caller.chat.startChat({ characterIds: [], opening: "none" });
  await caller.chat.star({ chatId: chat.id, starred: true });
  return chat.id;
}

// The chat list over the mounted tRPC wire, admitted by the signed-in request headers alone.
async function wireRooms(root: AuthModeRoot, session: SignedIn): Promise<ChatId[]> {
  const address = new URL("http://localhost/api/trpc/chat.listChats");
  address.searchParams.set("input", JSON.stringify({}));
  const response = await root.http.request(address, { headers: session.headers });
  expect(response.status).toBe(200);
  return listEnvelopeSchema.parse(await response.json()).result.data.items.map((item) => item.id);
}

forEachAuthMode("the owner and an admin member sign in through the mode's login path with their roles", async ({ root, capability }) => {
  const owner = await signIn(root, await ownerSubject(root));
  expect(owner.viewer).toMatchObject({ userId: root.ownerId, globalRole: "owner" });
  const admin = await mintMember(root, { role: "admin" });
  const outcome = await trySignIn(root, admin);
  expect(outcome instanceof SignInRefusal ? outcome.name : outcome.viewer).toEqual(
    capability.members ? { userId: admin.userId, handle: admin.handle, globalRole: "admin" } : REFUSED,
  );
});

forEachAuthMode("members see only their own rooms; a mode without members refuses every second account", async ({ root, capability }) => {
  const owner = await signIn(root, await ownerSubject(root));
  const ownerRoom = await claimedRoom(root, owner.userId);
  const alice = await mintMember(root);
  const bob = await mintMember(root);
  const aliceRoom = await claimedRoom(root, alice.userId);
  const bobRoom = await claimedRoom(root, bob.userId);
  const views: (ChatId[] | string)[] = [];
  for (const member of [alice, bob]) {
    const outcome = await trySignIn(root, member);
    views.push(outcome instanceof SignInRefusal ? outcome.name : await wireRooms(root, outcome));
  }
  expect(views).toEqual(capability.members ? [[aliceRoom], [bobRoom]] : [REFUSED, REFUSED]);
  expect(await wireRooms(root, owner)).toEqual([ownerRoom]);
});

test("a wrong password or another mode's login door gets the product's refusal, while the right credential signs in", async () => {
  await using root = await createAuthModeRoot("local");
  const alice = await mintMember(root);
  expect((await signIn(root, alice)).viewer.userId).toBe(alice.userId);
  await expect(signIn(root, { ...alice, password: `${alice.password}-wrong` })).rejects.toMatchObject({ name: REFUSED, status: UNAUTHORIZED });
  await expect(beginOidcLogin(root, root.issuer, { sub: alice.subject })).rejects.toMatchObject({ name: REFUSED, status: NOT_FOUND });
});

test.for(AUTH_MODES)("an un-credentialed loopback request is the owner exactly where the capability states a fallback [%s]", async (mode) => {
  await using root = await createAuthModeRoot(mode, { physicalPeer: () => LOOPBACK_PEER });
  const response = await root.http.request(VIEWER_ROUTE);
  await response.arrayBuffer();
  expect(response.status).toBe(AUTH_MODE_CAPABILITIES[mode].ownerFallback ? OK : UNAUTHORIZED);
});

test.for(FALLBACK_MODES)("an owner-fallback mode refuses the owner from an off-box peer with the product's 401 [%s]", async (mode) => {
  await using onBox = await createAuthModeRoot(mode);
  expect((await signIn(onBox, await ownerSubject(onBox))).viewer.globalRole).toBe("owner");
  await using offBox = await createAuthModeRoot(mode, { physicalPeer: () => OFF_BOX_PEER });
  await expect(signIn(offBox, await ownerSubject(offBox))).rejects.toMatchObject({ name: REFUSED, status: UNAUTHORIZED });
});

test.for(MEMBERLESS_MODES)("a mode without members answers a member's password login as an unmounted route [%s]", async (mode) => {
  await using root = await createAuthModeRoot(mode);
  expect((await signIn(root, await ownerSubject(root))).viewer.globalRole).toBe("owner");
  await expect(signIn(root, await mintMember(root))).rejects.toMatchObject({ name: REFUSED, status: NOT_FOUND });
});

test("single-user refuses a public bind with no declared owner peers, while a login mode binds it", async () => {
  const publicBind = { bindHost: "0.0.0.0", allowPublicBind: true } as const;
  const { refusal } = resolveBindPosture({
    nodeEnv: "test",
    authMode: "single-user",
    bindHost: publicBind.bindHost,
    allowDevPublicBind: publicBind.allowPublicBind,
    ownerPeersDeclared: false,
    inContainer: false,
  });
  if (refusal === null) {
    throw new Error("the product bind rule admitted a public single-user bind with no declared owner peers");
  }
  await expect(createAuthModeRoot("single-user", publicBind)).rejects.toThrow(refusal);
  await using local = await createAuthModeRoot("local", publicBind);
  expect((await signIn(local, await ownerSubject(local))).viewer.globalRole).toBe("owner");
});
