// @subject packages/server/src/domain/import/verbs/portable-imports.ts
// Every chat the chat import route accepts is named: a transcript and a bundle, written or already held, untitled room or not, so the
// import notice always has a room name to show and never falls back to a file name the owner did not choose.
import { createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import type { ChatImportResult } from "@orb/contracts/import";
import { chatImportResultSchema } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { UPLOAD_FILE_FIELD } from "@orb/contracts/uploads";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

const NAME = "Harbor Keeper";
const SENT = "2024-06-01T12:00:00.000Z";
const HTTP_OK = 200;

// SillyTavern wire text is snake_case by spec, so the transcript is raw JSON lines.
const TRANSCRIPT = new TextEncoder().encode(
  [
    `{"character_name":"${NAME}","user_name":"Nate","create_date":"${SENT}"}`,
    `{"name":"Nate","is_user":true,"is_system":false,"mes":"Is the lamp lit?","send_date":"${SENT}"}`,
    `{"name":"${NAME}","is_user":false,"is_system":false,"mes":"Since dusk.","send_date":"${SENT}"}`,
  ].join("\n"),
);

async function importChat(root: ServerTestHarness, filename: string, bytes: Uint8Array): Promise<ChatImportResult> {
  const form = new FormData();
  form.append(UPLOAD_FILE_FIELD, new File([Buffer.from(bytes)], filename));
  const response = await root.http.request(PORTABILITY_ROUTES.importChat, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body: form });
  expect(response.status).toBe(HTTP_OK);
  return chatImportResultSchema.parse(await response.json());
}

test("a chat import names every room it accepts, written or held, from a transcript or from an untitled room's bundle", async () => {
  await using root = await createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner", ["SEED_CONTENT"]: "off" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
  const principal = await root.principalFor(root.ownerId);
  const character = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "harbor-keeper", name: NAME, description: "Keeps the light." }),
  });
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [character.id], opening: "none" });
  expect((await root.services.chat.getChat({ principal, chatId: chat.id })).title).toBeNull();
  const bundle = await root.app.exportService.exportChatBundle({ principal, chatId: chat.id });
  if (bundle === null) {
    throw new Error("the owner's own room did not export");
  }

  const written = await importChat(root, "harbor-keeper/watch.jsonl", TRANSCRIPT);
  const held = await importChat(root, "harbor-keeper/watch.jsonl", TRANSCRIPT);
  const untitled = await importChat(root, bundle.filename, bundle.bytes);

  // Positive control: each file is accepted, the transcript once written and once held, the untitled room held as itself.
  expect([...written.imported, ...held.imported, ...untitled.imported].map((entry) => entry.created)).toEqual([true, false, false]);
  for (const entry of [...written.imported, ...held.imported, ...untitled.imported]) {
    expect(entry.title).toEqual(expect.any(String));
  }
});
