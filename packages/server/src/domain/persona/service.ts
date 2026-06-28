// domain/persona — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The human's persona
// cards — owner-scoped CRUD + the character⇄persona junction + the non-lossy createFromCharacter mint.
// `PersonaContext` is assembled at the entry root (db + injected clock/id + db-bound `logAudit`) and passed
// in; persona injects NO guard (every surface is ownership-scoped, not admin/owner-gated).
//
// FLAG[PD-20]: `setActivePersona` (persona.md §8-slot `verbs/set-active.ts`) is NOT wired here — DEFERRED to
// the chat build. It writes `chat_participants.activePersonaId` (a chat-owned table) and is host-or-self,
// which needs the `{ kind: 'chat', roster }` resource arm of `can()` — explicitly NOT built yet (admin
// contract/guard.ts FLAG[PD-1]: the resource-role axis "lands with chat"). The participant roster + host
// determination it gates on are chat-domain knowledge. Building it now would collapse the chat tier into
// persona (a forbidden tier collapse). See PROMOTION-DEBT.md PD-19.

import type { PersonaContext, PersonaService } from "./contract/service";
import { createConnect, createDisconnect, createListConnected } from "./verbs/connection";
import { createCreate } from "./verbs/create";
import { createCreateFromCharacter } from "./verbs/create-from-character";
import { createGet } from "./verbs/get";
import { createList } from "./verbs/list";
import { createRemove } from "./verbs/remove";
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
  };
}
