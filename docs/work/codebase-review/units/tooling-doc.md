# tooling-doc

- Path: `tooling/src/doc/`
- Band: S (3,759 code lines, 29 files — tokei)
- Status: reviewed
- Carried, not re-filed: `ops/check.ts:3-5` and `index.ts:3` agent-sync remnants, counted in
  `units/tooling-floor.md` F1.
- Law above the axes: ADR 0164/0222 ("One checker, `pnpm check:agents`"; `pnpm doc check`
  REJECTED as a second checker) and D333 (killed check:agents "without … check aliases or
  equivalent replacements"). Fix directions here must pass both.

## Sweeps

- Hatch sweep: zero `any`-as-shape (every hit English prose), zero suppressions, zero TODO.
  One `catch` unit-wide (`ops/items.ts:215`) — rethrows as UsageError with `cause`: nothing
  swallowed. Legacy cites: zero (rc=1 unpiped). Sideways imports: zero.
- Weak asserts in `tests/tooling/doc/` (25 files): one `toBeGreaterThan(0)` census floor
  (`parse.test.ts:110`) — legitimate against a vacuous empty-census pass.
- D141 archaeology: the sweep's densest — `format-fidelity.ts` is wall-to-wall issue cites and
  dated corpus receipts ("Measured 2026-09-12 over all 1106 tables", "owner ruling 2026-10-23
  raised it from 4 KiB"). But this is archaeology of the BEST class — dated, measured, honest
  snapshots — the db/`query/batch.ts` MEASUREMENT pattern at scale, not rot. Not filed.
- Header-claim truthing (probed, all TRUE): `rules.ts` size-cap comment matches the constants
  exactly (8 KiB ADR, 48 KiB item/plan/law, `rules.ts:26-32`); `drift.ts` "Seven checks" is
  exactly seven check functions; `due` is soft as claimed (probed: exit 0); `names.ts` padding
  grammar is one shared regex; the mint verbs really do run the same rule composition
  pre-write (`pendingDocProblems`); `runFormat` prints both censuses always, refusals with the
  `REFUSED ` prefix as the header states.
- Door census (the unit's point): `pnpm doc help` lists every verb — there is NO `check` verb.
  `check:agents` is not a script (package.json). CI's only test:tools line
  (`contributor.yml:126`) enumerates five files, none in `tests/tooling/doc/`.
  `docLayerProblems` live callers: mint pre-write only + `check.int.test.ts` (whole-tree
  `toEqual([])` assertion that CI never runs). lefthook runs `doc format --write` on staged
  files with `|| true` (`lefthook.yml:16`).
- Provenance via transcript oracle: "the five-slot cap" (cited in 7 tool `cli.ts` headers,
  incl. doc's) is the deleted `tooling-slot-template` Verify gate
  (`tooling/src/verify/gates/tooling-slot-template.ts`, per
  `~/.claude/projects/.../a4a1b84e…/subagents/agent-a93329764763b7a9d.jsonl`); its home doc
  `docs/architecture/core/Core-Tooling-Law.md` was deleted in the SAME commit as the gate
  (821e8f8dff). Decided, not forgotten; the layout survives as convention by faith.

## Findings

- \[P2] The dead-door dialect reaches `tooling/src/doc/` in a spelling F2's regex can't see.
  Beyond the two counted remnants, ~10 living sites name commands that no longer exist:
  ghost `check:agents` — `ops/check.ts:1` and its own refusal message
  (`check.ts:16` `refuseDirectInvocation(…, "pnpm check:agents")` tells an author to run a
  missing script), `lib/rules.ts:4`, `contract/vocab.ts:18`, `ops/format.ts:16` ("the
  REGISTERED `check:agents` stage"), `tests/tooling/doc/ops/check.int.test.ts:1`,
  `format.test.ts:194`; ghost `check:docs` — `lib/generated.ts:3`, `ops/format.ts:20` cites
  "`pnpm check:docs`" as a command, `run.ts:56,72,75` PRINT it as the verb name, and
  `format.ts:108` adds ghost `check:ledgers-fresh`; and the 11th dead policy name, "the
  five-slot cap" (`cli.ts:1-2` and five sibling tool cli headers + `snap/contract/contrast.ts:3`),
  provenance proved above. ADR 0164/0222/0283 still describe check:agents as the live one
  checker — ledger-internal contradiction (0164 rejected `pnpm doc check`; D333 then deleted
  the checker, leaving zero). Fix = retire the prose with the class-wide sweep; the refusal
  message and printed verb name go first (they lie to authors mid-command, the phase-0
  tripwire shape).
- \[P3] `lib/drift.ts:1-3` — the header promises the drift nag is printed by "the SessionStart
  hook": neither SessionStart command runs it (`session-onboard.sh` greps P1 items by hand,
  `compact-instructions.sh` doesn't touch doc). The nag is real and used (I run `pnpm doc
  drift` every boot), just not by the named mechanism. Fix: say who runs it (the orchestrator
  protocol) or wire the hook.
- \[P3, owner call] The whole-tree rules audit has no runnable entry point. `docLayerProblems`
  is fully implemented, exported and believed (its int test asserts the REAL tree is clean),
  but nothing in-tree can invoke it on the tree: no verb, no script, no CI step. The
  writing verbs self-enforce pre-write, so the tree stays consistent by author-habit +
  mint-time refusal, and the audit runs only via local `pnpm test:tools`. ADR 0164 explicitly
  REJECTED a `pnpm doc check` verb and D333 bans "check aliases or equivalent replacements",
  so adding the obvious verb re-decides the ledger — same open-call shape as the
  prose-baseline and unicode-data calls: keep-as-test-only (and fix the prose) or owner
  amends 0164/D333 and adds the verb.

## Verdict

reviewed (1 P2, 2 P3, zero fixed in-unit). The doc tool's CODE is the most honestly-prosed
module in the sweep — measured, dated, receipted claims that all verified true — while its
COMMAND SURFACE is the clearest case yet of the D333 amputation left unsutured: the rules
engine, its tests and its ADRs all still speak of a checker that exists nowhere, in three
ghost command spellings plus the five-slot ghost. That it works at all is thanks to the
surviving door nobody advertises: every mint/land verb runs the full rule composition over
what it is about to write. The unit adds one rule to the triage item: the dead-policy sweep
must search ghost COMMAND strings (`pnpm check:\w+` in package.json minus defined scripts),
not just backticked policy names — the dialect doesn't always wear the `` `policy `X` `` uniform.
