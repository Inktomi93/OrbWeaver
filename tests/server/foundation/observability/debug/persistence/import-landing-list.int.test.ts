// The operator's chat list enumerates room rows with no roster, so it leaves out a room an import is still landing and
// lists it once it has landed.
// @subject packages/server/src/foundation/observability/debug/inspect/list.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness, TranscriptLine } from "@orb/testkit/node/composed";
import { createServerHarness, seedTranscript, transcriptFile } from "@orb/testkit/node/composed";
import { duringChatLanding } from "@orb/testkit/node/rows";
import { z } from "zod";
import { LANDING_STAGE_ROWS } from "#server/domain/chat/persistence/import-landing.ts";

const HANDLE = "list-keeper";
// A one-line message is two rows, so this is several landing stages.
const ROOM_MESSAGES = 4 * (LANDING_STAGE_ROWS / 2) + 1;

function transcriptLines(messageCount: number): TranscriptLine[] {
  return Array.from({ length: messageCount }, (_, turn) => ({ role: turn % 2 === 0 ? "user" : "assistant", content: `line ${String(turn)}` }));
}

const DEBUG_TOKEN = "import-landing-debug-token";
// The probe's rows stay opaque; the case reads only the room ids.
const chatList = z.object({ chats: z.array(z.object({ id: z.string() })) });

async function listedChats(root: ServerTestHarness): Promise<readonly string[]> {
  const response = await root.http.request("/api/_debug/db/chats", { headers: { "x-debug-token": DEBUG_TOKEN } });
  expect(response.status).toBe(200);
  return chatList.parse(await response.json()).chats.map((chat) => chat.id);
}

test("the operator chat list leaves out a room still landing, and lists it once landed", async () => {
  await using root = await createServerHarness({ debugToken: DEBUG_TOKEN });
  const principal = await root.principalFor(root.ownerId);
  await root.services.character.create({ principal, input: createCharacterSchema.parse({ handle: HANDLE, name: HANDLE, description: "Keeps the list." }) });
  const landed = await seedTranscript(root, { ownerId: root.ownerId, characterHandles: [HANDLE], lines: transcriptLines(2) });
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production chat import descriptor is missing");
  }

  const file = transcriptFile({ characterHandles: [HANDLE], lines: transcriptLines(ROOM_MESSAGES), chat: { title: "long" } });
  const landing = descriptor.importFile(root.ownerId, file);
  const seen = await duringChatLanding(root.db, landing, async () => await listedChats(root));
  expect(await landing).toMatchObject({ ok: true, created: true });

  expect(seen.stillLanding).toBe(true);
  expect(seen.result).toEqual([landed.chatId]);
  // The control: once landed, the list names the room it left out.
  expect(new Set(await listedChats(root))).toEqual(new Set([landed.chatId, seen.chatId]));
});
