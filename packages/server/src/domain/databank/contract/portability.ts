// domain/databank/contract/portability — the THREE portability ops of the document library, in ONE contract
// file because they share one DI bundle and one dedup rule. Databank was born AFTER the portability spec
// froze its kind list, so a full-account backup silently lost the whole library (F1, P1) until these landed.
//
//   • `ListOwnedDocumentIds` + `ExportDocument` (`@orb/contracts/databank`) — the bundle descriptor's export half, deliberately SPLIT:
//     `extractedText` IS the canon and one document can be megabytes, so the descriptor streams one file at
//     a time instead of materializing the library (the world-info book precedent).
//   • `ImportDocument` — the import half. Never throws for a malformed file.
//
// THE DEDUP RULE (one home): `(ownerId, importHash)` — the same unique index the re-upload path dedups on.
// A re-imported document is not re-written; its ATTACHMENTS are still (re)asserted, so a bundle whose
// document already existed still restores the scopes it was attached under.

import type { Db } from "@orb/db";
import type { DbAssemblyInput } from "@orb/db/wiring";
import type { Clock } from "@orb/kit/time";
import type { Logger } from "#foundation/observability";
import type { DatabankContext } from "./service.ts";

/** The DI bundle every databank portability op closes over (assembled at the entry composition root).
 *  Principal-less by design: the delivery core knows only `ownerId`, so these are standalone factories, not
 *  `DatabankService` verbs. */
export interface DatabankPortabilityContext {
  readonly logger: Logger;
  readonly db: Db;
  readonly now: Clock;
  readonly newDocumentId: DatabankContext["newDocumentId"];
  /** Re-runs the DERIVED layer for a restored document. Nothing derived travels in a bundle (chunks +
   *  embeddings are re-runnable by construction), so a restored document is retrieval-dead until this runs. */
  readonly enqueueIngest: DatabankContext["enqueueIngest"];
}

export type DatabankPortabilityAssemblyContext = DbAssemblyInput<DatabankPortabilityContext>;
