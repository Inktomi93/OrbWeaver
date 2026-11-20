// An imported chat lands in stages and no reader sees it until the last stage: a failed stage and a second import of
// the same file each leave either the whole room or none of it, and a read that enumerates rooms without the roster
// leaves a landing room out. The crash case is `tests/server/entry/boot/persistence/import-landing-sweep.int.test.ts`.
// @subject packages/server/src/domain/chat/persistence/import-write.ts
// @subject packages/server/src/domain/chat/persistence/import-landing.ts
// @subject packages/server/src/domain/chat/persistence/room-reach.ts
// @subject packages/server/src/domain/chat/persistence/backfill-scope.ts
import { performance } from "node:perf_hooks";
import { createCharacterSchema } from "@orb/contracts/character";
import type { RoomEntityKind } from "@orb/contracts/chat";
import { createPersonaSchema, updatePersonaSchema } from "@orb/contracts/persona";
import { chatImportClaims, chats, messageAssets, messages } from "@orb/db";
import { ASSET_SCHEME } from "@orb/kit/content";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetId, ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness, TranscriptLine } from "@orb/testkit/node/composed";
import { createMemoryBackfillRoom, createServerHarness, makeAssetBytes, seedTranscript, transcriptFile } from "@orb/testkit/node/composed";
import { duringChatLanding } from "@orb/testkit/node/rows";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { LANDING_STAGE_CHARS, LANDING_STAGE_ROWS } from "#server/domain/chat/persistence/import-landing.ts";

const HANDLE = "stair-keeper";
const SENT = "2025-07-19@12h00m01s";
const FILENAME = `${HANDLE}/${HANDLE} - 2025-07-19@12h00m00s.jsonl`;
const PNG = "image/png";
// A one-line message is two rows, the message and its variant, so this is ten landing stages: a reader started after
// the first message stage finishes before the last.
const ROOM_MESSAGES = 10 * (LANDING_STAGE_ROWS / 2) + 1;
const MAX_GAP_MS = 200;
const LONG_ROOM_MESSAGES = 4;
const PERSONA = "Lantern Wanderer";
const PERSONA_ENTITY = "persona" satisfies RoomEntityKind;
// The sweep's result stays opaque; the case reads only how many rooms it visited.
const sweepResult = z.object({ segments: z.object({ scanned: z.number() }) });

function transcript(messageCount: number, lastLine = "the last lamp"): Uint8Array {
  const lines = [`{"character_name":"${HANDLE}","user_name":"Nate","create_date":"${SENT}"}`];
  for (let turn = 0; turn < messageCount; turn += 1) {
    const user = turn % 2 === 0;
    const text = turn === messageCount - 1 ? lastLine : `ok ${String(turn)}`;
    lines.push(`{"name":"${user ? "Nate" : HANDLE}","is_user":${String(user)},"is_system":false,"mes":"${text}","send_date":"${SENT}"}`);
  }
  return new TextEncoder().encode(lines.join("\n"));
}

function transcriptLines(messageCount: number): TranscriptLine[] {
  return Array.from({ length: messageCount }, (_, turn) => ({ role: turn % 2 === 0 ? "user" : "assistant", content: `line ${String(turn)}` }));
}

interface Box {
  readonly importFile: (bytes: Uint8Array) => Promise<unknown>;
  readonly importBundle: (file: ReturnType<typeof transcriptFile>) => Promise<unknown>;
}

async function box(root: ServerTestHarness): Promise<Box> {
  const principal = await root.principalFor(root.ownerId);
  await root.services.character.create({ principal, input: createCharacterSchema.parse({ handle: HANDLE, name: HANDLE, description: "Counts the lamps." }) });
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production chat import descriptor is missing");
  }
  return {
    importFile: (bytes) => descriptor.importFile(root.ownerId, { filename: FILENAME, bytes }),
    importBundle: (file) => descriptor.importFile(root.ownerId, file),
  };
}

