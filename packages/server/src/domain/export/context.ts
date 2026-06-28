// domain/export — DI BUNDLE. The explicit `ExportContext` interface (the bundle the verbs close over) is
// homed in `contract/service.ts` per §7.4 (one type home; never a `ReturnType<>` inference) — this file is
// the conventional 8-slot context slot, re-exporting that type so the feature root + tests reference the DI
// bundle by the canonical name (mirroring every other domain). The bundle is ASSEMBLED at the entry
// composition root (db + the infra `cas` / `imageTransform` handles) and handed to `createExportService`;
// export sideways-imports none of those (domain-no-cross-feature — they arrive type-only). There is NO
// guard in the bundle: `exportCharacter` is ownership-scoped via `fetchOwned` (the gate is
// `principal.userId`), not admin-gated.

export type { ExportContext } from "./contract/service";
