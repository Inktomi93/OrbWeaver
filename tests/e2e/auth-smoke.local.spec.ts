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
import { loginLocal, ownerActor } from "./support/actors.ts";
import { E2E_DEBUG_TOKEN, LOCAL_MEMBER, LOCAL_OWNER } from "./support/modes.ts";

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

// THE /api/_debug REFUSAL, end-to-end on a booted stack (#1193). It lives HERE, on a real logged-in
// NON-ADMIN, because that is the only refusal this harness can actually construct: every mode-project runs
// `NODE_ENV=development` + `AUTH_FALLBACK=owner` and every request reaches the server on a LOOPBACK socket,
// so an "un-credentialed caller" is the box OPERATOR by construction (this file's first test asserts exactly
// that), and flipping this project to `AUTH_FALLBACK=deny` is not available: globalSetup seeds every booted
// mode through that same un-credentialed loopback seam (`support/global-setup.ts::seedMode` →
// `character.list`/`chat.startChat`/`settings.updateUserSettingsSection`, plus the multi-user seed CLI).
//
// A cookie session is posture-INDEPENDENT: the seam's cookie arm resolves before the fallback is consulted,
// so this member is `via:"cookie"`, `role:"user"` — and the gate must refuse them whatever the box's posture
// is. That is the arm that matters in any multi-human deployment: a logged-in ordinary user must not read
// principal-blind whole-db probes (and, with WIRE_CAPTURE=on as this stack runs, provider request BODIES).
// The anonymous/PRODUCTION-posture refusal is the unit suite's (`tests/server/entry/debug-gate.suite.test.ts`
// — "the PRODUCTION posture refuses the same loopback owner, single-user included"); it cannot be booted here.
//
// TIER: deliberately NOT `@smoke` (owner-side ruling 2026-09-02). The push tier would have to boot the whole
// `local` stack for this one assertion, and the property is already double-covered — the node suite's
// production-posture + demoted-row rows, and this file in the FULL e2e tier (`pnpm e2e`) and the
// certification drive. Do not promote it to `@smoke` casually; that is a push-cost decision, not a tidy-up.
test("a logged-in NON-ADMIN is refused /api/_debug, and the refusal NAMES the arm", async ({ baseURL }) => {
  const origin = baseURL ?? "";
  const member = await loginLocal(origin, castId<Handle>(LOCAL_MEMBER.handle), LOCAL_MEMBER.password);

  const refused = await fetch(`${origin}/api/_debug/info`, { headers: member.headers });
  expect(refused.status, "a member's session must never open the diagnostics door").toBe(401);

  // The #1193 message half, proven at the wire: an owner staring at "HTTP 401" needs to know WHICH arm said
  // no. The token clause is asserted too — this stack HAS a DEBUG_TOKEN configured, so a 404 here would mean
  // the surface was off and the 401 above proved nothing.
  const body = (await refused.json()) as { readonly reason?: unknown };
  expect(typeof body.reason === "string" ? body.reason : "").toContain("the admin-session arm refused this request");
  expect(typeof body.reason === "string" ? body.reason : "").toContain("no x-debug-token header was sent");

  // POSITIVE CONTROL on the same stack, same route: the operator token still opens it, so the 401 above is
  // the ROLE gate biting and not a dead route.
  const authorized = await fetch(`${origin}/api/_debug/info`, { headers: { "x-debug-token": E2E_DEBUG_TOKEN } });
  expect(authorized.status).toBe(200);
});
