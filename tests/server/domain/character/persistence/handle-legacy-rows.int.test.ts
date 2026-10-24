// A character row stored before the handle alphabet was enforced keeps reading, keeps copying, and exports
// with its chats under a safe archive directory that a restore re-links the chat through.
// @subject packages/contracts/src/character/index.ts
// @subject packages/server/src/domain/export/verbs/portable-exports.ts
// @subject packages/server/src/domain/export/verbs/export-chat-bundle.ts
import { characterHandleSchema, createCharacterSchema } from "@orb/contracts/character";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { importStartedSchema } from "@orb/contracts/import";
import { PORTABLE_DIRECTORIES } from "@orb/contracts/portability";
import { characters } from "@orb/db";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, extractZip, seedTranscript } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

const EXPORT_ROUTE = "/api/export/library?kinds=character,chat";
const BUNDLE_ROUTE = "/api/import/bundle";
const SIGNED_IN_ROUTE = "/api/trpc/sessions.me";
const WORKLOAD_DEADLINE_MS = 60_000;
const SOURCE_ID_CURSOR = 2 ** 29;
/** Inside the length cap, outside the alphabet: the stored shape the export used to write as `chats/../`. */
const LEGACY_HANDLE = "..";
const NAME = "Wanderer";

async function signedInBox(ids?: ReturnType<typeof createSeededIds>): Promise<ServerTestHarness> {
  const root = await createServerHarness({
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
    env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" },
    ...(ids === undefined ? {} : { ids }),
  });
  expect((await root.http.request(SIGNED_IN_ROUTE)).status).toBe(200);
  await root.settleBackground();
  return root;
}

test("a stored handle outside the alphabet still reads and copies, and its chats export and restore under a safe directory", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  const owner = await source.principalFor(source.ownerId);
  const created = await source.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: "wanderer", name: NAME, description: "A wanderer maps the outer rings." }),
  });
  const lines = [{ role: "user", content: "Where does the ring end?" }] as const;
  await seedTranscript(source, { ownerId: source.ownerId, characterHandles: [castId<CharacterHandle>("wanderer")], lines });
  await source.db
    .update(characters)
    .set({ handle: castId<CharacterHandle>(LEGACY_HANDLE) })
    .where(eq(characters.id, created.id));

  const read = await source.services.character.get({ principal: owner, characterId: created.id });
  const download = await source.http.request(EXPORT_ROUTE);
  const archive = download.status === 200 ? new Uint8Array(await download.arrayBuffer()) : null;
  const copy = await source.services.character.duplicate({ principal: owner, characterId: created.id });
  const staged = archive === null ? null : await extractZip(archive);
  const chatDirs = staged === null ? [] : staged.entries.filter((e) => e.path.startsWith(PORTABLE_DIRECTORIES.chat)).map((e) => e.path.split("/")[1]);
  await staged?.dispose();

  await using target = await signedInBox();
  let restored: { readonly status: string; readonly transcripts: readonly (readonly string[])[] } | null = null;
  if (archive !== null) {
    const response = await target.http.request(BUNDLE_ROUTE, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body: archive });
    const { workloadId } = importStartedSchema.parse(await response.json());
    await target.runAdmittedWorkload?.(workloadId, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
    const workload = await target.services.workloads.get({ caller: await target.principalFor(target.ownerId), id: workloadId });
    const caller = await target.internalCallerFor(target.ownerId);
    const [character] = (await caller.character.list({})).items.filter((item) => item.name === NAME);
    const rooms = character === undefined ? [] : (await caller.chat.listChats({ characterId: character.id })).items;
    restored = {
      status: workload.status,
      transcripts: await Promise.all(rooms.map(async (room) => (await caller.chat.listMessages({ chatId: room.id })).messages.map((m) => m.content))),
    };
  }

  expect({
    read: read.handle,
    copyInAlphabet: characterHandleSchema.safeParse(copy.handle).success,
    exportStatus: download.status,
    chatDirs: chatDirs.map((dir) => dir !== undefined && characterHandleSchema.safeParse(dir).success),
    restored,
  }).toEqual({
    read: LEGACY_HANDLE,
    copyInAlphabet: true,
    exportStatus: 200,
    chatDirs: [true],
    restored: { status: "succeeded", transcripts: [lines.map((line) => line.content)] },
  });
});
