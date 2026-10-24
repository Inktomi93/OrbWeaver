// @subject tests/support/node/corpus-seed.ts
// @subject tests/support/node/corpus-auth.ts
// @subject packages/server/src/entry/auth/seam.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { blobIconUrl, blobUrl } from "@orb/contracts/assets";
import { CSRF_HEADER, viewerViewSchema } from "@orb/contracts/identity";
import { localPath, sessions, users } from "@orb/db";

import { brandedId } from "@orb/kit/ids";
import { readSessionCookie } from "@orb/server/entry/auth";
import { createCas } from "@orb/server/infra/storage/cas";
import { eq, inArray } from "drizzle-orm";
import { createCorpusHarness, loadCorpusFixture } from "./corpus.ts";
import { captureCorpusCookieIdentity } from "./corpus-auth.ts";
import { captureCookieAuth } from "./corpus-seed.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

const PASSWORD = "native-shared-member-login-password";

test("committed media uses native cookie ownership, exact CAS bytes and native variant refusals", { tags: "slow" }, async () => {
  const source = loadCorpusFixture();
  await using root = await createCorpusHarness();
  const hash = source.wire.reads["character.list"][0]?.output.items.find((row) => row.avatarHash !== null)?.avatarHash;
  const reader = source.wire.memberIdentities?.notificationReader.viewer;
  if (hash === undefined || hash === null || reader === undefined) {
    throw new Error("The committed corpus has no native media ownership cohort");
  }
  const bytes = Buffer.from(await createCas(source.layout.assets).read(root.ownerId, hash));
  const owner = await root.principalFor(root.ownerId);
  const ownerAuth = await captureCookieAuth(root, owner, PASSWORD);
  const member = await root.principalFor(brandedId("UserId").parse(reader.userId));
  const memberAuth = await captureCookieAuth(root, member, PASSWORD);
  const request = (path: string, cookie: string): Promise<Response> => Promise.resolve(root.http.request(path, { headers: { cookie, forwarded: "" } }));
  const original = await request(blobUrl(hash), ownerAuth.cookie);
  expect(original.status).toBe(200);
  expect(original.headers.get("cache-control")).toBe("private, immutable");
  expect(original.headers.get("x-content-type-options")).toBe("nosniff");
  expect(Buffer.from(await original.arrayBuffer()).equals(bytes)).toBe(true);
  const variant = await request(blobIconUrl(hash, 64), ownerAuth.cookie);
  expect(variant.status).toBe(200);
  expect(variant.headers.get("content-type")).toBe("image/webp");
  expect((await variant.arrayBuffer()).byteLength).toBeGreaterThan(0);
  const refusals = [
    await request(blobUrl(hash), memberAuth.cookie),
    await request(blobIconUrl(hash, 64), memberAuth.cookie),
    await request(blobUrl("0".repeat(64)), ownerAuth.cookie),
    await request(`${blobUrl(hash)}?w=-1`, ownerAuth.cookie),
    await request(`${blobIconUrl(hash, 64)}&v=unsupported`, ownerAuth.cookie),
  ];
  for (const response of refusals) {
    expect(response.status).toBe(404);
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  }
  const anonymous = await request(blobUrl(hash), "");
  expect(anonymous.status).toBe(401);
  await anonymous.arrayBuffer();
  expect(Buffer.from(await createCas(source.layout.assets).read(root.ownerId, hash)).equals(bytes)).toBe(true);
});

