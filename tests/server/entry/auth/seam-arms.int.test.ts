// D40/D135: the seam's cookie, owner-fallback and SSO-header arms over the real HTTP graph and real credentials.
// @subject packages/server/src/entry/auth/seam.ts
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { isOwner } from "@orb/server/domain/admin";
import type { SessionsRolePolicyConfig } from "@orb/server/domain/sessions";
import { authConfigFromEnv, createAuthSeam } from "@orb/server/entry/auth";
import { env } from "@orb/server/foundation/env";
import { expect, test } from "@orb/testkit/node";
import type { ServerHarnessOptions, ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, damageOwnerRow, readAccounts } from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { authMe, claimedOwnerCookie, debugStatus, FORWARD_USERNAME_CLAIM, policy, signedForwardRoot, signedInMember, wireViewer } from "../_auth-roots.ts";

const LOOPBACK = "127.0.0.1";
const LAN_PEER = "192.168.1.27";
const PROXY_PEER = "10.1.2.3";
const PUBLIC_PEER = "203.0.113.9";
const TRUSTED_PROXIES = ["10.0.0.0/8"];
/** Verification's placeholder handle; the owner policy below deliberately differs from it (the D135 shape). */
const PLACEHOLDER_HANDLE = castId<Handle>("owner");
const REAL_OWNER_HANDLE = "owner@example.test";
const FORWARD_USER_HEADER = "x-forwarded-user";
const FORWARD_GROUPS_HEADER = "x-forwarded-groups";
const ADMIN_GROUP = "orb-admins";
const RELAY_HOST = "calm-river-four-birds.trycloudflare.com";
const BUNDLE_ROUTE = "/api/import/bundle";
const PRUNE_ROUTE = "/api/trpc/tag.pruneUnusedTags";
const ANONYMOUS = { authenticated: false, handle: null, role: null };

type Root = Pick<ServerTestHarness, "http">;

function single(options: Omit<ServerHarnessOptions, "authConfig"> & { readonly defaultHandle?: Handle } = {}): Promise<ServerTestHarness> {
  const { defaultHandle, rolePolicyConfig, ...rest } = options;
  return createServerHarness({
    physicalPeer: () => LOOPBACK,
    ...rest,
    env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" },
    rolePolicyConfig: { ...rolePolicyConfig, ...(defaultHandle === undefined ? {} : { ["DEFAULT_USER_HANDLE"]: defaultHandle }) },
  });
}

