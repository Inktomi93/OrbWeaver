// The provider store over the real DB: admin rows are deployment-wide, and a plugin row reaches a user only
// through their own claim (D147, D265). The claims are permanent per owner, independent across owners, and
// survive their install as tombstones; the constraints keep admin and plugin ids apart.

import type { ProviderDef, ProviderId } from "@orb/contracts/inference";
import { pluginProviderClaims, providerRows } from "@orb/db";
import type { Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { describe } from "vitest";
import {
  deleteAdminProviderRow,
  listProviderRows,
  putAdminProviderRow,
  releasePluginProviderClaims,
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
const OTHER_ACME: ProviderDef = { ...PLUGIN_ACME, label: "Other Acme" };

/** An installed, ENABLED plugin (the harness's own provider lifecycle is a no-op, so no claim exists yet). */
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

describe("admin rows", () => {
  test("round-trip, replace in place and delete", async () => {
    const db = await freshDb();
    const admin: UserId = await seedUser(db, { handle: castId<Handle>("user_admin") });
    await putAdminProviderRow(db, ACME, admin, FROZEN_AT_MS);
    await putAdminProviderRow(db, { ...ACME, label: "Acme v2" }, admin, FROZEN_AT_MS + 1);
    await putAdminProviderRow(db, { ...ACME, label: "Acme v2" }, admin, FROZEN_AT_MS + 2);
    expect(await listProviderRows(db)).toEqual({ rows: [{ ...ACME, label: "Acme v2" }], installs: [] });
    expect(await deleteAdminProviderRow(db, ACME_ID)).toBe(true);
    expect(await deleteAdminProviderRow(db, ACME_ID)).toBe(false);
    expect(await listProviderRows(db)).toEqual({ rows: [], installs: [] });
  });

  test("the namespace constraint keeps an admin row off a plugin id and a plugin row off a bare id", async () => {
    const db = await freshDb();
    const admin: UserId = await seedUser(db, { handle: castId<Handle>("user_admin") });
    await expect(putAdminProviderRow(db, PLUGIN_ACME, admin, FROZEN_AT_MS)).rejects.toThrow();
    await expect(
      db.run(sql`insert into provider_rows (id, label, wire, auth, apis, catalog, metered, definition_hash, origin_kind)
        values (${ACME_ID}, 'x', 'openai-compat', 'endpoint', '["chat-completions"]', 'url', 0, 'h', 'plugin')`),
    ).rejects.toThrow();
  });
});

describe("plugin claims", () => {
  test("owners of identical definitions share one row, and each release narrows only its own install", async () => {
    const db = await freshDb();
    const harness = makePluginHarness(db);
    const first = await installedPlugin(db, harness, "user_first");
    const second = await installedPlugin(db, harness, "user_second");
    expect(await replacePluginProviderRows(db, [PLUGIN_ACME], first.pluginId, FROZEN_AT_MS)).toEqual({ ok: true });
    expect(await replacePluginProviderRows(db, [PLUGIN_ACME], second.pluginId, FROZEN_AT_MS + 1)).toEqual({ ok: true });
    expect(await db.select().from(providerRows)).toHaveLength(1);
    const shared = await listProviderRows(db);
    expect(shared.installs.map((install) => install.ownerId).toSorted()).toEqual([first.ownerId, second.ownerId].toSorted());
    expect(shared.installs.every((install) => install.row.id === PLUGIN_PROVIDER_ID)).toBe(true);

    await releasePluginProviderClaims(db, first.pluginId);
    expect(await listProviderRows(db)).toEqual({ rows: [], installs: [{ ownerId: second.ownerId, row: PLUGIN_ACME }] });
    await releasePluginProviderClaims(db, second.pluginId);
    expect(await listProviderRows(db)).toEqual({ rows: [], installs: [] });
    // Both claims remain as their owners' tombstones, so the definition they name is kept.
    expect(await db.select().from(pluginProviderClaims)).toHaveLength(2);
    expect(await db.select().from(providerRows)).toHaveLength(1);
  });

  test("one owner's claim never blocks or answers for another owner's different definition", async () => {
    const db = await freshDb();
    const harness = makePluginHarness(db);
    const squatter = await installedPlugin(db, harness, "user_squatter");
    const genuine = await installedPlugin(db, harness, "user_genuine");
    expect(await replacePluginProviderRows(db, [OTHER_ACME], squatter.pluginId, FROZEN_AT_MS)).toEqual({ ok: true });
    expect(await replacePluginProviderRows(db, [PLUGIN_ACME], genuine.pluginId, FROZEN_AT_MS + 1)).toEqual({ ok: true });

    const { installs } = await listProviderRows(db);
    expect(installs.find((install) => install.ownerId === genuine.ownerId)?.row).toEqual(PLUGIN_ACME);
    expect(installs.find((install) => install.ownerId === squatter.ownerId)?.row).toEqual(OTHER_ACME);
    expect(await db.select().from(providerRows)).toHaveLength(2);
  });

  test("an owner's claim refuses a changed definition before any write, even after its install is gone", async () => {
    const db = await freshDb();
    const harness = makePluginHarness(db);
    const { pluginId, ownerId } = await installedPlugin(db, harness, "user_owner");
    await replacePluginProviderRows(db, [PLUGIN_ACME], pluginId, FROZEN_AT_MS);
    expect(await replacePluginProviderRows(db, [OTHER_ACME], pluginId, FROZEN_AT_MS + 1)).toEqual({ ok: false, conflictingId: PLUGIN_PROVIDER_ID });
    expect(await listProviderRows(db)).toEqual({ rows: [], installs: [{ ownerId, row: PLUGIN_ACME }] });
    expect(await db.select().from(providerRows)).toHaveLength(1);

    await harness.service.uninstall({ caller: principalFor(ownerId), pluginId });
    const [tombstone] = await db.select().from(pluginProviderClaims).where(eq(pluginProviderClaims.ownerId, ownerId));
    expect(tombstone?.pluginId).toBeNull();
    const reinstalled = await harness.service.install({ caller: principalFor(ownerId), bundle: makeBundle({ id: "test-plugin" }), grant: [] });
    expect(await replacePluginProviderRows(db, [OTHER_ACME], reinstalled.id, FROZEN_AT_MS + 2)).toEqual({ ok: false, conflictingId: PLUGIN_PROVIDER_ID });
  });

  test("two concurrent claims of one owner's id with different definitions leave exactly one bound and served", async () => {
    const db = await freshDb();
    const harness = makePluginHarness(db);
    const { pluginId, ownerId } = await installedPlugin(db, harness, "user_owner");
    const second = await harness.service.install({ caller: principalFor(ownerId), bundle: makeBundle({ id: "second-plugin" }), grant: [] });
    await harness.service.setEnabled({ caller: principalFor(ownerId), pluginId: second.id, enabled: true });

    const outcomes = await Promise.all([
      replacePluginProviderRows(db, [PLUGIN_ACME], pluginId, FROZEN_AT_MS),
      replacePluginProviderRows(db, [OTHER_ACME], second.id, FROZEN_AT_MS),
    ]);
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    const winner = outcomes[0]?.ok === true ? PLUGIN_ACME : OTHER_ACME;
    expect(await listProviderRows(db)).toEqual({ rows: [], installs: [{ ownerId, row: winner }] });
  });

  test("reconciliation unlinks a disabled install's claim and reaps a definition no claim names", async () => {
    const db = await freshDb();
    const harness = makePluginHarness(db);
    const { pluginId, ownerId } = await installedPlugin(db, harness, "user_owner");
    await replacePluginProviderRows(db, [PLUGIN_ACME], pluginId, FROZEN_AT_MS);
    await harness.service.setEnabled({ caller: principalFor(ownerId), pluginId, enabled: false });
    expect(await listProviderRows(db)).toEqual({ rows: [], installs: [] });
    const [claim] = await db.select().from(pluginProviderClaims);
    expect(claim?.pluginId).toBeNull();

    await db.delete(pluginProviderClaims);
    await listProviderRows(db);
    expect(await db.select().from(providerRows)).toEqual([]);
  });

  test("reads re-parse every row", async () => {
    const db = await freshDb();
    const harness = makePluginHarness(db);
    const { pluginId } = await installedPlugin(db, harness, "user_owner");
    await replacePluginProviderRows(db, [PLUGIN_ACME], pluginId, FROZEN_AT_MS);
    await db.run(sql`update provider_rows set apis = '["telepathy"]' where id = ${PLUGIN_PROVIDER_ID}`);
    await expect(listProviderRows(db)).rejects.toThrow();
  });
});
