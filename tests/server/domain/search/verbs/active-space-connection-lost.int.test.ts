// A search whose active generation's connection is deleted between the generation read and the connection resolve answers the
// re-indexing refusal, and the retrieval degrade turns that refusal into the ruled empty result plus one index-unavailable report.
// @subject packages/server/src/domain/search/substrate/space.ts
// @subject packages/server/src/domain/search/substrate/retrieval-degrade.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { SEARCH_SPACE_REINDEXING } from "@orb/contracts/search";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  freshHeldDb,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { withRetrievalDegrade } from "#server/domain/search/index.ts";
import { executeAdmitted } from "../../workloads/funding.fixtures.ts";

async function admitted(root: ServerTestHarness, id: Parameters<typeof executeAdmitted>[1]): Promise<void> {
  await executeAdmitted(root, id);
  await expect.poll(async () => (await root.services.workloads.get({ caller: null, id })).status).not.toMatch(/queued|running|cancelling/u);
}

test("an active generation whose connection is deleted mid-search is the re-indexing refusal, and the degrade reports it once", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
  });
  using held = await freshHeldDb();
  await using root = await createServerHarness({ db: held.db, providerFetch: physical.execute });
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

  // The generation row still names the connection when the search reads it; the delete lands before the resolve reads the row.
  const gate = held.hold(/from "user_connections" where "user_connections"\."id" = \? limit/u);
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
