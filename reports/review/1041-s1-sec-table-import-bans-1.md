# 1041 shard s1-sec-table-import-bans-1

Two security gates moved to native ESLint rows plus production-root behavioural tests and were deleted: `no-direct-users-read` and `vector-scope-derived`. Three gates stay in place and are escalated: `membership-enforcer`, `chat-viewer-plane-canon-reads` and `own-tables-only`.

Worktree `wf_d99749a9-c7a-2`, branch `wt/wf_d99749a9-c7a-2`. The uncommitted work of the stopped `wf_b2a8e8fa-466-2` worker was ported first (same base `07d7dcccb3`), reviewed, and extended. Its four planted files were not ported.

## no-direct-users-read: done

Successor:
- `orb/no-direct-users-read` in `TABLE_IMPORT_RESTRICTIONS` (`eslint.config.js`). Scope is `packages/server/src/domain/**` and `packages/server/src/entry/**`, the retired population. It refuses a `users` import or export specifier from any source, and a namespace, star or dynamic door into `@orb/db` or a relative `db/src` path.
- `orb/no-direct-users-read-reexport`, scope `@server`, no homes. It refuses a `users` re-export and an `export *` from the db package everywhere in server source, including sessions and admin. This closes the namespace-through-a-home door the retired gate closed by origin resolution.
- Homes: `domain/sessions/**` and `domain/admin/**`, the two owning domains in Spine-Identity-and-Auth §1 invariant 10 and the retired `SCHEMA_OWNERS.users` row.
- Behavioural test: `tests/server/domain/admin/verbs/identity-root.int.test.ts` drives the real composition root and real HTTP door. An admin role change and a disable reach a live cookie session on its next request, through the sessions re-read of the identity row.

Parity: 9 mustFlag / 5 mustPass ported, 0 lost. Rows are in `USERS_GATE_ROWS` of `tests/tooling/verify/ops/table-import-bans-native.test.ts`. One mustPass row is inverted on purpose: a same-named `users` export of another module (`import { users } from "./foreign.ts"`) is now refused, because the native door matches the name from any source.

Lost claim: per-module review inside the two owning domains. The retired gate needed a reviewed grant for each of the 7 sessions/admin modules. The native homes admit any module under `domain/sessions/**` and `domain/admin/**`. D321 rejects copying the grant list into config, and the law names the two domains, not the modules.

The earlier read-only survey `reports/review/1041-native-identity-env-survey.md` (main checkout) advised keeping this gate until a successor preserves a listed set of properties. Each one against this successor:
- Aliases, string-named imports and destructures: the imported name is matched, and a destructure needs a namespace or dynamic door, which is refused.
- Writes: any write names the table through an import, which is refused.
- Dynamic-bag refusal and unreadable-origin refusal: namespace, star and dynamic db doors are refused, and a `users` import from any source is refused.
- Local and foreign passes: a local object passes. A foreign same-named export is refused, which is stricter.
- Canonical barrel origin: not resolved. The name match over-approximates it. The one shared gap is a renamed re-export from outside server source, which the retired gate also declared as a limit; a renamed re-export inside server source is refused by the re-export row.
- Production-root identity and disabled-account behaviour: `identity-root.int.test.ts`. The atomic password, session and audit behaviour keeps its existing test (`tests/server/domain/admin/verbs/session-policy.int.test.ts:100`).
- Exact module grants: not kept. This is the lost claim above.

Waivers and grants rejudged:
- 7 reviewed grants in `tooling/src/verify/lib/reviewed-grants-depcruise-to-egress.ts` (admin create-user, persistence/queries, reset-password, set-enabled, set-role; sessions persistence/sessions and persistence/users). Disposition: home. Each site is inside one of the two owning domains. The grant rows and the `no-direct-users-read: 7` budget row are deleted.
- 0 `@orb-waive` markers.

## vector-scope-derived: done

Successor:
- `orb/vector-scope-derived`, scope `@server`. It refuses the six vector table names in an import or export specifier from any source, and a namespace, star or dynamic db door. Homes are the five retired import roles: `domain/embeddings/**`, `domain/search/persistence/**`, `domain/chat/memory/persistence/**`, `domain/discovery/persistence/**`, `foundation/observability/debug/**`.
- `orb/vector-scope-derived-reexport`, scope `@server`, no homes. No module, including a home, re-exports a vector table or star-exports the db package.
- `orb/vector-scope-derived-write`, home `domain/embeddings/persistence/**`. It refuses `insert`/`update`/`delete` (dotted, bracket literal, or a computed non-literal key) whose first argument names a vector table, an aliased vector import, a const or assignment rebinding of a table, and a whole-db door. The rebinding and door selectors keep the canonical name at every write position, which is what replaces the retired const-alias and namespace resolution.
- `orb/vector-scope-derived-cosine`, home `domain/search/persistence/**`. It refuses `vector_distance_cos` in a string literal or template element.
- Behavioural test: `tests/server/domain/search/verbs/vector-owner-scope.int.test.ts` seeds the recall corpus for the owner through the real root and provider wire. A second user with the same embedding space retrieves none of the owner's digest or segment rows through `search.corpus` and `search.discover`.

