---
name: orchestrator
description: "Orchestration for orbweaver: role routing, briefs, lane cap, merge trains, the barrier, worktrees, pushes, session start, the claude-b bridge. A SessionStart hook injects it into every main session."
---

# Orchestrator

The orchestrator plans, decides, and judges. Lanes do the volume and the execution.
Quality comes from verification, not from model size.

Do not delegate a single read you need now, a decision, or anything the user asked you to judge.

CodeGraph's server instructions say to answer directly instead of delegating a lookup; that line is about a raw grep-and-read loop, not about role routing. Keep dispatching lanes for their own work; use `codegraph_explore` yourself only for the briefing facts you would otherwise read for.

## Role routing

| Work | Role |
| - | - |
| Search, lookup, "where is X" | `scout` or `Explore` |
| Fully specified mechanical work, bulk edits, suite runs | `mech-executor` |
| Implementation that needs judgment | `executor` |
| New subsystems, wide coupled changes, migrations, where the design is the risk | `forge` |
| Authn, authz, secrets, crypto, validation, CSRF, hardening | `security-executor` |
| Logic, data, or server correctness review | `verifier` |
| Rendered, visual, or accessibility review | `side-eye` |
| Deep pre-merge review of a branch or a hard investigation | `stickler` |
| Off-budget mechanical volume on the local model | `qwen-run`; load the `qwen-lane` skill first |

- Use `forge` only when a cheaper failure would cost more than the forge run.
- Never do security work yourself or route it to a role whose model is `fable`.
- Send a trivial diff to `verifier`, not `stickler`.
- A change that spans server and UI gets both `verifier` and `side-eye`.
- After two failed attempts at one tier, go up one tier or do the work yourself.

## Models

- Dispatch a named role with no `model` override. Each role file declares its model and effort.
- Set `model` on every ad-hoc agent and workflow fan-out. The default, `inherit`, runs the main model.
- Change a role's model in its role file, never at dispatch. The `agent-authoring` skill owns role files.
- A running session keeps the agent and skill definitions it loaded. Test an edited role with a fresh `claude -p --agent <role>`; the owner runs `/reload-plugins` to pick it up here.

## Lane shape

- Give each lane a substantial batch across related areas that share context, dependencies or acceptance checks.
- Include implementation, coupled tests and required documentation in the same assignment. Name ownership for each area.
- Split lanes for independent work or different required expertise, not for each file or small item.
- Follow the `lane` skill's commit policy. Batch related corrections before the final commit so the commit check runs once.
- File a review pass's P3 findings as one bundle item per surface, not one item per finding.
- Dispatch independent lanes in parallel. Keep working while they run.
- Send a second task in a live lane's area as a SendMessage leg, never as a fresh spawn.
- A leg to a merged lane fast-forwards its branch to main's tip and stacks new commits. Never ask for a second worktree.
- Resume a lane killed by an API error with SendMessage to the same agent id. Quote its last output line.
- Send a finished lane nothing until there is real work. A message resumes it, and it acts on any hint in it.
- Keep a map of lane name to agent id. Reply by agent id; several lanes can share one role name.
- Stop a runaway lane with TaskStop.

## Lane cap

Run at most three lanes at once. Raise the cap only on an explicit owner ruling, written here.

- Let over-cap lanes finish. Never refill above the cap.
- Start gate-heavy lanes minutes apart. Simultaneous verification spikes load and makes gates flaky.
- Before the first dispatch or whole-tree run of a session, do the pre-flight below.

## Pre-flight

1. Read the stack state with `ss -ltnp` and `pnpm stack status` from main. The model engines are the owner's box tooling outside this repo; never start or stop them.
2. If no live drive needs the prod stack, run `pnpm stack down prod` from main.
3. Before you reason about how long a background run has lasted, run `stat --format=%w <log>`. The harness can start a deferred run long after you asked.

## Before dispatch

Re-derive the item first:

1. Run `git log --oneline -5 -- <main path>`.
2. Read the cited `file:line`.
3. Run `git log --all --grep="<key noun>"`.

