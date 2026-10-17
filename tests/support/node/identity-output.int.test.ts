// @subject tests/support/node/corpus-auth.ts
// @subject tests/support/node/share.ts
// @subject tests/support/node/factories/notification.ts
import "./composed-real.ts";
import { SIGN_IN_TARGET_MODES } from "@orb/contracts/identity";
import { PRESENCE_READ_MAX_USER_IDS } from "@orb/contracts/notifications";
import type { ExternalId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { authModeSource, installKind } from "@orb/server/foundation/env";
import { logger } from "@orb/server/foundation/observability";
import { afterAll, vi } from "vitest";
import { captureAccountViews } from "./corpus-auth.ts";
import { captureNotificationViews } from "./factories/notification.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";
import { captureShareViews } from "./share.ts";

vi.hoisted(() => {
  vi.stubEnv("LOG_LEVEL", "error");
});
afterAll(() => vi.unstubAllEnvs());

test("native account and sharing suppliers keep request identity and owner-only diagnostics separate from delegated sign-in guidance", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
  const owner = await root.principalFor(root.ownerId);
  const admin = await root.actor({ role: "admin" });
  const subject = "private-native-supplier-subject";
  const member = await root.actor({ externalId: castId<ExternalId>(subject) });
  const ownerCaller = await root.internalCallerFor(root.ownerId);
  const adminCaller = await root.internalCallerFor(admin.id);
  const memberCaller = await root.internalCallerFor(member.id);
  const privateText = "Private diagnostic prose and opaque request material must not become public output.";
  logger.error(
    { event: "supplier.capture", path: "sessions.me", code: "SUPPLIER_TEST", err: new Error(privateText), privateBody: privateText },
    `output supplier: ${privateText}`,
  );
  const owned = await captureAccountViews(ownerCaller);
  expect(owned.viewer).toEqual({ userId: owner.userId, handle: owner.handle, globalRole: "owner" });
  expect(owned.diagnostics.serverErrors.kind).toBe("included");
  if (owned.diagnostics.serverErrors.kind !== "included") {
    throw new Error("native owner diagnostic control did not enter the included projection");
  }
  expect(owned.diagnostics.serverErrors.records).toContainEqual({
    at: expect.any(Number),
    source: "output supplier",
    event: "supplier.capture",
    errorType: "Error",
    code: "SUPPLIER_TEST",
    procedure: "sessions.me",
  });
  expect(owned.diagnostics.serverErrors.held).toBeGreaterThanOrEqual(owned.diagnostics.serverErrors.records.length);
  expect(JSON.stringify(owned)).not.toContain(privateText);
  expect(JSON.stringify(owned)).not.toContain("privateBody");
  for (const [actor, caller] of [
    [admin, adminCaller],
    [member, memberCaller],
  ] as const) {
    const captured = await captureAccountViews(caller);
    expect(captured.viewer).toEqual({ userId: actor.id, handle: actor.handle, globalRole: actor.role });
    expect(captured.diagnostics).toEqual({ runtime: owned.diagnostics.runtime, serverErrors: { kind: "owner-only" } });
    expect(JSON.stringify(captured)).not.toContain(subject);
    expect(captured.viewer).not.toHaveProperty("externalId");
    expect(captured.viewer).not.toHaveProperty("via");
  }
  const sharing = await captureShareViews(ownerCaller.share);
  expect(sharing.status).toMatchObject({ relay: { state: "off" }, certificate: { state: "off" }, liveSocketCount: 0 });
  expect(sharing.signInMode).toMatchObject({ mode: "local", source: authModeSource(), install: installKind() });
  expect(sharing.signInMode.targets.map((target) => target.mode)).toEqual([...SIGN_IN_TARGET_MODES]);
  expect(sharing.signInMode.targets).toMatchObject([
    { mode: "local", shareRefusal: null },
    { mode: "oidc", shareRefusal: { code: "share_oidc" } },
    { mode: "forward-header", shareRefusal: { code: "share_forward_header" } },
  ]);
  expect(Object.keys(sharing.signInMode).toSorted()).toEqual(["install", "mode", "source", "targets"]);
  expect(await adminCaller.share.signInMode()).toEqual(sharing.signInMode);
  await expect(captureShareViews(adminCaller.share)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(memberCaller.share.signInMode()).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(captureShareViews(memberCaller.share)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await captureShareViews(ownerCaller.share)).toEqual(sharing);
  const anonymous = await root.internalCallerFor(null);
  await expect(captureAccountViews(anonymous)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(anonymous.bugReportDiagnostics()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

test("native notification snapshots distinguish offline and unknown IDs from unavailable disclosure without leaking last-seen state", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
  const owner = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal: owner, partial: { localMultiUser: true } });
  const reader = await root.actor();
  const other = await root.actor();
  const caller = await root.internalCallerFor(reader.id);
  const unknownId = root.idSource.unprefixed<UserId>();
  const asked = [other.id, unknownId, root.ownerId, other.id, reader.id];
  const empty = await captureNotificationViews(caller.notifications, asked);
  expect(empty).toEqual({ inbox: { items: [], nextCursor: null }, presence: { onlineUserIds: [] } });
  const ownerDevice = new AbortController();
  const otherDevice = new AbortController();
  try {
    root.app.presence.connect(root.ownerId, ownerDevice.signal);
    root.app.presence.connect(other.id, otherDevice.signal);
    const connected = await captureNotificationViews(caller.notifications, asked);
    expect(connected.inbox).toEqual(empty.inbox);
    expect(connected.presence).toEqual({ onlineUserIds: [other.id, root.ownerId] });
    await expect(caller.notifications.presence({ userIds: Array.from({ length: PRESENCE_READ_MAX_USER_IDS + 1 }, () => other.id) })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    otherDevice.abort();
    root.clock.advance(60_000);
    expect(root.app.presence.read(other.id)).toMatchObject({ online: false, lastSeenAt: root.clock.frozenAt });
    const departed = await captureNotificationViews(caller.notifications, asked);
    expect(departed.presence).toEqual({ onlineUserIds: [root.ownerId] });
    expect(JSON.stringify(departed.presence)).not.toContain("lastSeenAt");
    expect(JSON.stringify(departed.presence)).not.toContain(String(root.clock.frozenAt));
    await root.services.settings.updateAppSettings({ principal: owner, partial: { localMultiUser: false } });
    const unavailable = await root.internalCallerFor(reader.id);
    await expect(captureNotificationViews(unavailable.notifications, asked)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await unavailable.notifications.list()).toEqual(empty.inbox);
    await root.services.settings.updateAppSettings({ principal: owner, partial: { localMultiUser: true } });
    const restored = await root.internalCallerFor(reader.id);
    expect((await captureNotificationViews(restored.notifications, asked)).presence).toEqual(departed.presence);
    const anonymous = await root.internalCallerFor(null);
    await expect(captureNotificationViews(anonymous.notifications, asked)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  } finally {
    ownerDevice.abort();
    otherDevice.abort();
  }
});
