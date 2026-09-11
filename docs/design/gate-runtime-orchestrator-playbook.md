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
2. Pre-flight, cheapest probe FIRST: `free -g` and `grep Shmem /proc/meminfo`. A sleeping vLLM fleet parks \~37 GiB as
   `Shmem`; under \~1 GiB means engines are already down and you need no launcher call at all. Only if `Shmem` is high
   do you touch `pnpm engines status` / `pnpm stack status`, and then take prod down and stop engines from `main`'s
   checkout. The launcher family has no help guard — a bare `node scripts/dev/engines.ts --help` once REAPED three live
   pids — so never invoke it merely to look.
3. `git -C <main> status --short` empty, `git log --oneline -3`, `git worktree list` (every worktree is a lane; resume,
   never respawn — a killed lane's worktree keeps its uncommitted work). **For each worktree run
   `git -C <wt> rev-list --count main..HEAD` and `git -C <wt> status --short`. A dead lane showing 0 commits and a large
   dirty set is one `worktree remove` from annihilation: CHECKPOINT it immediately** (`git -C <wt> add -u`, then
   `git -C <wt> -c core.hooksPath=/dev/null commit`) with a message that says explicitly it is a durability checkpoint
   and not a completion receipt. `add -u` stages tracked modifications only, so lane scratch files stay untracked.
4. `pnpm work:item overview`. The program row is #1584. Rows that matter: Verify (needs an Opus verifier), Ready (claim
   at dispatch), Needs owner (ask, do not build).
5. Re-derive the census: `pnpm gate:contract > <scratch>/census.log`; the total line and the distinct `gates/*.ts`
   in the descriptor-wrapper findings are the legacy roster. Never quote a number from a document — EVERY roster in
   `docs/reviews/gate-runtime/` is a frozen snapshot and they are all stale (the conversion census counts a 255-module
   corpus against 271 today). Run this AFTER lanes drain, never beside a live lane.