- A claim that work is unbuilt needs the same evidence as a claim that it is done.
- Re-derive a data-binding claim from the ledger, not from memory.
- Before you state that a doc approves or blocks something, read that clause in the doc.
- A brief that quotes a law step re-checks the step's premise on the tree.
- Before you route an item to a live lane, confirm the measured commit is an ancestor of the lane's HEAD. Otherwise re-derive on the lane's tip.
- Your rules are from session start, and `EnterWorktree` does not reload them. Read the rule files from the tree before you brief a change to them.

## What a brief carries

A subagent gets its role body, its preloaded skills, `AGENTS.md`, git status, and your message. It does
not get your conversation, your reads, or your output style. Write each brief so a cold reader can finish.

- The goal, the reason, the constraints, the done-criteria, and the paths, in one message.
- The outcome and the evidence you want. Name a mechanism only with `path:line` proof that it is the ruled home; otherwise ask the lane to find it.
- The contracts to read first: `packages/contracts/src/<domain>/`, the domain's own `contract/`, and the drizzle schema files it touches.
- Scope limits against sibling lanes, and the hunk regions when two lanes share a file.
- A lane-unique prefix for scratch files.
- The exact CT files and suites its floor runs.
- That a correct refusal with evidence is a success.
- The hazards you know for that area.
- For an investigation, the instrumentation steps: log each boundary from client payload to server input to db row to read-back.
- For work that produces text (a spec, a doc draft, owner-facing copy), a `docs/` path to write it to. A report alone is lost.
- For a `docs/**` lane, the floor that the docs path rule names.

The `lane` skill carries the standing lane rules. Restate only the deltas.

## Before calling work done

- Assign verification ownership in the brief. Reuse completed lane checks under the `lane` skill's completion policy.
- Call work done after its applicable checks. Use `AGENTS.md` to decide whether the barrier is required.
- Use fresh-context review for substantive code changes. Review routine prose and configuration edits directly; add independent review for a concrete correctness or security risk.
- For a multi-wave program, run one `verifier` pass per wave over every change landed in it. That pass covers each item; spawn no second `verifier` per item inside a covered wave.
- Call `side-eye` for a new UI surface or redesign, imagery or effects near text, settings panes, forms, wizards, empty, error, or loading states, and any accessibility doubt. Skip it for backend-only changes.
- Treat scout findings as input. Check the important ones before you act on them.
- Before a status report, check each "dispatched", "filed", "queued", or "merged" claim against the dispatch map and the tree. Retract an unsupported claim in the same message.
- To sweep finished lanes for dropped follow-ups, read each lane's last message in full. A keyword search misses other wording.

## Merge trains

A merge train lands several drained lane branches on main. The barrier is `pnpm check`, run on main
after the train.

1. Run `scripts/commit-msg-check.sh --range main..<branch>` for each branch. Reword a refused commit on the branch.
2. Check that no whole-tree check is running. A merge during a whole-tree check voids it, because it reads the working tree.
3. Merge. Confirm HEAD moved with `git rev-parse HEAD`. A fast-forward prints its "Updating" line before checkout can still refuse.
4. Run the barrier alone, with no live lanes running gate-heavy checks.
5. Read the verdict from `reports/verify.json` and the slot the run printed.

- Fold a drained branch when it arrives. Do not hold it behind a running check; a check that finishes on an older tip is not the new tip's verdict.
- A merge that combines shared-interface edits needs typechecking. The barrier covers it; run a separate typecheck only for earlier feedback.
- A merge touching `packages/server/src/transport/trpc/routers/**` runs `tests/server/transport/cross-tenant-sweep.suite.int.test.ts` first.
- The sweep does not cover a room's resume read. A merge touching a room's `authorizeAttach` or replay verb also runs that room's recipient-scope test, for example `tests/server/domain/notifications/verbs/replay-since.int.test.ts`.
- A merge restarts the dev server and clears the in-memory recorders. Never merge while a live drive depends on them.
- `pnpm check:ledgers-fresh` fails when a merge shifts the lines a ledger row cites. Run the regeneration yourself on the merged tree. Lanes only hand-edit their own row.

## Stopping checks and commits

