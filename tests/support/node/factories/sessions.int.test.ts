// @subject tests/support/node/factories/rows/sessions.ts

import { CSRF_HEADER } from "@orb/contracts/identity";
import { RATE_LIMIT_CAP_MIN } from "@orb/contracts/settings";
import { sessions } from "@orb/db";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { seedBffSessionRows, seedLoginBucketsRows } from "./rows/sessions.ts";

test("a real session mint persists only its hash and revoke settles the actual returned session identity", async () => {
  await using root = await createServerHarness();
  const actor = await root.actor();
  const capture = await seedBffSessionRows(root, { userId: actor.id, userAgent: "Corpus BFF device" });
  expect(capture.row.id).toBe(capture.created.sessionId);
  expect(capture.row.userId).toBe(actor.id);
  expect(capture.row.expiresAt).toBe(capture.created.expiresAt);
  expect(JSON.stringify(capture.row)).not.toContain(capture.created.token);
  expect(await root.app.sessions.validate(capture.created.token)).toMatchObject({ sessionId: capture.row.id, userId: actor.id, enabled: true });
  expect(await root.app.sessions.revokeByToken(capture.created.token)).toEqual({ sessionId: capture.row.id, oidcIdToken: null });
  expect(await root.app.sessions.validate(capture.created.token)).toBeNull();
  expect(await root.app.sessions.revokeByToken(capture.created.token)).toBeNull();
  expect(await root.db.select().from(sessions).where(eq(sessions.id, capture.row.id)).get()).toMatchObject({ revokedAt: root.clock.now() });
});

test("the real HTTP login spends its canonical buckets only after CSRF and refuses at the live configured cap", async () => {
  await using root = await createServerHarness({ env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" } });
  const owner = await root.principalFor(root.ownerId);
  const configured = await root.services.settings.updateAppSettings({ principal: owner, partial: { rateLimits: { login: RATE_LIMIT_CAP_MIN } } });
  expect(configured.rateLimits.login).toBe(RATE_LIMIT_CAP_MIN);
  const body = new URLSearchParams({ handle: owner.handle, password: "incorrect-corpus-password" });
  const before = await seedLoginBucketsRows(root, ["/api/auth/login", { method: "POST", body }]);
  expect(before.response.status).toBe(403);
  await before.response.text();
  expect(before.buckets).toEqual([]);
  const input = { method: "POST", headers: { [CSRF_HEADER]: "1", "content-type": "application/x-www-form-urlencoded" }, body };
  let attempt = await seedLoginBucketsRows(root, ["/api/auth/login", input]);
  expect(attempt.response.status).toBe(401);
  await attempt.response.text();
  expect(attempt.buckets).toHaveLength(2);
  expect(attempt.buckets.map((row) => row.count)).toEqual([1, 1]);
  for (let index = 1; index < RATE_LIMIT_CAP_MIN; index += 1) {
    attempt = await seedLoginBucketsRows(root, ["/api/auth/login", input]);
    expect(attempt.response.status).toBe(401);
    await attempt.response.text();
  }
  expect(attempt.buckets.map((row) => row.count)).toEqual([RATE_LIMIT_CAP_MIN, RATE_LIMIT_CAP_MIN]);
  const throttled = await seedLoginBucketsRows(root, ["/api/auth/login", input]);
  expect(throttled.response.status).toBe(429);
  await throttled.response.text();
  expect(throttled.response.headers.get("retry-after")).not.toBeNull();
  expect(throttled.buckets.map((row) => row.key)).toEqual(attempt.buckets.map((row) => row.key));
  expect(throttled.buckets.map((row) => row.count).toSorted((left, right) => left - right)).toEqual([RATE_LIMIT_CAP_MIN, RATE_LIMIT_CAP_MIN + 1]);
  expect(await root.db.select().from(sessions)).toEqual([]);
});
