// Importing a large chat leaves the event loop to the rest of the server: the parse, the content hash and the row
// build yield between slices, and the room commits in stages, so no synchronous stretch grows with the chat.
// @subject packages/server/src/domain/chat/persistence/import-write.ts
// @subject packages/server/src/primitives/serde/chat/index.ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { createCharacterSchema } from "@orb/contracts/character";
import { createDb, runMigrations } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, ownFileDb, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";

const HANDLE = "long-keeper";
const SENT = "2025-07-19@12h00m01s";
const FILE_BYTES = 5_000_000;
const MAX_GAP_MS = 200;

// A roleplay reply is about a thousand characters; a one-line turn is the most messages, and so the most rows, the
// same bytes can carry.
const SHAPES = {
  reply: (turn: number): string => `Turn ${String(turn)}: ${"the keeper counts the lamps on the stair. ".repeat(20)}`,
  "one line": (turn: number): string => `ok ${String(turn)}`,
} as const;

function largeTranscript(text: (turn: number) => string): { readonly bytes: Uint8Array; readonly turns: number } {
  const lines = [`{"character_name":"${HANDLE}","user_name":"Nate","create_date":"${SENT}"}`];
  let size = 0;
  let turns = 0;
  for (; size < FILE_BYTES; turns += 1) {
    const user = turns % 2 === 0;
    const line = `{"name":"${user ? "Nate" : HANDLE}","is_user":${String(user)},"is_system":false,"mes":"${text(turns)}","send_date":"${SENT}"}`;
    lines.push(line);
    size += line.length + 1;
  }
  return { bytes: new TextEncoder().encode(lines.join("\n")), turns };
}

for (const [shape, text] of Object.entries(SHAPES)) {
  test(`importing a five megabyte chat of ${shape} messages never holds the event loop past 200 ms, and every message lands`, async () => {
    // A file database, as the server runs: an in-memory commit is several times faster and would hide a long stage.
    await using resources = new AsyncDisposableStack();
    const directory = await mkdtemp(join(tmpdir(), "large-chat-yields-"));
    resources.defer(() => rm(directory, { recursive: true, force: true }));
    const db = resources.use(ownFileDb(await createDb(pathToFileURL(join(directory, "orbweaver.db")).href))).db;
    await runMigrations(db, SHIPPED_MIGRATIONS);
    const root = resources.use(await createServerHarness({ db }));
    const principal = await root.principalFor(root.ownerId);
    await root.services.character.create({ principal, input: createCharacterSchema.parse({ handle: HANDLE, name: HANDLE, description: "Keeps the lamp." }) });
    const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
    if (descriptor === undefined) {
      throw new Error("the production chat import descriptor is missing");
    }
    const { bytes, turns } = largeTranscript(text);

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
}
