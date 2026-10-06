// History-only portability has no connection resolver or provider executor. The owner comes exclusively
// from the trusted bundle runner; carried context and ids are never an admission predicate.

import type { PortableImageryCall, PortableImageryImage } from "@orb/contracts/imagery";
import type { PortableFile, PortableImportOutcome } from "@orb/contracts/portability";
import type { BumpStatsCanonVersion } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { ImageryCallId, ImageryGenerationId, UserId } from "@orb/kit/ids";

export interface ImageryPortabilityContext {
  readonly db: Db;
  readonly newCallId: () => ImageryCallId;
  readonly newGenerationId: () => ImageryGenerationId;
  readonly bumpStatsCanonVersion: BumpStatsCanonVersion<BatchStmt[], Db>;
}

export interface ImageryPortabilityService {
  readonly exportAll: (ownerId: UserId) => AsyncIterable<PortableFile>;
  readonly importFile: (ownerId: UserId, file: PortableFile) => Promise<PortableImportOutcome>;
}

export interface ImageryImportWriteResult {
  readonly admitted: boolean;
  readonly created: boolean;
  readonly subjectLinked: boolean;
}

export interface NativeImageryImportMatch {
  readonly call: PortableImageryCall;
  readonly callId: ImageryCallId | null;
}

export interface ImageryImportOutputInput {
  readonly image: PortableImageryImage;
  readonly id: ImageryGenerationId;
  readonly native: NativeImageryImportMatch | null;
}
