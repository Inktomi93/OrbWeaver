---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/infra fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/infra`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `issuedCertificateSchema.notBefore` | `server/src/infra/acme/contract.ts:8` | never-read | delete | delete the key and its writes (`server/src/infra/acme/issuer.ts:99`) |
| `acmeWorkerRequestSchema.polling.attempts` | `server/src/infra/acme/contract.ts:45` | unreferenced | delete | delete the key |
| `acmeWorkerRequestSchema.polling.minMs` | `server/src/infra/acme/contract.ts:45` | unreferenced | delete | delete the key |
| `acmeWorkerRequestSchema.polling.maxMs` | `server/src/infra/acme/contract.ts:45` | unreferenced | delete | delete the key |
| `ResolveDeps.oidcStore` | `server/src/infra/auth/contract.ts:131` | never-read | delete | delete the field and its writes (`server/src/entry/auth/seam.ts:368`) |
| `IdentityResolution.hasCsrfHeader` | `server/src/infra/auth/contract.ts:191` | never-read | delete | delete the field and its writes (`server/src/infra/auth/index.ts:50`) |
| `PasswordHasher.enabled` | `server/src/infra/auth/contract.ts:243` | never-read | delete | delete the field and its writes (`server/src/infra/auth/password.ts:68`) |
| `PasswordHasher.dummyHash` | `server/src/infra/auth/contract.ts:252` | never-read | delete | delete the field and its writes (`server/src/infra/auth/password.ts:69`) |
| `ImageInfo.format` | `server/src/infra/image/contract.ts:34` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ImageInfo.width` | `server/src/infra/image/contract.ts:36` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ImageInfo.height` | `server/src/infra/image/contract.ts:38` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SafeFetchResult.contentType` | `server/src/infra/network/contract/egress.ts:60` | never-read | delete | delete the field and its writes (`server/src/infra/network/egress.ts:817`) and the 2 test references |
| `TlsTerminator.port` | `server/src/infra/network/contract/tls-terminator.ts:14` | never-read | delete | delete the field and its writes (`server/src/infra/network/tls-terminator.ts:173`) |
| `HopResult.response` | `server/src/infra/network/egress.ts:1238` | never-read | delete | delete the field and its writes (`server/src/infra/network/egress.ts:1260`) |
| `HopResult.agent` | `server/src/infra/network/egress.ts:1240` | never-read | delete | delete the field and its writes (`server/src/infra/network/egress.ts:1260`) |
| `ImageGuardCaps.allowedMime` | `server/src/infra/network/image-guard.ts:27` | never-written | delete | delete the field and the branch that reads its default at `server/src/infra/network/image-guard.ts:51` |
| `ImageGuardCaps.requireDimensions` | `server/src/infra/network/image-guard.ts:29` | never-written | delete | delete the field and the branch that reads its default at `server/src/infra/network/image-guard.ts:42` |
| `BrokerHeartbeat.kind` | `server/src/infra/plugin-host/broker-watchdog.ts:49` | never-read | delete | delete the field and its writes (`server/src/infra/plugin-host/broker-watchdog.ts:75`) |
| `Binding.bridge` | `server/src/infra/plugin-host/process-runtime.ts:91` | never-read | delete | delete the field and its writes (`server/src/infra/plugin-host/process-runtime.ts:1219`) |
| `Binding.netEgress` | `server/src/infra/plugin-host/process-runtime.ts:93` | never-read | delete | delete the field and its writes (`server/src/infra/plugin-host/process-runtime.ts:1221`) |
| `syncReplySchema.error.name` | `server/src/infra/plugin-host/worker-runtime.ts:176` | unreferenced | delete | delete the key |
| `syncReplySchema.error.message` | `server/src/infra/plugin-host/worker-runtime.ts:176` | unreferenced | delete | delete the key |
| `PutResult.created` | `server/src/infra/storage/contract.ts:23` | never-read | delete | delete the field and its writes (`server/src/infra/storage/cas.ts:215`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Counts: 23 rows = applied 5, derived 0, kept 10, handed off 5 (4 to item 1698, 1 test-only reader), owner questions 3.

Method: codegraph on the infra symbols; compiler probe `pnpm typecheck tsconfig.node.json` exit 0 after the deletes; `ast-grep -l ts` (5890 files) and `-l tsx` (1526 files) for `$A.probe($B)`; suites `tests/server/entry/compose/share-acme.int.test.ts`, `tests/server/domain/chat/persistence/inline-reply-image-rows.suite.int.test.ts`, `tests/server/infra/plugin-host/process-runtime-lifecycle.int.test.ts` (25 passed).

| Rows | Class | Reader or reason |
| - | - | - |
| `TlsTerminator.port`, `PutResult.created`, `BrokerHeartbeat.kind` | applied | no reader in production, testkit, tooling or tests; `kind` is still checked while parsing, only the kept copy is gone |
| `ImageGuardCaps.allowedMime`, `.requireDimensions` | applied | no call site passes either (`materialize-background.ts`, `store-inline-reply-image.ts`, `plugin-host/net-egress.ts:48` pass `maxBytes` only); the `mime-not-allowed` reason and the opt-out branch go with them |
| `issuedCertificateSchema.notBefore` | kept | `IssuedCertificate` is passed whole to `nextRenewalAt` (`domain/share/certificate/controller.ts:164`), which reads `validity.notBefore` at `domain/share/substrate/renewal.ts:23` |
| `acmeWorkerRequestSchema.polling.*` | kept | the parsed `polling` is handed whole to `createAcmeIssuer` (`infra/acme/order-worker.ts:12`); `infra/acme/issuer.ts:80-82` reads `attempts`, `minMs`, `maxMs` |
| `HopResult.response`, `.agent` | kept | destructured at `infra/network/egress.ts:861` |
| `Binding.bridge`, `.netEgress` | kept | `dispatchBridgeCall(binding, ...)` (`process-runtime.ts:687`) destructures both at `bridge-rpc.ts:375`; guest-reaching |
| `syncReplySchema.error.name`, `.message` | kept | `response.error` is passed whole to `fromRpcError` (`worker-runtime.ts:201`) |
| `ResolveDeps.oidcStore`, `IdentityResolution.hasCsrfHeader`, `PasswordHasher.enabled`, `.dummyHash` | handed to 1698 | auth rows, untouched |
| `SafeFetchResult.contentType` | handed off (test-only reader) | only `tests/server/infra/network/egress-public-policy.int.test.ts:75` reads it; tests not rewritten |
| `ImageInfo.format`, `.width`, `.height` | owner question | the whole `ImageAdapter.probe` method has no caller (`$A.probe($B)` finds only unrelated `connection.probe`); its doc names it "the validation seam the assets domain can lean on", so deleting `probe` and `ImageInfo` together is the owner's call |
