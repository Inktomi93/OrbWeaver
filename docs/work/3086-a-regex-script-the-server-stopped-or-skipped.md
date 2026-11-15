---
kind: work
status: open
updated: 2026-11-15
priority: P1
area: chat
plan: import-robustness
---

# A regex script the server stopped or skipped is named in the room

## What

A host regex script that the server stops or skips is named in the room. Ruled shape: one server event naming the script and the cause, feeding one room notice that updates in place. The server knows the script at every sink, all inside `onScriptFailure(err, script)`: the user-input and world-info sinks in `packages/server/src/domain/chat/assembly/context.ts` (`onHostRegexFailure`, `classifyWiEntry`); the reply and reasoning sinks in `runTurnPipeline` (`packages/server/src/domain/chat/engine/pipeline.ts`); the prompt-history sink through `applyPromptHistoryRegex` (`packages/server/src/domain/chat/assembly/history-regex.ts`); and the edit re-apply sink in `packages/server/src/domain/chat/verbs/edit.ts`. The member-gated `previewContextFit` read in `packages/server/src/domain/chat/verbs/read.ts` must raise nothing, since it runs on every fit read and the turn's event covers it. The script at each sink is a full stored row at runtime (`resolveHostTierRegexScripts` in `packages/server/src/domain/chat/substrate/regex-tier.ts`), so its id and name are there, but the sink's declared type is the kit's `RegexScriptInput`, which carries neither; widen the sink's script type, never look a script up by pattern. The cause is the error's `code`: `ERR_SCRIPT_EXECUTION_TIMEOUT` is the row deadline, `ERR_REGEX_PASS_BUDGET_SPENT` is the pass budget, and anything else is a pattern that would not compile. Today the only trace is a server warn line that carries the placement, the find pattern and the error, not the script's id or name.

## Why

A skipped script is invisible: the host sees a reply without its panel and no reason. The owner ruled that a skipped script is never silent.

## Done when

A turn or edit whose pass stops or skips a host script emits one event per script, carrying the script id, its name (clipped and rendered as plain text, since an imported name is hostile), the cause (row deadline, pass budget, or did not compile) and the leg. The room shows one notice that names each such script and its cause in plain words and updates in place as later turns add or clear scripts. The event reaches only the host unless a ruling says members see it too. A preview read raises nothing.

## Evidence

Filled at landing: what ran and where its output is.
