// entry/boot/migrate-plugin-tool-wire-names — the boot STEP for the #1391 wire-name migration, against a real
// libSQL db (the .int lane). Each rewrite's own semantics are pinned at its persistence mirror
// (tests/server/domain/{chat,automation}/persistence/migrate-plugin-tool-wire-names.int.test.ts); this file
// pins only what the boot DOOR adds, and that is the composition itself:
//   • it reads the INSTALLED SLUGS and derives the rename set from them (not from a hard-coded list), so a
//     box with no hyphenated plugin migrates nothing;
//   • it reaches BOTH owning domains from one call — the whole reason this step exists rather than two;
//   • and it REFUSES an ambiguous slug end to end, leaving the persisted spelling alone rather than guessing.
// A compose-time rewire that stops calling either half goes red here rather than silently leaving every
// hyphen-slug plugin's tool cards unmatched.

import { pluginManifestSchema } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { assets, automationRules, messageVariants, plugins } from "@orb/db";
import type { AssetId, AutomationRuleId, Handle, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { migratePluginToolWireNamesOnBoot } from "@orb/server/entry/boot";
import { eq, sql } from "drizzle-orm";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedChat, seedMessage, seedUser } from "../../domain/chat/_support.ts";

const AT = 1_700_000_000_000;
const RULE_ID = castId<AutomationRuleId>("arule_wirenameboot0000001");

async function installPlugin(db: Db, ownerId: UserId, slug: string): Promise<void> {
  const bundleAssetId = castId<AssetId>(`asset_${slug}`);
  await db.insert(assets).values({ id: bundleAssetId, ownerId, kind: "plugin", mime: "application/zip", size: 1, hash: `hash-${slug}`, uploadedAt: AT });
  await db.insert(plugins).values({
    id: mintTypeId(ID_PREFIX.plugin),
    ownerId,
    slug,
    name: slug,
    version: "1.0.0",
    manifest: pluginManifestSchema.parse({ id: slug, name: slug, version: "1.0.0", hostVersion: 1, entry: "main.js", description: "d", capabilities: [] }),
    bundleAssetId,
    grantedCapabilities: [],
    status: "enabled",
    origin: "upload",
    installedAt: AT,
    updatedAt: AT,
  });
}

/** Seed one persisted tool-call record AND one `run_tool` arm, both under `toolName`. */
async function seedBothHomes(db: Db, ownerId: UserId, toolName: string): Promise<MessageVariantId> {
  const chatId = await seedChat(db, "c1");
  const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant", authorUserId: ownerId });
  await db
    .update(messageVariants)
    .set({
      toolCalls: sql`${JSON.stringify([{ toolCallId: "call_1", name: toolName, arguments: "{}", result: "Ace of Cups", isError: false, durationMs: 1 }])}`,
    })
    .where(eq(messageVariants.id, variantId));
  await db.insert(automationRules).values({
    id: RULE_ID,
    ownerId,
    chatId: null,
    name: "draw on entry",
    position: 0,
    triggerBus: "chat",
    triggerType: "messageCommitted",
    actions: [{ type: "run_tool", name: toolName, argsTemplate: "{}", resultScope: "chat" }],
    createdAt: AT,
    updatedAt: AT,
  });
  return variantId;
}

async function readToolCallName(db: Db, variantId: MessageVariantId): Promise<string> {
  const rows = await db
    .select({ blob: sql<string | null>`cast(${messageVariants.toolCalls} as text)` })
    .from(messageVariants)
    .where(eq(messageVariants.id, variantId));
  return ((JSON.parse(rows.at(0)?.blob ?? "[]") as { name: string }[])[0] ?? { name: "" }).name;
}

async function readArmName(db: Db): Promise<string> {
  const rows = await db
    .select({ blob: sql<string | null>`cast(${automationRules.actions} as text)` })
    .from(automationRules)
    .where(eq(automationRules.id, RULE_ID));
  return ((JSON.parse(rows.at(0)?.blob ?? "[]") as { name: string }[])[0] ?? { name: "" }).name;
}

test("the boot door derives the rename from the INSTALLED slug and reaches BOTH owning domains", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, castId<Handle>("alice"));
  await installPlugin(db, ownerId, "oracle-deck");
  const variantId = await seedBothHomes(db, ownerId, "plugin_oracle_deck_draw");

  // Two homes, one call — a chat variant's record and an automation rule's arm.
  expect(await migratePluginToolWireNamesOnBoot({ db })).toBe(2);

  expect(await readToolCallName(db, variantId)).toBe("plugin_oracle__deck_draw");
  expect(await readArmName(db)).toBe("plugin_oracle__deck_draw");
  // Idempotent through the door as well as through each statement.
  expect(await migratePluginToolWireNamesOnBoot({ db })).toBe(0);
});

test("NOTHING is rewritten when the naming plugin is not installed — the rename set is DERIVED, never assumed", async () => {
  // The same stored bytes as above, on a box where `oracle-deck` was never installed. This is the planted
  // control for the whole step: if it rewrote here, it would be pattern-matching `plugin_*` rather than
  // reasoning about who owns the namespace.
  const db = await freshDb();
  const ownerId = await seedUser(db, castId<Handle>("alice"));
  const variantId = await seedBothHomes(db, ownerId, "plugin_oracle_deck_draw");

  expect(await migratePluginToolWireNamesOnBoot({ db })).toBe(0);

  expect(await readToolCallName(db, variantId)).toBe("plugin_oracle_deck_draw");
  expect(await readArmName(db)).toBe("plugin_oracle_deck_draw");
});

test("an AMBIGUOUS slug pair is refused end to end — the persisted spelling is left alone, never guessed", async () => {
  // `oracle` beside `oracle-deck` makes `plugin_oracle_deck_draw` unreadable: it is either `oracle-deck`'s
  // `draw` or `oracle`'s `deck_draw`. Guessing would move one plugin's cards onto the other's namespace.
  const db = await freshDb();
  const ownerId = await seedUser(db, castId<Handle>("alice"));
  await installPlugin(db, ownerId, "oracle-deck");
  await installPlugin(db, ownerId, "oracle");
  const variantId = await seedBothHomes(db, ownerId, "plugin_oracle_deck_draw");

  expect(await migratePluginToolWireNamesOnBoot({ db })).toBe(0);

  expect(await readToolCallName(db, variantId)).toBe("plugin_oracle_deck_draw");
  expect(await readArmName(db)).toBe("plugin_oracle_deck_draw");
});
