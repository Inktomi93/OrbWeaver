// An imported chat lands in stages and no reader sees it until the last stage: a failed stage and a second import of
// the same file each leave either the whole room or none of it. The crash case is
// `tests/server/entry/boot/persistence/import-landing-sweep.int.test.ts`.
// @subject packages/server/src/domain/chat/persistence/import-write.ts
// @subject packages/server/src/domain/chat/persistence/import-landing.ts
import { performance } from "node:perf_hooks";
import { createCharacterSchema } from "@orb/contracts/character";
import { chatImportClaims, chats, messageAssets, messages } from "@orb/db";
import { ASSET_SCHEME } from "@orb/kit/content";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetId, ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makeAssetBytes } from "@orb/testkit/node/composed";
import { count, eq, isNotNull } from "drizzle-orm";

const HANDLE = "stair-keeper";
const SENT = "2025-07-19@12h00m01s";
const FILENAME = `${HANDLE}/${HANDLE} - 2025-07-19@12h00m00s.jsonl`;
const PNG = "image/png";
// Several landing stages, so a reader started after the first finishes before the last; each case checks it did.
const ROOM_MESSAGES = 5001;
const MAX_GAP_MS = 200;

function transcript(messageCount: number, lastLine = "the last lamp"): Uint8Array {
  const lines = [`{"character_name":"${HANDLE}","user_name":"Nate","create_date":"${SENT}"}`];
  for (let turn = 0; turn < messageCount; turn += 1) {
    const user = turn % 2 === 0;
    const text = turn === messageCount - 1 ? lastLine : `ok ${String(turn)}`;
    lines.push(`{"name":"${user ? "Nate" : HANDLE}","is_user":${String(user)},"is_system":false,"mes":"${text}","send_date":"${SENT}"}`);
  }
  return new TextEncoder().encode(lines.join("\n"));
}

interface Box {
  readonly importFile: (bytes: Uint8Array) => Promise<unknown>;
}

async function box(root: ServerTestHarness): Promise<Box> {
  const principal = await root.principalFor(root.ownerId);
  await root.services.character.create({ principal, input: createCharacterSchema.parse({ handle: HANDLE, name: HANDLE, description: "Counts the lamps." }) });
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production chat import descriptor is missing");
  }
  return { importFile: (bytes) => descriptor.importFile(root.ownerId, { filename: FILENAME, bytes }) };
}

async function landingRoom(root: ServerTestHarness): Promise<ChatId | null> {
  const [row] = await root.db.select({ id: chats.id }).from(chats).where(isNotNull(chats.landingAt));
  return row?.id ?? null;
}

/** Run `during` once the import has opened its room and before the room lands, polling a turn at a time. */
async function duringLanding<T>(root: ServerTestHarness, landing: Promise<unknown>, during: (chatId: ChatId) => Promise<T>): Promise<T> {
  const progress = { settled: false };
  const markSettled = (): void => {
    progress.settled = true;
  };
  landing.then(markSettled, markSettled);
  for (;;) {
    await new Promise((resolve) => setImmediate(resolve));
    const chatId = await landingRoom(root);
    if (chatId !== null) {
      return await during(chatId);
    }
    if (progress.settled) {
      throw new Error("the import settled without a landing stage the test could see");
    }
  }
}

async function rowCounts(root: ServerTestHarness): Promise<{ readonly rooms: number; readonly messages: number; readonly claims: number }> {
  const [rooms] = await root.db.select({ n: count() }).from(chats);
  const [slots] = await root.db.select({ n: count() }).from(messages);
  const [claims] = await root.db.select({ n: count() }).from(chatImportClaims);
  return { rooms: rooms?.n ?? 0, messages: slots?.n ?? 0, claims: claims?.n ?? 0 };
}

