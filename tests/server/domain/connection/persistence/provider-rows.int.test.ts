// Provider definitions are deployment-global while plugin ownership is many-to-one. These tests exercise the
// actual DB transaction and FK belts: identical contributors share, conflicts write nothing, and only the
// final contributor retires visibility while the immutable definition identity remains tombstoned. The read
// also names each enabled contributor's OWNER, which is the whole input to per-user scope (D147).

import type { ProviderDef, ProviderId } from "@orb/contracts/inference";
import { pluginProviderContributions, providerRows } from "@orb/db";
import type { Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { describe } from "vitest";
import {
  deleteAdminProviderRow,
  deletePluginProviderRows,
  listProviderRows,
  putAdminProviderRow,
  replacePluginProviderRows,
} from "../../../../../packages/server/src/domain/connection/persistence/provider-rows.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import type { PluginHarness } from "../../plugin/_support.ts";
import { makeBundle, makePluginHarness, principalFor, seedUser } from "../../plugin/_support.ts";

const ACME_ID = castId<ProviderId>("acme-endpoint");
const PLUGIN_PROVIDER_ID = castId<ProviderId>("plugin:test-plugin/acme");
const ACME: ProviderDef = {
  id: ACME_ID,
  label: "Acme",
  wire: "openai-compat",
  dialect: "openai-compatible",
  auth: "endpoint",
  apis: ["chat-completions"],
  catalog: "url",
  metered: false,
};
const PLUGIN_ACME: ProviderDef = { ...ACME, id: PLUGIN_PROVIDER_ID };

async function installedPlugin(
  db: Awaited<ReturnType<typeof freshDb>>,
  harness: PluginHarness,
  userName: string,
): Promise<{ readonly pluginId: PluginId; readonly ownerId: UserId }> {
  const ownerId = await seedUser(db, { handle: castId<Handle>(userName) });
  const caller = principalFor(ownerId);
  const installed = await harness.service.install({ caller, bundle: makeBundle({ id: "test-plugin", providers: [PLUGIN_ACME] }), grant: [] });
  await harness.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  return { pluginId: installed.id, ownerId };
}

describe("admin ownership", () => {
  test("round-trips and updates an admin row without adopting a plugin id", async () => {
    const db = await freshDb();
    const harness = makePluginHarness(db);
    const admin: UserId = await seedUser(db, { handle: castId<Handle>("user_admin") });
    expect(await putAdminProviderRow(db, ACME, admin, FROZEN_AT_MS)).toBe(true);
    expect(await putAdminProviderRow(db, { ...ACME, label: "Acme v2" }, admin, FROZEN_AT_MS + 1)).toBe(true);
    expect(await listProviderRows(db)).toEqual({ rows: [{ ...ACME, label: "Acme v2" }], installs: [] });
    const { pluginId } = await installedPlugin(db, harness, "user_owner");
    expect(await replacePluginProviderRows(db, [PLUGIN_ACME], pluginId, FROZEN_AT_MS)).toEqual({ ok: true });
    expect(await putAdminProviderRow(db, PLUGIN_ACME, admin, FROZEN_AT_MS)).toBe(false);
  });

  test("removes only an admin-owned row", async () => {
    const db = await freshDb();
    const admin = await seedUser(db, { handle: castId<Handle>("user_admin") });
    await putAdminProviderRow(db, ACME, admin, FROZEN_AT_MS);
    expect(await deleteAdminProviderRow(db, ACME_ID)).toBe(true);
    expect(await listProviderRows(db)).toEqual({ rows: [], installs: [] });
  });
});

describe("plugin contributions", () => {
  test("shares an identical definition and removes it only with the final contributor", async () => {
    const db = await freshDb();
    const harness = makePluginHarness(db);
    const first = await installedPlugin(db, harness, "user_first");
    const second = await installedPlugin(db, harness, "user_second");
    expect(await replacePluginProviderRows(db, [PLUGIN_ACME], first.pluginId, FROZEN_AT_MS)).toEqual({ ok: true });
    expect(await replacePluginProviderRows(db, [PLUGIN_ACME], second.pluginId, FROZEN_AT_MS + 1)).toEqual({ ok: true });
    expect(await db.select().from(pluginProviderContributions)).toHaveLength(2);
    const shared = await listProviderRows(db);
    expect(shared.rows).toEqual([PLUGIN_ACME]);
    expect(shared.installs.map((install) => install.ownerId).toSorted()).toEqual([first.ownerId, second.ownerId].toSorted());
    expect(shared.installs.every((install) => install.providerId === PLUGIN_PROVIDER_ID)).toBe(true);
    await deletePluginProviderRows(db, first.pluginId);
    expect(await listProviderRows(db)).toEqual({ rows: [PLUGIN_ACME], installs: [{ providerId: PLUGIN_PROVIDER_ID, ownerId: second.ownerId }] });
    await deletePluginProviderRows(db, second.pluginId);
    expect(await listProviderRows(db)).toEqual({ rows: [], installs: [] });
    expect(await db.select().from(providerRows)).toHaveLength(1);
  });

  test("refuses conflicting shared and admin definitions before any contribution write", async () => {
    const db = await freshDb();
    const harness = makePluginHarness(db);
    const admin = await seedUser(db, { handle: castId<Handle>("user_admin") });
    const first = await installedPlugin(db, harness, "user_first");
    const second = await installedPlugin(db, harness, "user_second");
    await replacePluginProviderRows(db, [PLUGIN_ACME], first.pluginId, FROZEN_AT_MS);
    expect(await replacePluginProviderRows(db, [{ ...PLUGIN_ACME, label: "Conflict" }], second.pluginId, FROZEN_AT_MS + 1)).toEqual({
      ok: false,
      conflictingId: PLUGIN_PROVIDER_ID,
    });
    expect(await db.select().from(pluginProviderContributions)).toHaveLength(1);
    await putAdminProviderRow(db, ACME, admin, FROZEN_AT_MS);
    expect(await replacePluginProviderRows(db, [ACME], second.pluginId, FROZEN_AT_MS)).toEqual({ ok: false, conflictingId: ACME_ID });
  });

  test("refuses definition replacement even by the sole contributor and reparses rows on read", async () => {
    const db = await freshDb();
    const harness = makePluginHarness(db);
    const { pluginId, ownerId } = await installedPlugin(db, harness, "user_owner");
    const replacement = { ...PLUGIN_ACME, label: "Acme v2" };
    await replacePluginProviderRows(db, [PLUGIN_ACME], pluginId, FROZEN_AT_MS);
    expect(await replacePluginProviderRows(db, [replacement], pluginId, FROZEN_AT_MS + 1)).toEqual({
      ok: false,
      conflictingId: PLUGIN_PROVIDER_ID,
    });
    expect(await listProviderRows(db)).toEqual({ rows: [PLUGIN_ACME], installs: [{ providerId: PLUGIN_PROVIDER_ID, ownerId }] });
    await db.run(sql`update provider_rows set apis = '["telepathy"]' where id = ${PLUGIN_PROVIDER_ID}`);
    await expect(listProviderRows(db)).rejects.toThrow();
  });
});
