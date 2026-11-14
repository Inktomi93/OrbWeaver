// Importing a large chat leaves the event loop to the rest of the server: the parse, the content hash and the row
// build yield between slices, and the room commits in stages bounded by the rows they write, so no synchronous
// stretch grows with the chat.
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
const MAX_GAP_MS = 200;
const SWIPES_PER_REPLY = 600;

// Each shape is the smallest file whose room, written in one batch, holds the loop past the bound on a quiet box.
// A one-line turn is the most messages the bytes can carry; a reply of many two-character swipes is the most
// variant rows, which a stage bounded by text alone lets through by the tens of thousands.
const SWIPES = JSON.stringify(Array.from({ length: SWIPES_PER_REPLY }, () => "xy"));
const SHAPES = {
  "one line": { fileBytes: 1_500_000, fields: (turn: number): string => `"mes":"ok ${String(turn)}"` },
  "many short swipes": {
    fileBytes: 450_000,
    fields: (turn: number): string => (turn % 2 === 0 ? `"mes":"ok ${String(turn)}"` : `"mes":"xy","swipes":${SWIPES},"swipe_id":0`),
  },
} as const;

function largeTranscript(fileBytes: number, fields: (turn: number) => string): { readonly bytes: Uint8Array; readonly turns: number } {
  const lines = [`{"character_name":"${HANDLE}","user_name":"Nate","create_date":"${SENT}"}`];
  let size = 0;
  let turns = 0;
  for (; size < fileBytes; turns += 1) {
    const user = turns % 2 === 0;
    const line = `{"name":"${user ? "Nate" : HANDLE}","is_user":${String(user)},"is_system":false,"send_date":"${SENT}",${fields(turns)}}`;
    lines.push(line);
    size += line.length + 1;
  }
  return { bytes: new TextEncoder().encode(lines.join("\n")), turns };
}

for (const [shape, { fileBytes, fields }] of Object.entries(SHAPES)) {
  test(`importing a chat of ${shape} never holds the event loop past 200 ms, and every message lands`, async () => {
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
    const { bytes, turns } = largeTranscript(fileBytes, fields);

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
