// domain/persona — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The human's persona
// cards — owner-scoped CRUD + the character⇄persona junction + the non-lossy createFromCharacter mint.
// `PersonaContext` is assembled at the entry root (db + injected clock/id + db-bound `logAudit`) and passed
// in; persona injects NO guard (every surface is ownership-scoped, not admin/owner-gated).

import type { PersonaContext } from "./context.ts";
import type { PersonaService } from "./contract/service.ts";
import { createConnect, createDisconnect, createListConnected, createListConnectedCharacters } from "./verbs/connection/index.ts";
import { createCreate } from "./verbs/create.ts";
import { createCreateFromCharacter } from "./verbs/create-from-character.ts";
import { createDuplicate } from "./verbs/duplicate.ts";
import { createExport } from "./verbs/export.ts";
import { createGet } from "./verbs/get.ts";
import { createImport } from "./verbs/import.ts";
import { createList } from "./verbs/list.ts";
import { createRemove } from "./verbs/remove.ts";
import { createSetActive } from "./verbs/set-active.ts";
import { createUpdate } from "./verbs/update.ts";

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
    listConnectedCharacters: createListConnectedCharacters(ctx),
    setActivePersona: createSetActive(ctx),
    duplicate: createDuplicate(ctx),
    export: createExport(ctx),
    import: createImport(ctx),
  };
}
