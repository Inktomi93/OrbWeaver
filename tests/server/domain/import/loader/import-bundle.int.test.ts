// A library export restored into a fresh box whose owner has signed in once, so the first-login seed has landed
// its plates, cards and rooms before the bundle arrives. The restore keeps every chat with its character, through the
// export and import routes and the import workload.
// @subject packages/server/src/domain/import/loader/import-bundle.ts
// @subject packages/server/src/domain/import/substrate/handle.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { importStartedSchema } from "@orb/contracts/import";
import type { PortableKind } from "@orb/contracts/portability";
import type { CharacterHandle, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, seedTranscript } from "@orb/testkit/node/composed";

const EXPORT_ROUTE = "/api/export/library";
const BUNDLE_ROUTE = "/api/import/bundle";
/** Any signed-in request runs the first-login seed; this one reads nothing else. */
const SIGNED_IN_ROUTE = "/api/trpc/sessions.me";
const WORKLOAD_DEADLINE_MS = 60_000;
/** Asset ids restore verbatim, so the exporting box mints from its own band. */
const SOURCE_ID_CURSOR = 2 ** 29;
/** A handle the owner chose, which is not the slug of the character's name. */
const CHOSEN_HANDLE = castId<CharacterHandle>("lantern-warden");
const CHARACTER_NAME = "Keeper";

/** A local box whose loopback requests act as its owner, after that owner's first-login seed has settled. */
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

async function exportLibrary(root: ServerTestHarness, kinds?: readonly PortableKind[]): Promise<Uint8Array> {
  const response = await root.http.request(kinds === undefined ? EXPORT_ROUTE : `${EXPORT_ROUTE}?kinds=${kinds.join(",")}`);
  expect(response.status).toBe(200);
  return new Uint8Array(await response.arrayBuffer());
}

/** Upload the bundle and run its import workload to the end; the workload's own status and tallies. */
async function restore(root: ServerTestHarness, bundle: Uint8Array): Promise<{ readonly status: string; readonly failed: number | undefined }> {
  const response = await root.http.request(BUNDLE_ROUTE, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body: bundle });
  expect(response.status).toBe(202);
  const id: WorkloadId = importStartedSchema.parse(await response.json()).workloadId;
  const run = root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  await run(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  const row = await root.services.workloads.get({ caller: await root.principalFor(root.ownerId), id });
  if (row.kind !== "import-bundle" || row.poison) {
    throw new Error("the bundle upload left no typed import-bundle workload");
  }
  return { status: row.status, failed: row.result?.failed };
}

test("a chat restores with its character when the character's handle is not the slug of its name", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  const owner = await source.principalFor(source.ownerId);
  await source.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: CHOSEN_HANDLE, name: CHARACTER_NAME, description: "A keeper tends the orbital ledger." }),
  });
  const lines = [
    { role: "user", content: "Is the ledger balanced?" },
    { role: "assistant", speakerHandle: CHOSEN_HANDLE, content: "Every orbit is accounted for." },
  ] as const;
  await seedTranscript(source, { ownerId: source.ownerId, characterHandles: [CHOSEN_HANDLE], lines });
  const bundle = await exportLibrary(source, ["character", "chat"]);

  await using target = await signedInBox();
  const outcome = await restore(target, bundle);
  const caller = await target.internalCallerFor(target.ownerId);
  const restored = (await caller.character.list({})).items.filter((item) => item.name === CHARACTER_NAME);
  const [character] = restored;
  const rooms = character === undefined ? [] : (await caller.chat.listChats({ characterId: character.id })).items;
  const transcripts = await Promise.all(rooms.map(async (room) => (await caller.chat.listMessages({ chatId: room.id })).messages.map((m) => m.content)));

  expect({ outcome, handles: restored.map((c) => c.handle), transcripts }).toEqual({
    outcome: { status: "succeeded", failed: 0 },
    handles: [CHOSEN_HANDLE],
    transcripts: [lines.map((line) => line.content)],
  });
});
