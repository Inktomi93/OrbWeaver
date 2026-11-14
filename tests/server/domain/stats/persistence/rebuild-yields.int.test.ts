// A stats rebuild over a library of several pages hands the event loop back between pages and never holds it near half
// a second on a heavy library, and a canon write that lands between two pages is reflected: the rebuild folds the owner
// again when the canon version moved under it.
// @subject packages/server/src/domain/stats/persistence/rebuild-from-canon.ts
// @subject packages/server/src/domain/stats/verbs/reconcile.ts
import { performance } from "node:perf_hooks";
import { createCharacterSchema } from "@orb/contracts/character";
import { messages } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { asc } from "drizzle-orm";
import { CHUNK } from "#server/domain/stats/persistence/rebuild-from-canon.ts";

const SENT = "2025-07-19@12h00m01s";
// More than two streaming pages of messages, so a pass spans several turns of the loop.
const LIBRARY_MESSAGES = 2 * CHUNK + 1000;
const DELETED_MESSAGES = 1;
// The longest hold the rest of the server waits through while one page is read and folded.
const MAX_GAP_MS = 500;
// A page larger than this holds the loop about as long as MAX_GAP_MS on a heavy library, so the rebuild must yield at
// least once per this many canon rows. The count does not move with host load, which the gap does.
const MAX_PAGE_ROWS = 1000;
// A heavy library: many pages of turns about a thousand characters long, the length of a roleplay reply.
const HEAVY_MESSAGES = 12_000;
const SENTENCES_PER_TURN = 20;

function transcript(handle: string, count: number, text: (turn: number) => string): Uint8Array {
  const lines = [`{"character_name":"${handle}","user_name":"Nate","create_date":"${SENT}"}`];
  for (let turn = 0; turn < count; turn += 1) {
    const user = turn % 2 === 0;
    lines.push(`{"name":"${user ? "Nate" : handle}","is_user":${String(user)},"is_system":false,"mes":"${text(turn)}","send_date":"${SENT}"}`);
  }
  return new TextEncoder().encode(lines.join("\n"));
}

async function importTranscript(root: ServerTestHarness, handle: string, bytes: Uint8Array): Promise<void> {
  const principal = await root.principalFor(root.ownerId);
  await root.services.character.create({ principal, input: createCharacterSchema.parse({ handle, name: handle, description: `${handle} keeps count.` }) });
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production chat import descriptor is missing");
  }
  const outcome = await descriptor.importFile(root.ownerId, {
    filename: `${handle}/${handle} - 2025-07-19@12h00m00s.jsonl`,
    bytes,
  });
  expect(outcome).toMatchObject({ ok: true, created: true });
}

async function turns(root: ServerTestHarness, ownerId: UserId): Promise<number> {
  const view = await root.services.stats.overview(ownerId);
  return (view?.userTurns ?? 0) + (view?.assistantTurns ?? 0);
}

test("a rebuild over several pages of messages lets the loop turn between pages", async () => {
  await using root = await createServerHarness();
  await importTranscript(
    root,
    "page-keeper",
    transcript("page-keeper", LIBRARY_MESSAGES, (turn) => `ok ${String(turn)}`),
  );

  // Each immediate that runs while the rebuild is pending is a turn of the loop the rebuild handed back.
  let pending = true;
  let turnsDuringRebuild = 0;
  const tick = (): void => {
    if (pending) {
      turnsDuringRebuild += 1;
      setImmediate(tick);
    }
  };
  setImmediate(tick);
  await root.services.stats.reconcile(root.ownerId);
  pending = false;

  expect(await turns(root, root.ownerId)).toBe(LIBRARY_MESSAGES);
  expect(turnsDuringRebuild).toBeGreaterThanOrEqual(Math.floor(LIBRARY_MESSAGES / CHUNK));
});

test("a many-page rebuild never holds the event loop near half a second and counts every turn", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness();
  await importTranscript(
    root,
    "long-keeper",
    transcript("long-keeper", HEAVY_MESSAGES, (turn) => `Turn ${String(turn)}: ${"the keeper counts the lamps on the stair. ".repeat(SENTENCES_PER_TURN)}`),
  );

  // A chain of immediates stands for the rest of the server: a gap between two of them is time the rebuild held the
  // loop, and each page the rebuild yields after lets one of them run.
  let longestGap = 0;
  let loopTurns = 0;
  let last = performance.now();
  let watching = true;
  const tick = (): void => {
    const now = performance.now();
    longestGap = Math.max(longestGap, now - last);
    last = now;
    loopTurns += 1;
    if (watching) {
      setImmediate(tick);
    }
  };
  setImmediate(tick);
  const rebuilt = await root.services.stats.reconcile(root.ownerId);
  watching = false;
  longestGap = Math.max(longestGap, performance.now() - last);

  expect(rebuilt).toMatchObject({ owners: 1 });
  // Every turn lands once across the page boundaries: a skipped or repeated row at a boundary changes these counts.
  expect(await root.services.stats.overview(root.ownerId)).toMatchObject({ userTurns: HEAVY_MESSAGES / 2, assistantTurns: HEAVY_MESSAGES / 2 });
  expect(await root.services.stats.timeseries(root.ownerId)).toEqual([
    expect.objectContaining({ chatsCreated: 1, userTurns: HEAVY_MESSAGES / 2, assistantTurns: HEAVY_MESSAGES / 2 }),
  ]);
  expect(loopTurns).toBeGreaterThanOrEqual(HEAVY_MESSAGES / MAX_PAGE_ROWS);
  expect(longestGap).toBeLessThan(MAX_GAP_MS);
});

test("a message deleted from a page the rebuild already read is not counted by the rebuild", async () => {
  await using root = await createServerHarness();
  await importTranscript(
    root,
    "page-keeper",
    transcript("page-keeper", LIBRARY_MESSAGES, (turn) => `ok ${String(turn)}`),
  );
  const principal = await root.principalFor(root.ownerId);
  // The scan pages up by message id, so the lowest id is on the first page, read before the rebuild first yields.
  const [first] = await root.db.select({ id: messages.id, chatId: messages.chatId }).from(messages).orderBy(asc(messages.id)).limit(1);
  if (first === undefined) {
    throw new Error("the production import landed no message");
  }

  // The delete is one batch that moves the owner's canon version. A rebuild that did not fold again would replace the
  // rollups with a fold that still counts the deleted message.
  const order: string[] = [];
  const rebuild = root.services.stats.reconcile(root.ownerId).then(() => order.push("rebuild"));
  const write = new Promise<void>((resolve, reject) => {
    setImmediate(() => {
      root.services.chat.deleteMessages({ principal, chatId: first.chatId, messageIds: [first.id] }).then(() => {
        order.push("write");
        resolve();
      }, reject);
    });
  });
  await Promise.all([rebuild, write]);

  // The control: the write began after the rebuild started and settled before it finished, so it landed mid-rebuild.
  expect(order).toEqual(["write", "rebuild"]);
  expect(await turns(root, root.ownerId)).toBe(LIBRARY_MESSAGES - DELETED_MESSAGES);
});
