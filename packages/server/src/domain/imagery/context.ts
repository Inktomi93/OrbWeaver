// domain/imagery — DI BUNDLE. The explicit `ImageryContext` interface is homed in `contract/service.ts` per
// §7.4 (one type home; never a `ReturnType<>`). This is the conventional 8-slot context slot: it re-exports
// that type so the feature root + tests reference the DI bundle by the canonical name. The bundle is
// ASSEMBLED at the entry composition root and handed to `createImageryService`.

export type { ImageryContext } from "./contract/service";
