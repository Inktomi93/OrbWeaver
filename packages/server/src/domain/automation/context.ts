// domain/automation — DI BUNDLE. The explicit `AutomationContext` interface is homed in
// `contract/service.ts` (one type home; never a `ReturnType<>` inference). This conventional 8-slot
// context slot re-exports it so the feature root + tests reference the DI bundle by the canonical name.
// The bundle is ASSEMBLED at the entry composition root (db + the injected clock) and handed to
// `createAutomationService`.

export type { AutomationContext } from "./contract/service";