Parity: 9 mustFlag / 13 mustPass ported, 0 lost. Rows are in `VECTOR_GATE_ROWS`. Inverted mustPass rows, all stricter:
- a same-named export of another module (`hub/foreign.ts`) is refused;
- a local const spelled like a table in a write position (`local-table.ts`) is refused;
- the `@orb-waive` row is refused, because the native successor takes an inline directive with a reason instead (the `disabled.ts` row shows that form);
- a home's re-export (`embeddings/persistence/reexport.ts`) is refused by the re-export rule;
- `export const t = chatDigests` in the three read-only homes is refused by the write rule's rebinding selector. Naming the table there without rebinding stays admitted (the `digest-ids.ts` rows).

Lost claim: none of the descriptor rows. Outside the rows, a write through a helper parameter or a `.bind`/`.call` alias is invisible to both the retired gate and the native rule.

Waivers and grants rejudged: 2 markers, both inside the retired gate's own descriptor and the deleted drizzle delivery test. Disposition: removed-dead. 0 grants, 0 budget rows.

## membership-enforcer: escalate

The successor is expressible as `RESTRICTIONS` selectors plus a small scope-resolving rule for const-bound computed keys (`owned[FETCH]`, `row[OWNER]`, asserted by `tests/tooling/verify/ops/native-sealed-reference-delivery.int.test.ts:163`). It was not landed, for three reasons:
- The gate code reports every equality with an `ownerId`-named operand (`tooling/src/verify/gates/membership-enforcer.ts:157-196`, no nullish exemption). An ast-grep scan of the chat scope (268 files) finds 4 such comparisons with no waiver: `packages/server/src/domain/chat/persistence/backfill-scope.ts:44` (two nullish checks), `packages/server/src/domain/chat/verbs/bound-backfill.ts:22` (nullish) and `packages/server/src/domain/chat/verbs/resolve-media-ref.ts:46` (`meta.ownerId === hostId`, an asset ownership check). Whether the gate is red on HEAD cannot be shown without a structure run.
- `resolve-media-ref.ts:46` is an authorization decision. It needs a security reviewer's ruling, not a lane exception.
- The 6 reviewed `@orb-waive membership-enforcer(ownerId)` sites (`stats-delta.ts:37,149,185`, `memory/generate/segments.ts:167`, `memory/generate/digests.ts:150`, `persistence/generation-observation.ts:245`) become inline `eslint-disable-next-line` directives with a new `suppressions:source-orb-membership-enforcer` grant. That adds a granted class against `suppressions: 57` (`tooling/src/verify/lib/waiver-budget.ts:59`), which this shard may not raise.

Parity: not ported; the gate stays (6 mustFlag / 6 mustPass, 0 lost while it runs).

Owner decisions needed: whether a nullish comparison is out of subject, the ruling on `resolve-media-ref.ts:46`, and the budget transfer (`membership-enforcer: 6` retires, one suppressions class arrives).

## chat-viewer-plane-canon-reads: escalate

The gate judges per-verb reachability from each viewer-plane verb in `CHAT_VERB_AUTHORITY` to a floorless reader through module-local helpers, and discharges a read only when the result is filtered through the viewer's own `isBelowHistoryFloor` verdict (`tooling/src/verify/lib/chat-plane-read.ts`; 12 mustFlag, 7 mustPass and 13 mustRefuse rows). The proposed successor cannot hold that claim on the current tree:
- A file-level import ban cannot tell verbs apart inside one file. `packages/server/src/domain/chat/verbs/read.ts:129,132` imports `loadCanonHistory` and `loadChatEventReplay` for viewer-plane and waived room-plane verbs alike (waiver `read.ts:1205`), and `turn.ts:347,1669` carries two room-plane waivers. Either both files become homes, which loses the claim for every viewer-plane verb in them, or the ban reds the live tree.
- The behavioural half does not exist. No test drives every viewer-plane verb of `CHAT_VERB_AUTHORITY` with a from-join member through the real root (rg finds the matrix only in `tests/tooling/verify/gates/chat-viewer-plane-family.suite.test.ts` and `tests/legacy/server/domain/chat/substrate/auth/matrix.test.ts`).
- The 13 mustRefuse rows (matrix totality: spreads, computed keys, unbound values, cycles, member kinds) have no native expression.

