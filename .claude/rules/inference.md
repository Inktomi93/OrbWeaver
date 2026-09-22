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

## Backends

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
- `tokensIn` is a per-turn delta on a resuming session, not cumulative.
- A context cap plus `disableAutoCompact` forces `is_error`.
- `json_schema` output on the Anthropic wire rejects `oneOf` and throws. `scrubWireSchema`'s
  per-provider wire-shape modes strip bound keywords like `minItems`/`maxLength` instead of
  rejecting them (`output-schema.ts`).
- Tool wire is sequential-only.
- `terminal-tools.ts`: mount terminal tools through MCP and reach `hook_stopped` with
  `PreToolUse` `continue: false`. Never use `defer`; it is solo-only. `maxTurns` floors at 2 on a
  terminal turn.
