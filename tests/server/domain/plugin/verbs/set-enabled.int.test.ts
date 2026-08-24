// verb: setEnabled — activate/deactivate (02 §4). Enable activates on the CAS bundle under the granted subset
// (a contained failure surfaces as PluginCrashedError after the row lands errored); disable disposes + status
// disabled. Idempotent per target state.

import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginCrashedError, PluginNotFoundError } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makeInertOps, makePluginHarness, ownerPrincipalFor, principalFor, seedUser } from "../_support.ts";

test("enable activates on the CAS bundle under the granted subset; the row is enabled", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "mood", capabilities: ["chat.read"] }),
    grant: ["chat.read"],
  });

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  expect(h.port.created.length).toBe(1);
  expect(h.port.created[0]?.grants).toEqual(["chat.read"]); // the granted subset crossed the seam
  const [view] = await h.service.list({ caller: ownerPrincipalFor(owner) });
  expect(view?.status).toBe("enabled");
});

test("a contained activation failure surfaces as PluginCrashedError; the row lands errored", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "mood" }), grant: [] });
  h.port.script({ ok: false, error: "main.js threw", log: [] });

  await expect(h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true })).rejects.toBeInstanceOf(PluginCrashedError);
  const [view] = await h.service.list({ caller: ownerPrincipalFor(owner) });
  expect(view?.status).toBe("errored");
  expect(view?.lastError).toBe("main.js threw");
});

test("disable disposes the instance + lands the row disabled (idempotent)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: false });
  expect(h.port.disposed.length).toBe(1);
  // Idempotent second disable is a no-op (no resident to dispose again).
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: false });
  expect(h.port.disposed.length).toBe(1);
  const [view] = await h.service.list({ caller: ownerPrincipalFor(owner) });
  expect(view?.status).toBe("disabled");
});

test("a missing/foreign plugin is a leak-free NotFound; a non-admin is refused", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const user = await seedUser(db, { handle: castId<Handle>("user") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "mood" }), grant: [] });

  await expect(h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: castId<PluginId>("plugin_missing"), enabled: true })).rejects.toBeInstanceOf(
    PluginNotFoundError,
  );
  await expect(h.service.setEnabled({ caller: principalFor(user), pluginId: installed.id, enabled: true })).rejects.toBeInstanceOf(DomainForbiddenError);
});

test("DISABLING voids the plugin's pending posture-2 asks — a stale card never outlives the plugin", async () => {
  // The confirm-time liveness re-check is what makes a stale plugin card SAFE (it refuses); this sweep is what
  // makes it DISAPPEAR, so a host is never offered an answer that would only refuse. It fires UNCONDITIONALLY,
  // before the resident check, because a plugin can hold pending cards while holding no resident instance —
  // an upgrade tears the instance down and lands the row disabled.
  const db = await freshDb();
  const voided: PluginId[] = [];
  const ops = makeInertOps();
  const h = makePluginHarness(db, {
    ops: { ...ops, suggestions: { ...ops.suggestions, voidForPlugin: (pluginId): void => void voided.push(pluginId) } },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "sweep", capabilities: ["chat.read"] }),
    grant: ["chat.read"],
  });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });
  voided.length = 0; // the enable's own clean-slate deactivate already swept; measure the DISABLE

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: false });

  expect(voided).toEqual([installed.id]);
});

test("UNINSTALL voids them too (the same deactivate path — a removed plugin leaves no answerable card)", async () => {
  const db = await freshDb();
  const voided: PluginId[] = [];
  const ops = makeInertOps();
  const h = makePluginHarness(db, {
    ops: { ...ops, suggestions: { ...ops.suggestions, voidForPlugin: (pluginId): void => void voided.push(pluginId) } },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "gone" }), grant: [] });

  await h.service.uninstall({ caller: ownerPrincipalFor(owner), pluginId: installed.id });

  expect(voided).toEqual([installed.id]);
});
