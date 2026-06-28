// domain/tag — DI BUNDLE. The explicit `TagContext` interface (the bundle the verbs close over) is homed in
// `contract/service.ts` per §7.4 (one type home; never a `ReturnType<>` inference). This file is the
// conventional 8-slot context slot: it re-exports that type so the feature root + tests reference the DI
// bundle by the canonical name. The bundle is ASSEMBLED at the entry composition root (db + the injected
// `newTagId` seam + chat's `requireParticipant` gate) and handed to `createTagService`.

export type { TagContext } from "./contract/service";
