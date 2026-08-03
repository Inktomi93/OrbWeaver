// verb: setEnabled — activate/deactivate (02 §4). Enable activates on the CAS bundle under the granted subset
// (a contained failure surfaces as PluginCrashedError after the row lands errored); disable disposes + status
// disabled. Idempotent per target state.

import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginCrashedError, PluginNotFoundError } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeBundle, makePluginHarness, ownerPrincipalFor, principalFor, seedUser } from "../_support.ts";

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
