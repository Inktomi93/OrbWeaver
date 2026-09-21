// The durable host-handoff completion marker: it round-trips its parsed actor-rekey plan, clears only for
// the accepted host that owns it, and fails loudly when the private JSON cell is corrupt.

import type { Db } from "@orb/db";
import { chatHandoffResumptions } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { CharacterId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import {
  clearHandoffResumption,
  insertHandoffResumptionStatement,
  loadHandoffResumption,
} from "../../../../../packages/server/src/domain/chat/persistence/handoff-resume.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, seedChat, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("handoff resumption persistence", () => {
  test("round-trips the accepted host's actor plan and ignores a stale host clear", async () => {
    const acceptedByUserId = await seedUser(db, castId<Handle>("accepted"));
    const staleUserId = await seedUser(db, castId<Handle>("stale"));
    const chatId = await seedChat(db, "handoff");
    const sourceCharacterId = castId<CharacterId>("character_source");
    const characterId = castId<CharacterId>("character_copy");

    await db.batch(
      batchMany([
        insertHandoffResumptionStatement(db, {
          chatId,
          acceptedByUserId,
          actorRekeys: [{ sourceCharacterId, characterId }],
          now: FROZEN_AT,
        }),
      ]),
    );

    await expect(loadHandoffResumption(db, chatId)).resolves.toEqual({
      chatId,
      acceptedByUserId,
      actorRekeys: [{ sourceCharacterId, characterId }],
    });

    await clearHandoffResumption(db, chatId, staleUserId);
    await expect(loadHandoffResumption(db, chatId)).resolves.not.toBeNull();

    await clearHandoffResumption(db, chatId, acceptedByUserId);
    await expect(loadHandoffResumption(db, chatId)).resolves.toBeNull();
  });

  test("rejects a corrupt actor-rekey payload", async () => {
    const acceptedByUserId = await seedUser(db, castId<Handle>("accepted"));
    const chatId = await seedChat(db, "corrupt-handoff");
    await db.insert(chatHandoffResumptions).values({
      chatId,
      acceptedByUserId,
      actorRekeys: [{ sourceCharacterId: "", characterId: "character_copy" }],
      createdAt: FROZEN_AT,
    });

    await expect(loadHandoffResumption(db, chatId)).rejects.toThrow();
  });
});
