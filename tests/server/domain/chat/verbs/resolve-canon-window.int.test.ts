// op: resolveCanonWindow (crunchy-cluster §1.3 — the rpg resync's deep story feed) — against a real libSQL db.
// Proves: the selected-lineage canon projects into the SAME name-stamped, token-measured transcript the engine
// threads (assistant → character name, user → persona name, system → null), oldest→newest; the token budget
// slices newest-first (a small budget keeps the recent tail, drops the oldest); an empty chat returns []. This
// is the injected chat op the rpg resync verb reads its window through (rpg reads no chat table).

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach } from "vitest";
import { createResolveCanonWindow } from "../../../../../packages/server/src/domain/chat/verbs/resolve-canon-window.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedPersona, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

test("projects the selected-lineage canon, name-stamped + chronological, within the token budget", async () => {
  const chatId = await seedChat(db, "w");
  const userId = await seedUser(db, castId<Handle>("host"));
  // seedCharacter/seedPersona use the key as the NAME (character_<key> / persona_<key>).
  const characterId = await seedCharacter(db, userId, "Mara");
  const personaId = await seedPersona(db, userId, "Aldric");

  await seedMessage(db, chatId, 1, { role: "user", personaId, content: "I draw my sword." });
  await seedMessage(db, chatId, 2, { role: "assistant", characterId, content: "Mara parries." });

  const resolveCanonWindow = createResolveCanonWindow(makeChatContext(db));
  const window = await resolveCanonWindow(chatId, { maxTokens: 10_000 });

  // Chronological (oldest→newest), name-stamped by role origin (user→persona, assistant→character).
  expect(window.map((m) => ({ role: m.role, speakerName: m.speakerName, content: m.content }))).toEqual([
    { role: "user", speakerName: "Aldric", content: "I draw my sword." },
    { role: "assistant", speakerName: "Mara", content: "Mara parries." },
  ]);
  // Every row carries a positive token measure (the consumer budgets off it).
  expect(window.every((m) => m.tokens > 0)).toBe(true);
});

test("a tiny budget keeps the RECENT tail (newest-first fill), never the oldest", async () => {
  const chatId = await seedChat(db, "w2");
  await seedMessage(db, chatId, 1, { role: "assistant", content: "the oldest beat that should fall out of a tiny window" });
  await seedMessage(db, chatId, 2, { role: "assistant", content: "newest" });

  const resolveCanonWindow = createResolveCanonWindow(makeChatContext(db));
  // A budget that fits only ~one short message — the newest survives, the long oldest is dropped.
  const window = await resolveCanonWindow(chatId, { maxTokens: 3 });

  expect(window).toHaveLength(1);
  expect(window[0]?.content).toBe("newest");
});

test("an empty chat returns an empty window (no throw)", async () => {
  const chatId = await seedChat(db, "w3");
  const resolveCanonWindow = createResolveCanonWindow(makeChatContext(db));
  await expect(resolveCanonWindow(chatId, { maxTokens: 4096 })).resolves.toEqual([]);
});
