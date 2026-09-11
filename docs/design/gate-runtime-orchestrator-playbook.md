---
kind: design
status: active
updated: 2026-09-11
---

# Gate-runtime orchestrator playbook — how a fresh session runs #1584

Steps, not history. The law and the contract are in [gate-runtime-standardization.md](gate-runtime-standardization.md)
(read §1–§4 and §8–§9 before your first dispatch; §12 is what lanes read). This file is what YOU do, in order.

## 0. Session start (every time, in this order)

1. Prove the guard is bound: run `git stash` (bare) and expect the hook to DENY it. If it passes, relaunch from `main`
   before touching anything (hooks bind at launch).
2. Pre-flight: `pnpm engines status` (fleet must be DOWN; sleeping vLLM parks \~37 GiB in host RAM), `pnpm stack status`
   (prod down), `free -g`. Take prod down and stop engines from `main`'s checkout if either is up.
3. `git -C <main> status --short` empty, `git log --oneline -3`, `git worktree list` (every worktree is a lane; resume,
   never respawn — a killed lane's worktree keeps its uncommitted work).
4. `pnpm work:item overview`. The program row is #1584. Rows that matter: Verify (needs an Opus verifier), Ready (claim
   at dispatch), Needs owner (ask, do not build).
5. Re-derive the census: `pnpm gate:contract > <scratch>/census.log`; the total line and the distinct `gates/*.ts`
   in the descriptor-wrapper findings are the legacy roster. Never quote a number from a document.
6. Read `~/.claude/bridge/to-primary/` (ack SELF notes by `mv` into `done/`). Write a SELF note ONLY when a context
   sentinel fires or you are handing the session off.

## 1. Standing rules for this program (owner, 2026-09-11)

- Cap 3 concurrent lanes. The runtime lane (§2 phase A) runs ALONE.
- Lanes run in isolated worktrees off `main` (`isolation: "worktree"`); you merge by fast-forward with the hook path
  nulled after the lane rebases; you run its named floor again on `main` after the merge.
- Every commit and merge until the mixed `check:structure` is green on `main`: `git -c core.hooksPath=/dev/null …`,
  scoped floor named in the message. Whole-tree checks are red by construction; baseline them, never launder them.
- Roles: forge for runtime/architecture and the 13 mixed-hook splits; executor (Opus by definition) for conversions
  that add a reader or need judgment; Sonnet executor / mech-executor for fully specified conversions on existing
  readers and for marker translation, briefed with the planted-break rule for any invented proof row; one Opus
  verifier per merged wave, read-only, probes announced by SendMessage and prefixed with its lane name. Never pass
  `model` on a named role except the Sonnet test lanes.
- Conversions are program work: landing comments on #1584, no row per gate or batch. Only defects, prerequisites and
  decisions get rows. `done` only after the verifier CONFIRMED; `--evidence` under \~700 characters; `refute` returns a
  Verify row to Ready with the fix spec as its evidence.
- Conversion lanes translate their own legacy markers in the same commit (comment-only edits under `packages/**` and
  `tests/**` are inside that lane's fence). The pre-existing backlog (315 `ONESHOT-OK` in CT files, 55 `@owner-scope*`
  under `packages/server`) is one mech-executor lane, resumed from its worktree.
- No SELF dispatch maps at dispatch time; no rule edits mid-lane except to fix the source of a repeated correction.

## 2. Work order (dependency order; do not reorder to fill slots)

**Phase A — runtime lane, forge, alone.** One brief, one isolated worktree, one commit series; nothing else dispatched
until it lands, an Opus verifier confirms, and you have read the first mixed baseline.

- Mixed loader: classify each `tooling/src/verify/gates/*.ts` module by exact contract identity (branded `defineGate`
  result vs validated `GateDescriptor`); unbranded lookalike, duplicate id, duplicate module identity → tool error;
  every module accounted for once. Fix the `baseui-render-prop-composition` missing-`name` throw at its source.
- One front door: `check:structure` (and the scoped path) runs the legacy pass and `runPolicyPass` (full final roster
  as `knownPolicies`, central grant table) in one invocation; findings, owner status, authority, severity, population,
  timing land in the existing run manifest / `reports/check-structure.json` / `check:show`; exit classes 0/1/2/3
  unchanged; legacy markers route only to legacy owners, `@orb-waive` only to final ordinary policies, grants only to
  final reviewed-grant policies.
