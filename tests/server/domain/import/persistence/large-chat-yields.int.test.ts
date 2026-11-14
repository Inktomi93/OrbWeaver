// A large imported chat lands in stages bounded by the rows they write, and hands the event loop back before each
// stage, so the rest of the server runs between any two of them. The storage read is the subject: on every turn of the
// loop the case counts the message and variant rows that have landed, and no turn may see more than one stage's bound
// arrive at once. The proof counts rows, never milliseconds, so it reads the same on any host.
// @subject packages/server/src/domain/chat/persistence/import-write.ts
// @subject packages/server/src/domain/chat/persistence/import-landing.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { messages, messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { sql } from "drizzle-orm";
import { LANDING_STAGE_ROWS } from "#server/domain/chat/persistence/import-landing.ts";

const HANDLE = "long-keeper";
const SENT = "2025-07-19@12h00m01s";
const SWIPES_PER_REPLY = 600;

// A one-line turn is the most messages the bytes can carry; a reply of many two-character swipes is the most variant
// rows, which a stage bounded by text alone lets through by the tens of thousands. Each spans many stages.
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

// The driver runs a statement as it is called, so a read made on a turn sees exactly the stages committed before it.
// On a fresh database that only inserts, a table's largest rowid is its row count, read by one seek rather than a scan,
// so the watcher costs the same on every turn however many rows have landed.
const LAST_ROWID = sql<number | null>`max(rowid)`;
async function landedRows(root: ServerTestHarness): Promise<number> {
  const [slots] = await root.db.select({ n: LAST_ROWID }).from(messages);
  const [variants] = await root.db.select({ n: LAST_ROWID }).from(messageVariants);
  return (slots?.n ?? 0) + (variants?.n ?? 0);
}

for (const [shape, { fileBytes, fields }] of Object.entries(SHAPES)) {
  test(`a chat of ${shape} lands at most one stage's rows between two turns of the loop, and every message lands`, async () => {
    await using root = await createServerHarness();
    const principal = await root.principalFor(root.ownerId);
    await root.services.character.create({ principal, input: createCharacterSchema.parse({ handle: HANDLE, name: HANDLE, description: "Keeps the lamp." }) });
    const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
    if (descriptor === undefined) {
      throw new Error("the production chat import descriptor is missing");
    }
    const { bytes, turns } = largeTranscript(fileBytes, fields);

    // A chain of immediates stands for the rest of the server: each one runs only when the import hands the loop back.
    let landed = 0;
    let mostInOneTurn = 0;
    const watch = { on: true };
    const watcher = (async (): Promise<void> => {
      while (watch.on) {
        await new Promise((resolve) => setImmediate(resolve));
        const now = await landedRows(root);
        mostInOneTurn = Math.max(mostInOneTurn, now - landed);
        landed = now;
      }
    })();
    const outcome = await descriptor.importFile(root.ownerId, { filename: `${HANDLE}/${HANDLE} - 2025-07-19@12h00m00s.jsonl`, bytes });
    watch.on = false;
    await watcher;
    const total = await landedRows(root);
    mostInOneTurn = Math.max(mostInOneTurn, total - landed);

    expect(outcome).toMatchObject({ ok: true, created: true });
    const [chat] = (await root.services.chat.listChats({ principal })).items;
    expect(chat?.messageCount).toBe(turns);
    expect(total).toBeGreaterThan(LANDING_STAGE_ROWS * 2);
    expect(mostInOneTurn).toBeLessThanOrEqual(LANDING_STAGE_ROWS);
  });
}
