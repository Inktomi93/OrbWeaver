// @subject tests/support/node/corpus-notifications.ts
// @subject packages/server/src/transport/trpc/stream/sources/notifications.ts
// @subject packages/server/src/transport/trpc/routers/notifications.ts
import { spawn } from "node:child_process";
import { AUTOMATION_NOTICE_MESSAGE_MAX, NOTIFICATION_TYPES } from "@orb/contracts/notifications";
import { assertReferentialIntegrity } from "@orb/db";
import { PLUGIN_CRASH_DISABLE_THRESHOLD } from "@orb/server/domain/plugin";
import { SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import { budget } from "@orb/tooling/floor/host/load-budget";
import {
  CORPUS_NOTIFICATION_PLUGIN_ERROR,
  CORPUS_NOTIFICATION_PLUGIN_MESSAGE,
  CORPUS_NOTIFICATION_RULE_MESSAGE,
  captureCorpusNotificationRows,
  seedCorpusNotifications,
} from "./corpus-notifications.ts";
import { CORPUS_PROVIDER_ENDPOINT } from "./corpus-provider.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";
import { requireShowcaseBundle } from "./showcase-bundle.ts";

// Real plugin guest processes and a physical SSE replay: measured 5.0 s on a loaded 24-core box, which is the whole 5 s default.
const CORPUS_BASE_MS = 20_000;

test("native notification corpus retains real recipient lifecycle and bounded physical replay, live correction and withdrawal", {
  timeout: budget(CORPUS_BASE_MS),
}, async () => {
  // The boot seeder admits the showcase plugins this corpus asks consent for; with no built bundle it skips them silently.
  await requireShowcaseBundle(SHOWCASE_PLUGIN_SLUGS[0]);
  await using root = await createServerHarness({ authConfig: { mode: "local", fallback: "deny" }, pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal: owner, partial: { privateEndpointAllowlist: [new URL(CORPUS_PROVIDER_ENDPOINT).hostname] } });
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
  const producers = result.producers;
  expect(producers.foreignRun).toMatchObject({ name: "RuleNotFoundError" });
  expect(producers.foreignAfter).toEqual(producers.foreignBefore);
  expect(producers.ruleRun.result).toEqual({ outcome: "fired" });
  expect(producers.ruleRun.fires).toMatchObject([{ outcome: "fired", detail: { runNow: true, byUserId: result.reader.userId } }]);
  expect(producers.ruleNotice).toMatchObject({
    actionable: false,
    payload: {
      type: "automation-notice",
      recipientUserId: result.reader.userId,
      chatId: result.inbox.room.chat.id,
      source: { kind: "rule", ruleId: producers.rule.id },
      message: CORPUS_NOTIFICATION_RULE_MESSAGE,
    },
  });
  expect(producers.plugin.outcome.status).toBe("enabled");
  expect(producers.notifyRun.result).toEqual({ outcome: "fired" });
  expect(producers.pluginNotice).toMatchObject({
    actionable: false,
    payload: {
      type: "automation-notice",
      recipientUserId: result.reader.userId,
      chatId: result.inbox.room.chat.id,
      source: { kind: "plugin", pluginId: producers.plugin.outcome.id },
      message: CORPUS_NOTIFICATION_PLUGIN_MESSAGE.repeat(AUTOMATION_NOTICE_MESSAGE_MAX).slice(0, AUTOMATION_NOTICE_MESSAGE_MAX),
    },
  });
  expect(producers.failedBeforeClean.result).toEqual({ outcome: "action_error" });
  expect(producers.clean.result).toEqual({ outcome: "fired" });
  expect(producers.cleanView.status).toBe("enabled");
  expect(producers.crashes).toHaveLength(PLUGIN_CRASH_DISABLE_THRESHOLD);
  expect(producers.crashes.map(({ view }) => view.status)).toEqual([...Array.from({ length: PLUGIN_CRASH_DISABLE_THRESHOLD - 1 }, () => "enabled"), "errored"]);
  expect(producers.crashes.map(({ disabled }) => disabled.length)).toEqual([...Array.from({ length: PLUGIN_CRASH_DISABLE_THRESHOLD - 1 }, () => 0), 1]);
  expect(producers.crashes.every(({ run, view }) => run.result.outcome === "action_error" && view.lastError?.includes(CORPUS_NOTIFICATION_PLUGIN_ERROR))).toBe(
    true,
  );
  expect(producers.paused.result).toEqual({ outcome: "paused" });
  expect(producers.paused.fires).toEqual(producers.crashes.at(-1)?.run.fires);
  expect(producers.disabled).toMatchObject({
    actionable: false,
    payload: {
      type: "plugin-disabled",
      recipientUserId: result.reader.userId,
      pluginId: producers.plugin.outcome.id,
    },
  });
  expect(JSON.stringify(producers.disabled)).not.toContain(CORPUS_NOTIFICATION_PLUGIN_ERROR);
  for (const message of [
    CORPUS_NOTIFICATION_RULE_MESSAGE,
    CORPUS_NOTIFICATION_PLUGIN_MESSAGE.repeat(AUTOMATION_NOTICE_MESSAGE_MAX).slice(0, AUTOMATION_NOTICE_MESSAGE_MAX),
  ]) {
    const copies = result.rows.filter((row) => row.payload.type === "automation-notice" && row.payload.message === message);
    expect(copies.map((row) => row.recipientUserId).toSorted()).toEqual([result.reader.userId, result.host.userId].toSorted());
  }
  expect(result.dropped.submitted.messages.map((message) => message.role)).toEqual(["user"]);
  expect(result.dropped.queued.pending).toMatchObject([{ chatId: result.dropped.room, triggeredBy: result.reader.userId, runAsUserId: result.host.userId }]);
  expect(result.dropped.queued.locks).toEqual([]);
  expect(result.dropped.drained).toEqual({ ran: 0, dropped: 1 });
  expect(result.dropped.repeated).toEqual({ ran: 0, dropped: 0 });
  expect(result.dropped.completed.pending).toEqual([]);
  expect(result.dropped.notice).toMatchObject({
    actionable: false,
    payload: {
      type: "deferred-turn-dropped",
      recipientUserId: result.reader.userId,
      chatId: result.dropped.room,
      reason: "chat-gone",
    },
  });
  expect(result.rows.filter((row) => row.type === "deferred-turn-dropped")).toHaveLength(1);
  expect(result.dismissed).toMatchObject({ actionable: false, dismissedAt: root.clock.frozenAt });
  expect(result.dismissedAgain).toEqual(result.dismissed);
  expect(result.final.items.some((view) => view.id === result.dismissed.id)).toBe(false);
  expect(result.finalReplay).toEqual([...result.final.items].reverse());
  expect(result.rows.find((row) => row.id === result.dismissed.id)?.dismissedAt).toBe(root.clock.frozenAt);
  expect(new Set(result.rows.map((row) => row.type))).toEqual(new Set(NOTIFICATION_TYPES));
  expect(result.rows).toEqual(await captureCorpusNotificationRows(root.db, result.recipientIds));
  const deliveredBytes = JSON.stringify({
    rows: result.rows,
    replay: result.replay,
    resumed: result.resumed,
    live: result.live,
    finalReplay: result.finalReplay,
  });
  for (const secret of result.secrets) {
    expect(deliveredBytes).not.toContain(secret);
  }
  for (const view of result.inbox.raised.items) {
    expect(result.replay).toContain(view.id);
    expect(result.resumed).not.toContain(view.id);
  }
  expect(result.replay.indexOf(oldest.id)).toBeLessThan(result.replay.indexOf(newest.id));
  expect(result.live).toContain(result.nomination.id);
  expect(result.live).toContain(result.kicked.id);
  for (const notice of [producers.ruleNotice, producers.pluginNotice, producers.disabled, result.dropped.notice]) {
    expect(result.live).toContain(notice.id);
  }
  for (const view of result.inbox.foreignBefore.items) {
    expect(result.replay).not.toContain(view.id);
    expect(result.live).not.toContain(view.id);
  }
  expect(result.foreignAttach).toMatchObject({ code: "NOT_FOUND" });
  expect(result.liveSockets).toBe(0);
  expect(result.physicalCloses).toEqual(
    Array.from({ length: 2 }, () => ({
      requestDestroyed: true,
      responseClosed: true,
      responseDestroyed: true,
      generatorStopped: true,
    })),
  );
  await assertReferentialIntegrity(root.db);
});