- Whole-corpus conformance stage in `verify` (static tier): load every final policy, run `verifyPolicyProofs` over all
  of them (#1941; closes the 21 modules no family test imports).
- Mixed-corpus test with one REAL legacy descriptor and one REAL final policy (the 12 assertions in the guide §5.4).
- `enforcement-registry-parity` reads both contracts; `check-gates.repo.int.test.ts` alive under the mixed loader or
  retired with successor proofs per the carry-forward table.
- Delete the two real-tree zero-findings arms the #1947 lane restored in the grant-liveness int tests (keep the
  runnability arms) — the front door now owns that verdict.
- Floors: scoped tests it names; `pnpm gate:contract` unchanged; biome/eslint on touched files;
  `pnpm typecheck --config tsconfig.json` and `--config tooling/tsconfig.json`; the first mixed `check:structure` run
  on its worktree, wall time and RSS recorded.
- After merge: run the mixed `check:structure` once on quiet `main`, alone. Record the baseline (counts by policy and
  class) as a #1584 comment. File defects for real product findings; untranslated markers go to the backlog lane.

**Phase B — three slots, after A.**

1. Marker backlog: resume the worktree `.claude/worktrees/agent-a588b7202b748d71e` (uncommitted partial translation of
   the owner-scope markers; ONESHOT-OK not started). mech-executor. Receipt: both converted families at 0 blocking
   findings on the real tree, 0 unused markers, comment-only diff proven by `git diff -U0 | grep -vE '^[-+]\s*//'`.
2. Proof rework: resume `.claude/worktrees/agent-a2dae218300f26638` (item 1 done under the OLD scope: negative arms;
   correct it to the guide §4.2 — positive same-position arm per tenancy policy, delete the vacuous negative arms —
   then item 2: the `test-no-stubs` cross-file fixture whose offsets must overlap, plus its `@tests` header note). This
   is #1935's rework; `review` → `verify` → verifier → `done`.
3. \#1946 guard residuals (Sonnet mech-executor; hook + its pin + `registry.test.ts`; both-direction pins; no-loosening
   A/B over the pin ROWS table).

**Phase C — resource kinds (#1930), one Opus executor lane per kind, at most one at a time beside conversions,** in
the order that unblocks the most gates: path-identity door (exists / file-or-directory / symlink-resolves-outside +
absolute-selector normalization: unblocks `runner-config-path-liveness`, `tsconfig-entry-liveness`); document/ledger
facts (9 doc/registry gates); CSS census and static-class parity adjudication (14 CSS gates); Base UI installed surface
(7); token contract + devtools closure; tsconfig programs. Each ships with ready/missing/empty/unresolved receipts and
its own controls; no gate converts on a kind before the kind lands.

**Phase D — conversions, cap 3 minus the running prerequisite lane.** Pick families from the legacy roster (re-derived
in §0.5) in this order: direct-walking visitors and file hooks whose reader already exists → run-only evaluators on an
existing provider → resource families as their kind lands. One family per lane (4–8 modules), family named by its
`lib/` reader or declared singleton, markers translated in-commit, guide §8 procedure, guide §4 proofs. Merge, floor
on `main`, `#1584` comment, one Opus verifier per wave, refute or confirm.

**Phase E — after the bulk converts.** The 13 mixed-hook splits (forge, one lane); #1922 gate-owned tables → central
grants; the nine baseline ledgers → fixes, exact grants or `workItem` warnings; decisions #1939 and #1921 need owner
words before their gates convert.

**Phase F — legacy deletion** when `gate:contract` shows zero legacy modules: the checklist in
`docs/reviews/gate-runtime/ordinary-waiver-source-migration.md` §"Atomic cutover checklist" is the deletion list;
rewrite `GATE-AUTHORING.md`, `gate:new`, `gate-modernization` against `defineGate`; re-enable the lefthook hooks;
idle composed-pass remeasurement; catalog re-attest.

## 3. Dispatching a lane (the brief, in this order)

1. Lane name, and "state it first in every SendMessage".
2. WHY (two sentences).
3. Read in full, in order: the guide (`gate-runtime-standardization.md`) §3, §4, §8, §12; the exemplars doc; the
   exemplar modules and tests for the lane's evidence plane; every assigned module and its legacy source via
   `git show <sha>:<path>`; any carry-forward row naming a module. GATE-AUTHORING.md is the LEGACY guide, not an input.
4. The exact module list with the pre-conversion SHA; the family hypothesis (a hypothesis until the lane names the
   reader); stop-if-missing-kind (refusal is a success, report the exact read); markers translated in-commit with the
   census recorded.
5. The fence: files it owns; sibling lanes' files it must not touch; `packages/**`/`tests/**` only for comment lines.
6. Floors, exactly as the guide §8.8; never whole-tree; runs over ten minutes report and stop.
7. Git: `git -C <wt>` always; `git add -A` fine in its own worktree; `git status --short` empty; `git show --stat` in
   the report; one commit; `git -c core.hooksPath=/dev/null commit`; Co-Authored-By trailer.
8. Hazards: `vitest list --json=/abs/path`; rg `-r` clusters; never `git stash`/`checkout`/`restore`; `pnpm ast` for
   code questions; a search that finds nothing owes a planted control; whole-tree red is baseline.
9. Report shape: commit + stat; per-module receipts; census before/after; family decisions; refusals with `file:line`;
   deviations with tree evidence; proposed lessons as text; never touches `work:item` or `gh`.

## 4. Landing a lane

1. Read the report; verify `git -C <wt> show --stat <sha>` and `git status --short` empty yourself.
2. `git -C <wt> rebase main` (repeat if `main` moved), then from `main`: `git -c core.hooksPath=/dev/null merge --ff-only <branch>`.
3. Run the lane's named floor on `main`; `pnpm gate:contract` for the delta; regenerate `docs/test-baseline/manifest.json`
   on quiet `main` if a spec was added (`pnpm exec node tooling/src/verify/cli.ts baseline test-baseline-manifest`,
   commit it alone).
4. Post the receipt on #1584 (`gh issue comment --body-file`); rows: `review` + `verify --evidence` (< \~700 chars).
5. Dispatch one Opus verifier over the wave's merged commits (claims, exact fixtures to re-drive, census, the Sonnet
   assessment if a Sonnet lane is in the wave). On CONFIRMED: `done` with the identical evidence string. On REFUTED:
   `refute` with the spec; the fix goes back to a lane.
