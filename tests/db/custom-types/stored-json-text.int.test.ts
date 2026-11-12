// @subject packages/db/src/custom-types/index.ts
// A stored-JSON column reads text that is not JSON as an `UnreadableJsonText` instead of throwing, and writing that
// value back stores the same text, so no read-then-write path can replace the bytes it could not read.
import { settings } from "@orb/db";
import { UnreadableJsonText } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import { eq, sql } from "drizzle-orm";

const KEY = "catalog:probe";
const NOT_JSON = '{"models": [1, 2';

test("text that is not JSON reads as its unreadable value and writes back byte for byte", async ({ harness }) => {
  await harness.db.insert(settings).values({ key: KEY, value: sql`${NOT_JSON}`, updatedAt: 1 });
  const rawText = async (): Promise<string | undefined> =>
    (
      await harness.db
        .select({ text: sql<string>`${settings.value}` })
        .from(settings)
        .where(eq(settings.key, KEY))
    )[0]?.text;

  const [row] = await harness.db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY));
  expect(row?.value).toEqual(new UnreadableJsonText(NOT_JSON));

  await harness.db
    .update(settings)
    .set({ value: row?.value ?? null, updatedAt: 2 })
    .where(eq(settings.key, KEY));
  expect(await rawText()).toBe(NOT_JSON);

  // Positive control: a JSON value reads as itself and is stored as its JSON text.
  await harness.db
    .update(settings)
    .set({ value: { models: [1, 2] }, updatedAt: 3 })
    .where(eq(settings.key, KEY));
  expect((await harness.db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY)))[0]?.value).toEqual({ models: [1, 2] });
  expect(await rawText()).toBe('{"models":[1,2]}');
});
