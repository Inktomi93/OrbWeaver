// @subject tests/support/node/corpus-notifications.ts
// @subject packages/server/src/transport/trpc/stream/sources/notifications.ts
// @subject packages/server/src/transport/trpc/routers/notifications.ts
import "./composed-real.ts";
import { assertReferentialIntegrity } from "@orb/db";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { captureCorpusNotificationRows, seedCorpusNotifications } from "./corpus-notifications.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("native notification corpus retains real recipient lifecycle and bounded physical replay, live correction and withdrawal", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
  const result = await seedCorpusNotifications(root);
  expect(result.admission.seededPending.length).toBeGreaterThan(0);
  expect(result.admission.answeredPending).toHaveLength(result.admission.seededPending.length);
  expect(result.admission.answeredPending.every((plugin) => !plugin.reconsentPending && plugin.status === "disabled")).toBe(true);
  expect(result.inbox.raised.items).toHaveLength(2);
  const [newest, oldest] = result.inbox.raised.items;
  if (newest === undefined || oldest === undefined) {
    throw new Error("the native notification corpus omitted its observed ordering controls");
  }
  expect(result.inbox.raised.items.map((view) => view.seq)).toEqual([2, 1]);
  expect(result.inbox.raised.items.every((view) => view.actionable && view.payload.recipientUserId === result.reader.userId)).toBe(true);
  expect(result.inbox.pages.flatMap((page) => page.items)).toEqual(result.inbox.raised.items);
  expect(result.inbox.foreignBefore.items).toHaveLength(1);
  expect(result.inbox.foreignAfter).toEqual(result.inbox.foreignBefore);
  expect(result.inbox.foreignDismiss).toMatchObject({ code: "NOT_FOUND" });
  expect(result.inbox.afterRefusal).toEqual(result.inbox.beforeRefusal);
  expect(result.inbox.marked).toEqual({ markedCount: result.inbox.raised.items.length });
  expect(result.inbox.markedAgain).toEqual({ markedCount: 0 });
  expect(result.inbox.read.items.map((view) => view.readAt)).toEqual(result.inbox.raised.items.map(() => root.clock.frozenAt));
  const originalIds = result.inbox.raised.items.map((view) => view.id);
  expect(result.settled.items.filter((view) => originalIds.includes(view.id)).map((view) => view.actionable)).toEqual([false, false]);
  expect(result.nomination).toMatchObject({ actionable: true, payload: { recipientUserId: result.reader.userId, chatId: result.inbox.room.chat.id } });
  expect(result.final.items.find((view) => view.id === result.nomination.id)?.actionable).toBe(false);
  expect(result.accepted.items).toMatchObject([
    { actionable: false, payload: { type: "handoff-accepted", recipientUserId: result.host.userId, newHostHandle: result.reader.handle } },
  ]);
  expect(result.kicked).toMatchObject({ actionable: false, payload: { type: "kicked", recipientUserId: result.reader.userId } });
  expect(result.consent.first.payload).toMatchObject({ pendingCount: 1 });
  expect(result.consent.grown.payload).toMatchObject({ pendingCount: 2 });
  expect(result.consent.grown.id).not.toBe(result.consent.first.id);
  expect(result.consent.quiet).toMatchObject({
    id: result.consent.grown.id,
    seq: result.consent.grown.seq,
    readAt: root.clock.frozenAt,
    actionable: true,
    payload: result.consent.first.payload,
  });
  expect(result.consent.retracted.items.some((view) => view.type === "plugins-awaiting-consent")).toBe(false);
  expect(result.consent.quietBytes).toContain(JSON.stringify(result.consent.quiet.payload));
  expect(result.consent.retractedBytes).toContain(result.consent.grown.id);
  expect(result.consent.retractedBytes).toContain(`"dismissedAt":${String(root.clock.frozenAt)}`);
  expect(result.dismissed).toMatchObject({ actionable: false, dismissedAt: root.clock.frozenAt });
  expect(result.dismissedAgain).toEqual(result.dismissed);
  expect(result.final.items.some((view) => view.id === result.dismissed.id)).toBe(false);
  expect(result.finalReplay).toEqual([...result.final.items].reverse());
  expect(result.rows.find((row) => row.id === result.dismissed.id)?.dismissedAt).toBe(root.clock.frozenAt);
  expect(new Set(result.rows.map((row) => row.type))).toEqual(
    new Set(["invite", "handoff-nominated", "handoff-accepted", "kicked", "plugins-awaiting-consent"]),
  );
  expect(result.rows).toEqual(await captureCorpusNotificationRows(root.db, result.recipientIds));
  for (const view of result.inbox.raised.items) {
    expect(result.replay).toContain(view.id);
    expect(result.resumed).not.toContain(view.id);
  }
  expect(result.replay.indexOf(oldest.id)).toBeLessThan(result.replay.indexOf(newest.id));
  expect(result.live).toContain(result.nomination.id);
  expect(result.live).toContain(result.kicked.id);
  for (const view of result.inbox.foreignBefore.items) {
    expect(result.replay).not.toContain(view.id);
    expect(result.live).not.toContain(view.id);
  }
  expect(result.foreignAttach).toMatchObject({ code: "NOT_FOUND" });
  expect(result.liveSockets).toBe(0);
  await assertReferentialIntegrity(root.db);
});
