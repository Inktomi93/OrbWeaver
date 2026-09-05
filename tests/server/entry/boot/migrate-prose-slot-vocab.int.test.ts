// entry/boot/migrate-prose-slot-vocab — the boot STEP for the #1737 prose-slot id data migration, against a
// real libSQL db (the .int lane). The rewrite's own semantics (stamp carry, sibling survival, idempotence,
// fail-open on garbage) are pinned at the persistence mirror,
// tests/server/domain/preset/persistence/migrate-prose-slot-vocab.int.test.ts; this file pins only what the
// boot door adds — that it reaches the persistence statement and hands back its count — so a compose-time
// rewire that stops calling it goes red here rather than silently leaving every host's heading un-migrated.

import { DEFAULT_PROMPT_CONFIG, parsePromptConfig } from "@orb/contracts/preset";
import { resolveProse } from "@orb/contracts/prose";
import type { Db } from "@orb/db";
import { presets } from "@orb/db";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { migrateProseSlotVocabOnBoot } from "@orb/server/entry/boot";
import { eq, sql } from "drizzle-orm";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";

const PRESET_ID = castId<PresetId>("preset_proseslotboot1");
const AT = 1_700_000_000_000;

/** The pre-rename spelling, written as raw column text: the typed column can no longer express the retired key. */
const OLD_KEY_CONFIG = JSON.stringify({
  schemaVersion: 1,
  sections: [],
  prose: { "chat.group.castMember": { text: "[Voice — {{name}}]", baseVersion: 1 } },
});

async function seedRawConfig(db: Db, raw: string): Promise<void> {
  await db.insert(presets).values({ id: PRESET_ID, ownerId: null, name: PRESET_ID, kind: "user", config: DEFAULT_PROMPT_CONFIG, createdAt: AT, updatedAt: AT });
  await db
    .update(presets)
    .set({ config: sql`${raw}` })
    .where(eq(presets.id, PRESET_ID));
}

async function readProse(db: Db): Promise<ReturnType<typeof parsePromptConfig>["prose"]> {
  const rows = await db
    .select({ blob: sql<string | null>`cast(${presets.config} as text)` })
    .from(presets)
    .where(eq(presets.id, PRESET_ID));
  const raw = rows.at(0)?.blob ?? null;
  return parsePromptConfig(raw === null ? null : (JSON.parse(raw) as unknown)).prose;
}

test("the boot step reaches the persistence rewrite, reports its count, and is a no-op on the next boot", async () => {
  const db = await freshDb();
  await seedRawConfig(db, OLD_KEY_CONFIG);
  expect(resolveProse("chat.group.characterHeading", await readProse(db)).source).toBe("default");

  expect(await migrateProseSlotVocabOnBoot({ db })).toBe(1);
  expect(resolveProse("chat.group.characterHeading", await readProse(db))).toStrictEqual({ text: "[Voice — {{name}}]", source: "override", stale: true });

  // The second boot matches nothing: the predicate, not a marker, is what makes it idempotent.
  expect(await migrateProseSlotVocabOnBoot({ db })).toBe(0);
});
