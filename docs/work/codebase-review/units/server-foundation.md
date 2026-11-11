# server-foundation

- Path: `packages/server/src/foundation/`
- Band: S (3,434 code lines, 42 files — tokei)
- Status: reviewed
- Law read in full: `docs/law/Tier-2-Foundation.md`, `docs/adr/0327` (active) superseding `0326`
  (superseded), `.claude/rules/server-edge.md` + `.claude/rules/server.md` (path-matched),
  `.claude/rules/comments.md` (edit law).
- Carried, not re-filed: `stack/contract/types.ts`'s `DEBUG_ENV_KEYS` tuple missing the fourth knob
  (`WIRE_CAPTURE_REPLY`, `env/record/index.ts:237`) — counted in `units/tooling-configs.md`.

## Sweeps

- Hatch sweep: zero suppressions (`eslint-disable`/`@ts-`/`biome-ignore` rc=1 unpiped), zero
  TODO/FIXME; all 27 `any` hits are English prose. Sideways/upward relative imports: zero.
  `tests/legacy` cites: zero. Ghost commands: all `pnpm` mentions (`stack`, `start`,
  `bug:reports`, `install`) are defined scripts — the tooling-doc ghost family does NOT reach the
  server source. (First bite of the `-p`-is-`--pretty` variant of the short-flag cluster; the
  clean redo used `--only-matching` long-form.)
- Catch triage (12 catches): every one is a convert, count-and-alert, or null-as-answer —
  `audit.ts:86` implements the law's suppress→count→drop + `ALERT_EVERY=25` `security:true`
  `audit_sustained_failure` warn exactly as `Tier-2` §54 states; `record/index.ts:748` converts to
  `EnvRefusalError` with `cause`; the null-returners (`version/index.ts:63-83`,
  `log-ring-read.ts:52-58`, `bug-report.ts:88-92`, `operator-jwks.ts:15-21`, `routes.ts:148`) each
  carry the house "owned by … Ends if …" sentence naming their consumer and termination.
  Zero swallows.
- Door-probe battery (every enforcement NAMED in the tier law — all live): dep-cruiser
  `foundation-reaches-up-to-nothing` (`.dependency-cruiser.ts:246`),
  `process-env-composition-root-only` (:1434), `env-record-reads-no-host` (:1445); eslint
  `orb/sole-env-reader` (`eslint.config.ts:2038`), `orb/assumes-single-replica` (:2273),
  `orb/no-module-state` (:2279); Biome `noProcessEnv` error with the ONLY off-scope
  `foundation/env/index.ts` (the sole reader) — door width matches the law exactly.
  `ASSUMES(single-replica)` markers present on rings/audit/middleware/env per §56;
  `pnpm depcruise` green (8,524 modules, 53,096 deps, exit 0 unpiped).
- Header-claim truthing (probed, all TRUE): `AdminAuthChecker.isAdmin: (c: Context) => boolean`
  matches the law's "takes the hono `Context` (not headers)" ruling (`contract/debug.ts:22`);
  impl is the seam's `debugGateAdmits` reading the context principal (`entry/app.ts:526`); a
  throwing checker falls through to the token arm, never opens the gate (`routes.ts:243-251`);
  exactly one `app.post` on the debug surface ("the one WRITE" TRUE); body ceiling before
  `c.req.json()` (§83-90); `wrapLibSqlClient` present (`tracing.ts:445`); `versionIdentity` answers
  `/healthz` (`entry/app.ts:391`), the boot line (`lifecycle.ts:263`), the OTel service version and
  the bug envelope; `APP_VERSION` gone repo-wide except the two sentences that say it is gone
  (git grep, two methods); the `.env`-Set "written EXACTLY ONCE" claim — one call site
  (`env/index.ts:112`), readers are the `#301` refusal path only; container-entrypoint secret-name
  claim (`data-layout/index.ts:18`) — `docker/entrypoint.sh:111-113` writes `session_secret` under
  `secrets/`; entrypoint. contracts homes `@orb/contracts/diagnostics` and
  `@orb/kit/allowed-hosts` exist; `#primitives/node-environment` alias resolves
  (`package.json imports "#*"`).
- Union-drift habit (the good disease, replicated in `env/record/index.ts`):
  `AUTH_MODE_REQUIRED_ENV` and the `AUTH_FALLBACK` default map are `satisfies
  Record<(typeof AUTH_MODES)[number], …>` — a fifth auth mode fails `tsc`, the db enum-tuples
  pattern at the boot table.
- Tests: `pnpm test tests/server/foundation` — 16 files, 90 tests, all green (twice, before and
  after the in-unit comment fixes); the citation door
  `tests/tooling/doc/comment-path-citations.repo.int.test.ts` green after the fixes.

## Findings

