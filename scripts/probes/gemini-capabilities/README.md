# Gemini capability probes

This probe uses the app's inference runtime and installed AI SDK adapters. It does not use the standalone OpenRouter SDK.

Native Google uses `@ai-sdk/google`. OpenRouter uses `@openrouter/ai-sdk-provider` through the app's OpenRouter dialect.

## Paths

The ordinary AUTO case runs `runTurnPipeline` → `createRunChatTurnBridge` → `toChatRequest` → the resolved inference executor → the installed SDK. The real tool-use registry validates and executes the calls. The chat recurse loop builds the continuation history.

The other cases run the same executor and structured planner directly. They test required choice, named choice, parallel control, response format and forced-tool payloads.

## Commands

```bash
pnpm exec node scripts/probes/gemini-capabilities/run.ts --fixture
pnpm exec node scripts/probes/gemini-capabilities/run.ts --fixture --routing-strict
```

The live commands require an explicitly authorized request budget:

```bash
pnpm exec node scripts/probes/gemini-capabilities/run.ts
pnpm exec node scripts/probes/gemini-capabilities/run.ts --routing-strict
```

The normal matrix caps generation requests at 28, including retries. Each route gets at most seven requests. An ordinary tool exchange gets at most two.

The strict-routing diagnostic caps requests at two, one per OpenRouter model. It restores the original parallel-control emission through a diagnostic declaration and adds only `provider.require_parameters: true`. This declaration is not a capability finding.

Credentials come from the existing `readEnvKey` loader using `GEMINI_PROBE_KEY` and `OPENROUTER_PROBE_KEY`. Results append to `results.jsonl`. No credentials, headers, signature bytes or prompt bodies are retained.

OpenRouter's upstream echo is requested on the same streaming call. The probe does not pay for an echo resend. Echo absence means unavailable evidence, not unchanged forwarding.

Read [RESULTS.md](RESULTS.md) before interpreting a row's `pass` flag. Parallel-control rows are observations, and routing refusals are not model acceptance.
