// Storage is the subject: boot's stale-space catch-up sends nothing to a disabled owner's encoder and keeps their
// stored vectors. The owner's endpoint changes what it reports while the account is disabled, so their target no
// longer matches their binding; the memory step would width-probe the encoder and purge the old vectors on the move.
// Re-enabled, the next catch-up makes that move.
// @subject packages/server/src/domain/embeddings/verbs/vacuous-memory-receipt.ts
// @subject packages/server/src/domain/embeddings/verbs/embedding-reindex-triggers.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import { characterEmbeddings } from "@orb/db";
import type { EmbedGenerationId, WorkloadId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_ALTERNATE_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { z } from "zod";

const CARD_INDEX = { kind: "index", params: { source: "text" } } satisfies StartWorkloadInput;
/** The input window the reconfigured server starts reporting for the owner's encoder. */
const RECONFIGURED_WINDOW = 4096;
/** The `/v1/models` row field a vLLM server states its window in: wire input from the external server. */
const LISTED_WINDOW_FIELD = "max_model_len";
const embedRequestSchema = z.looseObject({ model: z.string() });
const modelListSchema = z.looseObject({ data: z.array(z.looseObject({ id: z.string() })) });

// The root's own manual workload driver: the engine's claim and run, with no worker racing the case.
async function runToEnd(root: ServerTestHarness, id: WorkloadId): Promise<string> {
  const run = root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the harness owns its workload execution only with startJobs: false");
  }
  await run(id, new AbortController().signal);
  return (await root.services.workloads.get({ caller: null, id })).status;
}

test("boot's stale-space catch-up sends nothing to a disabled owner's encoder and keeps their vectors, then rebuilds once they are enabled", async () => {
  let spent: string[] = [];
  let reconfigured = false;
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_ALTERNATE_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
    completion: () => {
      throw new Error("an embedding sweep must not request a model reply");
    },
  });
  await using root = await createServerHarness({
    startJobs: false,
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (request.method === "POST" && path.endsWith("/embeddings")) {
        spent.push(embedRequestSchema.parse(await request.clone().json()).model);
      }
      const answer = await physical.execute(request);
      if (!(reconfigured && request.method === "GET" && path.endsWith("/models"))) {
        return answer;
      }
      // The server restarted with a stated window for the owner's encoder, so its listing now says so.
      const listed = modelListSchema.parse(await answer.json());
      const data = listed.data.map((row) => (row.id === CORPUS_ALTERNATE_EMBED_MODEL ? { ...row, [LISTED_WINDOW_FIELD]: RECONFIGURED_WINDOW } : row));
      return Response.json({ ...listed, data });
    },
  });
  const spentSince = (): readonly string[] => {
    const models = spent;
    spent = [];
    return models;
  };
  const admin = await root.principalFor(root.ownerId);
  const owner = await root.principalFor((await root.actor()).id);
  // The encoder states its width and leaves its input window to what the server reports.
  const encoder = await root.services.connection.create({
    principal: owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_ALTERNATE_EMBED_MODEL,
    allowBackground: true,
    declared: { kind: "embedding", embedding: { dims: CORPUS_EMBEDDING_VECTOR.length }, features: { detectServer: false } },
  });
  await root.services.connection.setBinding({ principal: owner, task: "embed", connectionId: encoder.id });
  await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Lamplighter", handle: "lamplighter", description: "A keeper who tends the ledger room's lamps." }),
  });
  const cards = await root.services.workloads.start({ caller: owner, ownerId: owner.userId, mode: "singular", input: CARD_INDEX });
  expect(await runToEnd(root, cards.id)).toBe("succeeded");
  await root.settleBackground();
  const stored = await root.app.embeddings.resolveGeneration(owner.userId, "embed");
  const vectorsIn = async (generationId: EmbedGenerationId): Promise<number> =>
    (await root.db.select({ id: characterEmbeddings.id }).from(characterEmbeddings).where(eq(characterEmbeddings.generationId, generationId))).length;
  expect(await vectorsIn(stored.id)).toBe(1);

  await root.services.admin.setEnabled({ principal: admin, userId: owner.userId, enabled: false });
  // The server is reconfigured, and another account's connection to it drops the listing every keyless row there shares.
  reconfigured = true;
  await root.services.connection.create({
    principal: admin,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    allowBackground: true,
    declared: { kind: "generation", generation: { context: { window: 32_000 } }, features: { detectServer: false } },
  });
  await root.settleBackground();
  spentSince();

  root.app.detachStaleSpaceReindex();
  await root.settleBackground();
  expect(spentSince()).toEqual([]);
  expect(await vectorsIn(stored.id)).toBe(1);

  // Positive control: enabled again, the same catch-up proves the encoder's width and moves the target, which retires
  // the old vectors and queues the owner's rebuild.
  await root.services.admin.setEnabled({ principal: admin, userId: owner.userId, enabled: true });
  root.app.detachStaleSpaceReindex();
  await root.settleBackground();
  expect(spentSince()).toContain(CORPUS_ALTERNATE_EMBED_MODEL);
  expect(await vectorsIn(stored.id)).toBe(0);
  const queued = await root.services.workloads.list({ caller: admin, ownerId: owner.userId, status: "queued" });
  expect(queued.map((run) => run.kind)).toContain(CARD_INDEX.kind);
});
