// Native generation/import provenance stays private; valid vendor pixels are supplied separately at HTTP.
import { createCharacterSchema } from "@orb/contracts/character";
import { portableImageryCallSchema } from "@orb/contracts/imagery";
import type { PortableFile } from "@orb/contracts/portability";
import { imageryGenerations, imageryImportCalls } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { eq, inArray } from "drizzle-orm";
import { CORPUS_PROVIDER_ENDPOINT } from "./corpus-provider.ts";
import { seedImageryGenerationsRows, seedNativeImageryImportClaimRows } from "./factories/rows/imagery.ts";
import type { ServerTestHarness } from "./server.ts";

export const CORPUS_IMAGE_MODEL = "corpus-image-v1";
type CorpusCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type NativeCohort = Awaited<ReturnType<typeof seedImageryGenerationsRows>>;
interface CorpusImagery {
  readonly character: Awaited<ReturnType<CorpusCaller["character"]["create"]>>;
  readonly room: Awaited<ReturnType<CorpusCaller["chat"]["startChat"]>>;
  readonly connection: Awaited<ReturnType<ServerTestHarness["services"]["connection"]["create"]>>;
  readonly first: NativeCohort;
  readonly tied: NativeCohort;
  readonly equalReuse: NativeCohort;
  readonly newest: NativeCohort;
  readonly newerReuse: NativeCohort;
  readonly imported: Awaited<ReturnType<typeof seedNativeImageryImportClaimRows>>;
  readonly repeated: Awaited<ReturnType<typeof seedNativeImageryImportClaimRows>>;
  readonly foreign: Awaited<ReturnType<ServerTestHarness["app"]["portability"][number]["importFile"]>>;
  readonly rows: readonly (typeof imageryGenerations.$inferSelect)[];
  readonly foreignClaims: readonly (typeof imageryImportCalls.$inferSelect)[];
  readonly provenance: readonly Awaited<ReturnType<CorpusCaller["imagery"]["readProvenance"]>>[];
}

/** Produce three native cohorts, retain exact reuse receipts and import only an actually exported file. */
export async function seedCorpusImagery(root: ServerTestHarness, foreignUserId: ServerTestHarness["ownerId"]): Promise<CorpusImagery> {
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const character = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "corpus-native-imagery", name: "Portrait witness", description: "A witness records the orbital loom." }),
  });
  const room = await caller.chat.startChat({ characterIds: [character.id], opening: "none" });
  await caller.chat.commitMessage({ chatId: room.chat.id, content: "The witness stands beside the loom.", timeZone: UTC_TIME_ZONE });
  const connection = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_IMAGE_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { context: { window: 32_000 }, output: { modalities: ["text", "image"] } },
      features: { images: "images-api", detectServer: false },
    },
  });
  await caller.connection.setBinding({ task: "generateImage", connectionId: connection.id });
  const params = { caller: principal, chatId: room.chat.id, subjectCharacterId: character.id, mode: "character", n: 2 } as const;
  const first = await seedImageryGenerationsRows(root, { ...params, reuse: "never" });
  const tied = await seedImageryGenerationsRows(root, { ...params, reuse: "never" });
  const equalReuse = await seedImageryGenerationsRows(root, { ...params, reuse: "prefer" });
  root.timers.advance(1);
  await root.settleBackground();
  const newest = await seedImageryGenerationsRows(root, { ...params, reuse: "never" });
  const newerReuse = await seedImageryGenerationsRows(root, { ...params, reuse: "prefer" });
  const descriptor = root.app.portability.find((entity) => entity.kind === "imagery");
  const callId = newest.generations[0]?.callId;
  if (descriptor === undefined || callId === null || callId === undefined) {
    throw new Error("native imagery corpus produced no portability descriptor or call identity");
  }
  let file: PortableFile | undefined;
  for await (const candidate of descriptor.exportAll(root.ownerId)) {
    const parsed = portableImageryCallSchema.loose().parse(JSON.parse(new TextDecoder().decode(candidate.bytes)));
    if (parsed.execution.sourceCallId === callId) {
      file = candidate;
      break;
    }
  }
  if (file === undefined) {
    throw new Error("native imagery export omitted its returned call cohort");
  }
  const imported = await seedNativeImageryImportClaimRows(root, [root.ownerId, file], callId);
  const repeated = await seedNativeImageryImportClaimRows(root, [root.ownerId, file], callId);
  const foreign = await descriptor.importFile(foreignUserId, file);
  const rows = await root.db
    .select()
    .from(imageryGenerations)
    .where(
      inArray(
        imageryGenerations.id,
        [...first.generations, ...tied.generations, ...newest.generations].map((row) => row.id),
      ),
    )
    .orderBy(imageryGenerations.id);
  const foreignClaims = await root.db.select().from(imageryImportCalls).where(eq(imageryImportCalls.ownerId, foreignUserId));
  const provenance = await Promise.all(newest.picture.images.map((image) => caller.imagery.readProvenance({ assetId: image.assetId })));
  await root.settleBackground();
  return { character, room, connection, first, tied, equalReuse, newest, newerReuse, imported, repeated, foreign, rows, foreignClaims, provenance };
}