- Stop a running check only in its own checkout; other checkouts and the other account share the box and the host verify slot. Send SIGTERM to each verify process whose working directory is under the checkout; the runner stops its own stage tree. The first `case` pattern keeps the main checkout's recipe off its nested worktrees: `C=/abs/path/to/checkout; for p in $(pgrep -f 'verify/cli\.[t]s'); do case "$(readlink /proc/$p/cwd)" in "$C"/.claude/worktrees/*) ;; "$C" | "$C"/*) kill -TERM "$p" ;; esac; done`
- A task notification that says "stopped by main session" comes from the Claude Code stop path: `TaskStop`, the task dialog, or a remote stop request. No repository hook or verify path produces it. Check your own session before you look for a killer in the tree.
- An amend with nothing staged makes pre-commit a no-op. It is not evidence that any check ran.
- Start one background git chain at a time. Wait for it to finish before you start another.
- Never chain another write behind a merge that can conflict. A conflict mid-chain commits conflict markers.

## Hooks and pushes

- Lanes and you commit through the hooks. Only the user or you may authorize a specific bypass under measured load. Use `LEFTHOOK_EXCLUDE=check git commit …`, which keeps the commit-msg check. Record the reason and the owed checks in the commit message, then run them when the train is quiet.
- Main integration is yours. Pushes are the owner's.
- Never push `origin` without fresh owner authorization for that exact push.
- Never commit while a push runs.
- Verify a push with `git ls-remote origin refs/heads/main`, not the printed summary.
- Local `main` is the base for worktrees. Spawn and rebase lanes from it, never from `origin/main`.

## Main checkout

Lanes can share main's checkout with you.

- Stage and commit on main by exact pathspec. A broad `git add` sweeps a sibling's probe into your commit.
- Before you report, run `git status --short` and account for every line.
- Probes follow the `lane` skill, Probes.

## Dev stack

- The dev stack reloads itself on source changes. Do not restart it for a merge or an edit.
- Restart it only after a `.env` edit, `pnpm install` or a dependency change, an edit to a supervisor script under `tooling/src/stack/`, or an engine-posture change.
- Stop the dev stack yourself when a live e2e run needs it stopped, and restart it after. A lane never stops it.
- To check what the stack serves, run `curl :5173/@fs/<abs path>` instead of a restart.

## Worktrees

- A dispatch with `isolation: "worktree"` gets a working tree from `.claude/hooks/worktree-setup.sh`. Never brief `pnpm install`.
- A manual `git worktree add` runs only git's post-checkout hook. Run `pnpm worktree:bootstrap` after it.
- Codex app worktrees use `.codex/environments/environment.toml` for setup and cleanup.
- Before manual removal, run `env -C <worktree> bash scripts/worktree-cleanup.sh` to release its Snap stage.
- Worktrees stay after an agent finishes. Sweep them by hand at session end.
- Scope a sweep to `.claude/worktrees/agent-*`. Other directories there, and trees listed elsewhere by `git worktree list`, belong to other sessions.
- Never remove a lane you might resume. A leg sent to a deleted worktree fails.
- Before teardown, run `git status --short` in the worktree and read the lane's `git show --stat`. A lane can report files it never committed.
- Sweep steps: `git worktree remove --force <dir>` for registered trees, then `git worktree prune`. Delete a `wt/*` branch only after `git rev-list --left-right --count main...<branch>` shows 0 on the branch side.
- Never `rm -rf` a registered worktree. It strands the registration.
- A worktree directory with no `.git` sends `git -C` up to main.
- If a killed task leaves a lane worktree with staged changes and no `MERGE_HEAD`, run `git reset --hard HEAD` in it and redo the step. The branch holds the commits.
- An `isolation: "worktree"` lane always branches from the main checkout's HEAD. `.claude/hooks/worktree-setup.sh` takes the git common dir's parent as the root and that root's HEAD as the base.
- When you orchestrate from a worktree, land your work on main first, or run lanes on the shared tree with disjoint files and pathspec staging.
- Never set `enableGlobalVirtualStore`. It breaks tsc and type-aware lint.

## Autonomous mode

Run autonomously only when the user says overnight, finish, or keep going.

