// The matrix's own transcript room on a tool-owned stage. The chat rows judge rendered message rows, so the
// verdict must not depend on what the stage's database holds: a worktree stage boots with no rooms, and a
// copied database can hold rooms only another account hosts. On a staged run this mints one stage-only
// character, imports one short deterministic transcript naming it through the product's own chat import
// door, and hands back that room's id. The cleanup deletes both and proves the room is gone. A shared run
// writes nothing and returns null.

import { randomUUID } from "node:crypto";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { chatImportResultSchema } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { UPLOAD_FILE_FIELD } from "@orb/contracts/uploads";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { instrumentRefusal, isPlainObject } from "../../floor/browser/page-validate.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { stageTrpcData } from "../../floor/http/stage-trpc.ts";
import { buildTranscript } from "../../seed/index.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --matrix --isolated");

const ROOM_PREFIX = "orb-matrix-room";
const ROOM_NAME_SUFFIX_LENGTH = 8;
/** Enough rows that a phone viewport shows a settled row with its header at rest above the newest one. */
const ROOM_MESSAGES = 6;
const TRANSCRIPT_SUFFIX = ".jsonl";

export interface MatrixRoom {
  readonly chatId: string;
  readonly cleanup: () => Promise<void>;
}

function roomCleanupError(primary: unknown, cleanup: unknown): AggregateError {
  return new AggregateError([primary, cleanup], "INSTRUMENT ERROR: matrix room provisioning and its cleanup both failed", { cause: primary });
}

async function createCharacter(baseUrl: string, handle: string, name: string): Promise<string> {
  const data = await stageTrpcData(baseUrl, "character.create", "mutation", { input: { handle, name, description: "" } });
  const id = typeIdSchema(ID_PREFIX.character).safeParse(isPlainObject(data) ? data["id"] : undefined);
  if (!id.success) {
    return instrumentRefusal("character.create did not return a character id for the matrix room");
  }
  return id.data;
}

async function importTranscript(baseUrl: string, title: string, characterName: string): Promise<void> {
  const form = new FormData();
  const transcript = buildTranscript({ title, messageCount: ROOM_MESSAGES, characterNames: [characterName] });
  form.append(UPLOAD_FILE_FIELD, new File([transcript], `${title}${TRANSCRIPT_SUFFIX}`));
  const response = await fetch(`${baseUrl}${PORTABILITY_ROUTES.importChat}`, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body: form });
  const text = await response.text();
  if (!response.ok) {
    instrumentRefusal(`matrix room import failed (HTTP ${String(response.status)}): ${text}`);
  }
  const result = chatImportResultSchema.safeParse(JSON.parse(text));
  if (!result.success || result.data.imported.length !== 1 || result.data.failed.length > 0) {
    instrumentRefusal(`matrix room import did not land exactly one room: ${text}`);
  }
}

/** The ids of the caller's rooms that seat the character, read through the chat list's own filter. */
async function roomsOf(baseUrl: string, characterId: string): Promise<readonly string[]> {
  const data = await stageTrpcData(baseUrl, "chat.listChats", "query", { characterId, limit: 2 });
  const items = isPlainObject(data) ? data["items"] : undefined;
  if (!Array.isArray(items)) {
    return instrumentRefusal("chat.listChats returned no item page for the matrix room");
  }
  return items.map((item) => {
    const id = typeIdSchema(ID_PREFIX.chat).safeParse(isPlainObject(item) ? item["id"] : undefined);
    return id.success ? id.data : instrumentRefusal("chat.listChats returned a room without a chat id");
  });
}

async function removeRoom(baseUrl: string, characterId: string, chatIds: readonly string[]): Promise<void> {
  for (const chatId of chatIds) {
    await stageTrpcData(baseUrl, "chat.delete", "mutation", { chatId });
  }
  const left = await roomsOf(baseUrl, characterId);
  if (left.length > 0) {
    instrumentRefusal(`matrix room cleanup left ${left.join(", ")} on the stage`);
  }
  await stageTrpcData(baseUrl, "character.remove", "mutation", { characterId });
}

/** Provision the matrix's room only on a tool-owned stage. */
export async function provisionMatrixRoom(baseUrl: string, staged: boolean): Promise<MatrixRoom | null> {
  if (!staged) {
    return null;
  }
  const suffix = randomUUID().slice(0, ROOM_NAME_SUFFIX_LENGTH);
  const name = `${ROOM_PREFIX}-${suffix}`;
  const characterId = await createCharacter(baseUrl, name, name);
  try {
    await importTranscript(baseUrl, name, name);
    const rooms = await roomsOf(baseUrl, characterId);
    const chatId = rooms[0];
    if (chatId === undefined || rooms.length !== 1) {
      return instrumentRefusal(`matrix room import seated ${String(rooms.length)} rooms on its character, expected one`);
    }
    return { chatId, cleanup: async () => await removeRoom(baseUrl, characterId, [chatId]) };
  } catch (error) {
    let cleanupFailure: unknown = null;
    // the cleanup failure is kept in cleanupFailure and thrown beside the primary error as roomCleanupError right after this block. Ends if that throw stops carrying cleanupFailure.
    try {
      await removeRoom(baseUrl, characterId, await roomsOf(baseUrl, characterId));
    } catch (cleanupError) {
      cleanupFailure = cleanupError;
    }
    if (cleanupFailure !== null) {
      throw roomCleanupError(error, cleanupFailure);
    }
    throw error;
  }
}
