// domain/credentials — DI BUNDLE. The explicit `CredentialContext` interface (the bundle the verbs close
// over) is homed in `contract/service.ts` per §7.4 (one type home; never a `ReturnType<>` inference —
// `no-context-returntype`). This conventional 8-slot context slot re-exports that type so the feature
// root + tests reference the DI bundle by the canonical name. The bundle is ASSEMBLED at the entry
// composition root (db + the injected determinism seam + the SecretBox + the owner guard + the
// providers/network ops) and handed to `createCredentialsService` — credentials sideways-imports none of
// those (domain-no-cross-feature; the infra/cross-feature edges are type-only on the contract).

export type { CredentialContext } from "./contract/service";
