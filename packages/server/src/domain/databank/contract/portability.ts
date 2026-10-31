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

import type { DbAssemblyInput } from "@orb/db/wiring";
import type { DatabankContext } from "./service.ts";

/** The DI bundle every databank portability op closes over (assembled at the entry composition root).
 *  Principal-less by design: the delivery core knows only `ownerId`, so these are standalone factories, not
 *  `DatabankService` verbs. A restore re-runs the derived layer through `enqueueIngest`: nothing derived travels
 *  in a bundle, so a restored document is retrieval-dead until its ingest runs. */
export type DatabankPortabilityContext = Pick<DatabankContext, "logger" | "db" | "now" | "newDocumentId" | "enqueueIngest">;

export type DatabankPortabilityAssemblyContext = DbAssemblyInput<DatabankPortabilityContext>;
