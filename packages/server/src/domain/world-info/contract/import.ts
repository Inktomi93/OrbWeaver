// domain/world-info/contract/import — the `WorldInfoImportContext` DI bundle + op type for the world-info-
// OWNED bulk-import WRITE (`createBulkImportLorebook`, Option B; PD-77). A PURPOSE-BUILT context (NOT the full
// `WorldInfoContext`): the bulk path needs only db + clock + the book/entry id minters — no audit/user-bus/
// chat guards (a bulk migration writes silently; the character.updated emit already re-indexes the card).
// Homed under `contract/` (the `types-in-contract`/`no-context-returntype` gate); explicit interface.
//
// `import` injects this op: it extracts the embedded ST `character_book` (via `#kit/serde/card`) → the
// canonical `BulkImportLorebookInput` (`@orb/contracts/world-info`) and calls the op. World-info owns the
// WRITE (its own `world_books`/`world_entries`/`character_books` tables) and the D28 replace-on-reimport.

import type { BulkImportLorebookInput, BulkImportLorebookResult } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import type { CharacterId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";

/** The DI bundle `createBulkImportLorebook` closes over (assembled at the entry composition root). */
export interface WorldInfoImportContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newBookId: () => WorldBookId;
  readonly newEntryId: () => WorldEntryId;
}

/** The world-info-owned bulk-import op the entry root wires into `import`'s `ImportContext.importLorebook`.
 *  Throws `DomainNotFoundError` when the target character isn't the caller's (the ownership precondition). */
export type BulkImportLorebook = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly book: BulkImportLorebookInput;
}) => Promise<BulkImportLorebookResult>;

// ── the STANDALONE (unattached) path — the `worlds/*.json` portability lane (W-worldinfo; §1) ──────────
// The lone-book import target: unlike `BulkImportLorebook` (the embedded-in-card path, which primary-attaches
// to a character), the standalone path lands a book with NO attachment and dedupes on `(ownerId, name)`
// reuse-or-replace (export-import-portability.md R6). It reuses the same `WorldInfoImportContext` (db + clock
// + id minters — no attach precondition). The VERB (`verbs/import.ts`) is a thin serde-parse + write wrapper.

/** The world-info-owned STANDALONE (unattached) bulk-import WRITE op — the `worlds/*.json` import target.
 *  Lands a LONE book (NO character attach) and dedupes on `(ownerId, name)`: an existing same-named owned
 *  book is edited in place (header + full entry swap, same id); otherwise a fresh unattached book is created. */
export type ImportStandaloneLorebook = (args: {
  readonly ownerId: UserId;
  readonly book: BulkImportLorebookInput;
}) => Promise<BulkImportLorebookResult>;

/** The DI bundle the standalone import VERB (`verbs/import.ts` `createImport`) closes over: just the injected
 *  unattached write op. The verb parses the untrusted upload through the serde, then calls this. */
export interface ImportWorldBookContext {
  readonly importStandalone: ImportStandaloneLorebook;
}

/** The per-file import outcome (structurally the delivery-core `PortableImportOutcome`): `ok:false` + `error`
 *  for a malformed upload (NEVER thrown — one bad file can't abort a bundle), else `ok:true` with
 *  `created:false` when a same-named book was replaced (an idempotent re-import). */
export interface ImportWorldBookOutcome {
  readonly ok: boolean;
  readonly created?: boolean;
  readonly error?: string;
}

/** Import ONE `worlds/*.json` upload into the owner's library (UNATTACHED; idempotent on `(ownerId, name)`).
 *  Never throws for a malformed file — returns `{ ok:false, error }`. */
export type ImportWorldBook = (args: {
  readonly ownerId: UserId;
  readonly bytes: Uint8Array;
}) => Promise<ImportWorldBookOutcome>;
