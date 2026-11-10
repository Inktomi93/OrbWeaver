---
name: local-lane
description: Preloaded with `lane` by every local-model lane (`lanes:*` agents on Qwen). How a local lane plans, batches tool calls, picks commands and proves its work without wasted steps.
---

# Local lane

You run on a local model. The `lane` skill binds you in full; this skill adds how to work fast without breaking it. Each of your steps costs real seconds, so a step that changes nothing is waste.

## How to think

Think in this order once per task, then act:

1. **Goal.** State the done line in your own words, one sentence.
2. **Facts.** List what your reads showed that the design depends on, with path:line.
3. **Design.** Write the change: the types, the files, the edits. Say why it meets each part of the done line.
4. **Check the design.** Predict how it could fail the done line. Look for a missed case, a guard with a hole (a typo that passes, a nested field left optional), or a rule it breaks. Fix what you find now.
5. **Act.** Make the edits and run the checks.

Rules for every step after that:

- Do not repeat a thought. Do not restate the brief, the plan or a finished decision.
- Re-open the design only when a result shows it fails the done line. Name the result.
- A better idea that the done line does not need goes in the report as a flag. Do not build it, and do not weigh it at length.
- Do not weigh a choice the brief already made. Its steps, files, classifications and checks are decided.
- When a tool can compute an answer, run the tool. Never work out a sort order, a format, a count or a type by hand.
- Settle convention questions with the tools: write the code, run lint and typecheck, fix what they report. Do not reason out tsdoc, knip or comment rules in advance.
- When you are unsure of a flag, run `<tool> --help` once. Never guess a flag twice.
- When you spot a gap in your own design, close it or name it in the report. Never judge a known gap acceptable on your own.

## Ask instead of guessing

- When you need a fact you cannot find, or a call that is not yours, ask the orchestrator: SendMessage to `main`. Examples are a ruling the law does not settle, a brief that contradicts the tree, or two valid designs with different costs.
- Write the question in two or three lines: what you found, the choices, and your default.
- Keep working on your default while you wait. Never stop to wait for the answer.
- When a message from the orchestrator reaches you mid-task, acknowledge it with one `SendMessage` to `main` that says what you will do, then do it.
- If SendMessage returns "no verdict", send it once more. If it fails again, put the question in your report as a flag.
- Ask once per question. A question you can answer by one more read or one tool run is not a question for the orchestrator.

## Verify the done line, not more

- Run each proof the done line names, once. When they pass, stop verifying.
- Do not build extra probes to make a passing proof more exact. If a tool truncates its output and the done line still holds, report the truncation and move on.

## Batch tool calls

- Send independent tool calls together in one turn. Reads of different files, a codegraph query with its `rg` checks, and edits to different files are independent.
- Run calls one at a time only when one needs another's result.
- Batching means several tool calls in one turn. It never means a chained shell command.

## Shell shape

- Your working directory is your worktree. Never `cd`.
- Run one plain command per Bash call. No `;`, `&&`, `||`, `echo` headers or `for` loops.
- Run git as plain `git` from the worktree. Commit with `git commit -F <scratch file>`.
- Put any script in a scratch file and run it with `python3 <file>`. Never pipe a heredoc into an interpreter.
- If a call returns "classifier gave no verdict", issue the same call once more. If it fails again, report it and continue. Never set `dangerouslyDisableSandbox`; it is refused.
- Read a persisted tool result at the path the harness names; that directory is yours. A directory outside your worktree that is not listed in `.claude/settings.json` under `permissions.additionalDirectories` is refused: report it, do not work around it.

## Survey, sized to the task

- Run one `codegraph_explore` per item, naming the symbols and files the brief names. Trust its source as read.
- Run `ast-grep` only for a pattern you change, and only to back a claim that nothing else uses it.
- When the brief names the pattern to copy, copy it. Do not survey the repository for alternatives.
- For a dependency's API or a ruling, use the `lane` skill's Documentation lookup: one `mcp__docs__search_docs` call, not a web search and not memory.
- A test change that only replaces a literal with a production import does not need the testing-law read in the `lane` skill's Start section. Any other test change does.

## Command card

| Job | Command |
| - | - |
| Structural search | `ast-grep run -l ts -p '<pattern>' <paths>`, then the same with `-l tsx`. No `--stats`, no `-c`. |
| Match count | add `--json=compact` and count the array |
| Scanned-file count | `git ls-files '<glob>'` and count the lines |
| Literal search | `rg -n '<pattern>' <paths>` |
| Lint, scoped | `pnpm lint:eslint <files>` |
| Biome, scoped | `pnpm exec biome check <files> --diagnostic-level=error`, and `--write` to fix order or format |
| Typecheck | `pnpm typecheck <tsconfig paths>` |
| Component test | `CT_PORT=<your own port> pnpm test:ct <file>` |
| Node test | `pnpm test <file>` |
| Dependency rules | `pnpm depcruise` |

## Check order

1. Run the brief's `rg` check, scoped ESLint and scoped Biome together.
2. Run the typecheck.
3. Run the CT or Node test. Never run it beside the typecheck: both need large memory.
4. Run `pnpm depcruise`.
5. Commit.

A long run goes to the background. Read its result when the notification wakes you.

## Red first in one pass

1. With your change in place and green, plant one break in production with Edit. For example, put back one old spelling.
2. Run the one test file. Confirm it fails at the planted line.
3. Remove the plant with Edit.
4. Run `git diff <file>` and confirm the file holds only your intended change. Do not rerun the test for an identical restore.

## Stop

- Stop when the brief's done line holds. Run no check the brief and the `lane` floor do not ask for.
- Hand back the `lane` return card.
