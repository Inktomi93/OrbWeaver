// The owned distillation writer stores the character_summaries row the smart picker reads as a candidate's
// pitch, scoped to the owning character; an undistilled character has no row.
// @subject packages/server/src/domain/chat/engine/smart-arbitrate.ts
// @subject packages/server/src/domain/chat/engine/rerank-pick.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { characterSummaries, characters } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { seedCharacterDistillationsRows } from "@orb/testkit/node/rows";
import { eq } from "drizzle-orm";
import { send, smartRoom } from "../verbs/smart-picker.fixtures.ts";
import { B_UTILITY_MODEL, saveSpeakerConnection, speakerInputs } from "../verbs/speaker-funding-physical.ts";

test("the real owned distillation writer supplies the native candidate pitch", async () => {
  await using room = await smartRoom(
    { chat: ["Bryn guides the caravan."], picks: [["bryn"]], pitch: "The caravan's guide." },
    {
      characters: [
        createCharacterSchema.parse({ handle: "aria", name: "aria", description: "" }),
        createCharacterSchema.parse({ handle: "bryn", name: "bryn", description: "The caravan's guide knows every crossing." }),
      ],
    },
  );
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize");
  const bryn = room.h.characters[1];
  if (bryn === undefined) {
    throw new Error("missing actual bryn card");
  }
  const distilled = await seedCharacterDistillationsRows(room.h.root, {
    ownerId: room.h.owner.userId,
    funderUserId: room.h.owner.userId,
    characterId: bryn.id,
  });
  expect(distilled.result).toMatchObject({ distilled: 1, failed: 0 });
  expect(distilled.summaries).toMatchObject([{ characterId: bryn.id, elevatorPitch: "The caravan's guide." }]);
  expect(
    await room.h.root.db
      .select({ characterId: characterSummaries.characterId, ownerId: characters.ownerId })
      .from(characterSummaries)
      .innerJoin(characters, eq(characters.id, characterSummaries.characterId))
      .where(eq(characterSummaries.characterId, bryn.id))
      .get(),
  ).toEqual({ characterId: bryn.id, ownerId: room.h.owner.userId });
  const aria = room.h.characters[0];
  if (aria === undefined) {
    throw new Error("missing actual aria card");
  }
  expect(aria.description).toBe("");
  expect(await room.h.root.db.select().from(characterSummaries).where(eq(characterSummaries.characterId, aria.id))).toEqual([]);
  await send(room, "how far to the crossing?");
  const inputs = (await speakerInputs(room.peer.requests, B_UTILITY_MODEL)).filter((body) => body.response_format?.json_schema.name === "speaker_pick");
  expect(inputs).toHaveLength(1);
  const prompt = inputs[0]?.messages.find((m) => m.role === "user")?.content;
  expect(prompt).toMatch(/^- bryn: The caravan's guide\. \(spoke 0 of the last 1 lines, talkativeness \d+%\)$/mu);
  expect(prompt).toMatch(/^- aria \(spoke/mu);
});
