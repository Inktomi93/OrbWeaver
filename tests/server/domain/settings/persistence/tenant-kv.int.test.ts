import { databaseHandle } from "@orb/db/wiring-driver";
import "@orb/testkit/node/composed-real.ts";
import { CATALOG_SETTINGS_PREFIX } from "@orb/contracts/settings";
import { settings } from "@orb/db";
import { createSettingsKvPort } from "@orb/server/domain/settings";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";

test("tenant KV preserves stored keys, opaque values and overwrite timestamps", async ({ db, clock }) => {
  const key = `${CATALOG_SETTINGS_PREFIX}openrouter`;
  await db.insert(settings).values({ key, value: "persisted snapshot", updatedAt: 1 });
  const kv = createSettingsKvPort(databaseHandle(db), CATALOG_SETTINGS_PREFIX, () => clock.now());
  expect(await kv.read(key)).toBe("persisted snapshot");
  expect(await kv.read(`${CATALOG_SETTINGS_PREFIX}absent`)).toBeUndefined();
  await kv.write(key, "updated snapshot");
  clock.advance(5000);
  await kv.write(key, { opaque: [null, true, 3] });
  expect(await kv.read(key)).toEqual({ opaque: [null, true, 3] });
  expect(await db.select().from(settings).where(eq(settings.key, key))).toEqual([{ key, value: { opaque: [null, true, 3] }, updatedAt: clock.now() }]);
});

test("tenant KV refuses foreign reads, writes and prefix deletion without touching rows", async ({ db, clock, services }) => {
  await services.settings.setGlobalSetting("application:marker", { kept: true });
  const kv = createSettingsKvPort(databaseHandle(db), CATALOG_SETTINGS_PREFIX, () => clock.now());
  await kv.write(`${CATALOG_SETTINGS_PREFIX}kept`, "owned snapshot");
  for (const key of ["application:marker", "", "app", "catalog", "Catalog:other", "catalogue:other"]) {
    await expect(kv.read(key)).rejects.toMatchObject({ code: "settings_tenant_namespace" });
    await expect(kv.write(key, "cross-tenant write")).rejects.toMatchObject({ code: "settings_tenant_namespace" });
    await expect(kv.deletePrefix(key)).rejects.toMatchObject({ code: "settings_tenant_namespace" });
  }
  expect(await kv.read(`${CATALOG_SETTINGS_PREFIX}kept`)).toBe("owned snapshot");
  expect((await services.settings.getGlobalSetting("application:marker"))?.value).toEqual({ kept: true });
});

test("prefix deletion treats URL underscores, percent signs and case as literal bytes", async ({ db, clock }) => {
  const kv = createSettingsKvPort(databaseHandle(db), CATALOG_SETTINGS_PREFIX, () => clock.now());
  const prefix = `${CATALOG_SETTINGS_PREFIX}endpoint:http://Box_1/v%2F#`;
  const keys = [
    prefix + "list",
    prefix + "ollama",
    prefix.slice(0, -1),
    prefix.replace("_", "X") + "list",
    prefix.replace("%", "XX") + "list",
    prefix.toLowerCase() + "list",
  ];
  for (const key of keys) {
    await kv.write(key, key);
  }
  await kv.deletePrefix(prefix);
  expect(await Promise.all(keys.map((key) => kv.read(key)))).toEqual([undefined, undefined, ...keys.slice(2)]);
  await kv.deletePrefix(CATALOG_SETTINGS_PREFIX);
  expect(await Promise.all(keys.map((key) => kv.read(key)))).toEqual(keys.map(() => undefined));
});

test("prefix deletion counts Unicode characters consistently for exact keys and descendants", async ({ db, clock }) => {
  const kv = createSettingsKvPort(databaseHandle(db), CATALOG_SETTINGS_PREFIX, () => clock.now());
  for (const part of ["ascii", "😀"]) {
    const prefix = `${CATALOG_SETTINGS_PREFIX}${part}:`;
    const matching = [prefix, prefix + "one", prefix + "two"];
    const siblings = [prefix.slice(0, -1), prefix.slice(0, -1) + ";one"];
    for (const key of [...matching, ...siblings]) {
      await kv.write(key, key);
    }
    await kv.deletePrefix(prefix);
    expect(await Promise.all(matching.map((key) => kv.read(key)))).toEqual(matching.map(() => undefined));
    expect(await Promise.all(siblings.map((key) => kv.read(key)))).toEqual(siblings);
  }
});
