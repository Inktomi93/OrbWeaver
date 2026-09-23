---
kind: runbook
status: archived
updated: 2026-08-22
---

# Orbweaver recovery index (RETIRED 2026-08-22)

> **RETIRED by owner ruling**: the recovery path is now `.claude/rules/orchestration.md` (auto-loads,
> carries the standing posture) + `pnpm work:item overview` (the board is the mutable state) + the
> SessionStart auto-onboard hook. Everything below is frozen archaeology of the pre-retirement eras.

## Current-state snapshot — 2026-08-21 midday (supersedes any earlier snapshot block)

Codex subscription ENDED (not renewing); Claude is the sole agent system. The 2026-08-21 fix train
(board #382-#387, all Done) merged and its drain `pnpm check` is GREEN on main; the behavioral
battery run was aborted for load and is OWED. Since then merged: #390 host-seat unique index
pending-merge check, #393 P0 design doc (`docs/law/Core-Tooling-Law.md` — the tooling-package
program, owner review of its four open questions PENDING), #395 kit/time on Temporal (luxon residual
\= `{{datetimeformat}}` vocabulary, documented in macro/registry.ts header).

In flight (lanes resume via SendMessage; worktrees under `.claude/worktrees/`): stryker-v10 #394
(items 1-5 committed `6ac24b8aa` on `wt/agent-a5802b358a89ffddc`; gate calibration at
`--concurrency 6` + recommended `break` land as a 2nd commit, then orchestrator merges; a TS7
option-sanitization experiment is queued post-calibration), fix-usage-server warm leg on #396
(export-chat-bundle 5-test red on main — serde provenance superRefine refusing exported bundles;
receipt `reports/export-bundle-red-check.log`), host-index #390 (reported green: index + baseline
regen + 2 stale two-host fixtures fixed; final report/merge pending), tooling-package forge (#393,
idle awaiting owner P0 review; P1 = scaffold + gates + test infra continues in-lane).

Standing rulings this day (also in `.claude/rules/orchestration.md` + session-anchor memory): dev DB
is EXPENDABLE (wipes = ST-import exercises, no backup ceremony); heavy entrypoints run `nice -n 19`
(package.json, `32691051c`); lanes use `pnpm test:scoped <paths> --maxWorkers=4` / `pnpm ct:scoped <paths> --workers=2` (`aac3b20bd`); calibrations are orchestrator-scheduled; the dev stack SELF-HEALS
(vite prebundle law was stale — `db25e3d1d`); typecheck truth table corrected (`503f0d2c7` — only
per-package sees `.ct.tsx`; also `@base-ui` ambients make `types:graph` blind to global-type
questions).

