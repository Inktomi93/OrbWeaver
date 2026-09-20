// domain/connection — DI BUNDLE. The explicit `ConnectionContext` interface (the bundle the verbs close over)
// is homed in `contract/service.ts` per §7.4 (one type home; never a `ReturnType<>` inference —
// `no-context-returntype`). Assembled at the entry composition root (db + clock + the runtime + the
// cross-domain ownership reads) and handed to `createConnectionService`.

export type { ConnectionContext } from "./contract/service.ts";
