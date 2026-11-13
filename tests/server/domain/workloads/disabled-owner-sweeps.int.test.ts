// A box-wide embed sweep spends nothing on a disabled owner's encoder: their rows count as skipped and stay un-indexed,
// so the next sweep after a re-enable embeds them. Each request names the encoder's owner, so the witness is whose
// account a sweep spent, not what it stored.
// @subject packages/server/src/domain/embeddings/verbs/embed-corpus.ts
// @subject packages/server/src/domain/embeddings/verbs/embed-assets.ts
// @subject packages/server/src/domain/embeddings/verbs/embedding-reindex-triggers.ts
// @subject packages/server/src/domain/databank/ingest/index.ts
// @subject packages/server/src/domain/embeddings/verbs/vector-sweep-ops.ts

import { ingestRunResultSchema } from "@orb/contracts/databank";
import type { EmbedPassResult } from "@orb/contracts/embeddings";
import { embedPassResultSchema } from "@orb/contracts/embeddings";
import type { Principal } from "@orb/contracts/identity";
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import { readSeedAvatar, SEED_MANIFEST } from "@orb/default-content";
import type { WorkloadId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedAsset,
} from "@orb/testkit/node/composed";
import { card, executeAdmitted, fundedOwner, WORKLOAD_FUNDER_HEADER } from "./funding.fixtures.ts";

const CARD_INDEX = { kind: "index", params: { source: "text" } } satisfies StartWorkloadInput;
const AVATAR_INDEX = { kind: "index", params: { source: "image" } } satisfies StartWorkloadInput;
const DOCUMENT_REINDEX = { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } } satisfies StartWorkloadInput;
const DOCUMENT_TEXT = "The ledger room keeps its lamps lit through the long watch.";

interface SweepRoom extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly admin: Principal;
  /** The owner who stays enabled throughout. */
  readonly kept: Principal;
  /** The owner the case disables and re-enables. */
  readonly gone: Principal;
  /** The owners named on the encoder and caption requests since the last call. */
  readonly spentSince: () => ReadonlySet<string | null>;
  readonly setGoneEnabled: (enabled: boolean) => Promise<unknown>;
}

