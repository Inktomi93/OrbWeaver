// domain/character — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The flat live card
// (D28): owner-scoped CRUD + the git-style snapshot/restore history + the card read + the synthetic
// group-identity mint/find. `CharacterContext` is assembled at the entry root (db + injected clock/id +
// db-bound `logAudit` + the cross-feature ops `emit`/`reapAssets`/`attachCardTag`) and passed in; character
// injects NO guard (every surface is ownership-scoped, not admin/owner-gated).
//
// FLAG[PD-31]: `getRosterCardView` (membership-gated MemberCardView, D22) is NOT wired — it needs the
//   `{ kind: 'chat', roster }` resource arm of `can()` + chat's `requireParticipant` (not built). Building
//   it now would collapse the chat tier into character. See contract/service.ts.
// FLAG[PD-32]: the default-card `seeder/` subsystem is NOT wired here — it's a separable slice (needs
//   the injected settings `isSeeded`/`markSeeded` ports + the authored default cards, over the real `create`
//   path). See contract/service.ts + index.ts.

import type { CharacterContext, CharacterService } from "./contract/service";
import { createBulkAddCardTag } from "./verbs/bulk-add-card-tag";
import { createBulkArchive } from "./verbs/bulk-archive";
import { createBulkRemove } from "./verbs/bulk-remove";
import { createCreate } from "./verbs/create";
import { createDuplicate } from "./verbs/duplicate";
import { createFindByImportHash } from "./verbs/find-by-import-hash";
import { createFindSyntheticGroupCharacter } from "./verbs/find-synthetic-group-character";
import { createGet } from "./verbs/get";
import { createGetCard } from "./verbs/get-card";
import { createList } from "./verbs/list";
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
    bulkRemove: createBulkRemove(ctx),
    bulkArchive: createBulkArchive(ctx),
    bulkAddCardTag: createBulkAddCardTag(ctx),
    snapshot: createSnapshot(ctx),
    listSnapshots: createListSnapshots(ctx),
    restore: createRestore(ctx),
    getCard: createGetCard(ctx),
    loadCardText: createLoadCardText(ctx),
    findByImportHash: createFindByImportHash(ctx),
    mintSyntheticGroupCharacter: createMintSyntheticGroupCharacter(ctx),
    findSyntheticGroupCharacter: createFindSyntheticGroupCharacter(ctx),
  };
}
