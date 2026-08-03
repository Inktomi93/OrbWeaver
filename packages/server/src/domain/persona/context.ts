// domain/persona — DI BUNDLE re-export. `PersonaContext` is homed in `contract/service.ts` (§7.4 — one
// type home, never `ReturnType<>`); this file re-exports it under the canonical import name. Assembled at
// `entry/compose/services.ts` (db + injected clock/id determinism seam + db-bound `logAudit`) and handed to
// `createPersonaService`; persona sideways-imports none of those (domain-no-cross-feature). No admin/owner
// guard here — ownership-scoped surfaces gate off `principal.userId`; `setActivePersona`'s host-or-self
// check is a separate injected chat guard (`requireChatAuthorOrHost`, see contract/service.ts).

export type { PersonaContext } from "./contract/service.ts";
