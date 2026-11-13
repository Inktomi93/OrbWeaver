// Importing a large chat leaves the event loop to the rest of the server: the parse and the row build yield between
// slices, and the one atomic commit hands SQLite its rows as JSON text, so its synchronous stretch stays short.
// @subject packages/server/src/domain/chat/persistence/import-write.ts
// @subject packages/server/src/primitives/serde/chat/index.ts
import { performance } from "node:perf_hooks";
import { createCharacterSchema } from "@orb/contracts/character";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

const HANDLE = "long-keeper";
const SENT = "2025-07-19@12h00m01s";
const FILE_BYTES = 5_000_000;
const MAX_GAP_MS = 200;
// About a thousand characters a turn, the length of a roleplay reply.
const SENTENCES_PER_TURN = 20;

function largeTranscript(): { readonly bytes: Uint8Array; readonly turns: number } {
  const lines = [`{"character_name":"${HANDLE}","user_name":"Nate","create_date":"${SENT}"}`];
  let size = 0;
  let turns = 0;
  for (; size < FILE_BYTES; turns += 1) {
    const user = turns % 2 === 0;
    const text = `Turn ${String(turns)}: ${"the keeper counts the lamps on the stair. ".repeat(SENTENCES_PER_TURN)}`;
    const line = `{"name":"${user ? "Nate" : HANDLE}","is_user":${String(user)},"is_system":false,"mes":"${text}","send_date":"${SENT}"}`;
    lines.push(line);
    size += line.length + 1;
  }
  return { bytes: new TextEncoder().encode(lines.join("\n")), turns };
}

test("importing a five megabyte chat never holds the event loop past 200 ms, and every message lands", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  await root.services.character.create({ principal, input: createCharacterSchema.parse({ handle: HANDLE, name: HANDLE, description: "Keeps the lamp." }) });
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production chat import descriptor is missing");
  }
  const { bytes, turns } = largeTranscript();

  // A chain of immediates stands for the rest of the server: a gap between two of them is time the import held the loop.
  let longestGap = 0;
  let last = performance.now();
  let watching = true;
  const tick = (): void => {
    const now = performance.now();
    longestGap = Math.max(longestGap, now - last);
    last = now;
    if (watching) {
      setImmediate(tick);
    }
  };
  setImmediate(tick);
  const outcome = await descriptor.importFile(root.ownerId, { filename: `${HANDLE}/${HANDLE} - 2025-07-19@12h00m00s.jsonl`, bytes });
  watching = false;
  longestGap = Math.max(longestGap, performance.now() - last);

  expect(outcome).toMatchObject({ ok: true, created: true });
  const [chat] = (await root.services.chat.listChats({ principal })).items;
  expect(chat?.messageCount).toBe(turns);
  expect(longestGap).toBeLessThan(MAX_GAP_MS);
});
