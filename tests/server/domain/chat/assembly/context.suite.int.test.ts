import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { chatBooks, worldBooks, worldEntries } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { assemblePrompt } from "../../../../../packages/server/src/domain/chat/assembly/assemble.ts";
import { buildAssembleContext } from "../../../../../packages/server/src/domain/chat/assembly/context.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeChatContext, seedChat, seedUser } from "../_support.ts";

test("cache diagnostics name only matched, kept keyword entries at active system anchors", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, castId<Handle>("lore-host"));
  const chatId = await seedChat(db, "cache-lore");
  const bookId = mintTypeId(ID_PREFIX.worldBook);
  await db.insert(worldBooks).values({ id: bookId, ownerId, name: "Attached lore", createdAt: FROZEN_AT });
  await db.insert(chatBooks).values({ chatId, worldBookId: bookId, createdAt: FROZEN_AT });
  const entries = [
    { title: "Dragon arrival", keys: ["dragon"], metadata: { position: "before" }, enabled: true, priority: 10, content: "A dragon appears." },
    { title: "Dragon aftermath", keys: ["dragon"], metadata: { position: "after" }, enabled: true, priority: 10, content: "Ash remains." },
    { title: "Static setting", keys: [], metadata: null, enabled: true, priority: 10, content: "The hills are green." },
    { title: "Unmatched river", keys: ["river"], metadata: null, enabled: true, priority: 10, content: "A river flows." },
    { title: "Disabled dragon", keys: ["dragon"], metadata: null, enabled: false, priority: 10, content: "Never include." },
    { title: "At-depth dragon", keys: ["dragon"], metadata: { inject: { depth: 0 } }, enabled: true, priority: 10, content: "The dragon flies." },
    { title: "Over-budget dragon", keys: ["dragon"], metadata: null, enabled: true, priority: -10, content: "Long lore. ".repeat(1000) },
  ] satisfies Pick<typeof worldEntries.$inferInsert, "title" | "keys" | "metadata" | "enabled" | "priority" | "content">[];
  await db
    .insert(worldEntries)
    .values(entries.map((entry) => ({ ...entry, id: mintTypeId(ID_PREFIX.worldEntry), worldBookId: bookId, ignoreBudget: false, createdAt: FROZEN_AT })));
  const input = {
    chatId,
    ownerId,
    characterIds: [],
    personaIds: [],
    promptConfig: DEFAULT_PROMPT_CONFIG,
    personas: { anchor: null, active: null },
    recentMessages: ["A dragon appears"],
    userInjections: [],
    variableValues: {},
    model: "test-model",
    injectionTokenBudget: 100,
    timezone: UTC_TIME_ZONE,
  };
  const context = await buildAssembleContext(makeChatContext(db), input);
  const prompt = assemblePrompt(DEFAULT_PROMPT_CONFIG, context);
  expect(prompt.trace.worldInfoDynamicEntries?.map(({ title, position }) => ({ title, position }))).toEqual([
    { title: "Dragon arrival", position: "before" },
    { title: "Dragon aftermath", position: "after" },
  ]);
  expect(prompt.dynamic).toContain("A dragon appears.");
  expect(prompt.dynamic).toContain("Ash remains.");
  expect(prompt.static).toContain("The hills are green.");
  expect(context.chatInjections?.some((entry) => entry.position === "in_chat" && entry.content.includes("The dragon flies."))).toBe(true);
  expect(context.wiTrace?.dropped).toHaveLength(1);
  const noMatch = await buildAssembleContext(makeChatContext(db), { ...input, recentMessages: [] });
  expect(assemblePrompt(DEFAULT_PROMPT_CONFIG, noMatch).trace.worldInfoDynamicEntries).toEqual([]);
  const noAnchors = {
    ...DEFAULT_PROMPT_CONFIG,
    sections: DEFAULT_PROMPT_CONFIG.sections.filter(
      (section) => section.type !== "marker" || (section.marker !== "world_info_before" && section.marker !== "world_info_after"),
    ),
  };
  const unanchored = await buildAssembleContext(makeChatContext(db), { ...input, promptConfig: noAnchors });
  expect(assemblePrompt(noAnchors, unanchored).trace.worldInfoDynamicEntries).toEqual([]);
});
