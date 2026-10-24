// domain/character — FRONT DOOR: the only legal external import; re-exports the public surface. Cross-
// boundary wire types/schemas live in `@orb/contracts/character` and are NOT re-exported here.

export type { ImportCharacterPort } from "./contract/import-ops.ts";
export type {
  CardWriteBasis,
  CharacterImportProvenance,
} from "./contract/params.ts";
// The refinery-consumed ops (R1 + the R4 sweep enumeration) — factories here, types in
// contract/refinery-ops.ts, wired at compose.
export type {
  CountRefineryScoreTargetsOp,
  DeleteSnapshotOp,
  ListRefineryScoreTargetsOp,
  LoadOwnedCardOp,
  RefineryScoreTarget,
  StampRefinerySignalsOp,
} from "./contract/refinery-ops.ts";
export type { BackfillPluginProvenanceResult } from "./contract/results.ts";
export type { CharacterService } from "./contract/service.ts";

export { createLinkCharacterAvatars } from "./persistence/avatar-link-write.ts";
// A boot verb that reads or writes rows of every owner takes `BootDatabaseHandle`, which only boot mints (D335).
export { backfillPluginProvenance } from "./persistence/backfill-plugin-provenance.ts";
export { createLoadCharacterEmbeddingOwner } from "./persistence/embedding-owner.ts";
export { createCopyHandoffCards } from "./persistence/handoff-copy-write.ts";
export { migrateSeededCardBackgrounds } from "./persistence/migrate-seeded-backgrounds.ts";
export { createCharacterOwned, createOwnedCharacterIds } from "./persistence/ownership-ops.ts";
export { readPluginCardData, writePluginCardData } from "./persistence/plugin-card-data.ts";
export {
  createCountRefineryScoreTargets,
  createDeleteSnapshot,
  createListRefineryScoreTargets,
  createLoadOwnedCard,
  createStampRefinerySignals,
} from "./persistence/refinery-ops.ts";
export { createLoadSeatCards } from "./persistence/seat-cards.ts";
export type { DefaultCharacterSeeder } from "./seeder/index.ts";
export { createDefaultCharacterSeeder, DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE } from "./seeder/index.ts";
export { createCharacterService } from "./service.ts";
export { cardTokenSize } from "./substrate/card-tokens.ts";
export { buildCardEmbedText } from "./substrate/embed-text.ts";
// rpg promotion recovers from a handle-uniqueness refusal through this, injected at the composition root.
export { isCharacterHandleConflict } from "./substrate/handle-conflict.ts";
export { createEmbeddableCardText } from "./verbs/embeddable-card-text.ts";
export { createGalleryCharacterOps } from "./verbs/gallery-character-ops.ts";
export { createGreetingCompletion, createGreetingTemplate } from "./verbs/greeting-ops.ts";
export { createCharacterImportOps } from "./verbs/import-ops.ts";
export { createCharacterRoomProjections } from "./verbs/room-projections.ts";
export { createFindSeedCharacter } from "./verbs/seed-reader.ts";
export { createCharacterSeedStep } from "./verbs/seed-step.ts";