// Both owners' content is stored before any encoder is bound, so nothing is indexed until a sweep runs.
async function sweepRoom(seed: (root: ServerTestHarness, owner: Principal, index: number) => Promise<unknown>): Promise<SweepRoom> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller repairs the orbital loom.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  let spent: (string | null)[] = [];
  await using construction = new AsyncDisposableStack();
  const root = construction.use(
    await createServerHarness({
      startJobs: false,
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        const path = new URL(request.url).pathname;
        if (request.method === "POST" && (path.endsWith("/embeddings") || path.endsWith("/chat/completions"))) {
          spent.push(request.headers.get(WORKLOAD_FUNDER_HEADER));
        }
        return await physical.execute(request);
      },
    }),
  );
  const admin = await root.principalFor(root.ownerId);
  const kept = await root.principalFor((await root.actor()).id);
  const gone = await root.principalFor((await root.actor()).id);
  for (const [index, owner] of [kept, gone].entries()) {
    await seed(root, owner, index);
  }
  await root.settleBackground();
  for (const owner of [kept, gone]) {
    const connections = await fundedOwner(root, owner);
    await root.services.connection.update({
      principal: owner,
      connectionId: connections.embed.id,
      patch: { transport: { headers: { [WORKLOAD_FUNDER_HEADER]: owner.userId } } },
    });
  }
  await root.settleBackground();
  const lifetime = construction.move();
  return {
    root,
    admin,
    kept,
    gone,
    spentSince: (): ReadonlySet<string | null> => {
      const owners = new Set(spent);
      spent = [];
      return owners;
    },
    setGoneEnabled: (enabled) => root.services.admin.setEnabled({ principal: admin, userId: gone.userId, enabled }),
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

// The production runner executes the stored row; its result is what the run reports to the owner's job list.
async function settled(room: SweepRoom, id: WorkloadId): Promise<unknown> {
  await executeAdmitted(room.root, id);
  const row = await room.root.services.workloads.get({ caller: room.admin, id });
  expect(row).toMatchObject({ status: "succeeded" });
  return row.result;
}

// The admin starts the box-wide run, funded by the admin's own account.
async function sweep(room: SweepRoom, input: StartWorkloadInput): Promise<unknown> {
  const ref = await room.root.services.workloads.start({ caller: room.admin, ownerId: room.admin.userId, mode: "bulk", input });
  return await settled(room, ref.id);
}

// The encoder requests show the disabled owner's rows were spent on only after the re-enable; both sweeps account for
// the same rows, so the first counted them rather than dropping them. The counts are the settled round's, and a round
// that only finds current rows reports them skipped too, so the split between the two counts is not the witness.
function expectSameRowsAccounted(disabled: EmbedPassResult, resumed: EmbedPassResult): void {
  expect(disabled.embedded + disabled.skipped).toBeGreaterThan(0);
  expect(resumed.embedded + resumed.skipped).toBe(disabled.embedded + disabled.skipped);
}

test("a bulk card index skips a disabled owner's cards, and the sweep after re-enable embeds them", async () => {
  await using room = await sweepRoom(async (root, owner) => await card(root, owner));
  room.spentSince();

  await room.setGoneEnabled(false);
  const disabled = embedPassResultSchema.parse(await sweep(room, CARD_INDEX));
  expect(room.spentSince()).toEqual(new Set([room.kept.userId]));

  await room.setGoneEnabled(true);
  const resumed = embedPassResultSchema.parse(await sweep(room, CARD_INDEX));
  expect(room.spentSince()).toEqual(new Set([room.gone.userId]));
  expectSameRowsAccounted(disabled, resumed);
});

test("the auto-index catch-up, which no account funds, skips a disabled owner's rows", async () => {
  await using room = await sweepRoom(async (root, owner) => await card(root, owner));
  room.spentSince();
  await room.setGoneEnabled(false);
  // Turning auto-index on starts the box-wide catch-up with no funder, so no run-account check stands in front of it.
  await room.root.services.settings.updateAppSettings({ principal: room.admin, partial: { corpusAutoindex: true } });
  await room.root.settleBackground();
  const catchups = (await room.root.services.workloads.list({ caller: room.admin, kind: "index", status: "queued" })).filter(
    (queued) => queued.mode === "bulk" && queued.funderUserId === null,
  );
  expect(catchups).toHaveLength(1);
  const catchup = catchups[0];
  if (catchup === undefined) {
    throw new Error("turning auto-index on queued no catch-up");
  }
  embedPassResultSchema.parse(await settled(room, catchup.id));
  expect(room.spentSince()).toEqual(new Set([room.kept.userId]));
});

test("a bulk avatar index neither captions nor embeds a disabled owner's avatar, and the sweep after re-enable does", async () => {
  const handles = SEED_MANIFEST.flatMap((item) => (item.kind === "character" ? [item.handle] : []));
  const avatars = (await Promise.all(handles.map((handle) => readSeedAvatar(handle)))).filter((avatar) => avatar !== null);
  await using room = await sweepRoom(async (root, owner, index) => {
    const avatar = avatars[index];
    if (avatar === undefined) {
      throw new Error("the shipped content carries too few avatars for this case");
    }
    await seedAsset(root, { principal: owner, ...avatar, kind: "avatar" });
  });
  room.spentSince();

  await room.setGoneEnabled(false);
  const disabled = embedPassResultSchema.parse(await sweep(room, AVATAR_INDEX));
  expect(room.spentSince()).toEqual(new Set([room.kept.userId]));

  await room.setGoneEnabled(true);
  const resumed = embedPassResultSchema.parse(await sweep(room, AVATAR_INDEX));
  expect(room.spentSince()).toEqual(new Set([room.gone.userId]));
  expectSameRowsAccounted(disabled, resumed);
});

test("a bulk databank reindex skips a disabled owner's document, and the sweep after re-enable embeds it", async () => {
  await using room = await sweepRoom(
    async (root, owner) => await root.services.databank.createFromText({ principal: owner, name: "lamps.txt", text: DOCUMENT_TEXT }),
  );
  room.spentSince();

  await room.setGoneEnabled(false);
  const disabled = ingestRunResultSchema.parse(await sweep(room, DOCUMENT_REINDEX));
  expect(room.spentSince()).toEqual(new Set([room.kept.userId]));
  expect(disabled.skipped).toBeGreaterThan(0);

  await room.setGoneEnabled(true);
  const resumed = ingestRunResultSchema.parse(await sweep(room, DOCUMENT_REINDEX));
  expect(room.spentSince()).toEqual(new Set([room.gone.userId]));
  expect(resumed).toMatchObject({ documents: disabled.documents + disabled.skipped, skipped: 0, failed: [] });
});
