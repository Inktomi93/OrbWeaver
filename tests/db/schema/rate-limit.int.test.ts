// .int test for schema/rate-limit: the natural-key round-trip, the count default and the unique key the
// limiter's atomic upsert conflicts on. The limiter's own consume and expiry sweep are pinned through the
// production limiter in `tests/server/transport/rate-limit.int.test.ts`. Real libSQL :memory: via freshDb.

import { rateLimitBuckets } from "@orb/db";
import { isConstraintViolation } from "@orb/db/query";
import { eq } from "drizzle-orm";
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
