# 1041 shard s1-sec-identity-writers-1

Three custom gates retired: `external-id-single-writer`, `external-id-single-writer-health` and `handle-key-writer`. Their claims live in eight HARD native ESLint restrictions (`IDENTITY_WRITER_RESTRICTIONS` in `eslint.config.js`, emitted only by `hardConfig`, so an inline directive cannot excuse a finding), a durable rule suite, and a behavioural test over the composed server. This is the redo of the refuted first attempt; the refuted gaps are closed and each has a durable row.

## Successors

- `eslint.config.js` `IDENTITY_WRITER_RESTRICTIONS`, registered in `restrictionPlugin` and run by `eslint-hard.config.js` (`tooling/src/verify/ops/eslint-profile.ts:22`, `--no-inline-config`):
  - `orb/external-id-claim-writer-callers` and `orb/external-id-pending-join-writer-callers`: the per-writer caller registry. Any identifier or string spelling of a writer name outside its registered capability files.
  - `orb/external-id-writer-home` (`users.ts` only): a writer name outside its own declaration; a keyed write, a quoted or computed key, a dynamic key, a patch assignment (dot or bracket) or a positional insert that reads a subject, outside a registered writer; any string spelling of the subject column.
  - `orb/external-id-subject-binds`: a non-null keyed subject write under a users write verb, or a subject patch assignment, outside `provision-identity.ts` and `users.ts`.
  - `orb/external-id-opaque-users-writes`: users write data the rules cannot read (a variable, a spread, a non-literal upsert `set`, a dynamic key), and any string spelling of the subject column, outside `provision-identity.ts` and `users.ts`.
  - `orb/external-id-raw-users-writes`: a positional users insert, and raw SQL text that inserts into, replaces into or updates `users`, outside `users.ts`.
  - `orb/users-write-plain-spelling` (all of `@server`, no exemption): an aliased `users` import from `@orb/db`; `as`, `satisfies`, `!` or a type assertion around the `users` table or a users write receiver; an optional-chain receiver in parentheses; a computed non-literal verb on a users chain (`db[VERB](users)`, `db.update(users)[VERB](…)`).
  - `orb/handle-key-writer`: a users insert, update, array insert or upsert `set` whose literal data sets `handle` without `handleKey`, including cast data.
- `tests/tooling/verify/ops/eslint-hard-identity-writers.suite.test.ts`: every descriptor row through the real hard profile, the refuted spellings, an inline-bypass control, the live server tree clean under all eight rules, the exact exemption census per rule, and the earned-exemption check.
- `tests/server/domain/sessions/persistence/users.int.test.ts`: the composed server (`createServerHarness`) through the forward-header HTTP door and the admin service. Handle-fallback bind-once, admin link bind-once and held-subject refusal, the concurrent link race, concurrent owner-policy adoption, and the IdP rename key.
- D259 pending-join binding: `tests/server/entry/compose/oidc-native.int.test.ts:219-272` (the joined row carries `externalId === MEMBER.sub`).

## external-id-single-writer

- Verdict: done.
- Parity: 20 mustFlag / 11 mustPass ported, 0 descriptor rows lost. Added rows for the refuted spellings: quoted, computed, dot and bracket subject writes in `users.ts` outside a writer; cast table, cast receiver, cast positional, cast upsert and parenthesized optional-chain receivers; the aliased table import; constant-key and constant-verb spellings.
- Refutation 1 (P1, keyed writes in `users.ts`): `orb/external-id-writer-home` now carries `keySpelled` (plain, quoted, computed literal and template keys), `SUBJECT_ASSIGNMENT` (dot, bracket and template members), a dynamic-key selector, and the subject string ban, each outside `INSIDE_SUBJECT_WRITER`.
- Refutation 2 (cast spellings): `orb/users-write-plain-spelling` refuses every wrapper the old `unwrapExpression` looked through, plus `!`, so the name-matching rules always see a bare `users`.
- Planted, real files, cwd the worktree, hard door `pnpm exec eslint --config eslint-hard.config.js --no-config-lookup --no-inline-config <files>`:
  - The verifier's plant: `users.ts` gains `rebindSubjectUnchecked` (`set({ "externalId": sub, updatedAt: 0 })`), `rebindComputed` (`["externalId"]`), `patchSubject` (`changes.externalId = sub`) and `patchSubjectBracket` (`changes["externalId"] = sub`); `admin/verbs/zzv-rebind.ts` calls the first. Exit 1, 7 errors, all `orb/external-id-writer-home` (`319:32` twice, `322:33`, `322:34`, `325:3`, `328:3`, `328:11`). `users.int.test.ts` stays green (exit 0): an uncalled writer is the lint's job.
  - `admin/verbs/zzv-rename.ts` with the six cast spellings: exit 1, 6 errors, all `orb/users-write-plain-spelling` (`4:57`, `5:52`, `6:56`, `7:50`, `8:44`, `9:50`).
  - Both doors: `link-external-id.ts` binds with `ctx.db.update(users).set({ externalId, updatedAt: at }).where(eq(users.id, userId))` in place of the claim. Hard door exit 1, `37:56 orb/external-id-subject-binds`. `users.int.test.ts` exit 1: the rebind resolves instead of rejecting, and the race binds both subjects. Suite exit 1: the live tree reports `link-external-id.ts:37`, and the earned check reports `link-external-id.ts no longer calls claimExternalIdIfUnbound`.
  - All plants removed; `git status --short` showed none.
