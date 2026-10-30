// domain/world-info/contract/import — the WorldInfoImportContext DI bundle + op type for the world-info-
// owned bulk-import write. A purpose-built context (not the full WorldInfoContext): the bulk path needs
// only db + clock + id minters, no audit/user-bus/chat guards (a bulk migration writes silently).

import type { PortableImportOutcome } from "@orb/contracts/portability";
import type { ImportStandaloneLorebook } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import type { UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import type { Clock } from "@orb/kit/time";

export interface WorldInfoImportContext {
  readonly db: Db;
  readonly now: Clock;
  readonly newBookId: () => WorldBookId;
  readonly newEntryId: () => WorldEntryId;
}

// ── the STANDALONE (unattached) path — the worlds/*.json portability lane ──────────

export interface ImportWorldBookContext {
  readonly importStandalone: ImportStandaloneLorebook;
}

/** ok:false + error for a malformed upload (never thrown); created:false when the book content-matched an
 *  owned book. `name` is the landed name; `renamedFrom` the file's own name when a collision suffix applied. */
export type ImportWorldBookOutcome =
  | (Extract<PortableImportOutcome, { readonly ok: true }> & { readonly created: boolean; readonly name: string; readonly renamedFrom: string | null })
  | (Extract<PortableImportOutcome, { readonly ok: false }> & { readonly name?: never; readonly renamedFrom?: never });

/** Never throws for a malformed file — returns \{ ok:false, error \}. `filename` names a raw SillyTavern
 *  world file (its stem is the book name); an orb-native file carries its own name. */
export type ImportWorldBook = (args: { readonly ownerId: UserId; readonly bytes: Uint8Array; readonly filename?: string }) => Promise<ImportWorldBookOutcome>;

// ── the character.duplicate CARRY ─────────────────────────────────────────

/** db + clock only: the carry copies character_books rows verbatim, no id-minting or audit. */
export interface WorldInfoDuplicateCarryContext {
  readonly db: Db;
  readonly now: Clock;
}
