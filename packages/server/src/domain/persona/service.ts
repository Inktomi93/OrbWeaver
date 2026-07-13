// domain/persona — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The human's persona
// cards — owner-scoped CRUD + the character⇄persona junction + the non-lossy createFromCharacter mint.
// `PersonaContext` is assembled at the entry root (db + injected clock/id + db-bound `logAudit`) and passed
// in; persona injects NO guard (every surface is ownership-scoped, not admin/owner-gated).
//
// See Audits-and-Debt.md PD-19.

import type { PersonaContext } from "./context";
import type { PersonaService } from "./contract/service";
import { createConnect, createDisconnect, createListConnected } from "./verbs/connection";
import { createCreate } from "./verbs/create";
import { createCreateFromCharacter } from "./verbs/create-from-character";
import { createDuplicate } from "./verbs/duplicate";
import { createExport } from "./verbs/export";
import { createGet } from "./verbs/get";
import { createImport } from "./verbs/import";
import { createList } from "./verbs/list";
import { createRemove } from "./verbs/remove";
import { createSetActive } from "./verbs/set-active";
import { createUpdate } from "./verbs/update";

export function createPersonaService(ctx: PersonaContext): PersonaService {
  return {
    create: createCreate(ctx),
    list: createList(ctx),
    get: createGet(ctx),
    update: createUpdate(ctx),
    remove: createRemove(ctx),
    createFromCharacter: createCreateFromCharacter(ctx),
    connectToCharacter: createConnect(ctx),
    disconnectFromCharacter: createDisconnect(ctx),
    listConnectedToCharacter: createListConnected(ctx),
    setActivePersona: createSetActive(ctx),
    duplicate: createDuplicate(ctx),
    export: createExport(ctx),
    import: createImport(ctx),
  };
}
