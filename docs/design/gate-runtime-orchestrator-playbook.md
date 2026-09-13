---
kind: runbook
status: active
updated: 2026-09-13
---

# Gate-runtime orchestrator playbook

Procedure only. Read [`gate-runtime-read-first.md`](gate-runtime-read-first.md), then the standing law in
[`gate-runtime-standardization.md`](gate-runtime-standardization.md). GitHub Project 1 and the refutation ledger own
mutable work; this file contains no row roster or wave-status table.

## 1. Start or resume a session

1. Inspect the current runtime's mutation controls. Claude hooks and bridge state do not establish Codex behavior.
2. Inspect main status, recent commits, and every worktree. For each worktree, measure `main..HEAD` and dirty state.
   Checkpoint tracked changes in an abandoned dirty lane before any cleanup.
3. Detect the engine fleet from `.cache/stack/engines.pgid`, `.cache/stack/engines.stopped`, and ports 8701–8703.
   Validate PID start ticks; a dead record without the stopped marker is uncertain state. Do not infer process presence
   from shared-memory size or a self-matching process grep.
4. Read `pnpm work:item overview` when choosing work. Re-derive candidate rows against current source before claiming.
5. Re-derive the final/legacy roster with `pnpm check:policy-conformance`; use `pnpm gate:contract` only for descriptor
   shape. Run these after active lanes drain when they compete for the box.
6. Read the three gate docs in the order in `gate-runtime-read-first.md`. Open other evidence only for the current
   family or question. Read contract headers before ruling on contract semantics.

Nothing in the conversion program may remain legacy merely because a capability is missing. Build a shared capability
when the law admits it. A lane asks and continues with a stated default when it needs a reader, helper, fixture, or
ruling. It stops only for work outside its fence or an unresolved design decision.

## 2. Select and claim work

The board and refutation ledger determine current work. Re-read the cited source and recent path history before putting
a row in a batch. Claim every row at dispatch and verify its Lane field. Treat historical refusal, Verify status, and a
prior audit as claims against an older tree.

Order work by the hard dependencies in the law. Do not reorder merely to fill slots. Group a bounded family or 4–8
related defect rows when repository policy and current capacity permit. Conversion work lands on #1584; defects,
prerequisites, and decisions use work items.

Dispatch implementation before bookkeeping when capacity is available. Reuse the authoring lane for a refuted warm
leg when its worktree remains safe and current.

## 3. Brief a lane

A brief carries:

1. Lane name, goal, and why.
2. Exact module list, current base, pre-conversion revisions, and the family hypothesis.
3. Full text of assigned board rows; a bare issue number is insufficient.
4. Required reads: the standing law in full, the current enforcement row, assigned modules and tests in full, their legacy source,
   the one relevant family record, and any inherited world-program guarantee.
5. File ownership and exclusions. Marker-only product/test edits belonging to the converted owner are inside its lane.
6. The lane-local verification floor and the coordinated checks reserved for the orchestrator.
7. Ask-versus-stop behavior and the expected report shape.

Brief repository standing facts by pointer. Restate only task-specific hazards and deltas. A reading assignment reports
every file read and every file omitted; grep-derived sampling does not satisfy a full-read requirement.

## 4. Conversion procedure

1. Read the active enforcement-row mechanism, final module, helpers, tests, exemptions, and the legacy module at its
   supplied revision.
2. State the actual evidence plane, authority, severity, execution mode, population, and family reader. Use the
   smallest complete contract.
3. Read the legacy predicate separately from its message. Port the predicate; repair a false message.
4. Carry every legacy proof row, then add only required missing, changed, identity, refusal, liveness, and differential
   controls under law §6.
5. Classify every private exemption and marker. Translate each live occurrence in the same commit, once per grammar
   kind; list intentional dead deletions. A gate with live markers and no product/test diff translated nothing.
6. Sweep coupled tests by gate id string and by assertions derived from the shrinking legacy roster. A split also runs
   `enforcement-registry-parity`, whose registered-policy total changes without naming the new id.
7. Run the scoped floor: touched family tests; `pnpm gate:contract` before/after; Biome and ESLint on touched files;
   every affected native TS program; affected product behavior; marker reconciliation; and the conversion differential.
8. Report population port, authority/severity, family and reader, proof changes, differential, marker census, refusals,
   deviations, exact checks, commit, status, and stat.