6. Fold the lane's lessons into the memory hub (`gate-migration-1584-lessons-hub.md`); if a correction had to be sent
   to a second lane, fix the FILE the lanes load, not the next brief.
7. Tear down the worktree only after the verifier confirmed and nothing may need resuming.

## 5. Lessons that bind (each paid for at least once; the incidents are in the memory hub)

- Fix the source, not the lane: a correction issued twice means the rule file is wrong.
- The census is not a convertibility list; trace every read against the seven shipped resource kinds.
- Carry the legacy proof rows; identity is proven once by the positive arm; central negatives are central; a planted
  break is owed only for an invented row; a header claiming a proof it was never shown to catch is a defect.
- Never override a named role's model down; Sonnet only where the owner ruled it.
- A proof harness cites nothing if it imports no gate module; a gate's rows run only where a committed test (or, after
  phase A, the conformance stage) calls `verifyPolicyProofs` on it.
- `native-config` populations are the whole transaction by design; consumers must be demand-driven; only ordinary
  owners demand waiver carriers.
- A retirement note can encode a defect as law; re-derive the inference, not just the measurement.
- Real-tree receipts pass the FULL final roster as `knownPolicies`; a partial roster manufactures unknown-policy alarms.
- A `mustFlag`/`mustPass` row can never carry an expected authority alarm; the report-identity test drives
  `runPolicyPass`.
- Before writing visitor logic, `pnpm ast` the legacy module's core literal across converted gates: an earlier wave may
  own the rule with a stronger reader (merge with a successor proof).
- Harness: a worktree-isolated Bash refuses `pnpm`/`gh` calls with long punctuated quoted args or `$(…)`; use
  `--body-file` and plain sentences. `work:item --evidence` fails near 1000 chars (#1920); the `Lane` field is
  lifecycle-controlled; `claim` refuses a second lane on a Running row. `doc-catalog:write` exits 1 on inherited rows;
  a rewritten doc needs its receipt re-attested (sha, commit, date) and a new doc adopted via `doc-catalog:sync`.
  After a lockfile changes on `main`, `pnpm install --frozen-lockfile`. The verifier's probes on `main` are untracked
  and prefixed; stage by pathspec only.

## 6. Open owner decisions

None. Every decision this program needed has a dated ruling in the guide §11; #1939 and #1921 were ruled on 2026-09-11
(hard cardinality policy plus exact grants; no third receipt kind). A new fork goes to Needs owner with a stated
default and deadline, never built around.
