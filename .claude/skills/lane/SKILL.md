---
name: lane
description: Preloaded by every build and review role. The one home for lane commit, staging, probe, red-first, long-run and when-to-message rules.
---

# Lane

A lane is a subagent that works one area in its own worktree. These rules bind every lane.
`.claude/hooks/tool-guard.mjs` refuses unsafe command spellings and names the correct form; use that form.

## Start

- Do not re-read `AGENTS.md`; it is already loaded.
- Read the router row for your task, the path rules that load for your files, and the header of every file you touch.
- Treat a brief's mechanism claims, and any list in a doc, as hypotheses. The brief's symptom and rulings bind.
- Before you build a mechanism, check whether it already exists under another name.
- Re-derive a data-binding claim from the ledger, not from memory.
- A precise refusal is a success. A guessed implementation is not.

## Scope

- Do what the brief asks. Do no drive-by cleanup, speculative abstraction or unrequested features.
- Treat brief boundaries as collision guards with sibling lanes.
- Never spawn agents, including through `claude -p`. If the task needs another role, say so in the report.

## Ruling forks

When a finding collides with a recorded ruling, keep the old mechanism and satisfy the new symptom. Report the fork with evidence, your default and a deadline, and keep working. Never reverse a ruling silently, and never stall on it. When a defect traces to owner-ruled law, the fork report is the deliverable.

## Git

- Pass `git -C <worktree>` on every git call. The shell cwd resets, and a `cd` into a worktree is refused.
- In your own worktree, `git add -A` is fine.
- On main or any shared tree, stage and commit by exact pathspec. `git stash -u` or a bare `git commit -m` can sweep a sibling's files.
- On a shared file, check your edit per row id, not by line count. A count can match by accident.
- Make one commit per leg. Stack follow-up legs as new commits; never amend a merged commit.
- Merge main into your branch through the hooks. Only the orchestrator merges to main. Only the owner pushes.

### Commit

- Commit through the hooks. Pre-commit runs `pnpm verify --static --changed`, which takes no host-wide slot; commit-msg runs `scripts/commit-msg-check.sh`.
- Write the header as `type(scope): subject`, name the floor you ran, and end with a `Co-Authored-By` trailer.
- Keep your own checks scoped. Do not run the full battery only to commit.
- Bypass a hook only when the user or orchestrator names the exception. Use `LEFTHOOK_EXCLUDE=check git commit ...`, which keeps the commit-msg check, and record the reason and the owed checks.

### Read your diff

- Read your own diff before you commit.
- An Edit inserted directly above a declaration can land between it and its JSDoc.
- A `Bin` count on a `.ts` or `.tsx` file in `git show --stat` means a NUL byte in a template literal.
- Classify diff ownership only when main is your parent. Run `git rev-list --left-right --count main...HEAD` first.
- Before you report, `git status --short` must be empty. `git commit -- <pathspec>` skips untracked files, which die at teardown.
- Include `git show --stat <sha>` in the report.

## Probes

- Probe a gate or linter with an untracked scratch file at a path the tool scans, then delete it. Not under `**/__probe*`: it is gitignored.
- Probe a real file with `cp f f.bak`, then `mv f.bak f`, one command per Bash call, then run `git status`. A refused chain drops its restore silently.
- Never undo a probe with `git stash`, `git checkout <path>` or `git restore`. They destroy uncommitted work.
- Never run `git show HEAD:<path> > <path>` over a file created this session. The redirect truncates it first.
- On a shared tree, message the orchestrator with the paths before you start and after you restore.
- Put other scratch files in the session scratchpad. Prefix each name with your lane name.

## Red first

- Run a new test against the unmodified source first. Confirm that it fails.
- A test that passes before the fix proves nothing. Plant a positive control that it catches.
- Write old-source proofs against the old API, and assert through what the user sees.

## Regenerators and shared files

- Never run a whole-tree regenerator in a lane, for example `pnpm prose:baseline` or a ledger freshness regeneration. The orchestrator runs it on the merged tree.
- Hand-edit your own row only, or use the gate's line-adjacent escape marker.
- Run `pnpm format:docs` on a shared file only before your edit. A later format turns sibling context into your diff.
- Two lanes may edit one file when both declared their hunk regions through main. Do not move hunks to dodge a merge.

## Running tools

