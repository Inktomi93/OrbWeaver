// A boot after a crash mid-landing removes the imported room that never landed, a chunk of messages at a time, and
// never touches a room that landed, whatever rows it lacks.
// @subject packages/server/src/entry/boot/reclaim-locks.ts
// @subject packages/server/src/domain/chat/persistence/import-landing.ts
import { performance } from "node:perf_hooks";
import { createCharacterSchema } from "@orb/contracts/character";
import { chatParticipants, chats, messages } from "@orb/db";
import { reclaimLocksOnBoot } from "@orb/server/entry/boot";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { bootGrantFor } from "@orb/testkit/node/helpers";
import { count, eq, isNotNull, ne } from "drizzle-orm";

const HANDLE = "stair-keeper";
const SENT = "2025-07-19@12h00m01s";
// Many cleanup chunks, so a sweep that deleted the room in one statement would hold the loop past the bound.
const ROOM_MESSAGES = 10_001;
const MAX_GAP_MS = 200;

function transcript(messageCount: number): Uint8Array {
  const lines = [`{"character_name":"${HANDLE}","user_name":"Nate","create_date":"${SENT}"}`];
  for (let turn = 0; turn < messageCount; turn += 1) {
    const user = turn % 2 === 0;
    lines.push(`{"name":"${user ? "Nate" : HANDLE}","is_user":${String(user)},"is_system":false,"mes":"ok ${String(turn)}","send_date":"${SENT}"}`);
  }
  return new TextEncoder().encode(lines.join("\n"));
}

async function reboot(root: ServerTestHarness): Promise<void> {
  await reclaimLocksOnBoot({
    logger: root.logger,
    db: bootGrantFor(root.db),
    contributions: root.app.workloadContributions,
    now: root.clock.now,
    holder: "import-landing-sweep",
    emitWorkloadEvent: root.app.workloadEvents.emitWorkloadEvent,
  });
}

/** The longest stretch `work` held the event loop, read from a chain of immediates. */
async function longestHold(work: () => Promise<unknown>): Promise<number> {
  let longest = 0;
  let last = performance.now();
  let watching = true;
  const tick = (): void => {
    const now = performance.now();
    longest = Math.max(longest, now - last);
    last = now;
    if (watching) {
      setImmediate(tick);
    }
  };
  setImmediate(tick);
  try {
    await work();
  } finally {
    watching = false;
  }
  return Math.max(longest, performance.now() - last);
}

test("a boot after a crash mid-landing removes the half-landed room in chunks and keeps a landed room with no roster", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const character = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: HANDLE, name: HANDLE, description: "Counts the lamps." }),
  });
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production chat import descriptor is missing");
  }
  const importFile = (): Promise<unknown> =>
    descriptor.importFile(root.ownerId, { filename: `${HANDLE}/${HANDLE} - 2025-07-19@12h00m00s.jsonl`, bytes: transcript(ROOM_MESSAGES) });

  expect(await importFile()).toMatchObject({ ok: true, created: true });
  const [crashed] = await root.db.select({ id: chats.id }).from(chats);
  if (crashed === undefined) {
    throw new Error("the production import landed no room");
  }
  // What a process that died before the last stage leaves: the room still marked landing, without its roster.
  await root.db.update(chats).set({ landingAt: root.clock.now() }).where(eq(chats.id, crashed.id));
  await root.db.delete(chatParticipants).where(eq(chatParticipants.chatId, crashed.id));
  // A landed room that lost its roster rows is not a landing room, whatever else it lacks.
  const kept = await root.services.chat.startChat({ principal, characterIds: [character.id], opening: "none" });
  await root.db.delete(chatParticipants).where(eq(chatParticipants.chatId, kept.chat.id));

  const hold = await longestHold(() => reboot(root));

  const survivors = await root.db.select({ id: chats.id }).from(chats);
  const [left] = await root.db.select({ n: count() }).from(messages).where(eq(messages.chatId, crashed.id));
  expect({ survivors: survivors.map((row) => row.id), crashedMessages: left?.n }).toEqual({ survivors: [kept.chat.id], crashedMessages: 0 });
  expect(hold).toBeLessThan(MAX_GAP_MS);

  // The re-import after the sweep lands as a new room: the sweep took the claim with the room.
  expect(await importFile()).toMatchObject({ ok: true, created: true });
  const [landed] = await root.db.select({ n: count() }).from(messages).where(ne(messages.chatId, kept.chat.id));
  const [stillLanding] = await root.db.select({ n: count() }).from(chats).where(isNotNull(chats.landingAt));
  expect({ messages: landed?.n, landing: stillLanding?.n }).toEqual({ messages: ROOM_MESSAGES, landing: 0 });
});
