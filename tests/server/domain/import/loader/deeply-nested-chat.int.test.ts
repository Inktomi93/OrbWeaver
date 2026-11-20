// @subject packages/server/src/primitives/serde/chat/index.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

// Far past the depth where a recursive walk of the decoded value overflows the stack.
const HOSTILE_DEPTH = 50_000;
const HANDLE = "deep-keeper";
const SENT = "2025-07-19@12h00m01s";
const REPLY = "The keeper answers from the stair.";

test("a chat whose message metadata nests past any stack imports, and its messages read back", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  await root.services.character.create({ principal, input: createCharacterSchema.parse({ handle: HANDLE, name: HANDLE, description: "Keeps the lamp." }) });
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production chat import descriptor is missing");
  }
  const nested = `${"[".repeat(HOSTILE_DEPTH)}${"]".repeat(HOSTILE_DEPTH)}`;
  const lines = [
    `{"character_name":"${HANDLE}","user_name":"Nate","create_date":"${SENT}"}`,
    `{"name":"Nate","is_user":true,"is_system":false,"mes":"Hello.","send_date":"${SENT}"}`,
    `{"name":"${HANDLE}","is_user":false,"is_system":false,"mes":"${REPLY}","send_date":"${SENT}","extra":{"vendor_tree":${nested}}}`,
  ];

  const outcome = await descriptor.importFile(root.ownerId, {
    filename: `${HANDLE}/${HANDLE} - 2025-07-19@12h00m00s.jsonl`,
    bytes: new TextEncoder().encode(lines.join("\n")),
  });

  expect(outcome).toMatchObject({ ok: true });
  const chats = (await root.services.chat.listChats({ principal })).items;
  expect(chats).toHaveLength(1);
  const chatId = chats[0]?.id;
  if (chatId === undefined) {
    throw new Error("the import landed no room");
  }
  const { messages } = await root.services.chat.listMessages({ principal, chatId });
  expect(messages.map(({ content }) => content)).toEqual(["Hello.", REPLY]);
});
