// A re-point whose new image encoder answers the width probe with no vector is refused, and the failure leaves one
// warning record that names its lens and model: the probe's empty answer is logged where it is thrown, not again by
// whoever catches it.
// @subject packages/server/src/domain/embeddings/persistence/generation.ts
// @subject packages/server/src/domain/embeddings/substrate/embed-failure.ts
// @subject packages/server/src/domain/embeddings/verbs/sync-target-generations.ts

import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { readSeedAvatar, SEED_MANIFEST } from "@orb/default-content";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_ALTERNATE_EMBED_MODEL,
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusConnections,
  seedEmbeddingConnection,
} from "@orb/testkit/node/composed";
import { z } from "zod";

const LOG_SCAN_LIMIT = 2000;
const EMBEDDINGS_PATH = "/v1/embeddings";
const PROVIDER_RESOLVE_EVENT = "provider.resolve-warning";
const logRecordSchema = z.looseObject({ level: z.string(), event: z.string().optional(), lens: z.string().optional(), model: z.string().optional() });
const embeddingRequestSchema = z.looseObject({ model: z.string() });

test("a re-pointed image encoder that answers the width probe with no vector is refused and logged once", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_ALTERNATE_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller repairs the orbital loom.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({
    logLevel: "warn",
    // The alternate encoder's server returns an embeddings list with no item, the empty answer a probe must not accept.
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method === "POST" && new URL(request.url).pathname === EMBEDDINGS_PATH) {
        const { model } = embeddingRequestSchema.parse(JSON.parse(await request.clone().text()));
        if (model === CORPUS_ALTERNATE_EMBED_MODEL) {
          return Response.json({ object: "list", model, data: [] });
        }
      }
      return await physical.execute(request);
    },
  });
  const principal = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, principal);
  await root.services.settings.updateAppSettings({ principal, partial: { corpusAutoindex: true } });
  const joint = await seedEmbeddingConnection(root, principal, { model: CORPUS_EMBED_MODEL, input: ["text", "image"] });
  await root.services.connection.setBinding({ principal, task: "imageEmbed", connectionId: joint.id });

  // The first image write creates the owner's image target, so the next binding is a move that must be probed.
  const handle = SEED_MANIFEST.flatMap((item) => (item.kind === "character" ? [item.handle] : []))[0];
  const avatar = handle === undefined ? null : await readSeedAvatar(handle);
  if (avatar === null) {
    throw new Error("the shipped content carries no avatar for this case");
  }
  await root.app.assets.store({ principal, ...avatar, kind: "avatar" });
  await root.settleBackground();

  const alternate = await seedEmbeddingConnection(root, principal, { model: CORPUS_ALTERNATE_EMBED_MODEL, input: ["text", "image"] });
  await expect(root.services.connection.setBinding({ principal, task: "imageEmbed", connectionId: alternate.id })).rejects.toMatchObject({
    code: CONNECTION_OP_CODES.embedUnreachable,
  });
  await root.settleBackground();

  // Provider resolution warnings are their own events; what is left is what the failed probe wrote.
  const probeRecords = root.observability
    .logLines(LOG_SCAN_LIMIT)
    .map((line) => logRecordSchema.parse(JSON.parse(line)))
    .filter((record) => record.level === "warn" && record.event !== PROVIDER_RESOLVE_EVENT);
  expect(probeRecords).toHaveLength(1);
  expect(probeRecords[0]).toMatchObject({ lens: "width probe", model: CORPUS_ALTERNATE_EMBED_MODEL });
});