- In that mode, re-derive, dispatch, merge, and run the barrier while safe work exists.
- Stop only for a destructive or irreversible action, an owner-reserved product choice, a scope change, or a push.
- The engines and the dev stack are yours to start and stop without asking.
- Before a decision becomes a question for the owner, try in order: a `stickler` pass, `pnpm ast` on the code, the docs and the ledger, then your own judgment.
- When the authorized queue is complete, report the result and stop. Run a broader UI audit only when requested.
- When the owner is present, batch questions and put the recommended option first.

## Tracking work

The board is `docs/work/`, and you own every state change on it. Read `.claude/rules/docs.md` "Work items" before your first board write in a session; it holds the states, the `blocked` grammar and the landing rules.

1. At session start, act on each `drift` line the onboarding prints. Each line names its fix.
2. At dispatch, run `pnpm doc set <id> doing --lane <branch>`. The lane value is the lane's exact branch, `wt/agent-<id>` for a worktree lane.
3. Tell the lane to end its closing commit with a `Closes: <id>` trailer. The merge hook lands the item on `main`.
4. For work committed on `main` itself, land it with `pnpm doc land <id> --evidence <sha>` once a verifier confirms it. A landing prints the board's `drift:` lines; act on each one, such as folding a drained plan into an ADR or law.
5. File a lane's out-of-scope finding with `pnpm doc item "<title>" --kind … --what … --why … --done …`. The title is positional.
6. When a lane stops with its item unfinished, set the item back to `open` with the reason in its Evidence section.

Run `pnpm doc <verb> --help` for one verb's flags. Read `pnpm doc overview` and `pnpm doc drift` bare; their output is short.

- For any `gh` write, use `--body-file`. `gh` runs backticks inside `--body`.

## Lying instruments

Diagnose an instrument failure far enough to identify its effect on the requested verdict. Repair it within the task's scope, or report the blocker separately. The tooling path rule owns instrument repairs.

- Assign a blocking gate repair explicitly before dispatching work that depends on it.
- Commit requested implementation after its applicable checks and review. Do not add review rounds after completion.
- File a review finding outside the item's done criteria as a new item, then land the item. Otherwise review rounds never end.

## Session start

At startup, resume, compaction, and clear, `.claude/hooks/orchestrator-inject.mjs` injects this skill into a
main session, and `.claude/hooks/session-onboard.sh` prints your account, the bridge inbox, the claude-b
registry, and the worktree state. Do not load this skill again. Follow the onboard first actions.

- Set up MCP servers and connectors before work starts. Changing one mid-session drops the prompt cache.
- Resume live lanes by SendMessage to their agent ids. Never respawn them.
- A context sentinel carried over from before compaction is stale. Act only on a new one.
- When a new context sentinel fires, follow its ritual. Write a `SELF` dispatch-map note in the bridge only then, or on an owner-ordered handoff.
- A weekly usage sentinel means stop opening lanes and land what is in flight.

## claude-b and the bridge

The session-onboard hook tells you which account you are. If you are claude-b:

- Prefix lane names with `cb-`.
- Never delegate to the other account.

Only the primary account commits on main's checkout. claude-b lands through a worktree branch that
the primary merges.

- Delegate overflow to claude-b only when a usage sentinel labeled `[primary]` fires. A `[claude-b]` or unlabeled sentinel is not the trigger.
- Read `~/.claude/bridge/SESSIONS.md` first. Resume the standing session; never start a new one.
- Launch detached, with a complete cold brief: `setsid nohup bash -c 'CLAUDE_CONFIG_DIR="$HOME/.claude-b" claude --resume <id> -p "<brief>" > <log> 2>&1; echo "EXIT=$?" >> <log>' >/dev/null 2>&1 &`.
- Check completion with `grep '^EXIT=' <log>`. Check liveness with `ps ax | grep '[.]claude-b'`.
- Treat claude-b output like any lane report. Verify its evidence.
- Never route a denied action through claude-b.

Cross-account messages go through `~/.claude/bridge/`. `~/.claude/bridge/PROTOCOL.md` owns the
format, numbering, and message kinds. Read it before you write a note.

- Write each note in one shot. The bridge plugin delivers a `bridge: new note N` event for every write to your inbox.
- Send with `claude-bridge send` (the bridge skill). It numbers the note under the lock.
- Ack a note by moving it into its inbox's `done/`.
- Keep lane-state notes in the session scratchpad, not in a bridge inbox.
