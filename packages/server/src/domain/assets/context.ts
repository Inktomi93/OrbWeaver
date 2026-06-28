// domain/assets — DI BUNDLE. The explicit `AssetsContext` interface (the bundle the verbs close over) is
// homed in `contract/service.ts` per §7.4 (one type home; never a `ReturnType<>` inference) — this file
// is the conventional 8-slot context slot, re-exporting that type so the feature root + tests reference the
// DI bundle by the canonical name (mirroring every other domain). The bundle is ASSEMBLED at the entry
// composition root (db + the injected clock/id determinism seam + the infra `cas`/`variants`/
// `imageTransform` handles + the `emit` event op) and handed to `createAssetsService`; assets
// sideways-imports none of those (domain-no-cross-feature — they arrive type-only). There is NO guard in
// the bundle: every assets surface is ownership-scoped (the gate is `principal.userId`), not admin-gated.

export type { AssetsContext } from "./contract/service";
