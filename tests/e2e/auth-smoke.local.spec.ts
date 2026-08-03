// E2E (LOCAL mode) — the auth-harness smoke: login mints a real session, the seam resolves the RIGHT
// principal + role, and role gating BITES at the wire. This is the deterministic (model-free) proof that the
// `local` project + the actor clients work — the foundation every local-mode spec (incl. the member-strip)
// stands on. NOT `@live` (no engines needed).
//
// The seeded local users (global-setup → multi-user-seed): `owner` (role=owner, via the login form) and
// `member` (role=user). The HOST/owner also resolves un-credentialed via the 127.0.0.1 fallback seam.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/test";
import { loginLocal, ownerActor } from "./support/actors";
import { LOCAL_MEMBER, LOCAL_OWNER } from "./support/modes";

const NO_SESSION_COOKIE = /no session cookie/u;

test("the un-credentialed fallback resolves the OWNER (role=owner)", async ({ baseURL }) => {
  const who = await ownerActor(baseURL ?? "").whoami();
  expect(who.authenticated).toBe(true);
  expect(who.role).toBe("owner");
});

test("a seeded MEMBER logs in and the seam resolves them as role=user", async ({ baseURL }) => {
  const member = await loginLocal(baseURL ?? "", castId<Handle>(LOCAL_MEMBER.handle), LOCAL_MEMBER.password);
  const who = await member.whoami();
  expect(who.authenticated).toBe(true);
  expect(who.handle).toBe(LOCAL_MEMBER.handle);
  expect(who.role).toBe("user");
});

test("the seeded OWNER can log in via the form too (role=owner)", async ({ baseURL }) => {
  const owner = await loginLocal(baseURL ?? "", castId<Handle>(LOCAL_OWNER.handle), LOCAL_OWNER.password);
  expect((await owner.whoami()).role).toBe("owner");
});

test("a MEMBER is REFUSED an owner-only proc (admin.listUsers → 403), but the owner is allowed", async ({ baseURL }) => {
  const origin = baseURL ?? "";
  const member = await loginLocal(origin, castId<Handle>(LOCAL_MEMBER.handle), LOCAL_MEMBER.password);
  const refused = await member.expectError("admin.listUsers", {}, "query");
  expect(refused.status).toBe(403);

  // The owner (fallback seam) reads it — the gate is a ROLE gate, not a blanket deny.
  const users = await ownerActor(origin).query<readonly unknown[]>("admin.listUsers", {});
  expect(Array.isArray(users)).toBe(true);
});

test("bad credentials mint no session (login is a real gate)", async ({ baseURL }) => {
  await expect(loginLocal(baseURL ?? "", castId<Handle>(LOCAL_MEMBER.handle), "wrong-password")).rejects.toThrow(NO_SESSION_COOKIE);
});