Owner decision batch OPEN: speaker-picker honest-refusal exemption · serde bundle refuse-vs-degrade
(now live via #396) · backfill sweep scope · #374 motion-law carve-out for anchored-popup entrance
(Codex's handoff: option 1 recommended, receipts in its final report) · #285 glow carrier scope ·
`{{datetimeformat}}` Intl-vocabulary arm (lean: never) · tooling P0's four questions (launcher shims;
4 flag-for-delete audit scripts; record.ts at P3; gate-size exemption). Queued Ready: #388 #391 #392 #398 #400. Pre-push: behavioral battery + `pnpm verify --push` still owed
before any origin push (needs fresh owner word).

DELTA (later 2026-08-21): #390 + #396 merged and Done (host-seat partial unique index — next boot
regenerates the dev db, owner-accepted; serde now DERIVES provenance instead of refusing — #401's
refuse-vs-degrade decision effectively evidence-settled, owner nod pending). Static tier PASS on main
(3cbb9602a). Board reconciled: decisions #397 #399 #401 #402 in Needs owner; #398 #400 Ready; #403
(Drizzle 1.0) Parked wake=stable. UPSTREAM POSTURE (owner): drafts stay LOCAL text-only, never filed;
patches stay private pnpm patches. stryker-v10 lane (#394, `wt/agent-a5802b358a89ffddc`): merge main
in → dry-run → calibration at --concurrency 6; TS7 three-arm experiment running (path-normalization
mechanism found in typescript-checker's ts-native — conditional LOCAL pnpm patch + native flip ONLY if
arm A fixes verdict AND speed; calibration must run on the shipping checker config). Codex's FINAL
merge `837e73853` (its branch 3cbb9602a..837e73853: memory-retrieval teaching #331 + coarse widths
\#371 + Select motion calibration #374/#389, 44 files +3172) is UNDER REVIEW — stickler dispatched;
its verdict routes fixes before this merge is trusted. Codex residue cleanup = #400. LATE DELTA: the TS7 four-arm falsification
CONFIRMED one bug caused both symptoms; a one-line typescript-checker patch landed, native checker ON
in both configs (identical verdict to classic, faster); gate calibration running cold on the landed
config — its report brings the recommended break + non-comparability evidence vs the old 1,115-mutant
population. Two private patches now carried (core sandbox + checker path-normalization); NEVER filed
upstream (owner posture).

RITUAL DELTA (2026-08-21 evening, \~98% context): Stickler CLEARED Codex's final merge `837e73853`
(verdict: sanctioned shape; 3 LOW findings → #405; report
`docs/history/reviews/stickler/2026-08-21-codex-final-merge.md`, receipted). Owner decision batch RULED via
question tool, all four on recommended arms and closed Done: #397 gate the speak-as picker
(executable half filed as #406, Ready, P2/Client), #399 keep luxon forever (`{{datetimeformat}}`
grammar permanent), #401 ratify derive-not-refuse as standing parser policy, #402 accept sweep scope
as designed (ruling comment committed at the predicate, `7755e932c`). Needs-owner column EMPTY except
\#285 glow (needs rendered evidence, not a ruling). In flight: forge P1 tooling scaffold (agent
af38fe8da3abc32df, worktree `.claude/worktrees/agent-af38fe8da3abc32df` — \_shared promotion underway,
argv test relocated to tests/tooling/\_shared/, deletions-manifest row added; merges after report +
whole-tree check, then P2 snap pilot in-lane); stryker-v10 calibration (agent a5802b358a89ffddc,
watching sv10-calib.log for EXIT — its report brings score + recommended `break` as commit 2, then
orchestrator merges #394; evidence must record upstream-drafts-stay-local posture). Queued Ready:
\#388 #391 #392 #398 #400 #404 #405 #406. Plan of record for the tooling program: P0 doc
`docs/law/Core-Tooling-Law.md` (owner-APPROVED) + plan file `~/.claude/plans/jolly-churning-dove.md`
(P0-P9). Untracked residue (3 side-eye docs + .codex/config.toml) = #400's scope, leave in place.

VACATION POSTURE (2026-08-22 → owner returns; supersedes earlier deltas): OVERNIGHT MODE IS STANDING
(orchestration.md carries the full rule set — auto-loads every session; nothing here needs re-derivation):
drain Ready · lanes at cap · merge+barrier per train · file-claim-fix findings · Parked stays parked ·
Needs-owner accumulates (#431 colorization reach awaits the owner's eye) · never merge under a live drive ·
ready-dry fallback = side-eye every RAIL item + home screen (fix all identified, never score-chase) ·
claude-b overflow ONLY on a WEEKLY ≥85% usage sentinel (CLAUDE\_CONFIG\_DIR=\~/.claude-b claude -p, cold
briefs, verify receipts). Tooling program #393 COMPLETE (P0-P9). Neo parity RIPPED (#428). Recent Done:
\#376 #391 #392 #398 #400 #404-analysis #405 #406 #408 #409-#424 #426 #428 #291. Live lanes at this
snapshot: kill-assemble (#404 kill-tests), client-polish (#424+#429), audit-aspect (#430). Parked: #54
demo-seeding (wake=owner) · #403 · #418 · #425-closed. Pre-push bar unchanged: full battery + verify
\--push + FRESH owner word — never push origin.

This page is the cold-start entry point, not a backlog or a second source of status. Mutable work
lives in [Orbweaver Project 1](https://github.com/users/Inktomi93/projects/1); repository documents
hold durable law, programs, evidence, and history.

## Resume a session

1. Read the root `AGENTS.md`, then the task-specific reading set it names.
2. Inspect local truth: `git status --short --branch` and `git log -5 --oneline`. Local `main` may be
   ahead of `origin/main`; never substitute the remote branch for the current local tree.
3. Open Project 1's **Active board**, **Ready**, **Needs owner**, **Verify**, and **Parked** views.
4. Re-derive the issue against current code and evidence before claiming it. Use
   `pnpm work:item show <issue>` and `pnpm work:item claim <issue> --lane <lane>` for agent work.
5. Read the verification tier from `pnpm verify --list`; a static green does not prove behavioral
   completion.

## Authority map

| Need | One home |
| - | - |
| Mutable status, priority, dependencies, lane, review, evidence | [Project 1](https://github.com/users/Inktomi93/projects/1) + its issues |
| Architecture and standing product rulings | `docs/law/` and the D-ledger |
| Agent delegation, worktree, merge, and overnight process | `.claude/rules/orchestration.md` (root `AGENTS.md` imports every Claude Markdown rule for Codex) |
| Committed future programs | `docs/architecture/proposed/INDEX.md` + one Project sprint issue per program |
| Re-derived reviews and reports | `docs/reviews/`, routed to a Work, Decision, or Program issue |
| Documentation inventory and fact-check receipts | `docs/catalog/catalog.json` + `docs/catalog/receipts/` |
| Frozen pre-Project workboard, owner-ruling provenance, and old queue | `docs/history/retro-workboard-2026-08-14.md` |

## Hard stops

- Never push `origin` without fresh owner authorization for that push.
- Never resume work from a checkbox or status line in the frozen workboard. Re-derive it and use the
  corresponding Project issue, or create one from current evidence.
- Never mirror Project status into prose. Leave a durable result or evidence link in Git and let the
  issue own the lifecycle.

If GitHub Project access is temporarily unavailable, continue safe read-only or local verification
work and record no substitute queue. Project state is authoritative again when access returns.
