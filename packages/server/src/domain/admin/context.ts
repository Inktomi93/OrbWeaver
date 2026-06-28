// domain/admin — DI BUNDLE. The explicit `AdminContext` interface (the bundle the verbs close over) is
// homed in `contract/service.ts` per §7.4 (one type home; never a `ReturnType<>` inference). This file is
// the conventional 8-slot context slot: it re-exports that type so the feature root + tests reference the
// DI bundle by the canonical name. The bundle is ASSEMBLED at the entry composition root (db + the bound
// `audit`/`hashPassword` adapters + the SessionAdminPort/VllmSupervisorPort + the injected clock/id seam)
// and handed to `createAdminService` — admin sideways-imports none of those (domain-no-cross-feature).

export type { AdminContext } from "./contract/service";
