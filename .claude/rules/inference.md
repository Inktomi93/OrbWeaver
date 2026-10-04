---
paths:
  - packages/inference/**
---

# Inference

## Capability quirks go in curated rows, never in backend code

A model-specific or provider-specific quirk is a curated row under
`packages/inference/src/capability/sources/curated/`. `synthesize.ts` folds curated, measured,
advertised, and declared evidence into one `Capability`. Backend code never branches on a model
name; it reads the resolved `Capability` instead.

`declared` overrides a dated measurement, and a nested field merges one level deep. Add a new
quirk as a curated row, not a special case in `synthesize.ts`'s fold.

## Structured output and tool calls

A backend sends the plan from `structured/plan.ts` and spells no schema, vehicle or tool choice of
its own. A vendor's schema subset or ceiling is a mode row in
`packages/contracts/src/inference/wire-subset.ts` or a capability row, never a backend branch.

## Backends

- A summarize or structured item is a chat turn with the `side-gen` posture
  (`packages/inference/src/roles/side-gen.ts`). Fix side-generation behavior in the wire's chat path
  or the funnel, never beside them, so chat and side generation cannot drift.
- Wire vocabulary differs per backend. Read each backend's own wire key or schema; never assume
  one backend's field name holds for another.
- Audit a vendor SDK's own default retry config, not only the wrapper code
  (`packages/inference/src/backends/kit/retry.ts`). An unset retry config can leave a silent
  long-running retry loop active.
- `openai-compat/body.ts`: scrub secret literals from a response you display from a
  user-controlled endpoint, not just the outbound request; test against an endpoint that echoes
  its input.

## `backends/agent-sdk/`

- The agent-sdk path has no observable HTTP wire body. Capture the SDK query input (prompt,
  system prompt, resolved capability), never a reconstructed HTTP payload.
- `tokensIn` is the whole prompt of the turn. On agent-sdk read tokens from the result `usage`: `modelUsage` continues from the session's saved totals on a resumed or forked turn.
- A context cap plus `disableAutoCompact` forces `is_error`.
- The `outputFormat` schema comes from the structured plan (`sdkOutputFormatOf` in `runner.ts`),
  never a local scrub. The plan refuses what the Anthropic grammar cannot carry, such as `oneOf`,
  before the spawn.
- Tool wire is sequential-only.
- `terminal-tools.ts`: mount terminal tools through MCP and reach `hook_stopped` with
  `PreToolUse` `continue: false`. Never use `defer`; it is solo-only. `maxTurns` floors at 2 on a
  terminal turn.
