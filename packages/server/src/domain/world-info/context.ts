// domain/world-info — DI BUNDLE. The explicit `WorldInfoContext` interface (the bundle the verbs close
// over) is homed in `contract/service.ts` per §7.4 (one type home; never a `ReturnType<>` inference). This
// file is the conventional 8-slot context slot: it re-exports that type so the feature root + tests
// reference the DI bundle by the canonical name. The bundle is ASSEMBLED at the entry composition root (db
// + the injected clock/id determinism seam + `audit` pre-bound to db) and handed to `createWorldInfoService`
// — world-info sideways-imports none of those (domain-no-cross-feature). The chat scope adds the
// THREE injected cross-feature ops: `requireChatHost`/`requireChatMember` (chat's own membership guards)
// and `emitWiEvent` (the chat bus's durable-first emit) — wired at the root, type-only here. See
// contract/service.ts.

export type { WorldInfoContext } from "./contract/service.ts";