async function landingRoom(root: ServerTestHarness): Promise<boolean> {
  const rows = await root.db.select({ landingAt: chats.landingAt }).from(chats);
  return rows.some((row) => row.landingAt !== null);
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

async function turns(root: ServerTestHarness): Promise<number> {
  const overview = await root.services.stats.overview(root.ownerId);
  return (overview?.userTurns ?? 0) + (overview?.assistantTurns ?? 0);
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
    return {
      listed: (await root.services.chat.listChats({ principal })).items.length,
      searched: (await root.services.chat.listChats({ principal, search: HANDLE })).items.length,
      opened: await settle(root.services.chat.getChat({ principal, chatId })),
      exported: await settle(root.app.exportService.exportChatBundle({ principal, chatId })),
      turns: await turns(root),
    };
  };

  const landing = importFile(transcript(ROOM_MESSAGES));
  const seen = await duringChatLanding(root.db, landing, reads);
  expect(await landing).toMatchObject({ ok: true, created: true });

  // The control: the reads ran after a message stage while the room was landing, and the same reads see all of it
  // once it has landed.
  expect(seen.stillLanding).toBe(true);
  // The bundle export answers null for a room the caller does not host.
  expect(seen.result).toEqual({ listed: 0, searched: 0, opened: "not-found", exported: "null", turns: 0 });
  expect(await reads(seen.chatId)).toEqual({ listed: 1, searched: 1, opened: "value", exported: "value", turns: ROOM_MESSAGES });
  expect(await landingRoom(root)).toBe(false);
});

test("an import applies no live stats delta: its turns reach the rollups only through a rebuild", async () => {
  await using root = await createServerHarness();
  const { importFile } = await box(root);

  expect(await importFile(transcript(ROOM_MESSAGES))).toMatchObject({ ok: true, created: true });
  const beforeRebuild = await turns(root);
  await root.services.stats.reconcile(root.ownerId);

  // The control: the room's turns are countable, so the zero before the rebuild is the import writing none.
  expect({ beforeRebuild, afterRebuild: await turns(root) }).toEqual({ beforeRebuild: 0, afterRebuild: ROOM_MESSAGES });
});

test("a stage that fails removes every stage before it without holding the loop, and the same file then lands whole", async () => {
  await using root = await createServerHarness();
  const { importFile } = await box(root);
  const principal = await root.principalFor(root.ownerId);
  const stored = await root.services.assets.store({ principal, kind: "generated", mime: PNG, bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)) });
  const assetId: AssetId = stored.assetId;
  // Only the last stage links the image, so a reap after the first message stage finds it unreferenced and the last
  // stage's link then names a missing asset.
  const lastLine = `the last lamp ![lamp](${ASSET_SCHEME}${assetId})`;

  const failing = importFile(transcript(ROOM_MESSAGES, lastLine)).then(
    (outcome) => outcome,
    (error: unknown) => error,
  );
  const hold = await longestHold(async () => {
    await duringChatLanding(root.db, failing, async () => {
      await root.services.assets.reapIfOrphan([assetId]);
    });
    await failing;
  });

  expect(await failing).not.toMatchObject({ ok: true });
  expect(await rowCounts(root)).toEqual({ rooms: 0, messages: 0, claims: 0 });
  expect(hold).toBeLessThan(MAX_GAP_MS);

  // The control: with the image back, the same file lands every message and links it, so the failure above was the
  // reaped image and the cleanup freed the claim.
  const restored = await root.services.assets.store({
    principal,
    kind: "generated",
    mime: PNG,
    bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
  });
  const relanded = transcript(ROOM_MESSAGES, `the last lamp ![lamp](${ASSET_SCHEME}${restored.assetId})`);
  expect(await importFile(relanded)).toMatchObject({ ok: true, created: true });
  const [linked] = await root.db.select({ n: count() }).from(messageAssets).where(eq(messageAssets.assetId, restored.assetId));
  expect({ ...(await rowCounts(root)), linked: linked?.n }).toEqual({ rooms: 1, messages: ROOM_MESSAGES, claims: 1, linked: 1 });
});

test("a second import of the same file while the first is landing is skipped, and one room lands", async () => {
  await using root = await createServerHarness();
  const { importFile } = await box(root);
  const bytes = transcript(ROOM_MESSAGES);

  const first = importFile(bytes);
  const second = await duringChatLanding(root.db, first, async () => await importFile(bytes));

  expect(second.result).toMatchObject({ ok: true, created: false });
  expect(await first).toMatchObject({ ok: true, created: true });
  expect(await rowCounts(root)).toEqual({ rooms: 1, messages: ROOM_MESSAGES, claims: 1 });
  // The control: once landed, the same file is a plain repeat of the landed room.
  expect(await importFile(bytes)).toMatchObject({ ok: true, created: false });
});

