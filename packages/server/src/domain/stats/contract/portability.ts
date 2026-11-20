import type { PortableEntity } from "@orb/contracts/portability";

/** The spend ledger's backup descriptor halves; the registry at the composition root supplies the rest. */
export interface SpendLedgerPortabilityService extends Readonly<Pick<PortableEntity, "exportAll" | "importFile">> {}
