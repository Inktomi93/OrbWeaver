# Promotion / Relocation Debt Registry

**The ONE place that lists every type/symbol/file deliberately homed in a TEMPORARY location with a
commitment to move (promote/relocate/replace) it later.** Born 2026-06-27 because these deferrals were
scattered across code `FLAG` comments + per-`D`-entry ledger notes + agent reports — collectively
invisible, individually forgettable. This file makes the set greppable in one place.

## The convention (how nothing gets lost)

1. Every deferral lives here as a `PD-<n>` row: **item · current home · target home · TRIGGER (the slice/
   condition that unblocks it) · status**.
2. Every in-code `FLAG` that defers a promotion/relocation **cites its id**: `// FLAG[PD-7]: …`. A grep of
   `PD-` reconciles code ↔ this registry — a flag with no row, or a row with no flag, is a drift.
3. When a trigger slice is built, its agent **clears every `PD-` row whose trigger is that slice** (or
   flips it `done` with the resolving commit). The slice prompt names the relevant `PD-` ids.

Status: `ready` = trigger has landed, do it now · `blocked:<slice>` = waiting on that slice · `done`.

## Registry

| id | item | current home | → target home | trigger | status |
|---|---|---|---|---|---|
| PD-1 | `ResourceRef` / `Can` guard types | `domain/admin/contract/guard.ts` | `@orb/contracts/identity` | chat wires `host\|member` (P5) — chat can't write admin's contract | blocked:chat(P5) |
| PD-2 | `AdminUserView` | `domain/admin/contract/views.ts` | `@orb/contracts/identity` | iff the client ever needs the read-model | blocked:client(P6) |
| PD-3 | admin vLLM engine-status view + `VllmSupervisorPort` | `domain/admin/contract/{views,service}.ts` | providers front door (like the diagnostics surface) / ops-admin | open decision — admin.md §vllm | blocked:transport(4d) |
| PD-4 | `infra/auth` `validateCookie` port removal + seam wiring | `infra/auth/contract.ts` (FLAG planted) | `entry/auth/seam.ts` calls `sessions.validate` directly (D40) | entry seam | blocked:entry(4e) |
| PD-5 | sessions `oidc-store` (`persistence/oidc-store.ts`) | not built (deferred) | `domain/sessions/persistence/` | OIDC route lands | blocked:entry(4e) |
| PD-6 | admin `SessionAdminView` ↔ sessions canonical session view | `domain/admin/contract/views.ts` | unify to one home; admin injects `sessions.listForUser` | composition root wires admin↔sessions | blocked:entry(4e) |
| PD-7 | agent-sdk reseed-from-canon | `infra/providers/backends/agent-sdk/session/` (seam exists; unfed) | wire the durable `sessionStore` / canon feed | chat/canon (P5) | blocked:chat(P5) |
| PD-8 | `inspect-chat` `InspectedParticipant.{kind,role}: string` | `foundation/observability/debug/inspect/inspect-chat.ts` | `@orb/contracts/chat` roster-kind / `host\|member` unions | chat lands (P5) | blocked:chat(P5) |
| PD-9 | role-default binder rebind so a role can resolve to `local-light` (D39) — the `mint-local-light` helper + the resolver's `local-light` arm are BUILT (credentials, batch B) | `domain/credentials` mint+resolver DONE; the boot binder still unconditionally mints vllm | the binder reads `routing.roleDefaults.<role>` per role (providers.md Esoteric §2) | connection slice (W1.5) / entry binder | blocked:connection(4c) |
| PD-10 | `DEFAULT_CHAT_MODEL_ID` / `DEFAULT_OR_CHAT_MODEL_ID` + `ChatModelId` brand (D38) | not built | `@orb/contracts/connection` (+ re-wire foundation `/_debug/info` down) | connection slice (W1.5) | blocked:connection(4c) |
| PD-11 | openrouter `rerank` typed not-supported throw | `infra/providers/backends/openrouter/runners/rerank` | wire real rerank (`@openrouter/sdk` 0.13 ships `client.rerank`) — revisit the doc's stale "no endpoint" premise | ledger revisit | ready |
| PD-12 | credentials `CustomModelProfile` (BYO model profile) | deferred (credentials.md) | `@orb/contracts/credentials` (NOT importing `ModelCapability` — D31 cycle) | BYO custom-endpoint form | blocked:connection/credentials |
| PD-13 | custom-byo `CustomOpenAiResponseMap` + `includeBody`/`excludeBody` | engine built; config type deferred | `@orb/contracts` + the credential metadata | custom-endpoint form | blocked:connection/client |
| PD-14 | `VLLM_*_CONCURRENCY` runtime injection (schema landed) | `@orb/contracts/settings` (`vllmConcurrencySchema`) | transport/binder injects it (vs the deps default) | transport(4d) / binder | blocked:transport(4d) |
| PD-15 | `IMPORT_DEFAULT_SOURCE` env + its AppSettings half | spec'd comment in `foundation/env` | `domain/import` + AppSettings | import slice (W3) | blocked:import(4c-W3) |
| PD-16 | providers diagnostic `signal?` threading | carried on the request shapes, unthreaded | thread through once reachable | SDK ports gain request options | blocked:upstream-sdk |
| PD-17 | chat `agent` participant kind / agent-as-first-class-principal (`provisionAgentPrincipal`, `users.isAgent`/`kind`) | v1 borrowed-owner posture | `chat` + `users` + identity | agent split (P5+) | blocked:chat(P5) |
| PD-18 | `reconcile-world-state` WorkloadKind + the P5 workload/presence/buddy seams (D38) | reserved tuple member / type stubs | activate in chat/workloads | v2 / P5 | blocked:P5 |
| PD-19 | tag `RequireParticipant` chat-tag membership gate (D30) — the port TYPE is declared in `domain/tag/contract/service.ts`; the RUNTIME guard is unwired (chat is built last, D16) | `domain/tag` injects the type-only port; root has no impl yet | `entry` composition root wires chat's real participant guard into `createTagService` | chat lands (P5) — chat provides `requireParticipant` | blocked:chat(P5) |
| PD-20 | persona `setActivePersona` verb (persona.md §8-slot `verbs/set-active.ts`) — per-participant active-persona write, host-or-self | not built (deferred); `FLAG[PD-20]` in `domain/persona/service.ts` | `domain/persona/verbs/set-active.ts` + chat assembly RESOLVE phase | chat build: needs `chat_participants.activePersonaId` (chat-owned) + the `{ kind: 'chat', roster }` resource arm of `can()` (admin guard PD-1) + host determination | blocked:chat(P5) |
| PD-21 | stats canon OWNER-ATTRIBUTION for the group-chat edge — `reconcileStats` attributes assistant economics by `characters.ownerId` + user turns by chat membership; the multi-owner group-chat case is unsettled (`applyStatsDelta` itself is attribution-agnostic, so chat retains control) | `domain/stats/write/rebuild-from-canon.ts` (`FLAG[PD-21]`) | confirm against chat's D18 membership model; the stats-drift test is the enforcer | chat lands (P5) | blocked:chat(P5) |
| PD-22 | stats `messages-economics` seam (the stats↔discovery read) — NOT built: its premise (economics columns on `messages`) is invalidated by D26 (economics live on `message_variants`); needs a D26-aware rewrite | not built (deferred) | `domain/stats/persistence/` (D26-aware) + the discovery consumer | discovery scaffold (W3) | blocked:discovery(4c-W3) |
| PD-23 | notifications `emit` → transport bus FAN-OUT — the durable `record` is built; the after-commit per-user bus subscription/stream is transport's job | `domain/notifications` provides `record` + the `EmitNotification` type | transport wires the subscription over the durable inbox | transport(4d) | blocked:transport(4d) |
| PD-24 | notifications `record` TX-ATOMICITY — runs durable-first on `ctx.db`; the doc wants the INSERT inside the producer's membership-transition tx (a tx-executor seam no domain threads yet) | `domain/notifications/verbs/record.ts` (durable-first today) | widen `record`/context to accept the producer's tx executor | chat lands (P5 — chat is the producer) | blocked:chat(P5) |
| PD-25 | credentials DRAFT (pre-save) endpoint inspect — `providers.inspect` takes a `ResolvedCredential` (non-null `credentialId`), so an unsaved custom_openai draft can't be inspected without a raw-args inspect op or a contract change | `domain/credentials/verbs/inspect-endpoint.ts` (saved-credential-only) | a draft-inspect path (raw args) on the providers front door, or a contract widening | custom-endpoint form (connection/client) | blocked:connection/client |
| PD-26 | assets maintenance verbs (`backfillAvatars`/`collectGarbage`/`reapIfOrphan`/`fsck`/`rebuildFromTree`) + their result/param types + the avatar-ref registry | not built (deferred) | `domain/assets` + injection into character.remove / the workloads runner | the GC/backfill wave | blocked:workloads(4c-W3)/GC |
| PD-27 | assets `asset.created` at-least-once delivery (in-process fire-and-forget vs a durable outbox) | `domain/assets/verbs/store.ts` (emit at the root) | the delivery mechanism is decided jointly with `embeddings.md §events` | embeddings(4c-W2) | blocked:embeddings(4c-W2) |
| PD-28 | assets roster-avatar membership exception — a chat member may fetch a co-member's avatar blob | `domain/assets/verbs/get-metadata.ts` (owner-scoped only) | add the `{kind:'chat',roster}` `can()` arm | chat lands (P5) | blocked:chat(P5) |
| PD-29 | assets `sniffMime` → `@orb/kit/assets` | `domain/assets/substrate/mime.ts` | `@orb/kit` | iff the client ever pre-sniffs | blocked:client(P6) |
| PD-30 | world-info chat-scope attach/detach/list + `WiBusEvent` emit (hard block: `chats` has no `ownerId` D18; admin `ResourceRef = GlobalResource` only) | `domain/world-info` (`chatBooks` table + `WiBusEvent` type declared, unwired) | wire when the `can({kind:'chat',roster})` arm + the chat bus exist | chat lands (P5) | blocked:chat(P5) |
| PD-31 | character `getRosterCardView` (membership-gated, level-clamped `MemberCardView`, D22) | not built (not on `CharacterService`) | `domain/character` | needs chat's `requireParticipant` + `{kind:'chat',roster}` `can()` arm + `memberCardVisibility` | blocked:chat(P5) |
| PD-32 | character default-card `seeder/` subsystem (`createDefaultCharacterSeeder` / welcome-assistant) | not built (separable slice) | `domain/character/seeder/` | injected settings `isSeeded`/`markSeeded` + authored default cards over the real `create` path | character seeder slice | blocked:settings-seed |
| PD-33 | character `cardContentHash` → `@orb/server/kit/serde/card` (shared with the import domain's serde hash) | `domain/character/substrate/content-hash.ts` | `@orb/server/kit/serde/card` | the serde/card scaffold + the import domain | blocked:import(4c-W3) |

## Cleared

| id | item | resolved by |
|---|---|---|
| PD-0 | `infra/crypto/token-hash.ts` dead duplicate (sessions relocated it, D38) | removed at the 4c sessions/admin integration |
