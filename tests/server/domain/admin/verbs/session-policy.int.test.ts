// @subject packages/server/src/domain/admin/verbs/session-policy.ts
// @subject packages/server/src/entry/compose/admin.ts
// @subject packages/server/src/foundation/observability/audit.ts
// @subject packages/server/src/domain/admin/substrate/audited-write.ts

import { sessions } from "@orb/db";
import type { SocketId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { refuseWrites } from "@orb/testkit/node/composed";
import { principal } from "@orb/testkit/node/helpers";
import { vi } from "vitest";

test("a single-device admin kick ends every target socket, including another device and session-less SSO, but not another user's", async ({
  harness,
  app,
  ids,
}) => {
  const actor = await harness.actor({ role: "admin" });
  const target = await harness.actor();
  const stranger = await harness.actor();
  const first = await app.sessions.create({ userId: target.id });
  const second = await app.sessions.create({ userId: target.id });
  const evicted = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
  const specs = [
    { userId: target.id, sessionId: first.sessionId },
    { userId: target.id, sessionId: second.sessionId },
    { userId: target.id, sessionId: null },
    { userId: stranger.id, sessionId: null },
  ];
  for (const [i, spec] of specs.entries()) {
    app.sockets.goLive(app.sockets.adopt(spec.userId, castId<SocketId>(ids.next("socket")), spec.sessionId), {
      onAttach: vi.fn(),
      onAnnounce: vi.fn(),
      onDetach: vi.fn(),
      onEvicted: () => evicted[i]?.(),
    });
  }
  await app.services.admin.revokeSession({ principal: await principal(harness, actor.id), sessionId: first.sessionId });
  expect(evicted.map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1, 0]);
  expect(await app.sessions.validate(first.token)).toBeNull();
  expect(await app.sessions.validate(second.token)).toMatchObject({ userId: target.id });
  await app.services.admin.revokeSession({ principal: await principal(harness, actor.id), sessionId: first.sessionId });
  expect(evicted.map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1, 0]);
});

test("the admin gate runs before a revoke, and the queried target is stamped on secret-free session views", async ({ harness, app }) => {
  const actor = await harness.actor({ role: "admin" });
  const target = await harness.actor();
  const session = await app.sessions.create({ userId: target.id, oidcIdToken: "private-id-token" });
  await expect(app.services.admin.revokeSession({ principal: await principal(harness, target.id), sessionId: session.sessionId })).rejects.toThrow();
  expect(await app.sessions.validate(session.token)).toMatchObject({ userId: target.id });
  const rows = await app.services.admin.listSessions({ principal: await principal(harness, actor.id), userId: target.id });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: session.sessionId, userId: target.id, revokedAt: null });
  expect(JSON.stringify(rows)).not.toContain("private-id-token");
  expect(JSON.stringify(rows)).not.toContain(session.token);
  expect(rows[0]).not.toHaveProperty("tokenHash");
});

test("revoke-all evicts session-less SSO even when the target has no cookie sessions", async ({ harness, app, ids }) => {
  const actor = await harness.actor({ role: "admin" });
  const target = await harness.actor();
  const evicted = vi.fn();
  app.sockets.goLive(app.sockets.adopt(target.id, castId<SocketId>(ids.next("socket")), null), {
    onAttach: vi.fn(),
    onAnnounce: vi.fn(),
    onDetach: vi.fn(),
    onEvicted: evicted,
  });
  expect(await app.services.admin.revokeUserSessions({ principal: await principal(harness, actor.id), userId: target.id })).toEqual({ revoked: 0 });
  expect(evicted).toHaveBeenCalledOnce();
});

test("a refused durable revoke does not evict live sockets or invalidate a cookie", async ({ harness, db, app, ids }) => {
  const actor = await harness.actor({ role: "admin" });
  const target = await harness.actor();
  const session = await app.sessions.create({ userId: target.id });
  const evicted = vi.fn();
  app.sockets.goLive(app.sockets.adopt(target.id, castId<SocketId>(ids.next("socket")), session.sessionId), {
    onAttach: vi.fn(),
    onAnnounce: vi.fn(),
    onDetach: vi.fn(),
    onEvicted: evicted,
  });
  await using refusal = await refuseWrites(db, { table: sessions, event: "UPDATE", columns: [sessions.revokedAt], message: "revoke refused" });
  await expect(app.services.admin.revokeSession({ principal: await principal(harness, actor.id), sessionId: session.sessionId })).rejects.toThrow();
  expect(evicted).not.toHaveBeenCalled();
  expect(await app.sessions.validate(session.token)).toMatchObject({ userId: target.id });
  await refusal.lift();
  await app.services.admin.revokeSession({ principal: await principal(harness, actor.id), sessionId: session.sessionId });
  expect(evicted).toHaveBeenCalledOnce();
});
