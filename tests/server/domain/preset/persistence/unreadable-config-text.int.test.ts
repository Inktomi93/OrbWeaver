// A preset whose stored config text is not JSON reads as unreadable, with the reset door, instead of throwing: the
// config column carries the text whole, the read names `not-json`, the guarded config write refuses and keeps the
// bytes, and reset repairs the row.
// @subject packages/server/src/domain/preset/persistence/queries.ts
// @subject packages/db/src/custom-types/index.ts
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import { presets } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq, sql } from "drizzle-orm";
import { STORED_CONFIG_UNREADABLE } from "#server/primitives/stored-config/index.ts";

// Text a truncated write leaves behind: no JSON parser reads it.
const NOT_JSON = '{"schemaVersion": 3, "sections": [';

test("a preset holding text that is not JSON reads as unreadable, refuses a config write and keeps its bytes until reset", async ({ harness }) => {
  const userId = harness.ownerId;
  const created = await harness.services.preset.create({ userId, name: "Kept", kind: "chat", config: DEFAULT_PROMPT_CONFIG });
  await harness.db
    .update(presets)
    .set({ config: sql`${NOT_JSON}` })
    .where(eq(presets.id, created.id));
  // The stored text itself, read past the column's decoding.
  const stored = async (): Promise<unknown> =>
    await harness.db
      .select({ text: sql<string>`${presets.config}` })
      .from(presets)
      .where(eq(presets.id, created.id));
  const before = await stored();

  const read = await harness.services.preset.get({ userId, id: created.id });
  expect({ configUnreadable: read.configUnreadable, config: read.config }).toEqual({
    configUnreadable: VERSIONED_PARSE_FAILURES.notJson,
    config: DEFAULT_PROMPT_CONFIG,
  });
  await expect(harness.services.preset.update({ userId, id: created.id, config: read.config })).rejects.toMatchObject({ code: STORED_CONFIG_UNREADABLE });
  expect(await stored()).toEqual(before);
  // A name-only write never reads the config, so it is not refused, and it leaves the bytes as they are.
  await harness.services.preset.update({ userId, id: created.id, name: "Renamed" });
  expect(await stored()).toEqual(before);

  const reset = await harness.services.preset.resetToDefault({ userId, id: created.id });
  expect(reset.configUnreadable).toBeNull();
  expect(await stored()).not.toEqual(before);
});
