// A stats rebuild over a library of several pages hands the event loop back between pages, and a canon write that
// lands between two pages is reflected: the rebuild folds the owner again when the canon version moved under it.
// @subject packages/server/src/domain/stats/persistence/rebuild-from-canon.ts
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

function oneLineTranscript(handle: string, count: number): Uint8Array {
  const lines = [`{"character_name":"${handle}","user_name":"Nate","create_date":"${SENT}"}`];
  for (let turn = 0; turn < count; turn += 1) {
    const user = turn % 2 === 0;
    lines.push(`{"name":"${user ? "Nate" : handle}","is_user":${String(user)},"is_system":false,"mes":"ok ${String(turn)}","send_date":"${SENT}"}`);
  }
  return new TextEncoder().encode(lines.join("\n"));
}

async function importTranscript(root: ServerTestHarness, handle: string, count: number): Promise<void> {
  const principal = await root.principalFor(root.ownerId);
  await root.services.character.create({ principal, input: createCharacterSchema.parse({ handle, name: handle, description: `${handle} keeps count.` }) });
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production chat import descriptor is missing");
  }
  const outcome = await descriptor.importFile(root.ownerId, {
    filename: `${handle}/${handle} - 2025-07-19@12h00m00s.jsonl`,
    bytes: oneLineTranscript(handle, count),
  });
  expect(outcome).toMatchObject({ ok: true, created: true });
}

async function turns(root: ServerTestHarness, ownerId: UserId): Promise<number> {
  const view = await root.services.stats.overview(ownerId);
  return (view?.userTurns ?? 0) + (view?.assistantTurns ?? 0);
}

test("a rebuild over several pages of messages lets the loop turn between pages", async () => {
  await using root = await createServerHarness();
  await importTranscript(root, "page-keeper", LIBRARY_MESSAGES);

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

test("a message deleted from a page the rebuild already read is not counted by the rebuild", async () => {
  await using root = await createServerHarness();
  await importTranscript(root, "page-keeper", LIBRARY_MESSAGES);
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
