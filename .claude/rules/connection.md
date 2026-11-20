---
paths:
  - "packages/server/src/domain/connection/**"
  - "packages/contracts/src/providers/**"
  - "packages/contracts/src/inference/connection*.ts"
  - "packages/contracts/src/inference/resolved.ts"
  - "packages/client/src/features/credentials/**/*connection*"
  - "packages/client/src/components/connection-role-*"
  - "tests/server/domain/connection/**"
  - "tests/client/features/credentials/**/*connection*"
---

# Connection domain

Read `Tier-3b-Providers.md` §3 before you change this domain. `@orb/inference` resolves and executes; this domain owns its rows and the door.

- Only this domain writes `user_connections`, `connection_bindings` and `provider_rows`. Every read verb delegates to the runtime (`packages/server/src/domain/connection/contract/service.ts`).
- Judge every refusal at the write seam, through `packages/server/src/domain/connection/substrate/admission.ts`. The draft catalog reads use the same checks, so a draft that lists models is a draft that saves.
- A foreign and a missing connection id are one refusal, kind and text; the door never answers more precisely than the runtime (`Tier-3b-Providers.md` §10.6). `tests/server/domain/connection/persistence/connections.int.test.ts` pins both spellings.
- A plugin provider id resolves per owner through that owner's claim; another caller gets `ProviderUnknownError`. Never delete or move another owner's claim (D147, D265).
- A client or a bus sees only `ResolvedConnectionView`, never the credential-bearing `Resolved` (`packages/server/src/domain/connection/verbs/resolve.ts`).
- Each result schema is its procedure's strict output parser: an extra key fails the call (`packages/server/src/domain/connection/contract/results.ts`).
- Error codes live in `CONNECTION_OP_CODES` in `packages/contracts/src/inference/connection.ts`, because the client keys on them (`packages/server/src/domain/connection/contract/errors.ts`).
- A write that can move an embed space runs in the owner's write queue, probes the new embedder, then lands or undoes (`packages/server/src/domain/connection/substrate/owner-queue.ts`).
- An undo is compare-and-set: restore only while the row still holds this write. An update writes only the columns its patch names (`packages/server/src/domain/connection/verbs/connections.ts`).
- Compare embed spaces by the same connection fingerprint generation identity uses, never by model name (`Tier-3b-Providers.md` §9, `packages/server/src/domain/connection/substrate/embed-space.ts`).
- A binding points only at the caller's own row and a task its kind serves. Resolve re-checks `allowBackground`, because it can flip after the write (`packages/server/src/domain/connection/verbs/bindings.ts`).
- Decode stored JSON only after owner admission. A corrupt row never becomes a stand-in that a write persists (`packages/server/src/domain/connection/contract/stored.ts`).
- A catalog dial that fails or lists nothing answers `listed: false` with its reason; the pane offers the typed-id fallback (`packages/server/src/domain/connection/verbs/catalogs.ts`).
- The local-light seed never overwrites an existing binding, an explicit null included (`packages/server/src/domain/connection/persistence/local-light-seed.ts`).
- Build the `session_entries` writes here and inject them into the runtime; demote then promote in one batch (D8, `packages/server/src/domain/connection/persistence/session-entries.ts`).
