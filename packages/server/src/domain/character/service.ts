// domain/character — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The flat live card
// (D28): owner-scoped CRUD + the git-style snapshot/restore history + the card read + the synthetic
// group-identity mint/find. `CharacterContext` is assembled at the entry root (db + injected clock/id +
// db-bound `logAudit` + the cross-feature ops `emit`/`reapAssets`/`attachCardTag`) and passed in; character
// injects NO guard (every surface is ownership-scoped, not admin/owner-gated).
//
// The default-card `seeder/` subsystem (PD-32) is NOT a verb here — it's reached by ENTRY over this service's
//   `create`/`findByHandle` verbs (`createDefaultCharacterSeeder` lives in `seeder/`, re-exported from the
//   front door). See seeder/ + contract/seeder.ts.

import type { CharacterContext } from "./context.ts";
import type { CharacterService } from "./contract/service.ts";

import { createBulkAddCardTag } from "./verbs/bulk-add-card-tag.ts";
import { createBulkArchive } from "./verbs/bulk-archive.ts";
import { createBulkRemove } from "./verbs/bulk-remove.ts";
import { createBulkRemoveCardTag } from "./verbs/bulk-remove-card-tag.ts";
import { createCreate } from "./verbs/create.ts";

import { createDuplicate } from "./verbs/duplicate.ts";
import { createFindByHandle } from "./verbs/find-by-handle.ts";
import { createFindByImportHash } from "./verbs/find-by-import-hash.ts";
import { createFindByImportedFrom } from "./verbs/find-by-imported-from.ts";
import { createFindSyntheticGroupCharacter } from "./verbs/find-synthetic-group-character.ts";
import { createGenerateGreeting } from "./verbs/generate-greeting.ts";
import { createGet } from "./verbs/get.ts";
import { createGetCard } from "./verbs/get-card.ts";
import { createGetSnapshot } from "./verbs/get-snapshot.ts";
import { createList } from "./verbs/list.ts";
import { createListEmbeddableCharacterIds } from "./verbs/list-embeddable-character-ids.ts";
import { createListSnapshots } from "./verbs/list-snapshots.ts";
import { createListTagGroups } from "./verbs/list-tag-groups.ts";
import { createLoadCardText } from "./verbs/load-card-text.ts";
import { createMintSyntheticGroupCharacter } from "./verbs/mint-synthetic-group-character.ts";

import { createRemove } from "./verbs/remove.ts";
import { createRestore } from "./verbs/restore.ts";
import { createRewriteGreeting } from "./verbs/rewrite-greeting.ts";
import { createSnapshot } from "./verbs/snapshot.ts";
import { createUpdate } from "./verbs/update.ts";

export function createCharacterService(ctx: CharacterContext): CharacterService {
  return {
    create: createCreate(ctx),
    get: createGet(ctx),
    list: createList(ctx),
    listTagGroups: createListTagGroups(ctx),
    update: createUpdate(ctx),
    remove: createRemove(ctx),
    duplicate: createDuplicate(ctx),
    findByHandle: createFindByHandle(ctx),
    bulkRemove: createBulkRemove(ctx),
    bulkArchive: createBulkArchive(ctx),
    bulkAddCardTag: createBulkAddCardTag(ctx),
    bulkRemoveCardTag: createBulkRemoveCardTag(ctx),
    snapshot: createSnapshot(ctx),
    listSnapshots: createListSnapshots(ctx),
    getSnapshot: createGetSnapshot(ctx),
    restore: createRestore(ctx),
    getCard: createGetCard(ctx),
    loadCardText: createLoadCardText(ctx),
    listEmbeddableCharacterIds: createListEmbeddableCharacterIds(ctx),
    findByImportHash: createFindByImportHash(ctx),
    findByImportedFrom: createFindByImportedFrom(ctx),
    mintSyntheticGroupCharacter: createMintSyntheticGroupCharacter(ctx),
    findSyntheticGroupCharacter: createFindSyntheticGroupCharacter(ctx),
    rewriteGreeting: createRewriteGreeting(ctx),
    generateGreeting: createGenerateGreeting(ctx),
  };
}
