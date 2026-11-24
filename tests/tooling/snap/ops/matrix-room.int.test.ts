// The matrix room's stage lifecycle against a loopback stand-in for the stage's server edge. The stand-in
// refuses a request without the CSRF header with 403, as the tRPC mount and the import route do, so every
// assertion below also proves the fixture's calls carry it.

import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { UPLOAD_FILE_FIELD } from "@orb/contracts/uploads";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/tooling";
import { afterEach } from "vitest";
import { provisionMatrixRoom } from "../../../../tooling/src/snap/ops/matrix-room.ts";
import { listeningAddress } from "../../_server-address.ts";

interface Stage {
  readonly baseUrl: string;
  readonly calls: string[];
  readonly characters: Map<string, string>;
  readonly rooms: Map<string, string>;
  readonly transcripts: string[];
}

interface StageState extends Omit<Stage, "baseUrl"> {
  readonly characterId: CharacterId;
  readonly chatId: ChatId;
  readonly importFails: boolean;
}

let server: Server | null = null;

afterEach(async () => {
  const open = server;
  server = null;
  if (open !== null) {
    await new Promise<void>((resolve) => open.close(() => resolve()));
  }
});

async function body(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function envelope(data: unknown): string {
  return JSON.stringify({ result: { data } });
}

/** The import route reads the upload from its file field; the transcript's lines travel verbatim inside the
 *  multipart body, so the stand-in keeps the lines of the part under that field. */
function answerImport(state: StageState, upload: string): string {
  state.calls.push("import");
  const part = upload.split(`name="${UPLOAD_FILE_FIELD}"`)[1] ?? "";
  state.transcripts.push(
    part
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("{"))
      .join("\n"),
  );
  if (state.importFails) {
    return JSON.stringify({ imported: [], failed: [{ filename: "room.jsonl", error: "no such character" }], memoryScope: null });
  }
  state.rooms.set(state.chatId, state.characterId);
  return JSON.stringify({ imported: [{ filename: "room.jsonl", created: true, title: null }], failed: [], memoryScope: null });
}

/** The four procedures the fixture calls, each answering from the stand-in's own rows. */
function answerProcedure(state: StageState, procedure: string, input: Record<string, unknown>): string | null {
  if (procedure === "character.create") {
    const fields = input["input"] as { readonly name: string };
    state.characters.set(state.characterId, fields.name);
    return envelope({ id: state.characterId, name: fields.name });
  }
  if (procedure === "chat.listChats") {
    const items = [...state.rooms].filter(([, seated]) => seated === input["characterId"]).map(([id]) => ({ id }));
    return envelope({ items, nextCursor: null, totalCount: items.length, viewerLastTurnAt: null });
  }
  if (procedure === "chat.delete") {
    state.rooms.delete(String(input["chatId"]));
    return envelope(null);
  }
  if (procedure === "character.remove") {
    state.characters.delete(String(input["characterId"]));
    return envelope(null);
  }
  return null;
}

async function answer(state: StageState, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://stage");
  const raw = await body(request);
  if (request.headers[CSRF_HEADER] === undefined) {
    state.calls.push(`refused ${url.pathname}`);
    response.writeHead(403).end();
    return;
  }
  response.setHeader("content-type", "application/json");
  if (url.pathname === PORTABILITY_ROUTES.importChat) {
    response.end(answerImport(state, raw.toString()));
    return;
  }
  const procedure = url.pathname.split("/").at(-1) ?? "";
  state.calls.push(procedure);
  const input = (request.method === "POST" ? JSON.parse(raw.toString() || "{}") : JSON.parse(url.searchParams.get("input") ?? "{}")) as Record<string, unknown>;
  const reply = answerProcedure(state, procedure, input);
  if (reply === null) {
    response.writeHead(404).end();
    return;
  }
  response.end(reply);
}

/** A stage edge holding characters and rooms. `importFails` answers the import with a per-file failure,
 *  the shape the route returns for a transcript naming no character the account has. */
async function startStage(characterId: CharacterId, chatId: ChatId, importFails = false): Promise<Stage> {
  const state: StageState = { characterId, chatId, importFails, calls: [], characters: new Map(), rooms: new Map(), transcripts: [] };
  const listening = createServer((request, response) => {
    answer(state, request, response).catch((error: unknown) => {
      response.writeHead(500).end(String(error));
    });
  });
  server = listening;
  await new Promise<void>((resolve) => listening.listen(0, "127.0.0.1", resolve));
  return { baseUrl: `http://127.0.0.1:${String(listeningAddress(listening).port)}`, ...state };
}

test("a shared run writes nothing and opens no room of its own", async ({ ids }) => {
  const stage = await startStage(ids.typeId(ID_PREFIX.character), ids.typeId(ID_PREFIX.chat));

  await expect(provisionMatrixRoom(stage.baseUrl, false)).resolves.toBeNull();
  expect(stage.calls).toEqual([]);
});

test("a staged run imports a transcript naming its own character, hands back that room, and removes both", async ({ ids }) => {
  const characterId = ids.typeId(ID_PREFIX.character);
  const chatId = ids.typeId(ID_PREFIX.chat);
  const stage = await startStage(characterId, chatId);

  const room = await provisionMatrixRoom(stage.baseUrl, true);

  expect(room?.chatId).toBe(chatId);
  // The import door re-links a transcript by the character name its header carries, so the transcript must
  // name the character this run minted.
  const name = stage.characters.get(characterId);
  expect(name).toMatch(/^orb-matrix-room-/u);
  expect(stage.transcripts).toHaveLength(1);
  const header = JSON.parse(stage.transcripts[0]?.split("\n")[0] ?? "{}") as Record<string, unknown>;
  expect(header["character_name"]).toBe(name);
  expect(stage.calls).toEqual(["character.create", "import", "chat.listChats"]);

  await room?.cleanup();

  expect(stage.rooms.size).toBe(0);
  expect(stage.characters.size).toBe(0);
  expect(stage.calls.slice(3)).toEqual(["chat.delete", "chat.listChats", "character.remove"]);
});

test("an import the route refuses fails loud and still removes the minted character", async ({ ids }) => {
  const characterId = ids.typeId(ID_PREFIX.character);
  const stage = await startStage(characterId, ids.typeId(ID_PREFIX.chat), true);

  await expect(provisionMatrixRoom(stage.baseUrl, true)).rejects.toThrow("matrix room import did not land exactly one room");
  expect(stage.characters.size).toBe(0);
  expect(stage.calls).toEqual(["character.create", "import", "chat.listChats", "chat.listChats", "character.remove"]);
});
