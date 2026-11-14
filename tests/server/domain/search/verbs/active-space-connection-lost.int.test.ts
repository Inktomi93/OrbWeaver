// A search whose active generation's connection is deleted between the generation read and the connection resolve answers the
// re-indexing refusal, and the retrieval degrade turns that refusal into the ruled empty result plus one index-unavailable report.
// @subject packages/server/src/domain/search/persistence/space.ts
// @subject packages/server/src/domain/search/substrate/retrieval-degrade.ts
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { SEARCH_SPACE_REINDEXING } from "@orb/contracts/search";
import { userConnections } from "@orb/db";
import type { UserConnectionId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { HeldDb, HeldStatement, ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  freshHeldDb,
  seedCorpusConnections,
  withheldTable,
} from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { withRetrievalDegrade } from "#server/domain/search/index.ts";
import { executeAdmitted } from "../../workloads/funding.fixtures.ts";

async function admitted(root: ServerTestHarness, id: Parameters<typeof executeAdmitted>[1]): Promise<void> {
  await executeAdmitted(root, id);
  await expect.poll(async () => (await root.services.workloads.get({ caller: null, id })).status).not.toMatch(/queued|running|cancelling/u);
}

interface ReadyGeneration {
  readonly principal: Principal;
  readonly embed: { readonly id: UserConnectionId };
  readonly query: Parameters<ServerTestHarness["services"]["search"]["search"]>[0];
  readonly gate: HeldStatement;
}

/** A root whose owner holds a promoted embed generation, with the by-id connection read of a search held for the test to race. */
async function readyGeneration(held: HeldDb, root: ServerTestHarness): Promise<ReadyGeneration> {
  const actor = await root.actor();
  const principal = await root.principalFor(actor.id);
  const caller = await root.internalCallerFor(actor.id);
  const { embed } = await seedCorpusConnections(root, principal);
  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  await caller.character.create({
    input: createCharacterSchema.parse({ handle: "ledger-keeper", name: "Ledger keeper", description: "Preserves the orbital ledger." }),
  });
  const document = await caller.databank.createFromText({ name: "Ledger", text: "The orbital ledger preserves the harbor witness." });
  await root.app.databankIngest.ingestDocument({ documentId: document.document.id, signal: new AbortController().signal });
  for (const input of [
    { kind: "index", params: { source: "all" } },
    { kind: "memory-backfill", params: {} },
    { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } },
  ] as const) {
    const job = await caller.workloads.start({ input, mode: "singular" });
    await admitted(root, job.id);
  }
  await root.settleBackground();
  const query = { ownerId: principal.userId, query: "orbital ledger", over: "entities", scope: { kind: "owner" }, topN: 5 } as const;
  expect((await root.services.search.search(query)).hits).not.toEqual([]);
  // The generation row still names the connection when the search reads it; the race lands before the resolve reads the row.
  const gate = held.hold(/from "user_connections" where "user_connections"\."id" = \? limit/u);
  return { principal, embed, query, gate };
}

function corpusProvider(): ReturnType<typeof createCorpusProviderExecution> {
  return createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
  });
}

test("an active generation whose connection is deleted mid-search is the re-indexing refusal, and the degrade reports it once", async () => {
  using held = await freshHeldDb();
  await using root = await createServerHarness({ db: held.db, providerFetch: corpusProvider().execute });
  const { principal, embed, query, gate } = await readyGeneration(held, root);
  let refusal: unknown;
  const unavailable = vi.fn();
  const degraded = withRetrievalDegrade(
    async () => {
      try {
        return await root.services.search.search(query);
      } catch (error) {
        refusal = error;
        throw error;
      }
    },
    { empty: null, onIndexUnavailable: unavailable },
  );
  try {
    await gate.reached;
    gate.disarm();
    await root.services.connection.remove({ principal, connectionId: embed.id });
  } finally {
    gate.release();
  }

  expect(await degraded).toBeNull();
  expect(refusal).toMatchObject({ code: SEARCH_SPACE_REINDEXING });
  expect(unavailable).toHaveBeenCalledOnce();
});

test("an active generation whose connection read fails for any other reason surfaces as itself and is not reported as unavailable", async () => {
  using held = await freshHeldDb();
  await using root = await createServerHarness({ db: held.db, providerFetch: corpusProvider().execute });
  const { query, gate } = await readyGeneration(held, root);
  const unavailable = vi.fn();
  const degraded = withRetrievalDegrade(() => root.services.search.search(query), { empty: null, onIndexUnavailable: unavailable });
  const settled = expect(degraded).rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringContaining("no such table") }) });
  try {
    await gate.reached;
    gate.disarm();
    await using _fault = await withheldTable(root.db, userConnections);
    gate.release();
    await settled;
  } finally {
    gate.release();
  }
  expect(unavailable).not.toHaveBeenCalled();
});
