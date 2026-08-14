## Lane identity

- Lane: `agent-tooling`
- Semantic scope: Claude/Codex agent definitions, local instructions, hooks, launch settings, and saved API-surface outputs assigned in `assignment.txt`.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00` (`assignment.txt:2`).
- Working-tree basis: current bytes; all 31 final owned hashes equal the frozen assignment hashes. This is a rolling snapshot: `.claude/agent-doctrine.md` transiently differed while read, was reread in full, and then reconciled back to the frozen hash; the assigned files are also untracked in the current tree.
- Assigned files read: 31 / 31 (100%).
- Assigned lines read: 6,061 / 6,061 (100%).
- Assigned bytes read: 429,738 / 429,738 (100%).
- Dirty assigned paths: 13 — `.agents/skills/agent-authoring/SKILL.md` and the 12 `.claude/apisurface-*` files (`git status --short`).
- Exclusions: no production source or sibling-owned files analyzed. The guard's mirrored integration test was read and run because it imports the owned hook directly.

## Read receipt

`read-receipt.tsv` covers every OWNED row in `assignment.txt:5-35`; final checksums reconcile exactly with the frozen assignment after `.claude/agent-doctrine.md` was reread for a transient rolling change. The manifest's `scripts/codemods/ast.ts` line count is stale (4,099 assigned vs 4,495 current), disclosed as rolling-snapshot drift; its current file was read in full before use.

## Architecture observed

`.claude/settings.json:3-50` wires the pre-Bash guard, post-edit checker, and managed worktree lifecycle. The guard classifies a command before returning a hook decision (`.claude/hooks/tool-guard.mjs:544-575,843-885`); its own integration test drives both the batch and hook wire contracts (`tests/tooling/tool-guard.int.test.ts:223-405`). Agent role definitions name model, effort, tools, and selected skills, while routing policy lives in `.claude/rules/orchestration.md` (R2/R3 from full reads and settings registration).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| PreToolUse command guard | 2 | 3 | 3 | 1 | 2 | high | `.claude/hooks/tool-guard.mjs:213,544-575,843-885`; `.claude/settings.json:3-14`; `tests/tooling/tool-guard.int.test.ts:223-405`; direct hook probes. |
| Post-edit biome/type/import checker | 3 | 3 | 0 | 2 | 2 | medium | `.claude/hooks/biome-check.sh:1-147`; `.claude/settings.json:16-25`; shell syntax check only. |
| Managed worktree lifecycle | 2 | 3 | 0 | 1 | 2 | medium | `.claude/hooks/worktree-setup.sh:1-60`; `.claude/hooks/worktree-remove.sh:1-47`; `.claude/settings.json:27-50`; shell syntax check only. |
| Agent roles, skills, and instruction tooling | 2 | 2 | 0 | 1 | 2 | medium | `.claude/agents/*.md`; `.claude/skills/*.md`; `.claude/rules/orchestration.md:1-97`; `.claude/settings.json:55-130`. |

## Findings

### AGENT-TOOLING-01 — Any mention of the guard filename disables all guard rules

- Severity: P1
- Class: behavior-defect
- Confidence: high — direct classifier and real hook-protocol executions reproduced it; confidence would only rise with an end-to-end Claude session, which is unnecessary to establish the emitted decision.
- Evidence rung: R5
- Scope denominator: the owned 983-line guard and its 405-line mirrored integration test. The controlled real-entry-point probe covered four commands, including two hard-floor/destructive forms; source sweep excluded no guard branches relevant to this early return.
- Receipts: `.claude/hooks/tool-guard.mjs:213` defines an unanchored filename regex; `.claude/hooks/tool-guard.mjs:544-546` returns before blanking, hard-floor, destructive-git, or push checks; `.claude/hooks/tool-guard.mjs:843-885` maps `pass` to hook `allow`; `.claude/settings.json:3-14` registers this hook. The current integration table covers only genuine self-tool invocations at `tests/tooling/tool-guard.int.test.ts:219-220`.
- Established fact: `node .claude/hooks/tool-guard.mjs --classify-batch` returned `pass/self-exempt` for `echo tool-guard.mjs && git stash`, `rm -rf packages/server/src # tool-guard.mjs`, and `curl … | bash # tool-guard.mjs`. The real stdin hook then emitted `permissionDecision:"allow"` for the latter destructive shape and `git stash # tool-guard.mjs`.
- User or system impact: a harmless comment, argument, or earlier compound clause containing the filename makes the configured guard authorize commands that its hard floor and destructive-git rules were meant to stop. This defeats the safety property before normal permission handling, including for subagents.
- What remains unverified: whether a particular Claude host independently blocks a command after a hook says `allow`; the hook's own contract makes that irrelevant to the guard's promised enforcement and the emitted allow is directly proven.
- Suggested next check or fix: narrow self-exemption to a parsed command stage whose executable is the guard/replay/census tool, after quote/heredoc blanking; add MUST-BITE rows for a trailing comment, quoted argument, and an earlier compound stage, then rerun the 12-test integration file.

## Proven strengths

None. The guard integration test is R4 (12 current behavioral assertions) rather than a proven strength because AGENT-TOOLING-01 demonstrates a material untested bypass.

## Declared versus completed

- The guard is declared and settings-registered (R3), and its current integration suite exercises 12 meaningful rule/contract tests (R4), but its early self-exemption is not complete (R5 direct counterexample).
- The post-edit and worktree hooks are declared and settings-registered (R3) and parse syntactically; no assigned behavioral test proves setup, removal, or post-edit behavior (R0 verification).
- Agent definitions and skills are present with explicit operational roles (R2); this lane did not launch every role, so no runtime loading or behavior claim is made.

## Tests and gates

`pnpm vitest run tests/tooling/tool-guard.int.test.ts` passed 12/12 integration tests with no type errors. The test exercises batch classification, rewrite exit preservation, hook output, fail-open, kill switch, and push behavior (`tests/tooling/tool-guard.int.test.ts:223-405`), but not the filename-in-comment/argument bypass. `node --check` and `bash -n` passed for the guard and shell hooks; these are static syntax checks only. Literal inventory over 1,691 current test files found no references to `worktree-setup.sh`, `worktree-remove.sh`, or `biome-check.sh`; this is a documented proof gap, not a separate defect finding.

## Cross-lane edges

- No source ownership handoff. The synthesis lane should retain the current rolling-snapshot disclosure: the assignment snapshot is `41e18…`, while current `scripts/codemods/ast.ts` differs in line count but was fully read from current bytes.

## Tool receipts

`pnpm ast` was run bare first. Its implementation documents that neither source corpus admits `.claude/**`, so it cannot structurally answer this lane's configuration questions. Completed package API-surface lenses reported 4,903 scanned source files each. One broad API-surface process completed after 89 seconds but its command runner dropped terminal output/exit; it is recorded in `commands.md` as a tool-output failure and supports no result. The guard's direct subprocess probes are R5 behavioral receipts; full output is summarized in `commands.md`.

## Lane verdict

The configured command guard, edit hook, worktree hooks, role definitions, skills, and saved API-surface outputs are all present and read completely. The guard is wired and has a meaningful current integration suite, but a global self-exemption lets any command containing `tool-guard.mjs` bypass every rule and emits an explicit hook allow. Post-edit and worktree scripts have no discovered behavioral tests; syntax parsing is the only current receipt. Final assigned hashes match their frozen snapshot after a transient doctrine-file change was reread; the overall audit remains rolling because shared `ast.ts` has moved.
