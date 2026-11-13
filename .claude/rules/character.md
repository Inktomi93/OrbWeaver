---
paths:
  - "packages/server/src/domain/character/**"
  - "packages/contracts/src/character/**"
  - "packages/client/src/features/character/**"
  - "tests/server/domain/character/**"
  - "tests/contracts/character/**"
  - "tests/client/features/character/**"
---

# Character domain

- The card is the flat live `characters` row, edited in place. `character_snapshots` gates nothing and no table references it (D28).
- Scope every owner read in the `WHERE`. A foreign and a missing card are one `CharacterNotFoundError`; `getCard` answers `null` and never throws (`packages/server/src/domain/character/verbs/get-card.ts`).
- Put every precondition inside its own write statement, never in a read before it (`packages/server/src/domain/character/persistence/card.ts`).
- Only this domain writes `characters`. Another domain gets a character-owned persistence write injected at compose (`docs/law/Tier-1-DB.md`, `packages/server/src/domain/character/persistence/avatar-link-write.ts`).
- A content write recomputes `contentHash` and `tokenSize` and emits `character.updated` (`packages/server/src/domain/character/substrate/card-tokens.ts`). An archive flag, a tag, a snapshot or plugin card data does neither (D148, `packages/server/src/domain/character/verbs/bulk-archive.ts`).
- An avatar points only at the caller's own picture asset, a carried background only at the caller's own asset. Every avatar writer checks through `ensureAvatarAssets` (`packages/server/src/domain/character/persistence/queries.ts`).
- The `__group__` handle namespace is reserved. Create and rename refuse it, and every user-facing query and the embed pass skip synthetic rows (`packages/server/src/domain/character/substrate/group-character.ts`).
- Write a handle through `characterHandleSchema`, and copy or export one through `portableCharacterHandle` (D257).
- In a merge, `null` clears and `undefined` keeps: test `!== undefined`, never `??` (`packages/server/src/domain/character/substrate/card-merge.ts`).
- An update is unconditional. A caller writing from an old read passes `expectedBasis` and gets a total refusal on a stale basis (`packages/server/src/domain/character/verbs/update.ts`).
- `loadCardText` and `listEmbeddableCharacterIds` take no Principal (D20). Wire them only into trusted system work, never onto the transport.
- A per-item bulk verb catches each item's own failure, announces what committed and returns the per-item split (`packages/server/src/domain/character/verbs/bulk-add-card-tag.ts`).
- A refusal code is wire vocabulary in `packages/contracts/src/character/`; the server aliases it and the client keys on it (`packages/server/src/domain/character/contract/errors.ts`).
- The greeting studio returns text and never writes. The client appends an accepted greeting through `character.update` (`packages/server/src/domain/character/verbs/generate-greeting.ts`).
- A seed card never hand-sets a derived field (`packages/server/src/domain/character/seeder/cards.ts`). A deleted seed card never returns (D263).
- A seed pack migration writes a field only where the live value is still the prior pack's (`packages/server/src/domain/character/seeder/authored-content.ts`).
