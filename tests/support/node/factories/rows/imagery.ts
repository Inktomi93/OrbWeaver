// Imagery rows a production verb left, read behind the rows door for persistence-tier and corpus captures.

import type { GeneratedPicture } from "@orb/contracts/imagery";
import type { PortableEntity } from "@orb/contracts/portability";
import type { Db } from "@orb/db";
import { imageryGenerations, imageryImportCalls } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type { ImageryGenerationRow, ImageryImportCallRow, ImageryService, SeededImageryGeneration, SeededNativeImageryImport } from "../imagery.ts";

/** The owner's `reused` result distinguishes stored reuse rows from newly produced provenance. */
export async function seedImageryGenerationsRows(
  root: ServerProducerRoot,
  params: Parameters<ImageryService["generatePicture"]>[0],
): Promise<SeededImageryGeneration> {
  const db = root.db;
  const generatePicture = root.services.imagery.generatePicture;
  const picture = await generatePicture(params);
  return { picture, generations: await captureImageryGenerationRows(db, picture) };
}

/** Capture the writer's returned identities, including a picture returned through the native edit route. */
export async function captureImageryGenerationRows(db: Db, picture: GeneratedPicture): Promise<readonly ImageryGenerationRow[]> {
  return await Promise.all(
    picture.images.map(async (image): Promise<ImageryGenerationRow> => {
      const row = await db.select().from(imageryGenerations).where(eq(imageryGenerations.id, image.generationId)).get();
      if (row === undefined) {
        throw new Error("production imagery output has no canonical generation row");
      }
      return row;
    }),
  );
}

/** The native roundtrip keeps its genuinely returned call identity; imports own parsing, admission and deduplication. */
export async function seedNativeImageryImportClaimRows(
  root: ServerProducerRoot,
  params: Parameters<PortableEntity["importFile"]>,
  callId: ImageryImportCallRow["id"],
): Promise<SeededNativeImageryImport> {
  const db = root.db;
  const descriptor = root.app.portability.find((entity) => entity.kind === "imagery");
  if (descriptor === undefined) {
    throw new Error("production composition has no imagery portability descriptor");
  }
  const importFile = descriptor.importFile;
  const [ownerId, file] = params;
  const outcome = await importFile(ownerId, file);
  if (!outcome.ok) {
    throw new Error("production native imagery import refused its claim", { cause: outcome });
  }
  const claim = await db
    .select()
    .from(imageryImportCalls)
    .where(and(eq(imageryImportCalls.id, callId), eq(imageryImportCalls.ownerId, ownerId)))
    .get();
  if (claim === undefined) {
    throw new Error("production native imagery import left no canonical call claim");
  }
  return { outcome, claim };
}
