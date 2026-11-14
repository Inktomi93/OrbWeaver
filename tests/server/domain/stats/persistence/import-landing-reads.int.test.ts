// The stats reads that reach messages by character or a room by its anchor persona, not through its roster, leave out
// a room an import is still landing: a model's character reach and a persona's usage count it once it has landed.
// @subject packages/server/src/domain/stats/persistence/rollups.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { ModelStatRow, PersonaUsageRow } from "@orb/contracts/stats";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness, TranscriptLine } from "@orb/testkit/node/composed";
import { createServerHarness, seedTranscript, transcriptFile } from "@orb/testkit/node/composed";
import { duringChatLanding } from "@orb/testkit/node/rows";
import { LANDING_STAGE_ROWS } from "#server/domain/chat/persistence/import-landing.ts";

const PERSONA = "Lantern Wanderer";
const MODEL = "lamp-writer-1";
// A one-line message is two rows, so this is several landing stages.
const ROOM_MESSAGES = 4 * (LANDING_STAGE_ROWS / 2) + 1;

function transcriptLines(messageCount: number): TranscriptLine[] {
  return Array.from({ length: messageCount }, (_, turn) =>
    turn % 2 === 0 ? { role: "user", content: `line ${String(turn)}` } : { role: "assistant", content: `line ${String(turn)}`, model: MODEL },
  );
}

interface Reads {
  readonly reach: ModelStatRow["charactersUsedWith"] | undefined;
  readonly usage: PersonaUsageRow["chatCount"] | undefined;
}

async function reads(root: ServerTestHarness): Promise<Reads> {
  // The model row is a rollup, so a rebuild writes it from the landed canon; the reach and the usage are read live.
  await root.services.stats.reconcile(root.ownerId);
  const models = await root.services.stats.byModel(root.ownerId);
  const personas = await root.services.stats.personaUsage(root.ownerId);
  return {
    reach: models.find((row) => row.model === MODEL)?.charactersUsedWith,
    usage: personas.find((row) => row.name === PERSONA)?.chatCount,
  };
}

test("a model's character reach and a persona's usage leave out a room still landing, and count it once landed", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  for (const handle of ["first-keeper", "second-keeper"]) {
    await root.services.character.create({ principal, input: createCharacterSchema.parse({ handle, name: handle, description: "Keeps count." }) });
  }
  await root.services.persona.create({ principal, input: createPersonaSchema.parse({ name: PERSONA, description: "Walks the stair." }) });
  const anchored = { anchorPersonaName: PERSONA };
  await seedTranscript(root, { ownerId: root.ownerId, characterHandles: ["first-keeper"], lines: transcriptLines(2), chat: anchored });
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production chat import descriptor is missing");
  }

  const file = transcriptFile({ characterHandles: ["second-keeper"], lines: transcriptLines(ROOM_MESSAGES), chat: { ...anchored, title: "long" } });
  const landing = descriptor.importFile(root.ownerId, file);
  const seen = await duringChatLanding(root.db, landing, async () => await reads(root));
  expect(await landing).toMatchObject({ ok: true, created: true });

  expect(seen.stillLanding).toBe(true);
  expect(seen.result).toEqual({ reach: 1, usage: 1 });
  // The control: the landed room's character and anchor count once it has landed.
  expect(await reads(root)).toEqual({ reach: 2, usage: 2 });
});
