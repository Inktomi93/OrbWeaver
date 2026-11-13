// Storage is the subject: a bulk databank reindex that skips a disabled owner's documents records no `documents`
// completion for that owner. A false completion would promote the owner's moved target with the documents missing,
// so boot's stale-space catch-up would never rebuild the documents the sweep skipped.
// @subject packages/server/src/domain/embeddings/verbs/vector-sweep-ops.ts
// @subject packages/server/src/domain/databank/ingest/index.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import { embedSpaceState } from "@orb/db";
import type { UserConnectionId, UserId, WorkloadId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_ALTERNATE_EMBED_MODEL,
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusConnections,
  seedEmbeddingConnection,
} from "@orb/testkit/node/composed";
import { and, eq } from "drizzle-orm";

const OWNER_HEADER = "x-embedding-owner";
const DOCUMENT_TEXT = "The ledger room keeps its lamps lit through the long watch.";
const DOCUMENT_REINDEX = { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } } satisfies StartWorkloadInput;
const CARD_INDEX = { kind: "index", params: { source: "text" } } satisfies StartWorkloadInput;

// The root's own manual workload driver: the engine's claim and run, with no worker racing the case.
async function runToEnd(root: ServerTestHarness, id: WorkloadId): Promise<string> {
  const run = root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the harness owns its workload execution only with startJobs: false");
  }
  await run(id, new AbortController().signal);
  return (await root.services.workloads.get({ caller: null, id })).status;
}

// Every encoder request names its owner, so an owner's spend is read off the wire.
async function tagEncoder(root: ServerTestHarness, owner: Principal, connectionId: UserConnectionId): Promise<void> {
  await root.services.connection.update({ principal: owner, connectionId, patch: { transport: { headers: { [OWNER_HEADER]: owner.userId } } } });
}

test("a bulk databank reindex records no documents completion for a disabled owner, so the boot catch-up rebuilds their documents", async () => {
  let spent: (string | null)[] = [];
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL, CORPUS_ALTERNATE_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
    completion: () => {
      throw new Error("a document sweep must not request a model reply");
    },
  });
  await using root = await createServerHarness({
    startJobs: false,
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method === "POST" && new URL(request.url).pathname.endsWith("/embeddings")) {
        spent.push(request.headers.get(OWNER_HEADER));
      }
      return await physical.execute(request);
    },
  });
  const spentSince = (): ReadonlySet<string | null> => {
    const owners = new Set(spent);
    spent = [];
    return owners;
  };
  const admin = await root.principalFor(root.ownerId);
  const kept = await root.principalFor((await root.actor()).id);
  const gone = await root.principalFor((await root.actor()).id);
  const documents = new Map<UserId, Awaited<ReturnType<typeof root.services.databank.createFromText>>>();
  for (const owner of [kept, gone]) {
    documents.set(owner.userId, await root.services.databank.createFromText({ principal: owner, name: "lamps.txt", text: DOCUMENT_TEXT }));
    await root.services.character.create({
      principal: owner,
      input: createCharacterSchema.parse({ name: "Lamplighter", handle: "lamplighter", description: "A keeper who tends the ledger room's lamps." }),
    });
    await tagEncoder(root, owner, (await seedCorpusConnections(root, owner)).embed.id);
  }
  const alternate = await seedEmbeddingConnection(root, gone, { model: CORPUS_ALTERNATE_EMBED_MODEL });
  await tagEncoder(root, gone, alternate.id);
  await root.app.embeddings.resolveGeneration(gone.userId, "embed");
  await root.settleBackground();
  // A bulk sweep covers the owners who hold vectors, so the enabled owner's card is embedded first.
  const keptCards = await root.services.workloads.start({ caller: kept, ownerId: kept.userId, mode: "singular", input: CARD_INDEX });
  expect(await runToEnd(root, keptCards.id)).toBe("succeeded");

  // The owner's target moves to a second encoder. The forced card rebuild finishes, then the owner is disabled before
  // the document rebuild runs, so that run is refused and the documents are not in the new generation.
  await root.services.connection.setBinding({ principal: gone, task: "embed", connectionId: alternate.id });
  await root.settleBackground();
  const moved = await root.app.embeddings.resolveGeneration(gone.userId, "embed");
  const goneRuns = (): ReturnType<typeof root.services.workloads.list> =>
    root.services.workloads.list({ caller: admin, ownerId: gone.userId, status: "queued" });
  const forced = await goneRuns();
  const cardRebuild = forced.find((queued) => queued.kind === CARD_INDEX.kind);
  if (cardRebuild === undefined) {
    throw new Error("the target move queued no card rebuild");
  }
  expect(await runToEnd(root, cardRebuild.id)).toBe("succeeded");
  await root.services.admin.setEnabled({ principal: admin, userId: gone.userId, enabled: false });
  for (const refused of await goneRuns()) {
    expect(await runToEnd(root, refused.id)).toBe("failed");
  }
  spentSince();

  const sweep = await root.services.workloads.start({ caller: admin, ownerId: admin.userId, mode: "bulk", input: DOCUMENT_REINDEX });
  expect(await runToEnd(root, sweep.id)).toBe("succeeded");
  expect(spentSince()).toEqual(new Set([kept.userId]));
  const documentsScope = (ownerId: UserId): Promise<readonly { readonly active: string | null; readonly candidate: string | null }[]> =>
    root.db
      .select({ active: embedSpaceState.activeGenerationId, candidate: embedSpaceState.candidateGenerationId })
      .from(embedSpaceState)
      .where(and(eq(embedSpaceState.ownerId, ownerId), eq(embedSpaceState.scope, "documents")));
  // The positive control: the same pass records the enabled owner's documents against their own target.
  const keptTarget = await root.app.embeddings.resolveGeneration(kept.userId, "embed");
  expect((await documentsScope(kept.userId)).some(({ active, candidate }) => active === keptTarget.id || candidate === keptTarget.id)).toBe(true);
  expect((await documentsScope(gone.userId)).flatMap(({ active, candidate }) => [active, candidate])).not.toContain(moved.id);

  // Re-enabled, the target still lacks its documents, so it is unpromoted and boot's catch-up rebuilds them.
  await root.services.admin.setEnabled({ principal: admin, userId: gone.userId, enabled: true });
  root.app.detachStaleSpaceReindex();
  await root.settleBackground();
  const rebuild = (await goneRuns()).filter((queued) => queued.kind === DOCUMENT_REINDEX.kind);
  expect(rebuild).toHaveLength(1);
  for (const queued of rebuild) {
    expect(await runToEnd(root, queued.id)).toBe("succeeded");
  }
  expect(spentSince()).toEqual(new Set([gone.userId]));
  const document = documents.get(gone.userId)?.document;
  if (document === undefined) {
    throw new Error("the disabled owner's document was never created");
  }
  const view = await root.services.databank.get({ principal: gone, id: document.id });
  expect(view.embeddedCount).toBeGreaterThan(0);
  expect(view.embeddedCount).toBe(view.chunkCount);
});