- Run tests with `pnpm test:scoped <paths>` and `pnpm test:ct <paths>` through `env -C <worktree>`.
- Use a named pnpm script, else `pnpm exec <tool>`. `npx` and a bare `node tooling/src/...` lose the heap floor.
- Run scoped ESLint as `pnpm exec eslint <files>`. `pnpm lint:eslint` is whole-repo and takes no paths.
- Run scoped Biome as `pnpm exec biome check <paths> --diagnostic-level=error`. A scoped `--write` is fine.
- Pass a worker flag only to go below the values in `tooling/concurrency-profile.json`.
- Get a long mutation or calibration run approved by the orchestrator before you start it.

### Typecheck

- `pnpm typecheck` checks every program. For a scoped run, pass `--config <tsconfig>` once per affected program.
- `pnpm test:types` runs the `.test-d.ts` assertions separately.
- A floor claims only the configs it ran. If unsure, plant a type error and see it fail.
- A worktree typecheck cannot prove an `@orb/*` exports-subpath removal. Say so, and leave it to the barrier.

## Floor

Your floor is the tests you touched, a scoped typecheck, Biome and ESLint on your files, the scoped gates, and every CT file for your change by path. Static checks never run a CT.

List each command and its result in the report. The whole-tree check is the orchestrator's.

## Checker failures

- Exit 134 or 137, a heap abort, a kill or a timeout means no verdict.
- Prove contention with a quiet re-run at fewer workers. Otherwise the failure is a finding, as is an OOM under the shipped CT ceiling.
- Prove a CT flake with `pnpm test:ct <paths> --repeat-each=<n>`. Prove a node-suite flake with sequential runs.

## Long runs

- Redirect a run under ten minutes to a log: `<cmd> > <log> 2>&1; echo EXIT=$?`. Read the log in a later call of the same turn.
- Start a longer run detached with its exit code written to a file. Report the log path and stop; the orchestrator resumes you.
- A finished turn is never woken by its own background job.

## Rendered proof

- Verify anything a user sees at the rendered level with `pnpm snap` or a CT, or flag it for side-eye.
- `:5173` serves main, never your worktree. Use `pnpm snap [route] --isolated --ref <sha>` or the CT browser.
- Verify the fix where the defect was reported, and verify what the model actually receives.
- Seeded rows are not evidence. An empty per-user read only shows which principal asked. Name the principal.

## Dev stack

- The dev stack reloads on source changes. A merge respawns the server and clears the in-memory recorders.
- Never restart or stop the stack, the fixture or the engines. Tell the orchestrator.
- A live e2e run needs the stack stopped first. Ask the orchestrator; only it stops the stack.
- Prove a served module with `curl :5173/@fs/<abs path>`. Check liveness with a bare `pnpm snap`, never a log tail.
- Verify a launcher change with typecheck, unit tests and `buildEngineArgv` snapshots.

## CLI hazards

- Join optional flag values with `=`, as in `--json=<scratch path>`. A bare value can become an output path and overwrite a file.
- Spell out rg flags. `-r` inside a flag cluster replaces match text.
- Never `pkill` by name. Kill your own process group.
- Biome on a gitignored path checks zero files. That is not a clean result.
- A glob such as `packages/*/tsconfig.json` inside a block comment closes the comment. Use a line comment.
- To hoist a literal into a const, replace only the use sites. A `replace_all` also rewrites the declaration into `const X = X`.

## Legacy-main

- Read `legacy-main` as a branch: `git -C <repo> archive legacy-main | tar -x -C <scratchpad>/legacy-main`.
- Never check it out, add a worktree for it, or copy it into the tree.
- Port from it hunk by hunk. Diff it against the current file and lift only the named hunks.
- Scan its SillyTavern code with `ast-grep` for both `js` and `html`. A js-only scan misses code inside HTML files.

## Build details

- Name test hooks `__reset<Noun>` for state resets and `__<verb>ForTest` otherwise. A hook reached by a computed name ships with the literal search that finds it.
- Generate TypeID fixtures with `mintTypeId`, never with literals.
- Declare a union with `satisfies` when Biome misreads a zod `discriminatedUnion` transform.

## When to message the orchestrator

Send a mid-run message only when you are about to change a real file on a shared tree, your premise is refuted, you hit a ruling fork, or the environment is lying: a stale server, a wrong build, a thin stage db, a held port, or a checker OOM or timeout.

Name your lane, state your default, and keep working. Send nothing else.

## Report

- Lead with the outcome. List every command you ran and its result, what you refused, and what you deferred.
- Name coupled risks, such as a moved file or a removed last importer.
- Put authored text such as specs, copy or ledger rows in a `docs/` file, and cite the path. Report text is not kept.
- Report a new lesson as text. The orchestrator decides its home.
