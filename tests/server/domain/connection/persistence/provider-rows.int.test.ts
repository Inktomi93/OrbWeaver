// persistence: `provider_rows` — the runtime `ProviderStore` over plugin-shipped and admin-added rows. Two
// properties carry the weight: the read re-parses every stored row through `providerDefSchema` (a row this
// deployment can no longer satisfy must fail LOUDLY at the read rather than reaching the registry as a
// half-provider), and `put` is an UPSERT by id whose origin columns are the kind-shape pair — a plugin row
// and an admin row are distinguishable at rest, which is what a later "drop everything this plugin added"
// depends on.

import type { ProviderDef, ProviderId } from "@orb/contracts/inference";
import { providerRows } from "@orb/db";
import type { PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { describe } from "vitest";
import { deleteProviderRow, listProviderRows, putProviderRow } from "../../../../../packages/server/src/domain/connection/persistence/provider-rows.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const ACME_ID = castId<ProviderId>("acme-endpoint");
const PLUGIN_ID = castId<PluginId>("plugin_000001");

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

describe("put / list", () => {
  test("round-trips a row and UPSERTS by id rather than accumulating duplicates", async () => {
    const db = await freshDb();
    const admin: UserId = await seedUser(db, "user_admin");
    await putProviderRow(db, ACME, { admin }, FROZEN_AT_MS);
    expect(await listProviderRows(db)).toEqual([ACME]);
    await putProviderRow(db, { ...ACME, label: "Acme v2" }, { admin }, FROZEN_AT_MS + 1000);
    const rows = await listProviderRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("Acme v2");
  });

  test("the ORIGIN is stored as the kind-shape pair, and a plugin origin must name a REAL plugin", async () => {
    const db = await freshDb();
    const admin = await seedUser(db, "user_admin");
    await putProviderRow(db, ACME, { admin }, FROZEN_AT_MS);
    expect(await db.select().from(providerRows)).toMatchObject([{ originKind: "admin", originUserId: admin, originPluginId: null }]);
    // The FK is the enforcement: a plugin-origin row for an uninstalled plugin cannot exist at rest, which
    // is what "drop everything this plugin added" later depends on.
    await expect(
      putProviderRow(db, { ...ACME, id: castId<ProviderId>("plugin-provider") }, { plugin: PLUGIN_ID }, FROZEN_AT_MS),
    ).rejects.toThrow();
    expect(await listProviderRows(db)).toHaveLength(1);
  });

  test("a stored row that no longer satisfies the schema fails LOUDLY at the read", async () => {
    const db = await freshDb();
    const admin = await seedUser(db, "user_admin");
    await putProviderRow(db, ACME, { admin }, FROZEN_AT_MS);
    // An `apis` member this build does not know — the column carries no CHECK (the tuple lives in zod), so
    // this is exactly the shape an older/newer deployment's row arrives in.
    await db.run(sql`update provider_rows set apis = '["telepathy"]' where id = ${ACME_ID}`);
    await expect(listProviderRows(db), "a half-parsed provider must never reach the registry").rejects.toThrow();
  });
});

describe("remove", () => {
  test("drops exactly the named row", async () => {
    const db = await freshDb();
    const admin = await seedUser(db, "user_admin");
    const other = castId<ProviderId>("other-endpoint");
    await putProviderRow(db, ACME, { admin }, FROZEN_AT_MS);
    await putProviderRow(db, { ...ACME, id: other }, { admin }, FROZEN_AT_MS);
    await deleteProviderRow(db, ACME_ID);
    expect((await listProviderRows(db)).map((row) => row.id)).toEqual([other]);
  });
});
