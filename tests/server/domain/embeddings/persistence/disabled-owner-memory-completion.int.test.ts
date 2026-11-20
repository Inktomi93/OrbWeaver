// Storage is the subject: a bulk memory sweep's completion skips a disabled owner whose memory needs no build. Their
// receipt would resolve their target, which width-probes their encoder and moves the target once their endpoint
// reports a new window, and the sweep would then record a memory completion they never earned. The enabled owner in
// the same pass is resolved and recorded. Each owner's encoder runs its own model, so the wire names whose it is.
// @subject packages/server/src/domain/embeddings/verbs/vector-sweep-ops.ts
// @subject packages/server/src/domain/embeddings/verbs/vacuous-memory-receipt.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import { embedSpaceState } from "@orb/db";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_ALTERNATE_EMBED_MODEL,
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
} from "@orb/testkit/node/composed";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const CARD_INDEX = { kind: "index", params: { source: "text" } } satisfies StartWorkloadInput;
const MEMORY_SWEEP = { kind: "memory-backfill", params: {} } satisfies StartWorkloadInput;
/** The input window the reconfigured server starts reporting for the disabled owner's encoder. */
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

// One owner's encoder on `model` and one indexed card, so a bulk sweep covers the owner.
async function indexedOwner(root: ServerTestHarness, owner: Principal, model: string): Promise<void> {
  const encoder = await root.services.connection.create({
    principal: owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model,
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
}

test("a bulk memory sweep sends nothing to a disabled owner's encoder and records no memory completion for them", async () => {
  let spent: string[] = [];
  let reconfigured = false;
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL, CORPUS_ALTERNATE_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
    completion: () => {
      throw new Error("a memory sweep with memory off must not request a model reply");
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
      // The server restarted with a stated window for the disabled owner's encoder, so its listing now says so.
      const listed = modelListSchema.parse(await answer.json());
      const data = listed.data.map((row) => (row.id === CORPUS_ALTERNATE_EMBED_MODEL ? { ...row, [LISTED_WINDOW_FIELD]: RECONFIGURED_WINDOW } : row));
      return Response.json({ ...listed, data });
    },
  });
  const spentSince = (): ReadonlySet<string> => {
    const models = new Set(spent);
    spent = [];
    return models;
  };
  const memoryScope = (ownerId: UserId): Promise<readonly { readonly active: string | null; readonly candidate: string | null }[]> =>
    root.db
      .select({ active: embedSpaceState.activeGenerationId, candidate: embedSpaceState.candidateGenerationId })
      .from(embedSpaceState)
      .where(and(eq(embedSpaceState.ownerId, ownerId), eq(embedSpaceState.scope, "memory")));
  const admin = await root.principalFor(root.ownerId);
  const kept = await root.principalFor((await root.actor()).id);
  const gone = await root.principalFor((await root.actor()).id);
  await indexedOwner(root, kept, CORPUS_EMBED_MODEL);
  await indexedOwner(root, gone, CORPUS_ALTERNATE_EMBED_MODEL);
  await root.settleBackground();
  // Control for the absence below: the disabled owner's encoder requests reach the wire under its model.
  expect(spentSince()).toContain(CORPUS_ALTERNATE_EMBED_MODEL);

  await root.services.admin.setEnabled({ principal: admin, userId: gone.userId, enabled: false });
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
  const goneBefore = await memoryScope(gone.userId);
  const keptBefore = await memoryScope(kept.userId);

  const sweep = await root.services.workloads.start({ caller: admin, ownerId: admin.userId, mode: "bulk", input: MEMORY_SWEEP });
  expect(await runToEnd(root, sweep.id)).toBe("succeeded");

  expect(spentSince()).not.toContain(CORPUS_ALTERNATE_EMBED_MODEL);
  expect(await memoryScope(gone.userId)).toEqual(goneBefore);
  // The positive control: the same pass records the enabled owner's memory against their target, which it had not been.
  const keptTarget = await root.app.embeddings.resolveGeneration(kept.userId, "embed");
  const recordsKept = (rows: Awaited<ReturnType<typeof memoryScope>>): boolean =>
    rows.some(({ active, candidate }) => active === keptTarget.id || candidate === keptTarget.id);
  expect(recordsKept(keptBefore)).toBe(false);
  expect(recordsKept(await memoryScope(kept.userId))).toBe(true);
});
