// domain/character — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The flat live card
// (D28): owner-scoped CRUD + the git-style snapshot/restore history + the card read + the synthetic
// group-identity mint/find. `CharacterContext` is assembled at the entry root (db + injected clock/id +
// db-bound `logAudit` + the cross-feature ops `emit`/`reapAssets`/`attachCardTag`) and passed in; character
// injects NO guard (every surface is ownership-scoped, not admin/owner-gated).
//
// The default-card `seeder/` subsystem (PD-32) is NOT a verb here — it's reached by ENTRY over this service's
//   `create`/`findByHandle` verbs (`createDefaultCharacterSeeder` lives in `seeder/`, re-exported from the
//   front door). See seeder/ + contract/seeder.ts.

import type { CharacterContext, CharacterService } from "./contract/service";
import { createBulkAddCardTag } from "./verbs/bulk-add-card-tag";
import { createBulkArchive } from "./verbs/bulk-archive";
import { createBulkRemove } from "./verbs/bulk-remove";
import { createCreate } from "./verbs/create";
import { createDuplicate } from "./verbs/duplicate";
import { createFindByHandle } from "./verbs/find-by-handle";
import { createFindByImportHash } from "./verbs/find-by-import-hash";
import { createFindSyntheticGroupCharacter } from "./verbs/find-synthetic-group-character";
import { createGet } from "./verbs/get";
import { createGetCard } from "./verbs/get-card";
import { createList } from "./verbs/list";
import { createListEmbeddableCharacterIds } from "./verbs/list-embeddable-character-ids";
import { createListSnapshots } from "./verbs/list-snapshots";
import { createLoadCardText } from "./verbs/load-card-text";
import { createMintSyntheticGroupCharacter } from "./verbs/mint-synthetic-group-character";
import { createRemove } from "./verbs/remove";
import { createRestore } from "./verbs/restore";
import { createSnapshot } from "./verbs/snapshot";
import { createUpdate } from "./verbs/update";

export function createCharacterService(ctx: CharacterContext): CharacterService {
  return {
    create: createCreate(ctx),
    get: createGet(ctx),
    list: createList(ctx),
    update: createUpdate(ctx),
    remove: createRemove(ctx),
    duplicate: createDuplicate(ctx),
    findByHandle: createFindByHandle(ctx),
    bulkRemove: createBulkRemove(ctx),
    bulkArchive: createBulkArchive(ctx),
    bulkAddCardTag: createBulkAddCardTag(ctx),
    snapshot: createSnapshot(ctx),
    listSnapshots: createListSnapshots(ctx),
    restore: createRestore(ctx),
    getCard: createGetCard(ctx),
    loadCardText: createLoadCardText(ctx),
    listEmbeddableCharacterIds: createListEmbeddableCharacterIds(ctx),
    findByImportHash: createFindByImportHash(ctx),
    mintSyntheticGroupCharacter: createMintSyntheticGroupCharacter(ctx),
    findSyntheticGroupCharacter: createFindSyntheticGroupCharacter(ctx),
  };
}
