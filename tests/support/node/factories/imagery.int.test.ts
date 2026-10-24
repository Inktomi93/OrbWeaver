// @subject tests/support/node/factories/rows/imagery.ts
// @subject packages/server/src/domain/imagery/persistence/queries.ts
import { createCharacterSchema } from "@orb/contracts/character";
import type { GeneratePictureParams } from "@orb/contracts/imagery";
import { generationProvenanceSchema } from "@orb/contracts/imagery";
import type { PortableFile } from "@orb/contracts/portability";
import { imageryGenerations, imageryImportCalls } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { eq, inArray } from "drizzle-orm";
import { createCorpusProviderExecution } from "../corpus-provider.ts";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { makeAssetBytes } from "./asset.ts";
import { makeGenerationProvenance } from "./imagery-view.ts";
import { seedImageryGenerationsRows, seedNativeImageryImportClaimRows } from "./rows/imagery.ts";

const ENDPOINT = "http://127.0.0.1:8703/v1";
const MODEL = "corpus-image-model";

test("default provenance is parsed by the canonical required-field contract without a shadow shape", () => {
  const provenance = makeGenerationProvenance();
  expect(generationProvenanceSchema.parse(provenance)).toEqual(provenance);
  expect(provenance.usage.costProvenance).toBeNull();
});

// Only raw provider HTTP varies; the graph resolves, shapes, accounts and stores every image itself.
type ImageExecution = ReturnType<typeof createCorpusProviderExecution> & Pick<Parameters<typeof createCorpusProviderExecution>[0], "images">;

function imageExecution(): ImageExecution {
  const images: Uint8Array[] = [];
  return {
    ...createCorpusProviderExecution({
      baseUrl: ENDPOINT,
      modelIds: [MODEL],
      embedding: [1, 0, 0],
      chatText: "a traveller in a blue coat, standing beside a loom",
      structuredReplies: new Map(),
      images,
    }),
    images,
  };
}

async function hostedSubject(
  root: Awaited<ReturnType<typeof createServerHarness>>,
): Promise<Pick<GeneratePictureParams, "caller" | "chatId" | "subjectCharacterId" | "n"> & { readonly mode: "character" }> {
  const principal = await root.principalFor(root.ownerId);
  const character = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "imagery-subject", name: "The traveller", description: "A traveller in a blue coat beside an orbital loom." }),
  });
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [character.id], title: "Portrait capture" });
  const connection = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: ENDPOINT,
    model: MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { context: { window: 32_000 }, output: { modalities: ["text", "image"] } },
      features: { images: "images-api" },
    },
  });
  await root.services.connection.setBinding({ principal, task: "summarize", connectionId: connection.id });
  await root.services.connection.setBinding({ principal, task: "generateImage", connectionId: connection.id });
  await root.services.connection.setBinding({ principal, task: "chat", connectionId: connection.id });
  await root.services.chat.commitMessage({ principal, chatId: chat.id, content: "The traveller stands beside the loom and waits." });
  return { caller: principal, chatId: chat.id, subjectCharacterId: character.id, mode: "character" as const, n: 2 };
}

test("equal-clock reuse returns one exact real call cohort without another provider request", async () => {
  const wire = imageExecution();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  wire.images.push(...Array.from({ length: 4 }, () => makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))));
  const params = await hostedSubject(root);
  const first = await seedImageryGenerationsRows(root, { ...params, reuse: "never" });
  const second = await seedImageryGenerationsRows(root, { ...params, reuse: "never" });
  expect(first.picture.reused).toBe(false);
  expect(second.picture.reused).toBe(false);
  expect(new Set([...first.generations, ...second.generations].map((row) => row.createdAt))).toEqual(new Set([root.clock.now()]));
  expect(new Set([...first.generations, ...second.generations].map((row) => row.callId)).size).toBe(2);
  const beforePrefer = [...wire.requests];
  const reused = await seedImageryGenerationsRows(root, { ...params, reuse: "prefer" });
  expect(reused.picture.reused).toBe(true);
  expect([first.picture.images, second.picture.images]).toContainEqual(reused.picture.images);
  expect([first.generations, second.generations]).toContainEqual(reused.generations);
  expect(wire.requests).toEqual(beforePrefer);
});

test("later-clock reuse returns the newest complete real cohort without another provider request", async () => {
  const wire = imageExecution();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  wire.images.push(...Array.from({ length: 4 }, () => makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))));
  const params = await hostedSubject(root);
  const first = await seedImageryGenerationsRows(root, { ...params, reuse: "never" });
  root.clock.advance(1);
  const newest = await seedImageryGenerationsRows(root, { ...params, reuse: "never" });
  expect(first.generations.map((row) => row.createdAt)).not.toEqual(newest.generations.map((row) => row.createdAt));
  const beforePrefer = [...wire.requests];
  const reused = await seedImageryGenerationsRows(root, { ...params, reuse: "prefer" });
  expect(reused.picture.reused).toBe(true);
  expect(reused.picture.images).toEqual(newest.picture.images);
  expect(reused.generations).toEqual(newest.generations);
  expect(wire.requests).toEqual(beforePrefer);
});

test("a real native export/import records one actual call claim without duplicating provenance or admitting foreign assets", async () => {
  const wire = imageExecution();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  wire.images.push(...Array.from({ length: 2 }, () => makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))));
  const params = await hostedSubject(root);
  const native = await seedImageryGenerationsRows(root, { ...params, reuse: "never" });
  const callId = native.generations[0]?.callId;
  const descriptor = root.app.portability.find((entity) => entity.kind === "imagery");
  if (callId === null || callId === undefined || descriptor === undefined) {
    throw new Error("actual imagery generation or root descriptor is missing");
  }
  const files: PortableFile[] = [];
  for await (const file of descriptor.exportAll(root.ownerId)) {
    files.push(file);
  }
  expect(files).toHaveLength(1);
  const file = files[0];
  if (file === undefined) {
    throw new Error("actual imagery export returned no file");
  }
  const beforeImport = [...wire.requests];
  const imported = await seedNativeImageryImportClaimRows(root, [root.ownerId, file], callId);
  const repeated = await seedNativeImageryImportClaimRows(root, [root.ownerId, file], callId);
  expect(imported.outcome).toMatchObject({ ok: true, created: false });
  expect(repeated).toEqual(imported);
  expect(imported.claim).toMatchObject({ id: callId, ownerId: root.ownerId });
  expect(await root.db.select().from(imageryImportCalls).where(eq(imageryImportCalls.ownerId, root.ownerId))).toEqual([imported.claim]);
  expect(
    await root.db
      .select()
      .from(imageryGenerations)
      .where(
        inArray(
          imageryGenerations.id,
          native.generations.map((row) => row.id),
        ),
      )
      .orderBy(imageryGenerations.id),
  ).toEqual(native.generations.toSorted((left, right) => left.id.localeCompare(right.id)));
  const foreign = await root.actor();
  expect(await descriptor.importFile(foreign.id, file)).toMatchObject({ ok: false });
  expect(await root.db.select().from(imageryImportCalls).where(eq(imageryImportCalls.ownerId, foreign.id))).toEqual([]);
  expect(wire.requests).toEqual(beforeImport);
});
