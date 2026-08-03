// domain/world-info/contract/export — the standalone world-info-book EXPORT op: its DI bundle + op type +
// result. Part of the uniform portability template (export-import-portability.md §1, W-worldinfo): the
// per-book primitive the delivery-core registry descriptor composes into its `exportAll` stream. PURE-READ +
// serde: it reads the owner's `world_books` row + `world_entries` → the canonical `BulkImportLorebookInput`
// and emits the portable `worlds/*.json` file via `#kit/serde/world-info` `buildWorldBookFile`. Owner-scoped
// (a foreign / absent book returns null — the leak-free posture of the owner-scoped book reads). Homed under
// `contract/` (types-in-contract / no-context-returntype); explicit interfaces, never a `ReturnType<>`.

import type { Db } from "@orb/db";
import type { UserId, WorldBookId } from "@orb/kit/ids";

/** The DI bundle `createExport` closes over (assembled at the entry composition root). Read-only: the
 *  standalone export is a pure owner-scoped read + serde build — no clock / id-minter / audit needed. */
export interface WorldInfoExportContext {
  readonly db: Db;
}

/** One portable world-info file: its `filename` (relative — the registry descriptor prefixes the bundle
 *  `dir`) and the serialized `bytes` (the UTF-8 `worlds/*.json` from `buildWorldBookFile`). */
export interface ExportedWorldBook {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** Export ONE owned book (+ its entries) as the portable `worlds/*.json` file, or null when the book is not
 *  the caller's (or absent). */
export type ExportWorldBook = (args: { readonly ownerId: UserId; readonly bookId: WorldBookId }) => Promise<ExportedWorldBook | null>;

/** Every book the owner owns — the enumeration the bundle descriptor's `exportAll` streams over. Homed here
 *  (F8) so the composition root wires a world-info op instead of running world-info's query itself. */
export type ListOwnedBookIds = (args: { readonly ownerId: UserId }) => Promise<readonly WorldBookId[]>;
