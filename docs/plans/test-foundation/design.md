---
kind: plan
status: active
updated: 2026-10-21
---

# Tests on the production harness

## Goal

Preserve meaningful behavior at the appropriate test layer, not every reference file. Rebuild missing cases through production composition, production-derived builders, the shared corpus and real client mounting. Remove redundant tests and copied assemblies with their qualified replacements.

## Shape

### Program ownership

This plan owns the test rebuild, its execution order and the [restoration register](../restoration-register/design.md). The [task index](tasks.md) owns the execution queue. Work items own current assignments, blockers and runtime evidence; an open item does not make its completed subareas unfinished.

### Scope

The program covers testkit, production-root test composition, builders, corpus data, the client mounting door and replacement suites. Change production only when a selected replacement exposes a real defect or needs a genuine composition seam.

The external legacy source named by [Spine-Testing](../../law/Spine-Testing.md) is reference-only. It is not part of this repository's tests, typecheck or CI.

Testkit support and runner configuration needed to execute a concrete replacement remain in scope. Add only machinery required by that case.

Use existing repository checks for changed behavior. Keep unrelated failures separate from replacement work.

### Execution sequence

| Phase | Work | Exit condition |
| - | - | - |
| Production seams | Use the actual production graph; fix only defects or missing injectable edges demonstrated by selected tests. | The selected cases reach production without copied domain logic. |
| Server harness | Qualify the existing server composition root, isolated database, injected business time and external-edge adapters. | Cases prove permissions, outputs and joined cleanup through the real graph. |
| Inputs and mounting | Qualify production-derived builders, the shared corpus and the existing client composition door. | Inputs satisfy production contracts and mounted registries derive from production. |
| Corpus flows | Complete corpus-backed e2e smoke across the required authentication, provider and viewport modes. | The actual wires and user-visible results pass without private owner data in artifacts. |
| Replacement suites | Rebuild server domains, component CTs and remaining cases in substantial related batches. | Meaningful cases survive, a production defect control fails, and the replacement contains no copied assembly. |

Start a replacement batch when its actual harness dependencies are available.

### Current foundation

The production server graph, world-split testkit, builders, corpus and client mounting door already exist. Their existence does not complete replacement coverage or runtime qualification.

Use these foundations for the remaining cases. Qualify corpus and support lifetimes through maintained cases. Keep source delivery, passing runtime cases and unqualified acceptance distinct.

### Restoration register

The [restoration register](../restoration-register/design.md) is the coverage index for reference cases from the legacy test source. Read it before selecting a case to port.

| Porting state | Meaning |
| - | - |
| Accounted for | The named reference cases have maintained homes or explicit drop decisions. |
| Partial | Only the named subset is compared. |
| Unreviewed | No complete case comparison is recorded. |

### Remaining work

- Qualify existing server, corpus, client and E2E mechanisms through their maintained cases.
- Rebuild meaningful reference cases through those mechanisms, including client lifecycle and recall behavior.
- Correct product defects exposed by selected cases, with behavioral regression coverage.
- Review unused support and production test hooks in the owning replacement batch.

Source delivery is not runtime acceptance. The OIDC issuer, typed tRPC recorder and production-backed CT mount already exist; qualify them instead of rebuilding them.

Keep the external reference source outside the test population. Do not restore deleted probes, checker infrastructure or legacy compiler programs.

### Candidate cases

| Area | Preserve | Replacement approach |
| - | - | - |
| Client composition | Registry entries and order, session recovery, subscriptions, nested mounts and disposal. | Mount the production composition door; assert observable behavior. |
| User flows | Routes, app-shell journeys, pending joins, imports and exports. | Run E2E against the shared corpus and actual authentication modes. |
| Server composition | Ownership, host checks, participant scope, targeted pruning, search and persistence. | Call the real server root instead of copying queries or domain assemblies. |
| Inference and plugins | Capability refusal, target selection, provider failures and guest behavior. | Use production entries with scripted external edges. |
| Contracts | Valid and invalid boundary inputs, actor keys, wire subsets and serialization. | Parse production-derived inputs through real schemas; use type assertions for compile-only properties. |
| Paging and imports | Cursor behavior, batch limits, skipped files and replanning. | Exercise the owning production operation, not a responder's copied algorithm. |
| Rendered behavior | Error and loading states, geometry, focus, accessibility, contrast and themes. | Use component CTs and retained measurement helpers. |
| Fixtures and constants | Valid identities, hashes, ownership, settings defaults and served security policy. | Use production-derived builders or corpus data; import shared constants when maintained consumers need them. |