- Red-first: with the identity blocks dropped from `hardConfig` the suite failed 52 of 77 (every flag row, the bypass control and the census). With only the dynamic-key and dynamic-verb selectors dropped it failed exactly the 8 rows they own.
- Lost claim: one narrow spelling. A patch assignment `x[K] = sub`, or a writer read `ns[K]`, whose key `K` is a constant declared outside `packages/server/src`. The old reader may have resolved such a constant; the native rules see only literals, and refuse every literal spelling inside `@server`. No such constant exists: `rg '["'"'"'`](externalId|external_id)["'"'"'`]' packages` outside the server finds only schema column names and comments. A `const t = users` rebinding and a positional subject renamed before the bind inside `users.ts` stay outside both the gate and the native rules, as the gate declared.
- Waivers and grants: none to rejudge. `rg '@orb-waive(-file)? (external-id-single-writer|handle-key-writer)|policyId: "(external-id-single-writer|handle-key-writer)'` over 12,280 files: 0; `grep -l` over the 23 `reviewed-grants*.ts` files and `waiver-budget.ts`: 0.

## external-id-single-writer-health

- Verdict: done, deleted with its family.
- Parity: 5 mustFlag / 2 mustPass ported, 0 lost. Dead provision bind, dead link call, deleted link file, dead provision call and dead pending-join call each fail `earned identity exemptions`; the healthy shape and the read map beside a write pass. Two rows added: a caller that still imports its writer but no longer calls it, and a persistence file with only a read map and an opaque write.
- The earned check counts a call (`CallExpression` whose callee names the writer), not an import or a bare reference.
- Planted: the `link-external-id.ts` plant above. `each live exempt file still holds the bind or call its exemption excuses` exit 1, as quoted.
- Lost claim: cadence only. The gate ran in the per-commit static tier; the earned check is in `tests/tooling/**`, which runs weekly. Per-push behaviour still covers the callers: `users.int.test.ts` fails if the admin link or the owner-flip bind stops binding once, and `oidc-native.int.test.ts` fails if the pending-join confirm stops binding.
- Waivers and grants: none (same counts as above).

## handle-key-writer

- Verdict: done.
- Parity: 3 mustFlag / 3 mustPass ported, 0 lost. Added rows: the upsert `set` rename, cast upsert config, cast table, cast receiver, non-null table, cast data and a constant-verb rename.
- Refutation (P3, cast spelling): `db.update(users as typeof users).set({ handle, … })`, `(db.update(users) as never).set({ handle })`, `db.update(users!).set({ handle })` and `db.update(users as never).set(…)` all fail `orb/users-write-plain-spelling` (the `zzv-rename.ts` plant above, lines 4-7).
- Planted, both doors: `updateUser` in `users.ts` writes `.set({ ...patch, handle: patch.handle })`. Hard door exit 1, `270:10 orb/handle-key-writer`. `users.int.test.ts` exit 1: the stored key stayed `ldentlty-bob` after the rename to `Identity-Robert`.
- Lost claim: none.
- Waivers and grants: none (same counts as above).

## Scaffolding removed

`tooling/src/verify/gates/{external-id-single-writer,external-id-single-writer-health,handle-key-writer}.ts`, `tooling/src/verify/lib/external-id-writer.ts` (only the three gates imported it), `tests/tooling/verify/gates/external-id-single-writer-family.suite.test.ts`, the arms in `tests/tooling/verify/gates/_liveness/server.ts` and `server-app.ts`, the `tests/tooling/gate-spelling-twins.baseline.json` row, and the ADR 0257 Checks line. The residue sweep finds only the generated `docs/law/Core-Enforcement-Active-Gates.md` rows 140, 141 and 149, owed to primary.

## Checks

- `pnpm test:scoped tests/tooling/verify/ops/eslint-hard-identity-writers.suite.test.ts`: 77 passed. Red-first 52 of 77 failed with the identity blocks dropped, 8 of 77 with the dynamic selectors dropped.
- `pnpm test:scoped tests/server/domain/sessions/persistence/users.int.test.ts`: 5 passed.
- `ORB_ENV_NO_FILE=1 pnpm test:scoped tests/server/entry/compose/oidc-native.int.test.ts`: 26 passed.
- `pnpm exec biome check <changed files> --diagnostic-level=error`: clean.
- `pnpm typecheck --config tsconfig.json` under the heavy lock: exit 1, no diagnostics in changed files; 3 in untouched `tests/legacy/{inference,server/domain/embeddings,server/domain/search}/_support.ts`, inherited from the branch base.
- `pnpm check:agents`: exit 1 on three missing `reports/review` link targets in `docs/plans/test-foundation/design.md`, unrelated; ADR 0257 is clean.

Owed to primary: `pnpm lint:eslint-scoped` on `eslint.config.js` and the changed tests, `tests/tooling/gate-spelling-twins.int.test.ts`, the `_liveness` real-corpus runner, and the `Core-Enforcement-Active-Gates.md` regeneration.