async function settle(promise: Promise<unknown>): Promise<string> {
  try {
    const value = await promise;
    return value === null ? "null" : "value";
  } catch (error) {
    return error instanceof DomainNotFoundError ? "not-found" : `error: ${String(error)}`;
  }
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

test("a room still landing is absent from the list, the room read, the export and a stats rebuild, and present once landed", async () => {
  await using root = await createServerHarness();
  const { importFile } = await box(root);
  const principal = await root.principalFor(root.ownerId);
  const reads = async (chatId: ChatId): Promise<Record<string, unknown>> => {
    await root.services.stats.reconcile(root.ownerId);
    const overview = await root.services.stats.overview(root.ownerId);
    return {
      listed: (await root.services.chat.listChats({ principal })).items.length,
      searched: (await root.services.chat.listChats({ principal, search: HANDLE })).items.length,
      opened: await settle(root.services.chat.getChat({ principal, chatId })),
      exported: await settle(root.app.exportService.exportChatBundle({ principal, chatId })),
      turns: (overview?.userTurns ?? 0) + (overview?.assistantTurns ?? 0),
    };
  };

  const landing = importFile(transcript(ROOM_MESSAGES));
  const seen = await duringLanding(root, landing, async (chatId) => ({
    chatId,
    reads: await reads(chatId),
    stillLanding: (await landingRoom(root)) === chatId,
  }));
  expect(await landing).toMatchObject({ ok: true, created: true });

  // The control: the reads ran while the room was landing, and the same reads see all of it once it has landed.
  expect(seen.stillLanding).toBe(true);
  // The bundle export answers null for a room the caller does not host.
  expect(seen.reads).toEqual({ listed: 0, searched: 0, opened: "not-found", exported: "null", turns: 0 });
  expect(await reads(seen.chatId)).toEqual({ listed: 1, searched: 1, opened: "value", exported: "value", turns: ROOM_MESSAGES });
  expect(await landingRoom(root)).toBeNull();
});

test("a stage that fails removes every stage before it, and the same file then lands whole", async () => {
  await using root = await createServerHarness();
  const { importFile } = await box(root);
  const principal = await root.principalFor(root.ownerId);
  const stored = await root.services.assets.store({ principal, kind: "generated", mime: PNG, bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)) });
  const assetId: AssetId = stored.assetId;
  // Only the last stage links the image, so a reap after the first stage finds it unreferenced and the last stage's
  // link then names a missing asset.
  const bytes = transcript(ROOM_MESSAGES, `the last lamp ![lamp](${ASSET_SCHEME}${assetId})`);

  const failing = importFile(bytes).then(
    (outcome) => outcome,
    (error: unknown) => error,
  );
  const hold = await longestHold(async () => {
    await duringLanding(root, failing, async () => {
      await root.services.assets.reapIfOrphan([assetId]);
    });
    await failing;
  });

  expect(await failing).not.toMatchObject({ ok: true });
  expect(await rowCounts(root)).toEqual({ rooms: 0, messages: 0, claims: 0 });
  expect(hold).toBeLessThan(MAX_GAP_MS);

  // The control: with the image back, the same file lands every message and links it, so the failure above was the
  // reaped image and the cleanup freed the claim.
  const restored = await root.services.assets.store({ principal, kind: "generated", mime: PNG, bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)) });
  expect(await importFile(transcript(ROOM_MESSAGES, `the last lamp ![lamp](${ASSET_SCHEME}${restored.assetId})`))).toMatchObject({ ok: true, created: true });
  const [linked] = await root.db.select({ n: count() }).from(messageAssets).where(eq(messageAssets.assetId, restored.assetId));
  expect({ ...(await rowCounts(root)), linked: linked?.n }).toEqual({ rooms: 1, messages: ROOM_MESSAGES, claims: 1, linked: 1 });
});

test("a second import of the same file while the first is landing is skipped, and one room lands", async () => {
  await using root = await createServerHarness();
  const { importFile } = await box(root);
  const bytes = transcript(ROOM_MESSAGES);

  const first = importFile(bytes);
  const second = await duringLanding(root, first, async () => await importFile(bytes));

  expect(second).toMatchObject({ ok: true, created: false });
  expect(await first).toMatchObject({ ok: true, created: true });
  expect(await rowCounts(root)).toEqual({ rooms: 1, messages: ROOM_MESSAGES, claims: 1 });
  // The control: once landed, the same file is a plain repeat of the landed room.
  expect(await importFile(bytes)).toMatchObject({ ok: true, created: false });
});
