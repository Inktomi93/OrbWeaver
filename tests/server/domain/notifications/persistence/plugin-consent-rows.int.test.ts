// Plugin consent against the stored plugin rows: a quiet answer leaves the plugin disabled with no plugin_kv row,
// and a raw ZIP install stores its manifest exactly before a narrower grant flags the stored row for reconsent.
// @subject packages/server/src/domain/notifications/verbs/standing.ts
// @subject packages/server/src/domain/notifications/persistence/queries.ts
// @subject packages/server/src/domain/plugin/substrate/consent-prompt.ts
// @subject tests/support/node/factories/plugin.ts

import { MS_PER_SECOND } from "@orb/kit/time";
import { makePluginBundle } from "@orb/testkit/node/composed";
import { seedInstalledPluginRows, seedPluginGrantRows } from "@orb/testkit/node/rows";
import { expect, NOTIFICATION_GUEST_SOURCE, pendingConsent, test } from "../_fixtures.ts";

test("actual plugin consent grows one ask, quietly answers it and retracts the last question without starting a guest", async ({
  harness,
  notificationActors: actors,
  clock,
}) => {
  const first = await pendingConsent(harness, actors.alice);
  const second = await pendingConsent(harness, actors.alice);
  expect(second.event.pendingCount).toBe(first.event.pendingCount + 1);
  expect(second.view.id).not.toBe(first.view.id);
  expect((await harness.services.notifications.list({ principal: actors.alice })).items.map((row) => row.id)).toEqual([second.view.id]);
  await harness.services.notifications.markAllRead({ principal: actors.alice });
  clock.advance(1000);
  const answered = await seedPluginGrantRows(harness, {
    caller: actors.alice,
    pluginId: first.plugin.id,
    grant: first.manifest.capabilities,
    acknowledgedNetHosts: [],
  });
  expect(answered.plugin.status).toBe("disabled");
  expect(answered.kv).toEqual([]);
  const [quiet] = (await harness.services.notifications.list({ principal: actors.alice })).items;
  expect(quiet).toMatchObject({ id: second.view.id, seq: second.view.seq, readAt: clock.frozenAt, actionable: true, payload: first.event });
  await harness.services.plugin.uninstall({ caller: actors.alice, pluginId: second.plugin.id });
  expect((await harness.services.notifications.list({ principal: actors.alice })).items).toEqual([]);
  expect(await harness.services.notifications.replaySince({ principal: actors.alice, afterSeq: 0 })).toEqual([]);
});

test("raw plugin ZIP identity derives from supplied time and still enters native install and consent", async ({
  harness,
  notificationActors: actors,
  clock,
}) => {
  const pending = await pendingConsent(harness, actors.alice);
  const manifest = pending.manifest;
  const first = makePluginBundle(manifest, NOTIFICATION_GUEST_SOURCE, clock.now());
  const repeat = makePluginBundle(manifest, NOTIFICATION_GUEST_SOURCE, clock.now());
  const later = makePluginBundle(manifest, NOTIFICATION_GUEST_SOURCE, clock.now() + MS_PER_SECOND);
  expect(Array.from(repeat)).toEqual(Array.from(first));
  expect(Array.from(later)).not.toEqual(Array.from(first));
  const caller = actors.bob;
  const installed = await seedInstalledPluginRows(harness, { caller, bundle: first, grant: [] });
  expect(installed.plugin.manifest).toEqual(manifest);
  expect(installed.plugin.pendingReconsent).toBe(false);
  const requested = await seedPluginGrantRows(harness, {
    caller,
    pluginId: installed.outcome.id,
    grant: [],
    acknowledgedNetHosts: [],
  });
  expect(requested.plugin.pendingReconsent).toBe(true);
  expect(requested.plugin.status).toBe("disabled");
  expect((await harness.services.notifications.list({ principal: caller })).items).toMatchObject([
    { actionable: true, payload: { type: pending.event.type, recipientUserId: caller.userId, pendingCount: 1 } },
  ]);
});