test("corpus cookie capture provisions and admits the actual member rather than resetting only the owner", async () => {
  await using root = await createServerHarness({ env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" } });
  const member = await root.principalFor((await root.actor()).id);
  const capture = await captureCookieAuth(root, member, PASSWORD);
  expect(capture.auth.signedInMe).toEqual({ authenticated: true, handle: member.handle, role: "user" });
  expect(capture.identity.viewer).toEqual({ userId: member.userId, handle: member.handle, globalRole: "user" });
  expect(capture.identity.authMe).toEqual(capture.auth.signedInMe);
  expect(capture.identity.authConfig).toMatchObject({ mode: "local", transport: "http", clientScope: "loopback" });
  expect(await root.app.sessions.ownerNeedsPassword()).toBe(true);
  const owner = await root.principalFor(root.ownerId);
  const ownerCapture = await captureCookieAuth(root, owner, "native-owner-compatibility-password");
  expect(ownerCapture.identity.viewer).toEqual({ userId: owner.userId, handle: owner.handle, globalRole: "owner" });
  await captureCookieAuth(root, member, PASSWORD);
  expect(await captureCorpusCookieIdentity(root, ownerCapture.identity.viewer, ownerCapture.cookie)).toEqual(ownerCapture.identity);
  await expect(captureCorpusCookieIdentity(root, ownerCapture.identity.viewer, capture.cookie)).rejects.toThrow("request refused");
});

test("native cookie identity refuses cross-viewer, anonymous, malformed, disabled, revoked and expired admission", async () => {
  await using root = await createServerHarness({ env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" } });
  const member = await root.principalFor((await root.actor()).id);
  const foreign = await root.principalFor((await root.actor()).id);
  const capture = await captureCookieAuth(root, member, PASSWORD);
  expect((await captureCorpusCookieIdentity(root, capture.identity.viewer, capture.cookie)).viewer.userId).toBe(member.userId);
  await expect(captureCorpusCookieIdentity(root, await (await root.internalCallerFor(foreign.userId)).sessions.me(), capture.cookie)).rejects.toThrow(
    "does not admit the expected viewer",
  );
  await expect(captureCorpusCookieIdentity(root, capture.identity.viewer, "")).rejects.toThrow("request refused (401)");
  const token = readSessionCookie(new Headers({ cookie: capture.cookie }), "http");
  if (token === null) {
    throw new Error("native member cookie has no canonical session token");
  }
  const malformed = capture.cookie.replace(token, "%E0%A4%A");
  await expect(captureCorpusCookieIdentity(root, capture.identity.viewer, malformed)).rejects.toThrow("request refused (401)");
  const login = (password: string, csrf: boolean): Promise<Response> =>
    Promise.resolve(
      root.http.request("/api/auth/login", {
        method: "POST",
        headers: csrf ? { [CSRF_HEADER]: "1" } : {},
        body: new URLSearchParams({ handle: member.handle, password }),
      }),
    );
  const noCsrf = await login(PASSWORD, false);
  expect(noCsrf.status).toBe(403);
  expect(noCsrf.headers.getSetCookie()).toEqual([]);
  await noCsrf.arrayBuffer();
  const wrongPassword = await login("incorrect-native-member-password", true);
  expect(wrongPassword.status).toBe(401);
  expect(wrongPassword.headers.getSetCookie()).toEqual([]);
  await wrongPassword.arrayBuffer();
  const admin = await root.internalCallerFor(root.ownerId);
  await admin.admin.setEnabled({ userId: member.userId, enabled: false });
  const disabled = await login(PASSWORD, true);
  expect(disabled.status).toBe(401);
  await disabled.arrayBuffer();
  await expect(captureCorpusCookieIdentity(root, capture.identity.viewer, capture.cookie)).rejects.toThrow("request refused (401)");
  await admin.admin.setEnabled({ userId: member.userId, enabled: true });
  const fresh = await captureCookieAuth(root, member, PASSWORD);
  const logout = await root.http.request("/api/auth/logout", { method: "POST", headers: { cookie: fresh.cookie, [CSRF_HEADER]: "1" } });
  expect(logout.status).toBe(200);
  await logout.arrayBuffer();
  await expect(captureCorpusCookieIdentity(root, capture.identity.viewer, fresh.cookie)).rejects.toThrow("request refused (401)");
  const expiring = await captureCookieAuth(root, member, PASSWORD);
  expect((await captureCorpusCookieIdentity(root, capture.identity.viewer, expiring.cookie)).viewer.userId).toBe(member.userId);
  const minted = await root.db.select().from(sessions).where(eq(sessions.userId, member.userId));
  expect(minted.length).toBeGreaterThan(0);
  root.clock.advance(Math.max(...minted.map((row) => row.expiresAt)) - root.clock.now());
  await expect(captureCorpusCookieIdentity(root, capture.identity.viewer, expiring.cookie)).rejects.toThrow("request refused (401)");
});

test("native loopback owner fallback cannot stand in for a cookie identity capture", async () => {
  await using root = await createServerHarness({ env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" } });
  const owner = await root.principalFor(root.ownerId);
  const capture = await captureCookieAuth(root, owner, PASSWORD);
  const address = await root.listen();
  const ambient = await fetch(`http://${address.address}:${String(address.port)}/api/trpc/sessions.me`);
  expect(ambient.status).toBe(200);
  await ambient.arrayBuffer();
  expect((await captureCorpusCookieIdentity(root, capture.identity.viewer, capture.cookie)).viewer.userId).toBe(root.ownerId);
  await expect(captureCorpusCookieIdentity(root, capture.identity.viewer, "")).rejects.toThrow("request refused (401)");
});

test("a frozen wire identity rejects a changed live role instead of normalizing the expected snapshot", async () => {
  await using root = await createServerHarness({ env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" } });
  const member = await root.principalFor((await root.actor()).id);
  const captured = await captureCookieAuth(root, member, PASSWORD);
  expect(captured.identity.viewer.globalRole).toBe("user");
  await (await root.internalCallerFor(root.ownerId)).admin.setRole({ userId: member.userId, role: "admin" });
  await expect(captureCorpusCookieIdentity(root, captured.identity.viewer, captured.cookie)).rejects.toThrow("does not admit the expected viewer");
  const fresh = await (await root.internalCallerFor(member.userId)).sessions.me();
  expect(fresh.globalRole).toBe("admin");
  expect((await captureCorpusCookieIdentity(root, fresh, captured.cookie)).viewer).toEqual(fresh);
});

test("local corpus admission is prepared after the last clone and cannot cross viewers, clones or the source publication", { tags: "slow" }, async () => {
  const source = loadCorpusFixture();
  const owner = source.wire.reads["sessions.me"][0]?.output;
  const member = source.wire.memberIdentities?.sharedMember.viewer;
  const sourceDatabase = localPath(source.layout.databaseUrl);
  if (owner === undefined || member === undefined || sourceDatabase === undefined) {
    throw new Error("The committed corpus has no captured local admission cohort");
  }
  const ownerView = viewerViewSchema.parse(owner);
  const memberView = viewerViewSchema.parse(member);
  const sourceBytes = await readFile(sourceDatabase);
  const sourceWire = await readFile(join(source.layout.root, "corpus.json"));
  await using root = await createCorpusHarness(undefined, { authConfig: { mode: "local", fallback: "owner" } });
  const cloneWire = await readFile(join(root.corpus.layout.root, "corpus.json"));
  const accountIds = [ownerView.userId, memberView.userId];
  expect(root.ownerId).toBe(owner.userId);
  expect(await root.db.select({ id: sessions.id }).from(sessions)).toEqual([]);
  const credentialsBefore = await root.db.select({ passwordHash: users.passwordHash }).from(users).where(inArray(users.id, accountIds));
  expect(credentialsBefore).toHaveLength(2);
  expect(credentialsBefore.every((row) => row.passwordHash === null)).toBe(true);
  const ownerPassword = `owner-${root.ids.uuid()}`;
  const memberPassword = `member-${root.ids.uuid()}`;
  const address = await root.listen();
  const origin = `http://${address.address}:${String(address.port)}`;
  for (const [viewer, password] of [
    [ownerView, ownerPassword],
    [memberView, memberPassword],
  ] as const) {
    const reset = await fetch(new URL("/api/trpc/admin.resetPassword", origin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: viewer.userId, password }),
    });
    await reset.arrayBuffer();
    expect(reset.status).toBe(200);
    expect(await root.app.sessions.authenticate(viewer.handle, password)).toBe(viewer.userId);
  }
  const credentialsAfter = await root.db.select({ passwordHash: users.passwordHash }).from(users).where(inArray(users.id, accountIds));
  expect(credentialsAfter).toHaveLength(2);
  expect(credentialsAfter.every((row) => row.passwordHash !== null)).toBe(true);
  const ownerAdmission = await captureCookieAuth(root, await root.principalFor(ownerView.userId), ownerPassword);
  const memberAdmission = await captureCookieAuth(root, await root.principalFor(memberView.userId), memberPassword);
  expect(ownerAdmission.identity.viewer).toEqual(owner);
  expect(memberAdmission.identity).toEqual(source.wire.memberIdentities?.sharedMember);
  await expect(captureCorpusCookieIdentity(root, ownerView, memberAdmission.cookie)).rejects.toThrow("does not admit the expected viewer");
  await expect(captureCorpusCookieIdentity(root, memberView, ownerAdmission.cookie)).rejects.toThrow("does not admit the expected viewer");
  for (const [cookie, csrf] of [
    [ownerAdmission.cookie, false],
    [memberAdmission.cookie, true],
  ] as const) {
    const refused = await fetch(new URL("/api/trpc/admin.resetPassword", origin), {
      method: "POST",
      headers: { "content-type": "application/json", forwarded: "", cookie, ...(csrf ? { [CSRF_HEADER]: "1" } : {}) },
      body: JSON.stringify({ userId: owner.userId, password: memberPassword }),
    });
    await refused.arrayBuffer();
    expect(refused.status).toBe(403);
    expect(refused.headers.getSetCookie()).toEqual([]);
  }
  expect((await captureCorpusCookieIdentity(root, ownerView, ownerAdmission.cookie)).viewer).toEqual(owner);
  expect((await captureCorpusCookieIdentity(root, memberView, memberAdmission.cookie)).viewer).toEqual(member);
  // The clone began with no session, so each re-authentication minted its own fresh session there.
  const minted = await root.db.select({ id: sessions.id, userId: sessions.userId }).from(sessions).where(inArray(sessions.userId, accountIds));
  expect(minted.map((row) => row.userId).toSorted()).toEqual(accountIds.toSorted());
  // A password rotation revokes only the rotated member's cookie, and a logout revokes only the owner's.
  const rotated = await captureCookieAuth(root, await root.principalFor(memberView.userId), `rotated-${root.ids.uuid()}`);
  expect(rotated.identity).toEqual(memberAdmission.identity);
  await expect(captureCorpusCookieIdentity(root, memberView, memberAdmission.cookie)).rejects.toThrow("request refused (401)");
  expect((await captureCorpusCookieIdentity(root, ownerView, ownerAdmission.cookie)).viewer).toEqual(owner);
  const logout = await fetch(new URL("/api/auth/logout", origin), {
    method: "POST",
    headers: { [CSRF_HEADER]: "1", cookie: ownerAdmission.cookie, forwarded: "" },
  });
  await logout.arrayBuffer();
  expect(logout.status).toBe(200);
  await expect(captureCorpusCookieIdentity(root, ownerView, ownerAdmission.cookie)).rejects.toThrow("request refused (401)");
  expect((await captureCorpusCookieIdentity(root, memberView, rotated.cookie)).viewer).toEqual(member);
  await using next = await createCorpusHarness(root.corpus.layout.root);
  expect(await next.db.select({ id: sessions.id }).from(sessions)).toEqual([]);
  const nextCredentials = await next.db.select({ passwordHash: users.passwordHash }).from(users).where(inArray(users.id, accountIds));
  expect(nextCredentials).toHaveLength(2);
  expect(nextCredentials.every((row) => row.passwordHash === null)).toBe(true);
  await expect(captureCorpusCookieIdentity(next, ownerView, ownerAdmission.cookie)).rejects.toThrow("request refused (401)");
  await expect(captureCorpusCookieIdentity(next, memberView, memberAdmission.cookie)).rejects.toThrow("request refused (401)");
  for (const [viewer, password] of [
    [owner, ownerPassword],
    [member, memberPassword],
  ] as const) {
    const stale = await next.http.request("/api/auth/login", {
      method: "POST",
      headers: { [CSRF_HEADER]: "1" },
      body: new URLSearchParams({ handle: viewer.handle, password }),
    });
    await stale.arrayBuffer();
    expect(stale.status).toBe(401);
    expect(stale.headers.getSetCookie()).toEqual([]);
  }
  expect((await readFile(sourceDatabase)).equals(sourceBytes)).toBe(true);
  expect((await readFile(join(source.layout.root, "corpus.json"))).equals(sourceWire)).toBe(true);
  expect((await readFile(join(root.corpus.layout.root, "corpus.json"))).equals(cloneWire)).toBe(true);
});
