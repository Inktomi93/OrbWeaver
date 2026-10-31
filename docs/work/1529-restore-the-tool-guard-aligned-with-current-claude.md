---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: tooling
---

# Restore the tool guard aligned with current Claude Code

## What

Port .claude/hooks/tool-guard.mjs from the savepoint branch whose name starts savepoint/pre-tooling-deletion and register it as a PreToolUse hook for Bash and Read. Owner rulings: a command the guard does not object to gets allow, so a subagent never stalls on a permission prompt; the settings deny rules (for example git push) still apply over a hook allow, and the hard floor runs before any allow. A denial names the shortcut plainly and then states the exact form to use instead. Keep the rules that catch lazy waiting: sleep-then-read loops, repeated reads of one task output, ps -p and kill -0 liveness polls, tail -f and until loops on a file, and a piped test harness. Each denial points at run_in_background with its completion notice, Monitor for a stream of events, or a background until-loop for one condition. Drop what Claude Code now owns: the plain foreground sleep block. Delete every rule for removed tooling (the verify harness, pnpm check, check:show, guard replay and census scripts). Keep the hard floor (sudo, a fetch piped to a shell), the commit hook bypass and --no-verify checks, the raw playwright and vitest heads, and the destructive rm and git stash shapes. Rewrite the lane skill line on long commands to the same rule the denials quote, and make the session start text agents receive say it once.

## Why

Agents waste calls on hand-written wait loops. Claude Code now idles a background agent until its own work reports, so a poll is pure cost. The old guard predates that.

## Done when

The hook is registered and fails open on an internal error. Each kept rule has a found case and a control case in tests/tooling. A case proves an unobjected command gets allow and a settings deny rule still refuses git push. The lane skill and session start text state the waiting rule once. A live check in a fresh session shows a sleep-then-tail loop denied with the replacement form.

## Evidence

Filled at landing: what ran and where its output is.
