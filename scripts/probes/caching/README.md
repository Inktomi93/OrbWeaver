# Caching acceptance probe

This is a headless **real persisted app** probe, not a handcrafted SDK conversation. It creates isolated in-memory services, host/member principals, an encrypted credential, connection binding, preset, character greeting, invite/membership and host presence. Public chat operations prepare the SDK request. No running stack or existing database is used.

## Evidence planes

- `tests/server/entry/compose/caching.suite.int.test.ts`: 816 scripted persisted app cells, factorized as 34 route/control configurations × three cohorts × two naming settings × four requested turn floors. Requested/effective clamps remain explicit. Each cell exercises ordinary and adjacent human/character turns, shaping, names, funding, send and fresh operations. This proves application behavior, not provider cache availability.
- `results.jsonl`: append-only physical live request/response facts from the bounded initial battery. Content and signatures are hashed; credentials are excluded. Original summaries remain unchanged even when offline reporting is corrected.
- `summary.json`: corrected offline projection of the same raw facts. It does not make requests or replace the raw evidence.
- `RESULTS.md`: interpretation and remaining acceptance limits.
- `SUPPORT.md`: provider/control boundaries, current vendor differences and case-to-evidence mapping.

## Commands

From the caching worktree:

```sh
env ORB_ENV_NO_FILE=1 pnpm exec node scripts/probes/caching/run.ts --scripted
env ORB_ENV_NO_FILE=1 pnpm exec node scripts/probes/caching/run.ts --report
```

Live execution requires a separately authorized physical POST budget. The initial 24-POST allowance is **exhausted**. Do not rerun `--live` or remove prior start records to reset the guard.

The source manifest in `scenario.ts` is frozen for each battery. Every POST checks the manifest and cumulative start count before sending. Catalog GETs are separate. Per-scenario allowance is three physical POSTs, including retries. After capturing the first successful response, the probe deliberately loses its transfer before the SDK/UI first delta. The real pre-commit retry must produce identical serialized request bytes. The third operation appends a real turn, except the response-replay case which performs an actual swipe.

Prefix experiments explicitly disable OpenRouter full-response replay. Native implicit cache availability, explicit prefix markers and full-response replay are separate observations. A missing counter remains unknown; a warm miss is not automatically an application defect. Billing authority is the reported cost, not an SDK-created zero or a configured-rate estimate.

Primary documentation: [OpenRouter prompt caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching), [response caching](https://openrouter.ai/docs/guides/features/response-caching), [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching), [Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [Google GenerateContent caching](https://ai.google.dev/gemini-api/docs/caching).
