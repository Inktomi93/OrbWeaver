---
kind: plan
status: done
updated: 2026-10-31
---

# The fields scan's engine disagreements and where its time goes

Result: the 99 disagreements are not a tsconfig world blind spot. Every row is decided inside one program. They come from the rule that compares the two engines, one key collision, and write forms neither engine follows. The scan's time is mostly engine one and find-references. TypeScript 6 costs about a sixth of it.

Evidence labels: proven means a run or a read of the cited code showed it. Inferred means the evidence points there and no run isolated it.

## Inputs

- Reports: `pnpm unwired fields` and `pnpm unwired fields --cross-check` each reported 2193 findings and 99 disagreements. The two JSON reports are byte-identical (`cmp` exit 0).
- Tree: `tooling/src/unwired/` at this document's base is identical to the tree that produced the reports (`git diff` empty). 30 files under `packages/` differ. Row line numbers below are read at this document's base.
- Probes called the engines on one world at a time from scratch scripts. `pnpm unwired` itself was not run.
- `pnpm test:tools tests/tooling/unwired`: 10 files, 27 tests passed.

## Which engine holds which side

Proven. `.disagreements[].found` is engine two's verdict: `tooling/src/unwired/fields.ts:496` computes it and `fields.ts:505` records it. The kind in the first column below is engine one's, recomputed from per-world dumps of both engines. 97 of 99 rows reproduce `found` exactly. The other two are class C, which is why they differ.

| Engine one | Engine two (`found`) | Rows |
| - | - | - |
| never-written | wired | 61 |
| never-written | unreferenced | 29 |
| never-read | unreferenced | 8 |
| never-read | wired | 1 |

## Causes

| Class | Rows | Cause | Right | Label |
| - | - | - | - | - |
| A1 | 59 | `envObjectSchema`. Both engines see the same reads and no writes of the key. They differ only on `homeWritten` (`fields.ts:427`). Engine one counts the overlay writes in `resolveEnv` as writes of the home, through the spread link at `packages/server/src/foundation/env/record/index.ts:681`. | Engine two's verdict: the values come from the host environment | proven |
| A2 | 1 | Same `homeWritten` gap on `portableImageryImageSchema` | Engine two's verdict; the write itself is missed by both | proven |
| B1 | 19 | A read on the domain params type reaches the schema key only through `{ principal, ...input }` in the router. Engine one links that spread (`tooling/src/unwired/occurrences.ts:239`). Find-references cannot, as `fields.ts:349` states. | Engine one: read exists and no production caller writes the key | proven |
| B2 | 10 | Same read path. A production write also exists in a form neither engine follows: a conditional spread, a helper's returned object, a client `…Vars` twin, or a library-filled cursor. | Neither: `never-written` is false | proven; the cursor row is inferred |
| C | 2 | Two schema union members share one field key (`fields.ts:304`). The tally keeps the first declaration (`fields.ts:458`) but sums both members' sites, so engine one sees the writes and engine two asks about one member. | Engine one's kind | proven |
| D | 2 | The member redeclares a base member. Find-references climbs to the base and reports the base's sites. | Engine one: engine two over-reports | proven |
| E | 3 | Kind only. Both engines find no production read. Engine one credits a site to the wrong member: every member of a contextual union (`occurrences.ts:155`), or a schema `.extend` key. | Mixed, see the rows | proven |
| F | 1 | A shorthand write in a literal returned through `.map` into `push(...)`. Engine one resolves its contextual type. Engine two does not reach it. | Engine one | proven for the sites; inferred for the mechanism |
| G | 2 | Both engines miss a whole-object hand-off: `spiderPose(input, tracker)` passes the frame to `SpiderScene`, which reads it. | Neither: `never-read` is false | proven |

Rows where the reported finding would be false until the write or read form is followed: B2, A2 and G, 13 in all. Item 1697 owns those forms. Engine two found no genuine production use that engine one missed in any row.

## Every row

Column two is engine one's kind. Column three is engine two's. Right names the engine whose answer holds.

