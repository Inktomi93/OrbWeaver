// .int test for schema/rate-limit: the natural-key round-trip and the atomic
// `INSERT … ON CONFLICT(key) DO UPDATE SET count = count + 1 … RETURNING count` upsert the DB-backed
// limiter relies on (Tier-4-Transport.md esoteric #2 — the SELECT-then-UPDATE-race-free consume path). Real
// libSQL :memory: via freshDb.

import { rateLimitBuckets } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import { eq, sql } from "drizzle-orm";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";

const WINDOW_MS = 60_000;

// A bucket key in the `scope:id:windowStart` shape the lazy sweep's `LIKE 'scope:%'` prefix scan keys on.
function bucketKey(scope: string, id: string, windowStart: number): string {
  return `${scope}:${id}:${windowStart}`;
}

test("rate_limit_buckets insert→select round-trips (natural key, count, expiresAt)", async () => {
  const db = await freshDb();
  const key = bucketKey("authed", "user_a", 0);
  const expiresAt = WINDOW_MS;
  await db.insert(rateLimitBuckets).values({ key, count: 1, expiresAt });

  const rows = await db.select().from(rateLimitBuckets).where(eq(rateLimitBuckets.key, key));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.key).toBe(key);
  expect(rows[0]?.count).toBe(1);
  expect(rows[0]?.expiresAt).toEqual(expiresAt);
});

test("count defaults to 0 when omitted", async () => {
  const db = await freshDb();
  const key = bucketKey("publicIp", "1.2.3.4", 0);
  await db.insert(rateLimitBuckets).values({ key, expiresAt: WINDOW_MS });
  const rows = await db.select().from(rateLimitBuckets).where(eq(rateLimitBuckets.key, key));
  expect(rows[0]?.count).toBe(0);
});

test("the atomic upsert increments count on conflict and RETURNING reflects the new value", async () => {
  const db = await freshDb();
  const key = bucketKey("authed", "user_b", 0);
  const expiresAt = WINDOW_MS;

  // The limiter's consume: insert-or-increment, returning the post-increment count to compare to the cap.
  async function consume(): Promise<number | undefined> {
    const result = await db
      .insert(rateLimitBuckets)
      .values({ key, count: 1, expiresAt })
      .onConflictDoUpdate({
        target: rateLimitBuckets.key,
        set: { count: sql`${rateLimitBuckets.count} + 1` },
      })
      .returning({ count: rateLimitBuckets.count });
    return result[0]?.count;
  }

  expect(await consume()).toBe(1); // first hit inserts
  expect(await consume()).toBe(2); // conflict → increment
  expect(await consume()).toBe(3);

  const rows = await db.select().from(rateLimitBuckets).where(eq(rateLimitBuckets.key, key));
  expect(rows).toHaveLength(1); // still ONE row — the upsert never duplicated the key
  expect(rows[0]?.count).toBe(3);
});

test("the natural key is unique — a plain re-insert of the same key is a UNIQUE violation", async () => {
  const db = await freshDb();
  const key = bucketKey("general", "user_c", 0);
  const expiresAt = WINDOW_MS;
  await db.insert(rateLimitBuckets).values({ key, expiresAt });

  let caught: unknown;
  try {
    await db.insert(rateLimitBuckets).values({ key, expiresAt });
  } catch (err) {
    caught = err;
  }
  const violation = isConstraintViolation(caught);
  expect(violation).toBeDefined();
  expect(violation?.kind).toBe("unique");
});

test("the lazy-sweep prefix scan: expired same-scope buckets are selectable by `key LIKE 'scope:%'`", async () => {
  const db = await freshDb();
  const now = WINDOW_MS * 10;
  // Two expired `authed:` buckets + one live `publicIp:` bucket.
  await db.insert(rateLimitBuckets).values([
    { key: bucketKey("authed", "u1", 0), count: 5, expiresAt: WINDOW_MS },
    { key: bucketKey("authed", "u2", 0), count: 9, expiresAt: WINDOW_MS * 2 },
    { key: bucketKey("publicIp", "9.9.9.9", now), count: 1, expiresAt: now + WINDOW_MS },
  ]);

  // The sweep predicate: same-scope prefix AND expired.
  const swept = await db
    .delete(rateLimitBuckets)
    .where(sql`${rateLimitBuckets.key} like 'authed:%' and ${rateLimitBuckets.expiresAt} < ${now}`)
    .returning({ key: rateLimitBuckets.key });
  expect(swept).toHaveLength(2);

  const remaining = await db.select().from(rateLimitBuckets);
  expect(remaining).toHaveLength(1);
  expect(remaining[0]?.key.startsWith("publicIp:")).toBe(true);
});