6. Read `~/.claude/bridge/to-primary/` (ack SELF notes by `mv` into `done/`). Write a SELF note ONLY when a context
   sentinel fires or you are handing the session off. A SELF note is a POINTER, never a source: verify every state
   claim in it before acting (two of note 522's were false within the hour).
7. Know the doc layer before you brief anyone. `docs/reviews/gate-runtime/` holds 23 documents. Roughly thirteen are
   completed-family EVIDENCE. Live detail the guide delegates to: `uncovered-gate-conversion-census.md` (per-gate
   blocker, family, population, authority, source lines — the Phase D ordering source),
   `resource-gate-access-patterns.md` (the 53-row resource manifest, Phase C), `exception-authority-census.md` (the
   nine baseline ledgers' per-row disposition, Phase E), `shared-semantic-readers.md` (the M/O/G/V foundations — and
   its binding constraint that those are COMPUTATION GROUPS, so a lane must prove real shared consumption before
   naming a `family`), `ordinary-waiver-source-migration.md` §"Exact central grammar" plus its "Explicit
   non-migrations" fence, and `checkpoint-2026-09-05.md`. Two of them were written on the dead ATOMIC
   premise and carry superseded banners naming what is dead and what still binds; read the banner before citing the
   doc it sits on, and brief a lane off the banner rather than the body. Constitution §0.1 makes a lane follow a doc
   over your brief, so an unbannered stale premise misbriefs silently.

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

**Phase A — DONE, landed 2026-09-11 at `d21ece8d8`.** The mixed front door, the whole-corpus conformance stage
(#1941), both contracts read by `enforcement-registry-parity`/`gate-modernization`, and the `schema-fact-health`
retirement (#1948). What it gives you is guide §5; do not rebuild it.

**Phase B — three slots, after A.**

1. Marker backlog: resume `.claude/worktrees/agent-a588b7202b748d71e`, **checkpointed at `8f1b31897` (121 files) — the
   lane does NOT redo it, it rebases onto `main` first**. Both vocabularies are substantially translated: the
   `@owner-scope*` markers under `packages/server` AND \~110 CT files of `ONESHOT-OK`. mech-executor. The checkpoint
   contains **26 non-comment diff lines that must each be adjudicated** before merge, in two shapes: a trailing marker
   relocated across a ternary operand (`: db` split over a comment line — restructure so the marker sits above the
   whole statement, since formatting will move it), and trailing `ONESHOT-OK` markers DELETED with no `@orb-waive`
   replacement (each is either a dead marker, which guide §8.6 allows only if it is counted and listed, or a silent
   suppression loss). Also remove its two `p-marker-translate-scratch*.test.ts` files. Receipt: both families at 0
   blocking findings on the real tree, 0 unused markers, and either a clean
   `git diff -U0 | grep -vE '^[-+]\s*//'` or every exception listed with its justification. That receipt is only
   measurable AFTER Phase A's front door lands, which is why this is Phase B.
2. Proof rework: resume `.claude/worktrees/agent-a2dae218300f26638`, **checkpointed at `20550dc83` (3 files); rebase
   onto `main` first**. Item 1 was built under the SUPERSEDED scope (per-gate negative arms); correct it to guide
   §4.2 — positive same-position arm per tenancy policy, delete the vacuous negative arms — then item 2: the
   `test-no-stubs` cross-file fixture whose offsets must actually OVERLAP (the prior attempt's never did), plus its
   `@tests` header note. That fixture is an invented row for a new property, so it owes a planted break. This is
   #1935's rework, already Running and claimed; `review` → `verify` → verifier → `done`.
3. \#1946 guard residuals (Sonnet mech-executor; hook + its pin + `registry.test.ts`; both-direction pins; no-loosening
   A/B over the pin ROWS table).

**Phase B2 — make the CONVERTED corpus sound before converting more (owner, 2026-09-11: "I'd rather get our new
gates in a pristine place before converting old ones"). Precedes C and D.**

1. **#1955 — the LAST conformance failure.** `bus-fact-health`'s provider refuses over an isolated fixture, the same
   class #1953 was. Until it lands, `structure:policy-conformance` exits 2 and cannot serve as a bar. Everything below
   is cheaper once it is green, because a conversion then proves itself by landing. **Do this first.**
2. **#1952 — identity arms, ~32 of 86 remaining**, batches of ~8 by family. Self-checking (guide §4.2), so cheap and
   parallelisable. The `mustFlag`/`expect` half is CLOSED.
3. **#1954 residue** — `bus-on-data-no-store-write` reports a token containing a paren, which the marker grammar
   (`[^()\r\n]+`) cannot spell, so every waiver against it is malformed. One-line fix: report the bare identifier with
   an offset. `persist-partialize` and `section-factory` are DONE.
4. **Five converted modules have no family test** (`baseui-render-prop-composition`, `bus-on-data-no-store-write`,
   `membership-fan-guard`, `no-caller-user-id`, `no-external-media-without-gate`). Their declared rows now run via the
   conformance stage, but their §4.2/§4.5 pins have no home.
5. The two message overclaims the audit found beyond `no-color-literals`: the false "in className" context claim
   repeats in `no-raw-container-widths`, `no-raw-typography-in-features`, `no-raw-spacing-in-features`.

**Phase C — resource kinds (#1930). THIS IS DESIGN-FIRST, NOT AN EXECUTOR LANE.** It unblocks the most conversions
(11+ named gates, and the pattern recurs across the remaining 106), but the row itself says it owes THREE decisions
before any implementation, and a lane briefed without them can only refuse or paper over:

1. Which capabilities are RESOURCE KINDS versus `defineFact` PROVIDERS. The row's own analysis: the Base UI surface
   and token contract are whole-population facts wanted once per invocation, so they fit `defineFact`; path liveness,
   raw bytes and staged blobs are per-subject reads, so they fit resource kinds.
2. Whether `node_modules` traversal becomes declarable AT ALL. An installed `.d.ts` tree is neither authored nor
   currently declarable, so this is new vocabulary rather than an extension of the source-universe rule.
3. Whether the population algebra gains ONE reviewed, tested operator for directory-tier permission — it would shrink
   the path-liveness and sanctioned-home (#1922) work at once.

**Also note the path-liveness kind needs a FIXTURE-RUNTIME change, not just a kind:** `runResourceExample` only writes
files and cannot express a symlink, which that kind's proofs require. That makes it runtime work, adjacent to Phase A.

Ordering once the decisions land, by what each unblocks: path liveness (5 — `runner-config-path-liveness` plus the
four grant-liveness/`tsconfig-entry-liveness` siblings still on `lib/grant-liveness.ts`) → document/ledger facts (9)
→ CSS census and static-class parity (14) → Base UI installed surface (7) → token contract → tsconfig programs. Each
ships as a provider or kind with ready/missing/empty/unresolved receipts and its own controls. **No gate converts on a
kind before the kind lands**, and a conversion that keeps a private reader behind a `defineGate` wrapper lowers the
census while leaving the forbidden machinery in place — the exact false green the census cannot catch.

**`gate:contract`'s simple tier is blind to this by construction.** It is mechanical AST shape-matching on the
descriptor literal and cannot see what a gate READS, so "simple by gate:contract" is never "convertible". The
convertibility oracle is the proposed-vs-shipped diff in `resource-gate-access-patterns.md`.

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
   **If any assigned module appears in guide §12.7, that row is a world-program (#1351) guarantee the conversion may
   not break:** the lane re-reads the CURRENT implementation on `main`, re-derives the delta against the anchor
   (`git diff 6c8424806 HEAD -- <the policy and its readers>`), and carries the row's named proof, including its
   do-not-restore prohibitions. Those rows are why a conversion can look green and still destroy an invariant.
4. The exact module list with the pre-conversion SHA; the family hypothesis (a hypothesis until the lane names the
   reader); stop-if-missing-kind (refusal is a success, report the exact read); markers translated in-commit with the
   census recorded.
5. The fence: files it owns; sibling lanes' files it must not touch; `packages/**`/`tests/**` only for comment lines.
6. Floors, exactly as the guide §8.8; never whole-tree; runs over ten minutes report and stop.
6b. Fixtures: a proof row's `files` map is VIRTUAL (in-memory for source/types, an auto-cleaned tmpdir for resource) and
   its paths are population coordinates, not locations — see guide §4.8. A final policy never plants in the working
   tree and cannot. Probing a REAL file is the separate `cp`/`mv` rule; never `git stash`/`checkout`/`restore`.
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
4. Docs the lane added or rewrote: `pnpm format:docs` then `pnpm check:docs` (both exit 0), then `pnpm doc-catalog:write`
   for a rewritten doc or `pnpm doc-catalog:sync` to adopt a NEW one. Both exit 1 on the inherited ratchet rows (31
   pending debt paths plus stale `verifiedSha256` on three documents last touched 2026-09-05/06), so judge the run by
   `git diff docs/catalog/` and NOT by its exit code: keep it only if the diff touches the rows for documents you
   actually read. Never let a regeneration attest a document you have not read. Commit the catalog alone.
5. Post the receipt on #1584 (`gh issue comment --body-file`); rows: `review` + `verify --evidence` (< \~700 chars).
6. Dispatch one Opus verifier over the wave's merged commits (claims, exact fixtures to re-drive, census, the Sonnet
   assessment if a Sonnet lane is in the wave). On CONFIRMED: `done` with the identical evidence string. On REFUTED:
   `refute` with the spec; the fix goes back to a lane.
7. Fold the lane's lessons into the memory hub (`gate-migration-1584-lessons-hub.md`); if a correction had to be sent
   to a second lane, fix the FILE the lanes load, not the next brief.
8. **Tear down the worktree. This is YOUR job and it happens at EVERY landing, not at end of session** — nothing
   fires it automatically, and stale checkouts are not merely untidy: each one is a full copy of the tree, so every
   later repo-root `grep -r`/`find` returns one extra hit per worktree with a real-looking `path:line`. Eight live at
   once inflated a marker census 8x.
   Gate it on CONTAINMENT, measured, not remembered: `git rev-list --count main..wt/agent-<id>` = 0 AND
   `git -C <wt> status --short` empty means teardown loses zero bytes.
   **Then tear down through the SANCTIONED hook, never raw git:**
   `echo '{"worktree_path":"<abs worktree>","cwd":"<main checkout>"}' | .claude/hooks/worktree-remove.sh`.
   It refuses any path outside `.claude/worktrees/`, removes and prunes, and deletes only a `wt/`-prefixed branch.
   Critically it does one thing raw git cannot: if the worktree owns a live `snap --isolated` stage
   (`<main>/.cache/snap-stage/bands.json` records the owning checkout) it stops that ~7-process stack through snap's
   own door first. Remove the directory without that and the stage keeps running with a DELETED cwd, holding a band,
   a port pair and real CPU until the 60-minute idle keeper reaps it (#1848, two orphans observed 2026-09-06). If you
   ever do sweep by hand, check `bands.json` for rows whose `checkout` no longer exists and clear each with
   `pnpm snap --stage-down --stage-owner <dir> --force`.
   **The one thing containment does NOT cover:** deleting a merged lane's branch forfeits the warm leg, so a later
   REFUTED verdict costs a fresh cold lane instead of resuming that agent. So keep a contained-but-unverified lane's
   worktree until its verifier confirms, and sweep everything already verified immediately. A lane still holding
   uncommitted work or commits ahead of main is never swept — checkpoint it (§0.3) and leave it.

## 5. Lessons that bind (each paid for at least once; the incidents are in the memory hub)

- Fix the source, not the lane: a correction issued twice means the rule file is wrong.
- A SCOPED suite red is never baseline. The posture's red-by-construction list is exhaustive and covers nothing
  adjacent; re-derive any scoped family-test red on a clean tree and date it against the commit that broke it.
- Grep the docs for the governing rule BEFORE recommending a contract change: guide §12.3 and
  `resource-gate-access-patterns.md:126` already rule the absence-versus-unresolved question, and a provider is atomic
  by §12.2, so per-subject failure means per-subject PROVIDERS.
- Counting proof coverage is a READING task a script can only bound: a grep for `@orb-waive <id>(` matches sibling
  negative arms, live product waivers and header prose. Escalate to `verifier`, never `scout`, and require a
  per-subject verdict line so a miss surfaces as a missing row instead of hiding inside "none found".
- Verify a subagent's MECHANISM claim against the code before writing it into law, and before a lane acts on it.
- Cheap read-only agents return false cleans on exhaustive enumeration, silently and inconsistently. Enumerate
  mechanically and verify every negative yourself; delegate READING only for qualitative classes.
- A wholesale doc rewrite can keep every section title and still strip the protection. Diff the OLD section row by row
  before committing a rewrite of a law or handoff document; "no superseded sections are kept" licenses dropping
  history, never compressing a protection list.
- Measure a lane's base with `git merge-base`; never read it from the lane's own prose.
- A document naming what to PROTECT is read in full even when a table in your own guide summarises it.
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