| Row | One | Two | Class | Right | Proving site |
| - | - | - | - | - | - |
| `packages/client/src/state/section-registry.ts:SectionWithoutList.listSearch` | never-read | unreferenced | E | two | packages/client/src/features/character/lib/characters-section.tsx:67 writes the `SectionWithList` member; this union member is `?: never` |
| `packages/contracts/src/character/index.ts:CharacterDetail.starred` | never-read | wired | D | one | packages/server/src/domain/import/substrate/card.ts:272 reads `CharacterCard.starred`, the base member, not this redeclaration |
| `packages/contracts/src/chat/detail.ts:redeemInviteResultSchema.participant` | never-read | unreferenced | E | neither decides | packages/server/src/transport/trpc/role-output.ts:41 is a schema `.extend` key, not a value write; no client file reads `.participant` |
| `packages/contracts/src/chat/start.ts:startChatSchema.injections` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/start-chat.ts:183` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:524; no production caller passes it |
| `packages/contracts/src/chat/start.ts:startChatSchema.opening` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/start-chat.ts:182` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:524; no production caller passes it |
| `packages/contracts/src/imagery/portable.ts:portableImageryImageSchema.assetHash` | never-written | wired | A2 | two (verdict) | packages/server/src/domain/imagery/persistence/portability-read.ts:42 writes it in an uncontextual local, so both engines miss the write; only `assetId` at packages/server/src/domain/imagery/persistence/portability-write.ts:229 marks the home written |
| `packages/contracts/src/inference/cache-policy.ts:prefixCacheSchemas.format` | never-read | unreferenced | E | one (kind only) | packages/inference/src/funnel/resolve-cache.ts:33 writes this union member through `...none`; the two sites engine one credits belong to other union members |
| `packages/contracts/src/inference/connection-view.ts:bindingActorSchema.kind` | never-read | unreferenced | C | one | packages/contracts/src/inference/connection-view\.ts:25 and :26 share one key; engine two asks only :25, and packages/client/src/features/plugin/components/plugin-model-bindings.tsx:99 writes :26 |
| `packages/contracts/src/inference/wire-limits.ts:ViolationOrigin.shape` | never-read | unreferenced | F | one | packages/inference/src/structured/plan.ts:293 writes it; no file reads `.shape` on a violation |
| `packages/contracts/src/rpg/inputs.ts:rpgListJournalInputSchema.offset` | never-written | unreferenced | B1 | one | `packages/server/src/domain/rpg/verbs/read/list-journal.ts:32` reads it through the spread at packages/server/src/transport/trpc/routers/rpg.ts:163; no production caller passes it |
| `packages/contracts/src/rpg/inputs.ts:rpgUpsertQuestInputSchema.objectives` | never-written | unreferenced | B2 | neither | `packages/server/src/domain/rpg/verbs/quest/upsert-quest.ts:24` reads it through the spread at packages/server/src/transport/trpc/routers/rpg.ts:101; packages/client/src/dev/agent-seed/index.ts:425 writes it |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.ALLOWED_HOSTS` | never-written | wired | A1 | two (verdict) | `packages/server/src/foundation/env/record/index.ts:646` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.AUTH_FALLBACK_TRUSTED_PEERS` | never-written | wired | A1 | two (verdict) | `packages/server/src/foundation/env/record/index.ts:617` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.AUTH_MODE` | never-written | wired | A1 | two (verdict) | `packages/server/src/domain/settings/effective-config/layer.ts:93` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.BIND_HOST` | never-written | wired | A1 | two (verdict) | `packages/server/src/foundation/env/record/index.ts:636` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.CLIENT_DIST_DIR` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/app.ts:536` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.CREDENTIALS_KEY` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/lifecycle.ts:270` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.DEBUG_TOKEN` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/app.ts:529` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.DEFAULT_USER_HANDLE` | never-written | wired | A1 | two (verdict) | `packages/server/src/domain/sessions/substrate/role-policy.ts:26` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.DEV_SEED` | never-written | wired | A1 | two (verdict) | `packages/server/src/foundation/env/record/index.ts:762` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.E2E_FIRST_RUN_ASK_HANDLES` | never-written | wired | A1 | two (verdict) | `packages/server/src/foundation/env/record/index.ts:761` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.E2E_HARNESS` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/app.ts:394` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.EGRESS_ALLOWLIST` | never-written | wired | A1 | two (verdict) | `packages/server/src/infra/network/egress.ts:610` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.FORWARD_AUTH_EMAIL_HEADER` | never-written | wired | A1 | two (verdict) | `packages/server/src/infra/auth/config.ts:57` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.FORWARD_AUTH_GROUPS_HEADER` | never-written | wired | A1 | two (verdict) | `packages/server/src/infra/auth/config.ts:55` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.FORWARD_AUTH_JWKS_ALLOWLIST` | never-written | wired | A1 | two (verdict) | `packages/server/src/infra/auth/config.ts:31` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.FORWARD_AUTH_JWT_AUDIENCE` | never-written | wired | A1 | two (verdict) | `packages/server/src/infra/auth/config.ts:64` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.FORWARD_AUTH_JWT_ISSUER` | never-written | wired | A1 | two (verdict) | `packages/server/src/infra/auth/config.ts:63` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.FORWARD_AUTH_TRUSTED_PROXIES` | never-written | wired | A1 | two (verdict) | `packages/server/src/infra/auth/config.ts:58` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.FORWARD_AUTH_UID_HEADER` | never-written | wired | A1 | two (verdict) | `packages/server/src/infra/auth/config.ts:56` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.FORWARD_AUTH_USER_HEADER` | never-written | wired | A1 | two (verdict) | `packages/server/src/infra/auth/config.ts:54` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.IMPORT_SKIP_CHARACTERS` | never-written | wired | A1 | two (verdict) | `packages/server/src/domain/settings/effective-config/layer.ts:86` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.IP_ALLOWLIST` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/app.ts:304` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.LOCAL_INITIAL_PASSWORD` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/lifecycle.ts:168` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.LOCAL_LIGHT_CPU_PERCENT` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/compose/services.ts:748` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.LOCAL_LIGHT_EMBED_DTYPE` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/compose/services.ts:749` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.LOCAL_LIGHT_PREFETCH` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/lifecycle.ts:646` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.NODE_ENV` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/app.ts:285` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OIDC_ADMIN_GROUPS` | never-written | wired | A1 | two (verdict) | `packages/server/src/domain/sessions/substrate/role-policy.ts:30` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OIDC_ALLOWED_GROUPS` | never-written | wired | A1 | two (verdict) | `packages/server/src/domain/sessions/substrate/role-policy.ts:31` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OIDC_CLIENT_ID` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/http/oidc.ts:38` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OIDC_CLIENT_SECRET` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/http/oidc.ts:50` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OIDC_EMAIL_CLAIM` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/http/oidc.ts:64` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OIDC_GROUPS_CLAIM` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/http/oidc.ts:63` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OIDC_GROUPS_SEPARATOR` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/http/oidc.ts:66` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OIDC_ISSUER` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/http/oidc.ts:36` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OIDC_PROVIDER_NAME` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/lifecycle.ts:577` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OIDC_REDIRECT_URIS` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/http/oidc.ts:58` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OIDC_SCOPES` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/http/oidc.ts:59` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OIDC_UID_CLAIM` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/http/oidc.ts:62` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OIDC_USERNAME_CLAIM` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/http/oidc.ts:61` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OPENROUTER_API_KEY` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/lifecycle.ts:493` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OWNER_GROUP` | never-written | wired | A1 | two (verdict) | `packages/server/src/domain/sessions/substrate/role-policy.ts:29` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.OWNER_HANDLES` | never-written | wired | A1 | two (verdict) | `packages/server/src/domain/sessions/substrate/role-policy.ts:27` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.PORT` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/lifecycle.ts:414` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.PRIVATE_ENDPOINT_ALLOWLIST` | never-written | wired | A1 | two (verdict) | `packages/server/src/domain/settings/effective-config/layer.ts:93` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.RATE_LIMIT_AI_TURN` | never-written | wired | A1 | two (verdict) | `packages/server/src/domain/settings/effective-config/layer.ts:71` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.RATE_LIMIT_AUTHED` | never-written | wired | A1 | two (verdict) | `packages/server/src/domain/settings/effective-config/layer.ts:73` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.RATE_LIMIT_LOGIN` | never-written | wired | A1 | two (verdict) | `packages/server/src/domain/settings/effective-config/layer.ts:74` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.RATE_LIMIT_PUBLIC_IP` | never-written | wired | A1 | two (verdict) | `packages/server/src/domain/settings/effective-config/layer.ts:72` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.RATE_LIMIT_WINDOW_MS` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/compose/services.ts:640` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.RE_DERIVE_ROLE_ON_LOGIN` | never-written | wired | A1 | two (verdict) | `packages/server/src/domain/sessions/substrate/role-policy.ts:33` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.RPG_TRACE` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/compose/services.ts:1176` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.SEED_CONTENT` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/compose/services.ts:1486` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.SESSION_SECRET` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/boot/migrate-data-layout.ts:407` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.SHARE_RELAY` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/lifecycle.ts:627` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.ST_PROFILE_DIR` | never-written | wired | A1 | two (verdict) | `packages/server/src/entry/lifecycle.ts:445` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.TRUSTED_PRIVATE_RANGES` | never-written | wired | A1 | two (verdict) | `packages/server/src/foundation/env/record/index.ts:651` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.WIRE_CAPTURE` | never-written | wired | A1 | two (verdict) | `packages/server/src/foundation/env/record/index.ts:784` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/foundation/env/record/index.ts:envObjectSchema.WIRE_CAPTURE_REPLY` | never-written | wired | A1 | two (verdict) | `packages/server/src/foundation/observability/debug/wire-capture.ts:93` reads it; packages/server/src/foundation/env/record/index.ts:726 parses it from the host environment |
| `packages/server/src/transport/trpc/routers/chat.ts:chatRouter.getMessageWindow.cursor` | never-written | unreferenced | B2 | neither | `packages/server/src/domain/chat/verbs/message-window.ts:21` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:606; packages/client/src/features/chat/components/transcript-window\.tsx:111 writes it |
| `packages/server/src/transport/trpc/routers/chat.ts:chatRouter.getMessageWindow.limit` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/message-window.ts:21` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:606; no production caller passes it |
| `packages/server/src/transport/trpc/routers/chat.ts:commitMessageSchema.attachmentAssetIds` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/turn.ts:1772` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:619; no production caller passes it |
| `packages/server/src/transport/trpc/routers/chat.ts:commitMessageSchema.personaId` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/turn.ts:1772` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:619; no production caller passes it |
| `packages/server/src/transport/trpc/routers/chat.ts:continueTurnSchema.guided` | never-written | unreferenced | B2 | neither | `packages/server/src/domain/chat/verbs/turn.ts:2212` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:632; packages/client/src/features/chat/hooks/use-guided-actions.ts:307 writes it |
| `packages/server/src/transport/trpc/routers/chat.ts:continueTurnSchema.intent` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/turn.ts:2212` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:632; no production caller passes it |
| `packages/server/src/transport/trpc/routers/chat.ts:editToolCallSchema.callOrdinal` | never-written | unreferenced | B2 | neither | `packages/server/src/domain/chat/verbs/edit.ts:772` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:680; packages/client/src/features/chat/components/message-tool-calls.tsx:48 writes it |
| `packages/server/src/transport/trpc/routers/chat.ts:editToolCallSchema.turnId` | never-written | unreferenced | B2 | neither | `packages/server/src/domain/chat/verbs/edit.ts:770` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:680; packages/client/src/features/chat/components/message-tool-calls.tsx:49 writes it |
| `packages/server/src/transport/trpc/routers/chat.ts:forceCharacterTurnSchema.guided` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/turn.ts:1799` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:846; no production caller passes it |
| `packages/server/src/transport/trpc/routers/chat.ts:forceCharacterTurnSchema.intent` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/turn.ts:1799` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:846; no production caller passes it |
| `packages/server/src/transport/trpc/routers/chat.ts:forkChatSchema.throughSeq` | never-written | unreferenced | B2 | neither | `packages/server/src/domain/chat/verbs/fork.ts:675` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:697; packages/client/src/features/chat/components/message-actions-row\.tsx:238 writes it |
| `packages/server/src/transport/trpc/routers/chat.ts:forkChatSchema.title` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/fork.ts:675` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:697; no production caller passes it |
| `packages/server/src/transport/trpc/routers/chat.ts:generateSchema.intent` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/turn.ts:2534` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:662; no production caller passes it |
| `packages/server/src/transport/trpc/routers/chat.ts:getShapeTraceSchema.speakerCharacterId` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/read.ts:1431` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:809; no production caller passes it |
| `packages/server/src/transport/trpc/routers/chat.ts:impersonateStreamSchema.intent` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/turn.ts:2362` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:655; no production caller passes it |
| `packages/server/src/transport/trpc/routers/chat.ts:impersonateStreamSchema.personaId` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/turn.ts:2362` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:655; no production caller passes it |
| `packages/server/src/transport/trpc/routers/chat.ts:previewAssemblySchema.guided` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/read.ts:1385` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:800; no production caller passes it |
| `packages/server/src/transport/trpc/routers/chat.ts:previewAssemblySchema.speakerCharacterId` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/read.ts:1385` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:800; no production caller passes it |
| `packages/server/src/transport/trpc/routers/chat.ts:previewContextFitSchema.speakerCharacterId` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/read.ts:1535` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:818; no production caller passes it |
| `packages/server/src/transport/trpc/routers/chat.ts:swipeSchema.guided` | never-written | unreferenced | B2 | neither | `packages/server/src/domain/chat/verbs/turn.ts:2153` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:623; packages/client/src/features/chat/hooks/use-guided-actions.ts:299 writes it |
| `packages/server/src/transport/trpc/routers/chat.ts:swipeSchema.intent` | never-written | unreferenced | B1 | one | `packages/server/src/domain/chat/verbs/turn.ts:2153` reads it through the spread at packages/server/src/transport/trpc/routers/chat.ts:623; no production caller passes it |
| `packages/server/src/transport/trpc/routers/connection.ts:connectionRouter.draftCatalogModels.credentialId` | never-written | unreferenced | B2 | neither | `packages/server/src/domain/connection/verbs/catalogs.ts:44` reads it through the spread at packages/server/src/transport/trpc/routers/connection.ts:166; packages/client/src/features/credentials/components/draft-models-check.tsx:54 writes it |
| `packages/server/src/transport/trpc/routers/connection.ts:connectionRouter.draftCatalogModels.headers` | never-written | unreferenced | B1 | one | `packages/server/src/domain/connection/verbs/catalogs.ts:52` reads it through the spread at packages/server/src/transport/trpc/routers/connection.ts:166; no production caller passes it |
| `packages/server/src/transport/trpc/routers/connection.ts:connectionRouter.draftCatalogModels.key` | never-written | unreferenced | B2 | neither | `packages/server/src/domain/connection/verbs/catalogs.ts:50` reads it through the spread at packages/server/src/transport/trpc/routers/connection.ts:166; packages/client/src/features/credentials/components/draft-models-check.tsx:52 writes it |
| `packages/server/src/transport/trpc/routers/invites.ts:nominateSchema.offer` | never-written | unreferenced | B2 | neither | `packages/server/src/domain/chat/verbs/participants.ts:1031` reads it through the spread at packages/server/src/transport/trpc/routers/invites.ts:139; packages/client/src/features/chat/components/committed-members-tab.tsx:184 writes it |
| `packages/server/src/transport/trpc/routers/preset.ts:presetRouter.update.fork.mode` | never-read | unreferenced | C | one | packages/server/src/transport/trpc/routers/preset.ts:67 holds both union members under one key; engine two asks only the `converge` member, and packages/client/src/features/preset/hooks/use-preset-autosave.ts:161 writes `new` |
| `packages/ui/src/art/web-weave/web-weave.tsx:FrameMotion.dt` | never-read | unreferenced | G | neither | packages/ui/src/art/web-weave/web-weave-render.ts:311 hands the frame on whole; packages/ui/src/art/web-weave/web-weave-spider.ts:166 reads `scene.dt` |
| `packages/ui/src/art/web-weave/web-weave.tsx:FrameMotion.prey` | never-read | unreferenced | G | neither | packages/ui/src/art/web-weave/web-weave-render.ts:311 hands the frame on whole; `SpiderScene.prey` at packages/ui/src/art/web-weave/web-weave-spider.ts:78 takes it |
| `packages/ui/src/primitives/toggle/toggle.tsx:ToggleBaseProps.className` | never-written | wired | D | one | packages/ui/src/primitives/toggle/toggle.tsx:11 redeclares a Base UI prop; engine two climbs to every `className`; no `<Toggle className` exists |

## The program set each engine loads

| Engine | Programs | Citation |
| - | - | - |
| One, the index | `packages/*/tsconfig.json` (client, contracts, db, default-content, inference, kit, plugin-toolchain, server, showcase-plugins, ui), then `tsconfig.node.json` and `tsconfig.tests-dom.json` | `tooling/src/unwired/worlds.ts:9`, `worlds.ts:13`, `tooling/src/unwired/run.ts:202`, `fields.ts:453` |
| Two, find-references on 7.1 | The same list, a new process per world | `fields.ts:481`, `tooling/src/unwired/language-service.ts:159` |
| Two under `--cross-check` | The same list on the TypeScript 6 language service | `language-service.ts:160` |
| Checker walks | The same list on TypeScript 6, after each world's 7.1 pass | `language-service.ts:161` |

No scan loads `packages/server/tsconfig.router.json`, the three `packages/showcase-plugins/tsconfig.author-*.json` worlds, `tooling/tsconfig.json`, `tooling/src/codemods/tsconfig.json` or `tsconfig.tests-iso.json`.

The root `tsconfig.json` does not see across worlds. It has `files: []` and only references others. Proven on a fixture: opening a solution gives one project with no files, and the references stay in their own projects. Opening files then adds each file's default project. Find-references asked in project a does not report a use that only project b holds.

Cross-world coverage comes from the merge instead. Each engine asks every world and unions the sites: `fields.ts:453` and `language-service.ts:159`. Declaration keys are `path#index`, which is the same node in every world (`tooling/src/unwired/native.ts:149`), and one fixture symbol has one identity in both projects.

## The world suspicion fails

Proven, by two methods:

1. Every row is decidable in one program. For each of the 99 rows, at least one loaded world holds the declaration and every read and write either engine reported. A blind spot between worlds needs a row with no such world, and there are none.
2. The worlds no scan loads change nothing. Both engines ran every reported field those worlds hold.

| Unloaded world | Reported fields held | Sites asked | Sites in files no scan loads | Production among them |
| - | - | - | - | - |
| `tsconfig.tests-iso.json` | 919 | 1148 | 0 | 0 |
| `packages/server/tsconfig.router.json` | 1597 | 1828 | 0 | 0 |
| `tooling/tsconfig.json` | 1642 | 1873 | 6 | 0 |
| `tooling/src/codemods/tsconfig.json` | 0 | 0 | 0 | 0 |
| `packages/showcase-plugins/tsconfig.author-frame.json` | 0 | 0 | 0 | 0 |
| `packages/showcase-plugins/tsconfig.author-main.json` | 0 | 0 | 0 | 0 |
| `packages/showcase-plugins/tsconfig.author-ui.json` | 0 | 0 | 0 | 0 |

The six sites are all `tooling/src/wire-tap/ops/sse.ts:151`, a spread read of five `InboxViewFields` members and `WorkloadEventBase.kind`. None is a row and none is production. A file-list diff agrees: no unloaded world holds a production file that a loaded world lacks. No row's reads or writes changed; the 11 differences the probe printed are one-line shifts in `packages/server/src/domain/chat/verbs/turn.ts`.

Parity between 6 and 7.1 fits a simpler cause. Both runs share engine one's index and the same worlds, and find-references on 7.1 is the same algorithm as on 6 (inferred from the identical output). The class B gap is in that algorithm, not in the program set.

## The TypeScript 7.1 API

Read from `node_modules/@typescript/native/dist/api/` at the pinned 7.1.0-beta.

- One session can hold every world. `openProjects` takes a list (`proto.generated.d.ts:1038`). Proven on this tree: 12 projects opened in 1.9 s, peak 1.4 GB before any query.
- Batches mix projects. `API.batch` takes generators from different projects. Proven on the fixture.
- `getReferencedSymbolsForNode` and `getSignatureUsage` both have `.gen` forms (`sync/api.d.ts:504`, `sync/api.d.ts:508`), so both batch. They do not cross projects: each is a method of one project's `LanguageService`, and each request carries `project: owner.project.id` (`sync/api.js:1746`, `sync/api.js:1774`). A mixed batch returns one per-project answer each.
- The scans do not call `getSignatureUsage`.
- The snapshot reshape: `createSnapshot` and `Snapshot.update` replace `updateSnapshot`. A snapshot holds projects, and each `Project` holds its `program`, `checker` and `languageService` (`sync/api.d.ts:478`). `NodeHandle` belongs to a project and resolves through it (`sync/api.d.ts:1278`). `fileSystem` layers the bridged config (`proto.generated.d.ts:295`), which the scans use (`native.ts:38`). `closeProjects` and synthetic `createPrograms` exist (`proto.generated.d.ts:1043`, `proto.generated.d.ts:1059`).
- `closeProjects` returned no memory in the probe: 7.3 GB before and after. It may release later; the probe did not force a collection.

No API option removes these classes, because worlds do not cause them. One session is also the wrong trade. A sample of 400 reference queries per world reached 8 GB with each checker barely touched. The fully checked worlds peak at 34.5 GB when added up, an upper bound because they share parsed files. That is over the 16 GB bar. A merged program stays out for the reason at `worlds.ts:1`.

The option that removes the classes is the comparison rule in the recommendation.

## Where the time goes

The suspicion fails: TypeScript 6 is not the main cost. Five worlds ran in the scan's order at load 32 to 50 on 24 cores: client, server, ui, node, tests-dom. The seven small worlds use the earlier per-world timings.

| Phase | Seconds | Share |
| - | - | - |
| Engine one `propertyIndex` | 608 | 41% |
| Engine two find-references, fresh process | 440 | 30% |
| TypeScript 6 `serviceReflectedReads` | 162 | 11% |
| TypeScript 6 program open | 85 | 6% |
| 7.1 program opens, both passes | 64 | 4% |
| Role classification (`rolesOf`) | 58 | 4% |
| Engine one `declarations` | 55 | 4% |
| Measured total | 1472 | 100% |

The full run took 1741 s. The other 269 s is not attributed: load differences and the final merge are the likely parts (inferred).

Porting the TypeScript 6 walks saves at most their whole cost: 247 s of 1472, 17%, or about 5 minutes of the 29. Peak memory does not move, because those phases are not the peak.

Two hot spots inside `propertyIndex` are larger per fix. Both were timed with a scratch copy.

| World | Batch | Seconds of index | Size |
| - | - | - | - |
| ui | `reflected` (`occurrences.ts:388`) | 79.6 of 84.8 | 685 reflections read 96,897 properties |
| node | lookups (`occurrences.ts:377`) | 54.1 of 93.4 | 472,887 lookups |
| node | `linked` (`occurrences.ts:420`) | 17.5 of 93.4 | 194,492 links |

- Reflection: each spread of a library props type lists every property and looks each up on the target, once per site, so ui spends 94% of its index here. The client and tests-dom worlds hold the same ui files, so they likely pay it too (inferred).
- Memory: `linked` took the node process from 1.7 GB to 5.6 GB in one step by concatenating repeated site lists. Its high-water mark in that world reached 9.0 GB. The tsgo process peaks at 5.0 GB in the scan's split passes (tests-dom). So the reported 7.9 GB is the Node process in `linked` on `tsconfig.node.json`, not a compiler (inferred: `time` reports one process). The sampled sum of both processes peaked at 9.8 GB. The bound is 13.5 GB, under the 16 GB bar.
- Keep the second process per world. In one process, tsgo reaches 8.2 GB, against 5.0 GB split, for a gain of about 110 s.

Other verbs: `ServiceWorld.flows` takes 81 s across the package worlds and serves only the member scan. `builtByService` and the `shapes.ts` hops were not measured.

## Recommendation

Keep two engines and one TypeScript 7.1 session per world. Make engine one the judge and find-references a one-way audit.

1. A disagreement means engine two found a production site in a role engine one lacks. `tooling/src/unwired/scan.ts:185` already works this way. Engine two finding fewer sites is expected, as `fields.ts:349` says, so it is not a contradiction.
2. Compute `homeWritten` from direct writes only, for both engines. A link-borne write is not evidence that the tree writes a home. This is a required part of step 1: without it, the 59 env rows become false findings.
3. Give each schema union member its own field key.
4. Delete `serviceReflectedReads`. Under step 1 engine two needs no reflective reads, so there is nothing to port. Only `--cross-check` then loads TypeScript 6 for fields.
5. Memoize `reflected` by value type and target type, and deduplicate sites in `linked`.

Expected rows: 2, class D. Each stays as an audit note. Expected findings: 38 more, of which 13 stay false until item 1697. This trade is the fork: it reports 13 false rows now, where today they sit in the disagreement list.

| Budget | Today | After | Label |
| - | - | - | - |
| `fields` wall time | 29:01 | 24 min with step 4; about 20 min with step 5 | 24 inferred from measured phases; 20 inferred from the ui hot spot |
| Largest process | 7.9 GB | about 5 GB, tsgo | inferred |
| Both processes | 9.8 GB sampled, 13.5 GB bound | under 8 GB | inferred |

### Retiring TypeScript 6

- From `fields`: yes, by deletion. `params` already loads no TypeScript 6 program outside `--cross-check`.
- From the member scan, `unions` and `shapes`: not yet. `flows`, `builtByService` and `serviceConfirms` hold TypeScript 6 programs and must be ported first. Each has a TypeScript 6 AST walk in its path.
- The `typescript` package stays. `tooling/src/unwired/classify.ts:61` parses alone and `worlds.ts` reads configs. The 7.1 API has no parse-alone call that I found (a search for `parse*` in its AST and sync types returned only config parsers). ESLint also uses it.
- Keep `--cross-check` until the other verbs show parity, because only `fields` has been compared.

### Item 1697

Restated twins and whole-object hand-offs are the same shape as the spread link, and they are invisible to find-references for the same reason. Treat them as new `Link` sources in engine one, not as engine two work. The rows show the forms to cover:

- A conditional spread into a literal: `packages/client/src/features/chat/hooks/use-guided-actions.ts:299`.
- A helper's returned object spread into a literal: `packages/client/src/features/credentials/components/draft-models-check.tsx:80`.
- A client `…Vars` twin of a router input: `packages/client/src/features/chat/hooks/use-membership-mutations.ts:76`.
- A whole object passed to a narrower parameter: `packages/ui/src/art/web-weave/web-weave-render.ts:311`.
- An uncontextual local literal: `packages/server/src/domain/imagery/persistence/portability-read.ts:42`.

The 19 class B1 rows are real `never-written` findings for their judgement items.

## Not proven

- The 269 s the phases do not cover, and the budget figures after each change. They need a run after the change on a quiet box: `/usr/bin/time -v pnpm unwired fields --out=reports/unwired/fields.json`. Timings above ran under load, and `propertyIndex` moved between runs (tests-dom 91 s and 217 s).
- That the 7.9 GB process is Node. The probes used a 12 GB heap limit. The scan's own run was not sampled per process.
- That `cursor` is written. The call passes no cursor; the row assumes tRPC's infinite query fills it.
- Why find-references misses class F. The sites are proven; the generic contextual path is inferred.
- Class C affects findings too. At least 19 reported keys in the server world alone span several declarations. Their kinds were not re-judged here.