### Rules

- Call production through its real public entry and composition root.
- Keep business decisions in their production domains; testkit supplies composition machinery and external-edge adapters, not copied rules.
- Derive inputs and response shapes from production contracts, builders or the corpus.
- Inject business clocks, IDs, randomness and timers through composition. Keep native protocol and physical timing under [Spine-Testing section 3](../../law/Spine-Testing.md#3-determinism--mock-doctrine).
- Retire legacy-only support with its replacement rather than making it a new foundation dependency.
- Add no production export or testkit door solely to keep a legacy harness compiling.
- Stop fake-heavy legacy fixture retrofits; rebuild the cases in their correct layer.
- Keep unrelated architecture and export cleanup outside the replacement assignment.

### Layer ownership and overlap

[Spine-Testing §10](../../law/Spine-Testing.md#10-choosing-the-test-layer) owns the layer table and the overlap rule.

### Restoration decisions

Before writing a replacement, record its behavior, existing coverage, primary layer, decision and any distinct cross-layer purpose in the owning work item.

| Decision | Use when | Action |
| - | - | - |
| Keep | Maintained coverage already exercises the behavior through production. | Reuse it; do not restore a duplicate. |
| Rebuild | A useful case has an unsuitable harness or fabricated business behavior. | Preserve the assertion's purpose through the real production entry. |
| Move | A useful case belongs at another layer. | Add only uncovered behavior there; remove the superseded maintained case. |
| Drop | A case is duplicate, obsolete, implementation trivia or only confirms its own fabricated data. | Record the reason or covering test; do not port the case. |

Prioritize authorization, data loss, critical journeys and known regressions. Compare case assertions, not filenames or test counts.

Do not restore a reference file wholesale because its cases once ran together. Keep reference harnesses outside the repository.

### How a replacement is written

1. Compare reference assertions with maintained coverage and record the restoration decisions above.
2. Select the production entry and layer for each uncovered behavior.
3. Build data through production-derived builders or the corpus; isolate physical resources and external execution.
4. Assert observable behavior, permissions, persistence and cleanup rather than a literal the test created.
5. Demonstrate that a relevant production defect makes the new regression case fail.
6. Remove redundant maintained cases and unsupported helpers with their qualified replacements.
7. Run affected tests and applicable existing checks; record remaining limitations without expanding the batch.

### Implementation and review briefs

Name the selected reference files, maintained test files and case-map location in both briefs. Include exclusions and required defect controls.

Implementers read the selected reference files in full before recording case decisions. Preserve distinct fields, inputs, states and assertions in that comparison. Similar test names or matching input types do not establish equivalent coverage.

Independent reviewers compare the original cases with the case map and maintained assertions, not only the implementation diff. Check each keep or drop decision against its cited evidence. Confirm the replacement reaches production and the defect control fails for the intended reason.

Record omitted or unresolved cases explicitly. Keep the register partial until every case in its named scope has a supported decision. Use the existing work item and register; add no separate tracking system.

### Selected case map: chat permissions and history

This is a bounded case map, not an exhaustive chat audit. Linked work items own runtime evidence; existing E2E source is not a fresh runtime verdict. Legacy paths are relative to the external source named in [Spine-Testing](../../law/Spine-Testing.md#2-the-tree).

| Behavior | Primary home and maintained evidence | Decision |
| - | - | - |
| Joining, host/member/outsider authority and host handoff | Integration: [role-authority](../../../tests/server/domain/chat/verbs/role-authority.int.test.ts), [participants](../../../tests/server/domain/chat/verbs/participants.int.test.ts). | Keep. Do not restore another service-level role matrix. |
| Full/from-join history, pages, message windows and fork lineage | Integration: [role-authority](../../../tests/server/domain/chat/verbs/role-authority.int.test.ts), [corpus chat outputs](../../../tests/support/node/corpus-chat-outputs.int.test.ts). | Keep. Browser coverage should prove wiring, not repeat cursor and permission permutations. |
| Hidden bytes across replay cursors and recipient-scoped live delivery | Integration: [member visibility](../../../tests/server/domain/chat/substrate/member-visibility.int.test.ts), [recipient isolation](../../../tests/server/transport/trpc/stream/recipient-isolation.int.test.ts). | Keep. These exercise production replay and authenticated transport, not only a UI filter. |
| Card disclosure and co-member updates | Integration: [member card clamp](../../../tests/server/domain/chat/verbs/member-card-clamp.int.test.ts), [member fanout](../../../tests/server/domain/chat/verbs/member-fan.int.test.ts). | Keep. Rendered controls do not replace authorization checks. |
| Shared history and role-specific controls after browser reload | E2E: [shared corpus](../../../tests/e2e/corpus-shared.local.spec.ts), [multi-human visibility](../../../tests/e2e/multi-human-visibility.local.spec.ts). | Keep the distinct browser/transport assertions. Compare overlapping API-only permutations before retaining both. |
| Invite landing after the first-run persona step | E2E: [corpus joiner](../../../tests/e2e/corpus-joiner.local.spec.ts). | Keep. Do not rebuild the complete journey as a network-stubbed CT. |
| OIDC callback, pending-join dismissal and precise URL/history cleanup | E2E: [OIDC pending join](../../../tests/e2e/oidc-pending-join.oidc.spec.ts). | Keep the [qualified OIDC journey](#e2e-runtime-qualification). It includes stored-token retirement; do not restore a duplicate dismissal journey. |
| Capability-dependent `/join/:token` refusal and redirect | HTTP integration: [auth metadata](../../../tests/server/entry/http/auth-meta.int.test.ts). Legacy `server/entry/http/join.test.ts` also checks encoded token bytes. | Keep existing coverage. Add the encoded-token case through real HTTP only if uncovered; drop the mock-app harness. |
| Invalid invite disclosure, focus ordering and dismissal without redemption | CT: [invite dialog](../../../tests/client/features/chat/anchors/join-invite-dialog.ct.tsx). | Keep the rebuilt controlled cases, including late popup focus and refusal after a ready preview. Membership remains an integration responsibility. |
| Persona validation/focus, approval, refused confirmation and unavailable pending invite | CT: [pending join](../../../tests/client/features/auth/components/login-pending-join.ct.tsx). | Keep public login-surface state and outgoing-request assertions. These do not prove session cookies or backend authentication. |
| Shared invite sentence formatting, withheld host and unnamed-room fallback | Unit: [invite wording](../../../tests/client/lib/invite-copy.dom.test.ts) calls production [invite-copy](../../../packages/client/src/lib/invite-copy.ts). | Keep the pure-function case; drop duplicate capitalization-only CTs. DOM declarations do not require browser execution. |

The controlled invite-component replacements are maintained under [client regression work](../../work/0977-rebuild-client-lifecycle-and-boundary-regression-cases.md). Reuse them when comparing further reference cases. The remaining client lifecycle and boundary cases stay open. The E2E runtime qualification below records the separate browser acceptance.

Keep the server coverage above. Legacy `server/domain/chat/substrate/wire-history.test.ts` and `db/query/chat-visibility.int.test.ts` still need case-by-case comparison with their current owners. This map does not classify those files as missing or obsolete.

### E2E runtime qualification

The combined native selection boots and warms single-user, local, forward-header and OIDC modes. It passes the selected smoke, authentication, CSRF, debug-admission and pending-join cases without changing readiness or timeout budgets.

Run the selection with `E2E_LIVE=0 E2E_ALLOW_DEV_TARGET=0 pnpm e2e tests/e2e/smoke.spec.ts tests/e2e/auth-smoke.local.spec.ts tests/e2e/auth-smoke.forward.spec.ts tests/e2e/csrf-gates.forward.spec.ts tests/e2e/debug-gate.forward.spec.ts tests/e2e/oidc-pending-join.oidc.spec.ts`. The corpus-only case skips without a selected corpus; this is not full-suite qualification.

Playwright configuration does not load the operator's environment file. Its generated run token passes to native test workers. The SSO modes declare their own groups, and positive member fixtures carry the admitted group.

The existing OIDC journey reaches pending join through the real server and HTTPS issuer. Dismissal preserves unrelated URL bytes and history, clears the stored invite and omits it from the next login. The regression fails when production dismissal does not clear the invite.

The native [OIDC integration cases](../../../tests/server/entry/compose/oidc-native.int.test.ts) own transaction binding, replay, issuer, audience, nonce, PKCE, pending-signup admission and group refusal. The [issuer integration cases](../../../tests/e2e/support/oidc-issuer.int.test.ts) own HTTPS trust and code single-use. These selected cases pass; the browser journey does not duplicate their negative matrix.

### E2E disposable state

Ordinary isolated runs own separate directories under `.cache/e2e/runs/`. Native Playwright SIGTERM shutdown lets the existing supervisor join its children. The cleanup reporter removes only that runner's directory after the selected server and Vite ports close.

Failed runs retain bounded stack-log tails beside native traces and reports. Reusable model weights live in `.cache/e2e/models/`, outside disposable data; ordinary isolated runs disable background model prefetch. Developer-target data and caller-owned corpus fixtures keep their existing owners. Dry collection creates no certificate directories.

UI sessions, native timeouts, failed evidence retention or uncertain port release retain the directory and report its path. Hard termination or a reporter override can bypass the hook. Remove retained directories only after confirming their owner stopped; there is no automatic orphan sweep.

The native lifecycle exercises cover successful teardown, assertion failure with retained logs and occupied-port refusal without deleting another owner's files. The public server-process regression holds an actual HTTP request across repeated shutdown signals; every caller waits for the same drain completion.

### Selected case map: boot migration, data layout and env floors

Legacy paths are relative to the external source named in [Spine-Testing](../../law/Spine-Testing.md#2-the-tree). The case map records every case of its reference files. Maintained homes:

| Home | Layer and production entry |
| - | - |
| [Boot migration](../../../tests/server/entry/boot/persistence/migrate.int.test.ts) | Integration on a real file database, `runBootMigrations`; pre-migration databases come from the shipped chain cut before its last migration |
| [Data-layout move](../../../tests/server/entry/boot/persistence/migrate-data-layout.int.test.ts) | Integration on a real filesystem and database, `migrateDataLayout`; the legacy flat tree is the historic state the move exists for; every crash state is a real failed rename; the idle-holder case runs two real processes through [the holder](../../../tests/support/node/db-holder.ts) and [the migration script](../../../tests/support/node/migrate-data-layout.ts) |
| [Layout resolver](../../../tests/server/foundation/data-layout/index.test.ts) | Unit, `resolveDataLayout`; expectations derive from the layout's own `LEGACY_ENTRIES`, and a mapped record over `DataLayoutInput` fails `tsc` when a key is added |
| [Boot migration deps](../../../tests/server/entry/boot/migrate.test-d.ts) | Type, `runBootMigrations` accepts no posture or reset option |
| [Env floor](../../../tests/server/foundation/env/record/floor-defaults.test.ts) | Unit, the production `parseEnv` through `createTestEnv` |
| [Env file load](../../../tests/server/foundation/env/env-file-load.int.test.ts) | Integration, the production process env module in a fresh node process per case ([child](../../../tests/support/node/env-file-child.ts)); the load runs once at import from the working directory and process environment, so one process cannot vary it |
| [Boot disclaimer](../../../tests/server/entry/boot/disclaimer.test.ts) | Unit, `composeBootDisclaimer` with posture values derived from a parsed record |

Decisions for `server/entry/boot/migrate.int.test.ts`:

| Case | Decision | Evidence |
| - | - | - |
| Forward migration over a populated baseline keeps prior bytes | Keep | [Provenance migration](../../../tests/db/schema/chat-freeze-provenance.repo.int.test.ts) runs a boot over a copied file database and compares rows and the pre-migration backup. The boot suite adds the second boot that takes no copy. |
| `resolveMigrationsFolder` ends in `migrations` | Drop | Private helper; every default-folder boot in the boot suite resolves it. |
| Baseline applied on a fresh database, integrity gate, foreign keys on | Rebuild | Boot suite, first case, on a file database with the default folder. |
| Second boot is a no-op | Rebuild | Same case, with the backup listing unchanged and the baseline `current`. |
| Raw `runMigrations` crashes on a stale record | Drop | Asserts drizzle's behavior. The product refusal is the drifted-chain case. |
| Regenerated-baseline dev database auto-resets | Drop: the reset arm is deleted under D163 | The `launched` option, `DB_LAUNCHED`, the boot reset branch and the database reset function are deleted, so `tsc` refuses a caller that passes the option ([type case](../../../tests/server/entry/boot/migrate.test-d.ts)). |
| Backup taken on a migrating boot into the passed dir, skipped on a no-op boot | Rebuild | Boot suite, first case. |
| Backup restores a commit still in the WAL | Rebuild | Boot suite on a database one migration behind, in place of the reset trigger. It also proves the copy predates the migration. |
| Backup failure aborts before the reset | Rebuild | Boot suite: an unwritable backup dir aborts before the forward migration, and the retry migrates. The proxy that forced a transaction failure is dropped as fabricated. |
| Debris at the stamped backup path is replaced | Rebuild | Boot suite. The name comes from `backupBeforeMigrate`, not a copy of its rule. |
| A reset boot backs up first, then prunes to the cap | Rebuild, narrowed; the reset trigger is deleted | Boot suite asserts the migrating boot prunes the oldest copy and keeps the newest, and a no-op boot prunes nothing. Retention counts, pins and daily rollup stay with the database client batch. |
| Shipped posture refuses a diverged chain on a file database before any backup | Rebuild | Boot suite, last case: the database, the rows and the copies are unchanged. |
| A launched memory database refuses to auto-wipe | Keep | Covered by the file-database case above. |
| Omitting `launched` fails closed | Drop: the reset arm is deleted under D163 | No posture option remains to omit; the type case guards it. |

Decisions for `server/entry/boot/migrate-data-layout.int.test.ts`:

| Case | Decision | Evidence |
| - | - | - |
| Fresh install gets the container dirs | Rebuild | Layout move suite. |
| Legacy tree moves every named entry with a snapshot first | Rebuild | Layout move suite, derived from `LEGACY_ENTRIES`. It also covers the WAL-only row, modes, the stores that never move and the absent journal. |
| Second run is a no-op | Rebuild | Same case. |
| Target holds data: refuse before any rename | Rebuild | Layout move suite with a clearing control. The sizes in the refusal text are not asserted. |
| Explicit slot, `DATABASE_URL` and `CREDENTIALS_KEY` keep an entry in place | Rebuild | One table over every keyed entry in `LEGACY_ENTRIES`, including the secrets and the no-snapshot rule for a kept database. |
| Live-pid journal refuses | Rebuild | Layout move suite, from a journal a real failed rename left. |
| Journal under this process's pid resumes | Rebuild | Same suite, default liveness. |
| Source on another filesystem | Rebuild | Same suite, injected device probe, with a same-device control. |
| Target container linked onto another filesystem | Rebuild | Same suite. |
| Data root that is a symlink | Rebuild | Same suite. |
| Resume re-plans against the current env | Rebuild | The apply-time failure case, keyed per entry, replays under an env that keeps the entry. |
| Idle holder of the legacy database refuses | Rebuild | Same suite, two real processes and a released control; the poll loop is replaced by a process message. |
| Zero-byte legacy database is ignored | Rebuild | Same suite. |
| Dead-pid journal resumes | Rebuild | Same suite. |
| Resume refuses when source and target both hold data | Rebuild | Same suite, tampering with a real crash state and a control that clears it. |
| Resume refuses when neither side exists | Rebuild | Same suite. |
| Empty mount point at a target | Rebuild | Same suite, with the keyed and keyless remedies. |
| Failing resume boots leave one snapshot | Rebuild | Apply-time failure case. |
| Apply-time rename failure keeps the journal until the env names the remedy | Rebuild | Same case, with the no-op boot after the remedy. |
| Legacy database on another filesystem refuses with the `DATABASE_URL` value that keeps it | Rebuild, narrowed | The keeper table runs the working value from `fileDatabaseUrl`. The refusal wording and the value parsed from it are not asserted. |
| Kept keyfile is warned with its keeper | Move to security batch | A secrets warning. |
| Stranded session secret is warned on every boot | Move to security batch | A session pepper warning. |

Decisions for `server/foundation/data-layout/index.test.ts`:

| Case | Decision | Evidence |
| - | - | - |
| Slots derive from the default root, relative | Rebuild | Layout resolver, by relation to the root. |
| `DATA_DIR` re-roots every slot | Rebuild | Same, for an absolute and a relative root. |
| Explicit slot wins and lands in the explicit set | Rebuild | Same, one key at a time against the derived tree. |
| Every slot key honoured, empty counts as unset | Rebuild | Same, over a record that lists every `DataLayoutInput` key by kind. |
| Non-file `DATABASE_URL` carried through | Keep | [Native file identity](../../../tests/server/foundation/data-layout/persistence/file-identity.int.test.ts) covers the explicit URL inputs; the resolver suite adds the remote case. |
| `DATA_LAYOUT_SKIP` parsing | Rebuild | Same. |
| `DATA_LAYOUT_SKIP` refuses the database, keyfiles and keyed slots, and an unknown name | Rebuild, narrowed | Same, one case per keyed entry plus a control. The naming of the key in the message is not asserted. |
| Database remedy carries the `DATABASE_URL` value | Drop | Message wording; the working value is run by the move suite. |
| Explicit secrets land in the explicit set | Rebuild | Same. |
| Import domain default equals the resolver | Drop | The import domain derives `DEFAULT_IMPORT_STAGING_DIR` from `resolveDataLayout`, so the two cannot differ. |

Decisions for `server/foundation/env/floor-defaults.test.ts`:

| Case | Decision | Evidence |
| - | - | - |
| Debug and observability gates default off | Rebuild | Env floor. |
| Single-user default needs no SSO or secret keys | Rebuild | Env floor, the fallback derived from `AUTH_MODE_DEFAULT_FALLBACK`. |
| `LOCAL_LIGHT_CACHE_DIR` default under the data root and override | Rebuild | Env floor reads every slot against the resolver. |
| `LOCAL_LIGHT_CPU_PERCENT` default and invalid values | Rebuild, narrowed | Env floor keeps the valid value and every refusal. The default of fifty is a copy of production and is dropped. |
| Data slots resolve from `DATA_DIR` | Rebuild | Env floor. |
| `DATA_LAYOUT_SKIP` is checked at parse | Rebuild | Env floor. |
| Rate-limit budgets have the documented floor | Drop | Asserts copies of production defaults. |
| Boolean toggles transform | Rebuild | Env floor, on a non-security knob. |
| Boolean knobs refuse widened spellings | Rebuild | Same. |
| Boolean knobs accept exactly `true` and `false` | Rebuild | Same. |
| `processEnvSnapshot` is a copy | Move to security batch | The agent child-env baseline; the function is now `hostEnvAllowlist`. |

Decisions for `server/foundation/env/env-file-load.test.ts`:

| Case | Decision | Evidence |
| - | - | - |
| `.env` beats a shell export | Rebuild | Env file load. |
| Override off under `VITEST` and under `ORB_ENV_NO_OVERRIDE`; the file still fills unset keys | Rebuild | Same, one case per hatch. |
| No `.env`, and an unreadable `.env` | Rebuild | Same, compared with a baseline process. |
| Parser tolerance for comments, quotes, `export`, junk and CRLF | Drop | Behavior of the platform parser, not the loader. |
| UTF-8 byte-order mark | Rebuild | Same. |
| `KEY: value` lines ignored | Drop | Behavior of the platform parser. |
| `ORB_ENV_NO_FILE` skips the load | Rebuild | Same, with a control. |
| The test config sets `ORB_ENV_NO_FILE` | Drop | A runner configuration literal; the tooling mirror owns runner configuration. |
| `AUTH_FALLBACK` in `.env` is boot-fatal, and absent boots clean | Move to security batch | Auth posture. The child-process reader above is the way to drive the load. |
| Deleted `SESSION_COOKIE_INSECURE` stays inert | Move to security batch | Cookie transport. |

Decisions for `server/entry/boot/disclaimer.test.ts`:

| Case | Decision | Evidence |
| - | - | - |
| Topics in order | Rebuild | Boot disclaimer. |
| Healthy loopback single-user carries the caveat and no security line | Rebuild | Same. |
| Caveat rides a widened-peer single-user box | Rebuild | Same. |
| Login modes carry no caveat | Rebuild | Same. |
| Each exposure is one security warning | Rebuild | Same. |
| Closed forward-header door warns but is not an exposure | Rebuild | Same. |
| Every security line is a warning | Rebuild | Folded into the exposure case. |
| Break-glass line | Rebuild | Same, with a control per ingredient. |

Defect controls: each guarded production behavior was planted in a worktree and the named case failed for its intended reason. The planted behaviors are the drifted-chain refusal, the posture option type, the backup gate, the abort on a failed backup, the retention sweep and its boot gating, debris replacement, the target-conflict check, the cross-device pre-flight, the sole-holder claim, the first-boot snapshot, own-pid and live-pid journal handling, keeper and skip-list planning, zero-byte handling, the resume snapshot rule, the skip validation, explicit-set recording, the boolean vocabulary, the gate defaults, the parse-time skip check, the override direction, the byte-order mark, `ORB_ENV_NO_FILE` and each disclaimer gate.

### Server composition

The test root delegates to production entry composition. Each domain case uses that graph instead of constructing a domain assembly inside a fixture.

Production owns business rules and persistence. The harness owns injected time and identity sources, external-edge scripts and physical resource lifetimes. Unexpected stream or child failures remain observable; ordinary disconnect and disposal join before completion.

### Builders and corpus

Use the canonical production-derived builders and corpus across server tests, CTs and e2e. Keep contract defaults, valid minted identities, ownership and native database behavior.

Qualify corpus producer, clone, search and cleanup lifetimes through their maintained cases. Do not weaken boundary parsing or fabricate missing fields to preserve old fixtures.

Keep private owner data, credentials, files and personal artifacts outside Git, publication and CI. Private recovery evidence is not a substitute for a public synthetic-corpus test.

### Client mounting

Native Playwright mounts browser-owned stories through the application Vite pipeline. The [gallery authoring contract](../../law/Spine-Testing.md#7-client--browser-tests--native-playwright) owns typed props, exact story IDs, isolation, network setup and cleanup. Reuse this setup for replacement cases; do not rebuild the harness or restore the experimental CT pipeline. Development component coverage remains separate from production build and E2E qualification.

Production data construction remains in `packages/client/src/compose/client-runtime.ts`. Authenticated registries remain in `packages/client/src/compose/authed-composition.tsx` and are delivered through `packages/client/src/compose/authed-providers.tsx`.

`tests/support/browser/ct-data-providers.tsx` mounts through that production door. It controls document capabilities and network responses without replacing application modules or copying registry tables.

Primitive subjects use `CtIsolation` from `tests/support/browser/ct-isolated-subject.tsx`. Registry variants use the named exception in `tests/support/browser/ct-isolation.ts`.

Qualify query teardown, document and notification bindings, nested mounts, session recovery and bus subscriptions through observable behavior. Flow tests remain e2e rather than another application assembled inside CT.

### Public entries and legacy retirement

Follow D318 and the existing public package doors. Rebuilt tests use production entries and the testkit doors; a helper a door does not export is internal to the kit.

Adjudicate test-only production hooks and unused helpers with their owning cases. Delete unsupported adapters; retain production-derived helpers needed by selected replacements.

Use the sibling legacy source only to identify cases. It is not part of this repository's tests, typecheck or CI.

### Completion and verification

A batch completes when every selected case has a keep, rebuild, move or drop decision with evidence. Required replacements exercise production, pass relevant controls and remove superseded support. Existing qualified coverage is a valid result; an additional test is not required for every reference case.

Use D317 and the orchestrator/lane completion policy for existing verification. A timeout or tool failure supplies no behavioral verdict. Record unrelated limitations separately.

## Rejected

Copied production assemblies, fake-heavy legacy retrofits, test-only production doors, and unrelated architecture campaigns as prerequisites.

## Coupled sites

[Spine-Testing](../../law/Spine-Testing.md) owns test composition, layer responsibilities and legacy boundaries. The inference-flow plan remains separate and supplies only dependencies required by a selected production case.

## Test plan

Qualify production-root behavior, deterministic inputs, ownership, physical cleanup and the actual client mounting door. Preserve meaningful cases and prove production defects are caught. Run each replacement batch when its concrete dependencies are qualified; unrelated corpus flows do not block it.
