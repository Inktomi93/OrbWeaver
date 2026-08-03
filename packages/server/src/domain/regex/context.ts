// domain/regex — DI BUNDLE. The explicit `RegexContext` interface (the bundle the verbs close over) is
// homed in `contract/service.ts` per the types-in-contract rule (one type home; never a `ReturnType<>`
// inference). This file is the conventional 8-slot context slot: it re-exports that type so the feature
// root + tests reference the DI bundle by the canonical name. The bundle is ASSEMBLED at the entry
// composition root (db + the injected clock/id determinism seam + `audit` pre-bound to db + the chat
// membership guards + the user-bus emit) — regex sideways-imports none of those.

export type { RegexContext } from "./contract/service.ts";
