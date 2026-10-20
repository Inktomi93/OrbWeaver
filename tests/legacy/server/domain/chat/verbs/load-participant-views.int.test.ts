// verb: loadParticipantViews — the roster display read, driven through the production chat collection (listChats).
// @subject packages/server/src/domain/chat/verbs/load-participant-views.ts

import "@orb/testkit/node/composed-real.ts";
import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshCountedDb } from "@orb/testkit/node/db.ts";
import { test as base, expect } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";
import { principal } from "../../../../db/schema/_support.ts";
import { seedCharacter, seedChat, seedParticipant, seedUser } from "../_support.ts";

const test = base.extend<{ db: Db; observed: Awaited<ReturnType<typeof freshCountedDb>> }>({
  observed: async ({}, use) => await use(await freshCountedDb()),
  db: async ({ observed }, use) => await use(observed.db),
});

test("production chat collection resolves shared seats without fetching full cards per room", async ({ services, db, observed }) => {
  const owner = await seedUser(db, castId<Handle>("collection-scale-owner"));
  const characterId = await seedCharacter(db, owner, "collection-shared-character");
  for (let index = 0; index < 12; index += 1) {
    const chatId = await seedChat(db, `collection-scale-${index}`);
    await seedParticipant(db, { chatId, key: `collection-host-${index}`, userId: owner, role: "host" });
    await seedParticipant(db, { chatId, key: `collection-character-${index}`, characterId });
  }
  observed.queries.reset();
  const fullCards = vi.spyOn(services.character, "get");
  const page = await services.chat.listChats({ principal: await principal({ db }, owner), limit: 12 });
  expect(page.totalCount).toBe(12);
  expect(page.items).toHaveLength(12);
  expect(page.items.every((room) => room.participantPortraits.some((seat) => seat.characterId === characterId))).toBe(true);
  expect(page.items.every((room) => room.participantNames.includes("collection-shared-character"))).toBe(true);
  expect(fullCards).not.toHaveBeenCalled();
  expect(observed.queries.count()).toBeLessThanOrEqual(14);
});