function local(peer: () => string = () => LOOPBACK): Promise<ServerTestHarness> {
  return createServerHarness({ physicalPeer: peer, env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" } });
}

function forward(peer: () => string, rolePolicyConfig: SessionsRolePolicyConfig = env): Promise<ServerTestHarness> {
  return createServerHarness({
    physicalPeer: peer,
    rolePolicyConfig,
    env: {
      ["FORWARD_AUTH_TRUSTED_PROXIES"]: TRUSTED_PROXIES.join(","),
      ["AUTH_MODE"]: "forward-header",
      ["AUTH_FALLBACK"]: "owner",
      ["FORWARD_AUTH_USER_HEADER"]: FORWARD_USER_HEADER,
      ["FORWARD_AUTH_GROUPS_HEADER"]: FORWARD_GROUPS_HEADER,
    },
  });
}

/** The fallback arm's CSRF signature: exempt on the tRPC JSON mount, refused on CORS-simple byte ingest. A cookie
 *  principal is refused on the mount, and a header principal is admitted on the ingest. */
async function csrfSignature(root: Root): Promise<{ readonly trpcMutation: number; readonly byteIngest: number }> {
  const mutation = await root.http.request(PRUNE_ROUTE, { method: "POST", headers: { "content-type": "application/json" }, body: "null" });
  const ingest = await root.http.request(BUNDLE_ROUTE, { method: "POST", body: new Uint8Array([1]) });
  await Promise.all([mutation.arrayBuffer(), ingest.arrayBuffer()]);
  return { trpcMutation: mutation.status, byteIngest: ingest.status };
}

test("single-user fallback resolves the OWNER's row (role read, not stamped; via=fallback)", async () => {
  await using root = await single();
  const owner = await root.principalFor(root.ownerId);
  expect(await authMe(root)).toEqual({ authenticated: true, handle: owner.handle, role: "owner" });
  expect(await wireViewer(root)).toEqual({ userId: root.ownerId, handle: owner.handle, globalRole: "owner" });
  expect(await csrfSignature(root)).toEqual({ trpcMutation: 200, byteIngest: 403 });
  expect((await readAccounts(root)).map(({ id }) => ({ id }))).toEqual([{ id: root.ownerId }]);
});

test("#298 f2: a NON-loopback peer is DENIED the owner fallback → null (was owner on any Host)", async () => {
  await using root = await single({ physicalPeer: () => LAN_PEER });
  const ensure = vi.spyOn(root.app.sessions, "ensureUser");
  expect(await authMe(root, { host: LOOPBACK })).toEqual(ANONYMOUS);
  expect(ensure).not.toHaveBeenCalled();
});

test("D135: the fallback Principal and the frozen-host Principal AGREE about the same caller", async () => {
  await using root = await single({ defaultHandle: PLACEHOLDER_HANDLE, rolePolicyConfig: policy({ ["OWNER_HANDLES"]: REAL_OWNER_HANDLE }) });
  const request = await wireViewer(root);
  expect(request).toEqual(await (await root.internalCallerFor(root.ownerId)).sessions.me());
  expect(request.globalRole).toBe("owner");
  // The wire projection drops externalId and via, so the Principals themselves are compared too.
  const seam = createAuthSeam({
    emitUserEvent: root.app.liveBuses.user.publishUserEvent,
    sessions: root.app.sessions,
    config: authConfigFromEnv(root.env),
  });
  const { principal } = await seam.resolvePrincipal(new Headers(), { peerIp: LOOPBACK, transport: "http" });
  expect(principal).toEqual(await root.principalFor(request.userId));
  expect(principal === null ? null : isOwner(principal)).toBe(true);
});

test("D135: the fallback lands on the OWNER_HANDLES row and mints NO second-class twin", async () => {
  await using root = await single({ defaultHandle: PLACEHOLDER_HANDLE, rolePolicyConfig: policy({ ["OWNER_HANDLES"]: REAL_OWNER_HANDLE }) });
  const ensure = vi.spyOn(root.app.sessions, "ensureUser");
  expect((await authMe(root)).handle).toBe(REAL_OWNER_HANDLE);
  expect(ensure.mock.calls).toEqual([[REAL_OWNER_HANDLE]]);
  expect((await readAccounts(root)).map(({ id, handle }) => ({ id, handle }))).toEqual([{ id: root.ownerId, handle: REAL_OWNER_HANDLE }]);
});

test("D135: an owner row demoted below owner is REPORTED, not overridden (the fallback never grants)", async () => {
  await using root = await single({ rolePolicyConfig: policy({ ["OWNER_HANDLES"]: REAL_OWNER_HANDLE }) });
  await damageOwnerRow(root, { role: "user" });
  expect(await authMe(root)).toEqual({ authenticated: true, handle: REAL_OWNER_HANDLE, role: "user" });
  expect((await wireViewer(root)).globalRole).toBe("user");
});

test("the empty-owner-handles guard is LOAD-BEARING: OWNER_HANDLES=',,' still resolves a handle", async () => {
  // An unseeded owner id: the fallback's own ensure births the row, so its role is the policy's verdict.
  await using root = await single({
    defaultHandle: PLACEHOLDER_HANDLE,
    rolePolicyConfig: policy({ ["OWNER_HANDLES"]: ",," }),
    ownerId: castId<UserId>("seam-arms-unseeded-owner"),
  });
  expect(root.app.sessions.rolePolicy.ownerHandles()).toEqual([]);
  const ensure = vi.spyOn(root.app.sessions, "ensureUser");
  // D135: with no owner policy the row the arm lands on is honestly `user`; the fallback admits, it does not grant.
  expect(await authMe(root)).toEqual({ authenticated: true, handle: PLACEHOLDER_HANDLE, role: "user" });
  expect(ensure.mock.calls).toEqual([[PLACEHOLDER_HANDLE]]);
  expect((await wireViewer(root)).globalRole).toBe("user");
});

test("a valid cookie resolves DIRECTLY via sessions.validate (userId carried, role re-read)", async () => {
  await using root = await local();
  const member = await signedInMember(root, castId<Handle>("alice"));
  const ensure = vi.spyOn(root.app.sessions, "ensureUser");
  const provision = vi.spyOn(root.app.sessions, "provisionIdentity");
  expect(await wireViewer(root, { cookie: member.cookie })).toEqual({ userId: member.id, handle: "alice", globalRole: "user" });
  await root.services.admin.setRole({ principal: await root.principalFor(root.ownerId), userId: member.id, role: "admin" });
  expect(await wireViewer(root, { cookie: member.cookie })).toEqual({ userId: member.id, handle: "alice", globalRole: "admin" });
  expect(ensure).not.toHaveBeenCalled();
  expect(provision).not.toHaveBeenCalled();
});

test("an invalid cookie under fallback=deny is unauthenticated (null), not the owner", async () => {
  await using root = await local();
  const member = await signedInMember(root, castId<Handle>("stale-cookie"));
  expect((await authMe(root, { cookie: member.cookie })).authenticated).toBe(true);
  const [name] = member.cookie.split("=");
  expect(await authMe(root, { cookie: `${name ?? ""}=stale` })).toEqual(ANONYMOUS);
});

test("an https request ignores a planted insecure-name cookie; the same cookie authenticates over http", async () => {
  let peer = LAN_PEER;
  await using root = await local(() => peer);
  const planted = await signedInMember(root, castId<Handle>("planted-name"));
  expect(planted.cookie).toMatch(/^orb_session_insecure=/u);
  const validate = vi.spyOn(root.app.sessions, "validate");
  peer = PROXY_PEER;
  expect(await authMe(root, { cookie: planted.cookie, "x-forwarded-proto": "https" })).toEqual(ANONYMOUS);
  expect(validate).not.toHaveBeenCalled();
  peer = LAN_PEER;
  expect(await authMe(root, { cookie: planted.cookie })).toEqual({ authenticated: true, handle: "planted-name", role: "user" });
  expect(validate).toHaveBeenCalledOnce();
});

test("an http request never reads the __Host- cookie", async () => {
  let peer = PROXY_PEER;
  await using root = await local(() => peer);
  const secure = await signedInMember(root, castId<Handle>("secure-only"), { "x-forwarded-proto": "https" });
  expect(secure.cookie).toMatch(/^__Host-orb_session=/u);
  const validate = vi.spyOn(root.app.sessions, "validate");
  peer = LAN_PEER;
  expect(await authMe(root, { cookie: secure.cookie })).toEqual(ANONYMOUS);
  expect(validate).not.toHaveBeenCalled();
  peer = PROXY_PEER;
  expect((await authMe(root, { cookie: secure.cookie, "x-forwarded-proto": "https" })).handle).toBe("secure-only");
});

test("a stale cookie is IGNORED outside cookie modes (forward-header never calls validate)", async () => {
  await using root = await forward(() => PROXY_PEER);
  const validate = vi.spyOn(root.app.sessions, "validate");
  const me = await wireViewer(root, { cookie: "__Host-orb_session=leftover; orb_session_insecure=leftover", [FORWARD_USER_HEADER]: "bob" });
  expect(me).toMatchObject({ handle: "bob", globalRole: "user" });
  expect(me.userId).not.toBe(root.ownerId);
  expect(validate).not.toHaveBeenCalled();
});

test("an SSO header upserts via provisionIdentity and carries the resolved role", async () => {
  await using root = await forward(() => PROXY_PEER, policy({ ["OIDC_ADMIN_GROUPS"]: ADMIN_GROUP }));
  const provision = vi.spyOn(root.app.sessions, "provisionIdentity");
  expect(await authMe(root, { [FORWARD_USER_HEADER]: "carol", [FORWARD_GROUPS_HEADER]: ADMIN_GROUP })).toEqual({
    authenticated: true,
    handle: "carol",
    role: "admin",
  });
  // The unsigned header path carries no subject, so the upserted row holds none.
  expect(provision.mock.calls.map(([identity]) => identity.externalId)).toEqual([null]);
  expect((await readAccounts(root)).filter(({ handle }) => handle === castId<Handle>("carol")).map(({ externalId }) => ({ externalId }))).toEqual([
    { externalId: null },
  ]);
});

test("B1 anti-spoof: an SSO header from an UNTRUSTED peer is rejected even with a forged trusted XFF", async () => {
  await using root = await forward(() => PUBLIC_PEER);
  const provision = vi.spyOn(root.app.sessions, "provisionIdentity");
  expect(await authMe(root, { [FORWARD_USER_HEADER]: "spoofed-owner", "x-forwarded-for": PROXY_PEER })).toEqual(ANONYMOUS);
  expect(provision).not.toHaveBeenCalled();
  expect((await readAccounts(root)).filter(({ handle }) => handle === castId<Handle>("spoofed-owner"))).toEqual([]);
});

// A relay cannot start in forward-header mode, so its registry is bound here exactly as the root binds it at boot.
test("the seam hands its relay registry to the header path: an SSO header on a relay Host from a trusted loopback peer is refused", async () => {
  await using root = await createServerHarness();
  const config = {
    ...authConfigFromEnv(root.env),
    mode: "forward-header" as const,
    fallback: "deny" as const,
    forwardUserHeader: FORWARD_USER_HEADER,
    forwardTrustedProxies: ["127.0.0.1/32"],
  };
  const seam = createAuthSeam({ emitUserEvent: root.app.liveBuses.user.publishUserEvent, sessions: root.app.sessions, config, relayHosts: () => [RELAY_HOST] });
  const loopback = { peerIp: LOOPBACK, transport: "http" as const };
  const direct = await seam.resolvePrincipal(new Headers({ host: "localhost", [FORWARD_USER_HEADER]: "relay-control" }), loopback);
  expect(direct.principal?.handle).toBe("relay-control");
  const provision = vi.spyOn(root.app.sessions, "provisionIdentity");
  const relayed = await seam.resolvePrincipal(new Headers({ host: RELAY_HOST, [FORWARD_USER_HEADER]: "relay-visitor" }), loopback);
  expect(relayed.principal).toBeNull();
  expect(provision).not.toHaveBeenCalled();
});

test("a disabled SSO row is gated to null (disable takes effect next request, not JWT-baked)", async () => {
  await using root = await forward(() => PROXY_PEER);
  expect((await authMe(root, { [FORWARD_USER_HEADER]: "dave" })).authenticated).toBe(true);
  const dave = (await readAccounts(root)).find(({ handle }) => handle === castId<Handle>("dave"));
  if (dave === undefined) {
    throw new Error("the header arm provisioned no row for dave");
  }
  await root.services.admin.setEnabled({ principal: await root.principalFor(root.ownerId), userId: dave.id, enabled: false });
  expect(await authMe(root, { [FORWARD_USER_HEADER]: "dave" })).toEqual(ANONYMOUS);
});

test("the CSRF header presence is surfaced as a signal (the ladder gates, not the seam)", async () => {
  await using root = await single();
  const withHeader = await root.http.request(BUNDLE_ROUTE, { method: "POST", headers: { [CSRF_HEADER]: "1" } });
  const without = await root.http.request(BUNDLE_ROUTE, { method: "POST" });
  await Promise.all([withHeader.arrayBuffer(), without.arrayBuffer()]);
  expect({ withHeader: withHeader.status, without: without.status }).toEqual({ withHeader: 400, without: 403 });
});

test("debugGateAdmits requires a CREDENTIAL as well as the OWNER role", async () => {
  await using root = await single();
  // Production binds the posture from the launch env; a seam bound without it is the strict arm.
  const strict = createAuthSeam({
    emitUserEvent: root.app.liveBuses.user.publishUserEvent,
    sessions: root.app.sessions,
    config: { ...authConfigFromEnv(root.env), mode: "single-user", fallback: "owner" },
  });
  const owner = (await strict.resolvePrincipal(new Headers(), { peerIp: LOOPBACK, transport: "http" })).principal;
  expect(owner === null ? null : isOwner(owner)).toBe(true);
  expect(strict.debugGateAdmits(owner, new Headers())).toBe(false);
  // This process launched on a non-production posture, so the composed root opens the door to the same caller.
  expect(await debugStatus(root)).toBe(200);
  for (const role of ["user", "admin"] as const) {
    await damageOwnerRow(root, { role });
    expect((await authMe(root)).role).toBe(role);
    expect(await debugStatus(root), role).toBe(404);
  }
  await using box = await local();
  expect(await debugStatus(box, { cookie: await claimedOwnerCookie(box) })).toBe(200);
  const admin = await signedInMember(box, castId<Handle>("debug-admin"));
  await box.services.admin.setRole({ principal: await box.principalFor(box.ownerId), userId: admin.id, role: "admin" });
  expect(await debugStatus(box, { cookie: admin.cookie })).toBe(404);
  expect(await debugStatus(box, { cookie: (await signedInMember(box, castId<Handle>("debug-user"))).cookie })).toBe(404);
  expect(await debugStatus(box)).toBe(404);
});

test("debugGateAdmits takes a VERIFIED SSO identity, never a proxy-asserted one", async () => {
  await using root = await createServerHarness({
    physicalPeer: () => LOOPBACK,
    env: { ["AUTH_MODE"]: "forward-header", ["AUTH_FALLBACK"]: "deny", ["FORWARD_AUTH_TRUSTED_PROXIES"]: "127.0.0.1/32" },
  });
  const ownerHandle = (await root.principalFor(root.ownerId)).handle;
  const unsigned = { "remote-user": ownerHandle };
  expect(await authMe(root, unsigned)).toEqual({ authenticated: true, handle: ownerHandle, role: "owner" });
  expect(await debugStatus(root, unsigned)).toBe(404);

  const signed = await signedForwardRoot(policy({ ["OIDC_ADMIN_GROUPS"]: ADMIN_GROUP }));
  await using signedRoot = signed.root;
  const owner = await signed.signedHeaders({ [FORWARD_USERNAME_CLAIM]: (await signedRoot.principalFor(signedRoot.ownerId)).handle, sub: "seam-arms-owner" });
  expect((await authMe(signedRoot, owner)).role).toBe("owner");
  expect(await debugStatus(signedRoot, owner)).toBe(200);
  const admin = await signed.signedHeaders({ [FORWARD_USERNAME_CLAIM]: "seam-arms-sso-admin", sub: "seam-arms-admin", groups: [ADMIN_GROUP] });
  expect((await authMe(signedRoot, admin)).role).toBe("admin");
  expect(await debugStatus(signedRoot, admin)).toBe(404);
});

test("createHostPrincipalResolver mints the host Principal from the LIVE row (real role carried)", async () => {
  await using root = await single();
  const host = await root.principalFor(root.ownerId);
  expect(isOwner(host)).toBe(true);
  expect(host).toMatchObject({ userId: root.ownerId, externalId: null, via: "fallback" });
  expect(host.handle).toBe((await authMe(root)).handle);
});

test("createHostPrincipalResolver degrades an unknown id to role=user (fail-closed for privileged gates)", async () => {
  await using root = await single();
  const unknown = castId<UserId>("seam-arms-no-such-row");
  const principal = await root.principalFor(unknown);
  expect(isOwner(principal)).toBe(false);
  expect(principal).toMatchObject({ userId: unknown, handle: unknown });
  expect(await (await root.internalCallerFor(unknown)).sessions.me()).toEqual({ userId: unknown, handle: unknown, globalRole: "user" });
});

test("D135: a DISABLED owner row is refused by the fallback arm (parity with cookie + SSO)", async () => {
  await using root = await single({ rolePolicyConfig: policy({ ["OWNER_HANDLES"]: REAL_OWNER_HANDLE }) });
  expect(await debugStatus(root)).toBe(200);
  await damageOwnerRow(root, { enabled: false });
  expect(await authMe(root)).toEqual(ANONYMOUS);
  // The operator posture's credential arm collapses with it: a disabled row never becomes a principal to admit.
  expect(await debugStatus(root)).toBe(404);
});

test("D135: the frozen-host bridge still resolves a DISABLED row (the gate is the CALLER's)", async () => {
  await using root = await single();
  await damageOwnerRow(root, { enabled: false });
  expect(isOwner(await root.principalFor(root.ownerId))).toBe(true);
  expect((await (await root.internalCallerFor(root.ownerId)).sessions.me()).globalRole).toBe("owner");
});

test("D135: an ENABLED fallback caller still deep-equals the frozen-host Principal (the agreement holds)", async () => {
  await using root = await single({ defaultHandle: PLACEHOLDER_HANDLE, rolePolicyConfig: policy({ ["OWNER_HANDLES"]: REAL_OWNER_HANDLE }) });
  expect(await wireViewer(root)).toEqual(await (await root.internalCallerFor(root.ownerId)).sessions.me());
});
