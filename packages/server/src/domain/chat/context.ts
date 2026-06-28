// domain/chat — DI BUNDLE: the ctx verbs close over (db + cross-feature ops, wired at the root). The explicit
// `ChatContext` interface (and every injected-op TYPE) is homed in `contract/context.ts` per §7.4 (one type
// home; never a `ReturnType<>` — the `no-context-returntype`/`types-in-contract` gate forbids an exported type
// in this conventional slot, so it RE-EXPORTS the contract home — the connection precedent). The bundle is
// ASSEMBLED at the entry composition root and handed to `createChatService`; chat sideways-imports none of the
// injected ops (`domain-no-cross-feature` — the cross-feature/infra edges are type-only on the contract).

export type { ChatContext, ChatServiceDeps } from "./contract/context";
