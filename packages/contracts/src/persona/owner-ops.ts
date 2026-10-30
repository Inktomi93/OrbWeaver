// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { PersonaId, UserId } from "@orb/kit/ids";

/** Capture a persona's room seats before its delete; the thunk re-seats exactly those seats with the persona it is handed. */
export type CapturePersonaSeatsForDeleteOp = (ownerId: UserId, personaId: PersonaId) => Promise<(reseatWith: PersonaId) => Promise<void>>;

/** Capture the rooms a persona reaches before junction teardown; call the thunk only after the owner-scoped write succeeds. */
export type CapturePersonaRoomReachOp = (personaId: PersonaId) => Promise<() => void>;