test("a persona edit refreshes the rooms the persona anchors, and skips one still landing", async () => {
  await using root = await createServerHarness();
  const { importBundle } = await box(root);
  const principal = await root.principalFor(root.ownerId);
  const persona = await root.services.persona.create({ principal, input: createPersonaSchema.parse({ name: PERSONA, description: "Walks the stair." }) });
  const anchored = { anchorPersonaName: PERSONA };
  const landed = await seedTranscript(root, { ownerId: root.ownerId, characterHandles: [HANDLE], lines: transcriptLines(2), chat: anchored });
  const refreshed: ChatId[] = [];
  const waiters = new Map<ChatId, () => void>();
  const unsubscribe = root.app.liveBuses.chat.subscribeAllChatEvents((frame) => {
    if (frame.event.type === "roomEntityChanged" && frame.event.entity === PERSONA_ENTITY) {
      refreshed.push(frame.event.chatId);
      waiters.get(frame.event.chatId)?.();
    }
  });
  const renamed = async (name: string, waitFor: ChatId): Promise<readonly ChatId[]> => {
    refreshed.length = 0;
    const arrived = Promise.withResolvers<void>();
    waiters.set(waitFor, arrived.resolve);
    await root.services.persona.update({ principal, personaId: persona.id, input: updatePersonaSchema.parse({ name }) });
    await arrived.promise;
    return [...refreshed];
  };

  try {
    const landing = importBundle(transcriptFile({ characterHandles: [HANDLE], lines: transcriptLines(ROOM_MESSAGES), chat: { ...anchored, title: "long" } }));
    const seen = await duringChatLanding(root.db, landing, async () => await renamed(`${PERSONA} Vale`, landed.chatId));
    expect(await landing).toMatchObject({ ok: true, created: true });

    expect(seen.stillLanding).toBe(true);
    expect(seen.result).toEqual([landed.chatId]);
    // The control: once landed, the same edit refreshes the room it skipped.
    expect(new Set(await renamed(PERSONA, seen.chatId))).toEqual(new Set([landed.chatId, seen.chatId]));
  } finally {
    unsubscribe();
  }
});

test("the every-owner memory sweep visits no room still landing, and visits it once landed", async () => {
  await using room = await createMemoryBackfillRoom();
  const { h } = room;
  const [character] = h.characters;
  const descriptor = h.root.app.portability.find((entity) => entity.kind === "chat");
  const run = h.root.runAdmittedWorkload;
  if (character === undefined || descriptor === undefined || run === undefined) {
    throw new Error("the memory room has no character, no chat import descriptor or no workload driver");
  }
  // The bulk sweep walks every owner's rooms by their rows; its result counts each room it visited.
  const roomsSwept = async (): Promise<number> => {
    const job = await h.caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "bulk" });
    const lifetime = new AbortController();
    try {
      await run(job.id, lifetime.signal);
    } finally {
      lifetime.abort();
    }
    const done = await h.caller.workloads.get({ id: job.id });
    expect(done.status).toBe("succeeded");
    return sweepResult.parse(done.result).segments.scanned;
  };
  const before = await roomsSwept();

  // Few messages keep the control sweep's summaries few; each is past half a stage's text, so each lands in its own stage.
  const longLines = transcriptLines(LONG_ROOM_MESSAGES).map((line) => ({ ...line, content: `${line.content} ${"x".repeat(LANDING_STAGE_CHARS / 2)}` }));
  const file = transcriptFile({ characterHandles: [character.handle], lines: longLines, chat: { title: "long" } });
  const landing = descriptor.importFile(h.owner.userId, file);
  const seen = await duringChatLanding(h.root.db, landing, roomsSwept);
  expect(await landing).toMatchObject({ ok: true, created: true });

  expect(seen.stillLanding).toBe(true);
  expect(seen.result).toBe(before);
  // The control: once landed, the sweep visits the room.
  expect(await roomsSwept()).toBe(before + 1);
});
