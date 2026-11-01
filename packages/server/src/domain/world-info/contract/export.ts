// domain/world-info/contract/export — the standalone world-info-book EXPORT op: its DI bundle + op type +
// result. Part of the uniform portability template (W-worldinfo): the
// per-book primitive the delivery-core registry descriptor composes into its `exportAll` stream. PURE-READ +
// serde: it reads the owner's `world_books` row + `world_entries` → the canonical `BulkImportLorebookInput`
// and emits the portable `worlds/*.json` file via `#primitives/serde/world-info` `buildWorldBookFile`. Owner-scoped
// (a foreign / absent book returns null — the leak-free posture of the owner-scoped book reads). Homed under
// `contract/` (types-in-contract / no-context-returntype); explicit interfaces, never a `ReturnType<>`.

import type { Db } from "@orb/db";
import type { DbAssemblyInput } from "@orb/db/wiring";

/** The DI bundle `createExportWorldBook` closes over (assembled at the entry composition root). Read-only: the
 *  standalone export is a pure owner-scoped read + serde build — no clock / id-minter / audit needed. */
export interface WorldInfoExportContext {
  readonly db: Db;
}

export type WorldInfoExportAssemblyContext = DbAssemblyInput<WorldInfoExportContext>;
