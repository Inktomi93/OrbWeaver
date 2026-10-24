// The Imagery row and result shapes; the reads that return them live in the rows tier (`rows/imagery.ts`).

import type { PortableEntity } from "@orb/contracts/portability";
import type { imageryGenerations, imageryImportCalls } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";

export type ImageryService = ServicesResult["services"]["imagery"];

export type ImageryGenerationRow = typeof imageryGenerations.$inferSelect;
export type ImageryImportCallRow = typeof imageryImportCalls.$inferSelect;

export interface SeededImageryGeneration {
  readonly picture: Awaited<ReturnType<ImageryService["generatePicture"]>>;
  readonly generations: readonly ImageryGenerationRow[];
}

export interface SeededNativeImageryImport {
  readonly outcome: Awaited<ReturnType<PortableEntity["importFile"]>>;
  readonly claim: ImageryImportCallRow;
}
