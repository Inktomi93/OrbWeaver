// activation: crash-policy — the auto-disable posture (03 §4). Each crash bumps the counter + records the
// detail; at the threshold (3) the plugin auto-disables (status errored) + is deactivated; a clean run resets.

import type { NotificationEvent } from "@orb/contracts/notifications";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PLUGIN_CRASH_DISABLE_THRESHOLD } from "@orb/server/domain/plugin";
import { createCrashPolicy } from "../../../../../packages/server/src/domain/plugin/activation/crash-policy.ts";
import { getById } from "../../../../../packages/server/src/domain/plugin/persistence/plugins.ts";
import { createPluginLifecycleLanes } from "../../../../../packages/server/src/domain/plugin/substrate/lifecycle-lanes.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makeInertOps, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

test("crashes below the threshold record the detail but keep the plugin runnable; the threshold auto-disables + notifies the owner", async () => {
  const db = await freshDb();
  // Capture the owner-notify emit (03 §4 "the owner is notified" — the `plugin-disabled` member).
  const emitted: NotificationEvent[] = [];
  const ops = {
    ...makeInertOps(),
    notifications: {
      emit: (event: NotificationEvent): Promise<void> => {
        emitted.push(event);
        return Promise.resolve();
      },
      post: () => Promise.resolve(),
      // The #1041 standing-ask trio: inert here — the crash notice is an episodic `emit`, not a standing ask.
      emitStanding: () => Promise.resolve(),
      refreshStanding: () => Promise.resolve(),
      retractStanding: () => Promise.resolve(),
    },
  };
  const h = makePluginHarness(db, { ops });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "mood" }), grant: [] });

  const deactivated: string[] = [];
  const policy = createCrashPolicy(
    h.ctx,
    (pluginId) => {
      deactivated.push(pluginId);
      return Promise.resolve();
    },
    createPluginLifecycleLanes(),
  );

  // Below the threshold: counter climbs, detail recorded, NOT disabled, NO notification.
  for (let i = 1; i < PLUGIN_CRASH_DISABLE_THRESHOLD; i += 1) {
    const verdict = await policy.recordCrash({ pluginId: installed.id, recipientUserId: owner, error: `crash ${i}` });
    expect(verdict.disabled).toBe(false);
    expect(verdict.count).toBe(i);
  }
  const before = await getById(h.ctx.db, owner, installed.id);
  expect(before?.status).toBe("disabled"); // never activated → still disabled, not errored
  expect(before?.consecutiveCrashes).toBe(PLUGIN_CRASH_DISABLE_THRESHOLD - 1);
  expect(emitted).toEqual([]);

  // The threshold crash: auto-disable + deactivate + notify the owner.
  const final = await policy.recordCrash({ pluginId: installed.id, recipientUserId: owner, error: "final crash" });
  expect(final.disabled).toBe(true);
  const after = await getById(h.ctx.db, owner, installed.id);
  expect(after?.status).toBe("errored");
  expect(after?.lastError).toBe("final crash");
  expect(deactivated).toEqual([installed.id]);
  expect(emitted).toEqual([{ type: "plugin-disabled", recipientUserId: owner, pluginId: installed.id }]);
});

// ── THE AUTO-DISABLE IS A CROSSING, NOT A STATE ────────────────────────────────────────────────────────────
// `incrementCrashes` is atomic per call, but the threshold test used to be `count >= THRESHOLD` with no
// was-below/now-at guard — so every crash AT OR ABOVE the threshold re-notified. Two crashes racing across the
// line land on 3 and 4 and BOTH fired `plugin-disabled`, putting two identical rows in the owner's durable
// inbox for one disable. Exactly the call that CROSSES may notify.
test("two crashes racing across the threshold notify the owner ONCE (the crossing call, not every call above it)", async () => {
  const db = await freshDb();
  const emitted: NotificationEvent[] = [];
  const ops = {
    ...makeInertOps(),
    notifications: {
      emit: (event: NotificationEvent): Promise<void> => {
        emitted.push(event);
        return Promise.resolve();
      },
      post: () => Promise.resolve(),
      // The #1041 standing-ask trio: inert here — the crash notice is an episodic `emit`, not a standing ask.
      emitStanding: () => Promise.resolve(),
      refreshStanding: () => Promise.resolve(),
      retractStanding: () => Promise.resolve(),
    },
  };
  const h = makePluginHarness(db, { ops });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "mood" }), grant: [] });
  const policy = createCrashPolicy(h.ctx, () => Promise.resolve(), createPluginLifecycleLanes());

  // Park the counter one short of the threshold…
  for (let i = 1; i < PLUGIN_CRASH_DISABLE_THRESHOLD; i += 1) {
    await policy.recordCrash({ pluginId: installed.id, recipientUserId: owner, error: `crash ${i}` });
  }
  expect(emitted).toEqual([]);

  // …then two guest invocations arrive concurrently (two resident handlers, two tabs' UI actions). The
  // lifecycle lane serializes their durable transition while preserving the one-notification crossing.
  await Promise.all([
    policy.recordCrash({ pluginId: installed.id, recipientUserId: owner, error: "race a" }),
    policy.recordCrash({ pluginId: installed.id, recipientUserId: owner, error: "race b" }),
  ]);

  expect(emitted).toEqual([{ type: "plugin-disabled", recipientUserId: owner, pluginId: installed.id }]);
  expect((await getById(h.ctx.db, owner, installed.id))?.status).toBe("errored");
});

test("a clean run resets the crash counter", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "mood" }), grant: [] });
  const policy = createCrashPolicy(h.ctx, () => Promise.resolve(), createPluginLifecycleLanes());

  await policy.recordCrash({ pluginId: installed.id, recipientUserId: owner, error: "flake" });
  await policy.recordCleanRun(installed.id);
  expect((await getById(h.ctx.db, owner, installed.id))?.consecutiveCrashes).toBe(0);
});