- \[P3] `env/bind.ts:2` and `env/diagnostics.ts:2` cite "the `posture.ts` shape" — the exemplar
  file was deleted by `9a6061b487` (2026-09-19, the inference cut-over, a "WIP: test tree red"
  commit that by construction could not do prose hygiene); the cites predate the death (landed
  `566f992fd8`, 2026-08-13) and were never re-pointed. Why the citation door missed it:
  `comment-path-citations.repo.int.test.ts` matches rooted/relative/directory-qualified paths, and
  its bare-name idiom (line 47) covers DOC and TEST files only — a bare SOURCE-file name is
  invisible. FIXED in-unit: both headers now name the surviving family (`bind.ts`/
  `diagnostics.ts`/`fallback-peers.ts` are each other's shape exemplars, the pattern
  `fallback-peers.ts:3` already used). Triage rule: the door's bare-name pattern should cover any
  tracked-file extension, or the house idiom must require a directory qualifier.
- \[P3] The dead-marker dialect — the dead-door class wearing a THIRD spelling, comment MARKER
  tags. `@owner-scope-ok` is cited as a live exemption at `debug/routes.ts:8` and
  `debug/inspect/automation-fires.ts:7` (plus `entry/auth/seam.ts:413`, phase-7 carry), but the
  grammar was translated away by `9dedb98b7e` ("translate the ONESHOT-OK and owner-scope grammars
  onto `@orb-waive`", #1944) and the family's consumer died with the custom gate system in
  `821e8f8dff` (116 touches of `owner-scoped-reads` there; `git log -S` full history). The purge
  commit `18f2cee2f5` ("remove dead markers … of deleted gates") removed MARKERS, not prose about
  them — the same deletion-hygiene gap ADR 0333 ordered closed. `inspect/config.ts:164` is the
  surviving exemption, now a bare ruling comment whose `@orb-waive` prefix the same commit
  stripped; `seam.ts:413` still points at it for a marker that is no longer there. The paired
  "D20" cite is topically vector-substrate ownership, not this surface. FIXED in-unit at the two
  foundation sites (now name the surviving ruling: D17's box-operator admitted set +
  `inspect/config.ts`); carry `seam.ts:413` and the `owner-scoped-reads` policy-name cites in
  `domain/discovery/persistence/character-scope.ts:18` and
  `domain/plugin/persistence/wire-name-census.ts:29` to their units. Ledger note: ADR 0323 names
  "the complete owner-scoped-reads policy" as live — add to the filed ledger-internal-contradiction
  row beside 0164/0222. Triage rule: the dead-name sweep must also diff comment MARKER tags
  (`@\w[\w-]*` grammars) against the families live rules consume (`@orb-waive` survives for
  `vector-scope-derived`, `one-principal-mint-population`, `turn-identity` — proven by their int
  tests; `owner-scoped-reads` consumes nothing).
- \[P3] `docs/law/Tier-2-Foundation.md:20` enumerates the `inspect/` probes as "`stats` · `integrity`
  · `inspect-chat`" — `config.ts` (2026-08-04) and `automation-fires.ts` (2026-08-29) were both
  added before the doc's own `updated: 2026-10-18` stamp, so the law doc drifted while being
  touched. A cold reader enumerating from the law misses 2 of 5 probes. Fix: name the tuple/exports
  (`debug/inspect/index.ts`) instead of copying members — `comments.md:41` says exactly this of
  prose too.
- \[P3] D141 archaeology cluster for `packages/server` (the package's standing cross-cutting P3,
  carried by every later server unit like the tooling agent-sync carry): `comments.md:39-40` bans
  dated history and issue-number cites, yet `packages/server/src` carries 1,357 issue cites in 446
  files and 254 dated receipts in 166 files (this unit alone: 51 + 25). The prose is high-class —
  dated, measured, receipted, and every sampled claim verified true — so the tree-wide sweep should
  re-home, not delete: the receipts deserve a `docs/work`/ADR anchor, and D141's ban is the ruling.
  Sharpest instance: `#301`/`#480`/`#2376`-class receipts are the repo's BEST habit running
  directly against its own comment law.

## Verdict

reviewed (4 findings; 2 fixed in-unit, 2 open; plus the carried DEBUG_ENV_KEYS item). The
server's floor tier behaves exactly like phase 2's tooling: its enforcement is real and every
named door fires — dep-cruiser, the three orb lint rules, Biome with a door-width that matches the
law sentence word for word, the union-drift `satisfies` tables, the written-exactly-once Set that
actually is written exactly once — and the unit's two genuine defects are both NAME ROT: a deleted
exemplar file cited by two headers, and a marker grammar that died twice while its prose kept
pointing. The marker finding adds the third spelling class to the triage item (after backticked
policy names and ghost commands): dead MARKER tags. The dead-door mechanism thesis extends to
serverside without a hitch; the neglect-vs-maintenance gradient predicts it and this unit is
consistent with it — the fresher law surfaces (ADR 0327, the boot tables, the debug gate's
AUTHFIX-2 receipts) are true, and the rot sits where nothing re-reads: cross-file exemplar names
and waiver-tag nostalgia.
