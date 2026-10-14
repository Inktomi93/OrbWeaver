// Generation provenance comes from the real imagery operation, including rows returned by a reuse hit.

import type { PortableEntity } from "@orb/contracts/portability";
import type { Db } from "@orb/db";
import { imageryGenerations, imageryImportCalls } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import { and, eq } from "drizzle-orm";

type ImageryService = ServicesResult["services"]["imagery"];

export type ImageryGenerationRow = typeof imageryGenerations.$inferSelect;
export type ImageryImportCallRow = typeof imageryImportCalls.$inferSelect;

export interface SeededImageryGeneration {
  readonly picture: Awaited<ReturnType<ImageryService["generatePicture"]>>;
  readonly generations: readonly ImageryGenerationRow[];
}

/** The owner's `reused` result distinguishes stored reuse rows from newly produced provenance. */
export async function seedImageryGenerations(
  db: Db,
  generatePicture: ImageryService["generatePicture"],
  params: Parameters<ImageryService["generatePicture"]>[0],
): Promise<SeededImageryGeneration> {
  const picture = await generatePicture(params);
  const generations = await Promise.all(
    picture.images.map(async (image): Promise<ImageryGenerationRow> => {
      const row = await db.select().from(imageryGenerations).where(eq(imageryGenerations.id, image.generationId)).get();
      if (row === undefined) {
        throw new Error("production imagery output has no canonical generation row");
      }
      return row;
    }),
  );
  return { picture, generations };
}

interface SeededNativeImageryImport {
  readonly outcome: Awaited<ReturnType<PortableEntity["importFile"]>>;
  readonly claim: ImageryImportCallRow;
}

/** The native roundtrip keeps its genuinely returned call identity; imports own parsing, admission and deduplication. */
export async function seedNativeImageryImportClaim(
  db: Db,
  importFile: PortableEntity["importFile"],
  params: Parameters<PortableEntity["importFile"]>,
  callId: ImageryImportCallRow["id"],
): Promise<SeededNativeImageryImport> {
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
