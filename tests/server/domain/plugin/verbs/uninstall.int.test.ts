// verb: uninstall — remove an installed plugin (02 §4). Deactivate (dispose the resident) → delete the row
// (KV cascades) → reap the bundle asset. The end state is zero rows, zero KV, zero bundle bytes.

import { pluginKv } from "@orb/db";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginNotFoundError } from "@orb/server/domain/plugin";
import { eq } from "drizzle-orm";
import { upsertKv } from "../../../../../packages/server/src/domain/plugin/persistence/plugin-kv.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, principalFor, seedUser } from "../_support.ts";

test("uninstall leaves zero rows, zero KV, zero bundle bytes; disposes a resident instance", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "mood", capabilities: ["storage.kv"] }),
    grant: ["storage.kv"],
  });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });
  // Seed a KV row so the CASCADE is observable.
  await upsertKv(db, { pluginId: installed.id, ownerId: owner }, { key: "k", value: "v", updatedAt: 1000 });

  await h.service.uninstall({ caller: ownerPrincipalFor(owner), pluginId: installed.id });

  expect(h.port.disposed.length).toBe(1); // the resident instance was torn down
  expect(await h.service.list({ caller: ownerPrincipalFor(owner) })).toEqual([]); // row gone
  expect(h.storedBytes.size).toBe(0); // bundle asset reaped
  const kv = await db.select().from(pluginKv).where(eq(pluginKv.pluginId, installed.id));
  expect(kv).toEqual([]); // KV cascaded off the FK
});

test("uninstalling a disabled plugin needs no instance (idempotent deactivate)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "mood" }), grant: [] });

  await h.service.uninstall({ caller: ownerPrincipalFor(owner), pluginId: installed.id });
  expect(h.port.disposed.length).toBe(0);
  expect(h.storedBytes.size).toBe(0);
});

test("a missing/foreign plugin is a leak-free NotFound; a non-admin is refused", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const user = await seedUser(db, { handle: castId<Handle>("user") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "mood" }), grant: [] });

  await expect(h.service.uninstall({ caller: ownerPrincipalFor(owner), pluginId: castId<PluginId>("plugin_missing") })).rejects.toBeInstanceOf(
    PluginNotFoundError,
  );
  await expect(h.service.uninstall({ caller: principalFor(user), pluginId: installed.id })).rejects.toBeInstanceOf(DomainForbiddenError);
});