Parity: not ported; the gate stays (12 mustFlag / 7 mustPass / 13 mustRefuse, 0 lost while it runs).

Needed: a per-verb from-join behavioural suite over the real root, sized as its own work item, before the gate can be deleted.

## own-tables-only: escalate

The gate is `authority: "hard"` (`tooling/src/verify/gates/own-tables-only.ts:532`), so its successor belongs in `hardConfig` with no inline exceptions. The proposed successor is not landable in this shard:
- The table-to-domain map is derived from the production schema at run time (`own-tables-only.ts:196-235`). A native per-domain ban needs eslint.config.js to load every `packages/db/src/schema/*.ts` module at config load and an input hash so a schema change re-lints the domain tree. Playbook §2 rules that plumbing escalation-sized.
- The write arm keys on the Drizzle method's declaration in `drizzle-orm` and refuses unstable table bindings (`own-tables-only.ts:261-268`, `:363-367`). Name selectors cannot hold that inside `persistence/`, the BULK_READERS domains and the FILE_ALLOWLIST file without an alias ban on every table import.
- The ruling tables (`SCHEMA_OWNERS`, `TABLE_OWNERS`, `BULK_READERS`, `FILE_ALLOWLIST`) have no typed product home yet, and their both-ways stale arms (`:407-431`) need a test over the real schema and tree.

Parity: not ported; the gate stays (6 mustFlag / 10 mustPass, 0 lost while it runs).

Needed: a ruling on the ruling tables' home, and primary's agreement to the config-load schema reader with its input hash.

## Commands

| Command | Result |
| - | - |
| `pnpm test:scoped tests/tooling/verify/ops/table-import-bans-native.test.ts` with `...TABLE_IMPORT_RESTRICTIONS` removed from `RESTRICTIONS` | 0 passed / 7 failed (red first) |
| the same, rows restored | 7 passed |
| scratch Linter pass of the six rules over `git ls-files packages/server/src` | 1833 files scanned, 1833 with a rule configured, 0 findings |
| `pnpm exec eslint` on six planted files | exit 1, one finding per plant (see the commit body) |
| `pnpm test:scoped` both behavioural tests on real source | 2 passed |
| the same with `hostScopeCond` removed from `digestScopeCond` and `segmentScopeCond` | vector test failed: the second user received the owner's `chat_digest` row |
| the same with the `!session.enabled` check removed from `validate` | identity-root test stayed green: `admin.setEnabled` also revokes every session of the target, so this plant is masked by design |
| the same with `validate` returning a fixed `user` role | identity-root test failed at the admin role assertion |
| `pnpm test:scoped` origin-server and home-server family suites | 26 passed; the run exited 1 only because a law doc was edited during it (working-tree guard) |
| `pnpm test:scoped` native sealed-reference and Drizzle delivery tests | 18 passed |
| `pnpm exec biome check <21 changed files> --diagnostic-level=error` | clean |
| `flock <heavy.lock> pnpm typecheck --config tsconfig.json` | exit 1: 3 errors, all in untouched files (`tests/legacy/inference/_support.ts:201`, `tests/legacy/server/domain/embeddings/_support.ts:299`, `tests/legacy/server/domain/search/_support.ts:296`); the product edits in this shard are comment-only, so they cannot change these types; 0 errors in changed files |
| `pnpm check:agents` | 3 dead links in `docs/plans/test-foundation/design.md` to gitignored `reports/review` files; not touched by this shard |

## Coupled risks

- `referenceNamesExport` (`tooling/src/verify/lib/origin-verdict.ts:83`) lost its last gate consumer with `vector-scope-derived`; only its unit test still calls it. It is left in place for the owner's dead-code adjudication.

## Owed to primary

- `pnpm lint:eslint-scoped` on the changed files (not run: it reselects the foundation passes after an `eslint.config.js` edit).
- `tests/tooling/verify/gates/identity-enforcement.repo.int.test.ts` and the real-corpus liveness runner that reads `tests/tooling/verify/gates/_liveness/server-app.ts`; both load the whole repo corpus.
- Regenerate `docs/law/Core-Enforcement-Active-Gates.md` (rows for both deleted gates) and run `pnpm check:ledgers-fresh`.
- `pnpm typecheck --config tooling/tsconfig.json` (only the root `tsconfig.json` program ran here).