Marker translation includes per-file accounting in the conversion commit. Compare real legacy markers with their
final successors: increases require verified split tokens; decreases require each deletion classified as dead,
unwaivable with measured carrier/token evidence, or a lost suppression to repair. Verify each surviving marker binds
and reconcile the complete census; a raw count or “pre-existing debt” label cannot explain a missing suppression.

Final proof fixtures are virtual or tmpdir-backed. A real-file cut uses a uniquely named sibling scratch module or a
recoverable copy/restore sequence, never Git stash/checkout/restore. Do not run whole-tree checks from a conversion
lane.

## 5. Land a lane

1. Read the report. Verify the commit, diff, status, base, and named check results.
2. Integrate the reviewed commits under the repository's current commit policy. Never rebase a live lane. For a
   released lane, reconcile against current main before landing; use a coordinated rebase or cherry-pick and inspect
   the resulting diff, including conflict resolutions.
3. Run the lane floor again on main. After each gate-module merge train is quiescent, run whole
   `pnpm check:policy-conformance` and read all three proof-arm counts, grant results, invalid count, and exit.
   Serialize this with the other whole-tree checks; do not run it alongside active gate-heavy lanes.
4. Post the conversion receipt on #1584. Move defect rows to Verify with exact evidence; do not mark program work Done
   before independent confirmation.
5. Dispatch an independent verifier over the merged wave or bounded change set. On refutation, return the precise fix
   to the warm authoring lane.
6. Fold repeated corrections into the law or procedure source after verifying the mechanism. Chat, a bridge note, and
   a GitHub comment are transport, not the durable home of a standing rule.

For rewritten docs, format and check them, then re-attest only documents fully read. Regenerate the read-first cost block
on the exact committed set of priced bytes; a generated value measured beside an uncommitted priced edit is invalid.

## 6. Coordinated verification and serialization

The orchestrator/verifier owns whole-only `pnpm check:policy-conformance`, `pnpm check:structure`, and
`pnpm check:structure-delta`. Read per-policy raw, waived, granted, and effective findings; authority alarms; tool errors;
and withheld status. An inherited aggregate red does not excuse a new result. Use explicit run ids when the default
comparison baseline has not been verified.

Only one `check:structure` leg runs box-wide. It never overlaps a fixture-planting suite in either direction. The
planting suites and structure legs are serialized because overlap creates a non-verdict even when the artifact looks
plausible. Let an already-started planter finish; killing it does not recover trustworthy state.

Run the barrier tail once on the tree that will stand: fold waiting lanes, fix newly surfaced red through the owning
warm lane, then run structure, delta, planting/tooling suites, lint, size regeneration, and doc formatting in their
governed order. A merge during a check voids the check.

Every verifier report contains an exact `## LEDGER ROWS (N rows)` section. Append it inside the ledger fence before
`## CLASS ROLLUP`, assert N, and rebuild rollup only at a quiet barrier. A verifier-found defect receives both a ledger
row and board row; the fixing commit flips its ledger state.

## 7. Worktree retention and teardown

Teardown is never the default. Remove a worktree only when all four conditions hold:

```text
contained: zero commits ahead of main and clean
and not live: no running agent owns it
and not awaiting a verifier
and not wanted for a warm leg: no open row targets its owned modules
```

Containment alone is insufficient because a live lane between commits can be clean and zero-ahead. Keep unverified
lanes for correction. Checkpoint dirty abandoned work before deciding anything.

Use the sanctioned worktree-removal hook so any isolated Snap stage is stopped and its band released. Raw directory or
Git removal can orphan a stack with a deleted cwd. If manual recovery is unavoidable, reconcile missing checkout paths
in `.cache/snap-stage/bands.json` through Snap's stage-down door.

## 8. Runtime distinctions

Claude account/bridge instructions apply only to Claude sessions. Codex uses its actual agent, memory, worktree, and
tool state; it does not assume Claude SessionStart hooks, inboxes, model-role inheritance, or cross-account division.
Both runtimes still obey repository ownership, board lifecycle, verification floors, serialized heavy checks, safe
teardown, and the prohibition on pushing without fresh owner authorization.

Keep the dev stack and model engines in the posture requested for the current run. Starting the stack can start engines
through server-loaded environment even when a host supervisor is disabled; verify server-visible configuration rather
than editing `.env` silently. Browser harnesses that own isolated stacks should start them through their own entrypoint.
