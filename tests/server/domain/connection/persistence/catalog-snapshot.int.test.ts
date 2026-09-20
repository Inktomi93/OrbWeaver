// persistence: the catalog-snapshot KV — a generic `key → json` tenant inside the shared `settings` table.
// Its contract is narrow and easy to break quietly: a missing key reads `null` (never `undefined`, never a
// throw — the mirror treats `null` as "cold" and re-warms), a re-write REPLACES in place on the injected
// clock rather than accumulating rows, keys are independent, and a NON-string settings value (the table is
// shared with real settings) reads as `null` instead of being handed to a JSON parser as an object.

import { settings } from "@orb/db";
import { eq } from "drizzle-orm";
import { createSnapshotStore } from "../../../../../packages/server/src/domain/connection/persistence/catalog-snapshot.ts";
import { createFrozenClock } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const KEY = "catalog:openrouter";

test("an absent key reads `null` — the mirror's cold signal", async () => {
  const db = await freshDb();
  const store = createSnapshotStore(db, () => 0);
  expect(await store.read(KEY)).toBeNull();
});

test("write → read round-trips the opaque string, and a re-write REPLACES in place", async () => {
  const db = await freshDb();
  const clock = createFrozenClock();
  const store = createSnapshotStore(db, () => clock.now());
  await store.write(KEY, '[{"id":"a/b"}]');
  expect(await store.read(KEY)).toBe('[{"id":"a/b"}]');
  clock.advance(5000);
  await store.write(KEY, '[{"id":"c/d"}]');
  expect(await store.read(KEY)).toBe('[{"id":"c/d"}]');
  const rows = await db.select().from(settings).where(eq(settings.key, KEY));
  expect(rows, "the snapshot is one row per key, not an append log").toHaveLength(1);
  expect(rows[0]?.updatedAt, "the stamp comes from the injected clock").toBe(clock.frozenAt + 5000);
});

test("keys are independent — one provider's snapshot never answers another's read", async () => {
  const db = await freshDb();
  const store = createSnapshotStore(db, () => 0);
  await store.write(KEY, "openrouter");
  await store.write("catalog:endpoint:http://box/v1", "endpoint");
  expect(await store.read(KEY)).toBe("openrouter");
  expect(await store.read("catalog:endpoint:http://box/v1")).toBe("endpoint");
});

test("a NON-string value in the shared settings table reads as `null`, never as a half-parsed snapshot", async () => {
  const db = await freshDb();
  const store = createSnapshotStore(db, () => 0);
  // The `settings` table is shared: a real setting under a colliding key is an object, not a JSON string.
  await db.insert(settings).values({ key: KEY, value: { notASnapshot: true }, updatedAt: 0 });
  expect(await store.read(KEY)).toBeNull();
});
