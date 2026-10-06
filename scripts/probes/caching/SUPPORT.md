# Caching support and evidence

This audit distinguishes provider prefix reuse, app-authored prefix controls, routing affinity and complete-response replay. Applying a control does not establish a cache hit. Unknown serving endpoints, missing usage and unproved translations remain unknown.

## Implementation boundary

The pure policy resolver is `packages/inference/src/funnel/resolve-cache.ts`. The canonical inputs and readback are `packages/contracts/src/inference/cache-policy.ts`; execution and editors use that same plan. `backends/kit/cache-control.ts` remains the sole conversational role-switch depth and N/N+2 placement home. Backends translate the plan into their own protocol without moving authored system text, changing roles, discarding dynamic lore or altering signed tool/reasoning replay.

Installed adapters inspected: `@ai-sdk/anthropic` 4.0.71, `@ai-sdk/google` 4.0.87, `@ai-sdk/openai-compatible` 3.0.62, `@openrouter/ai-sdk-provider` 3.1.0 and `ai` 7.0.127. The OpenRouter adapter is not `@openrouter/sdk`. No dependency or transport migration is included.

Owner scope: managed native Gemini cache-resource creation/binding/lifecycle is parked. Custom endpoints retain existing user-owned body, header and declared-capability controls; vendor automation is not inferred from a Custom model name. Subscription Agent SDK prompt caching remains its separate parked program.

## Named supported routes

| Route | Prefix mechanism and controls | Constraints and evidence |
| - | - | - |
| Native Anthropic Messages | Per-block ephemeral 5m/1h; separately opted-in request-wide automatic placement | Four manual breakpoints; tools precede system then messages; automatic placement is not a universal implicit mode. Model-specific minimums remain curated, including Sonnet 5 1024, Opus 5/5.5 512, Opus 4.7 2048, Opus 4.8 1024 and Haiku 4.5 4096. Native SDK fixtures plus the live Sonnet 5 cold/warm/appended calls establish wire and reuse. |
| OpenRouter Anthropic | Translated markers and automatic request directive | Existing Anthropic manual routing/no-fallback pin remains required by D251/D262. It disables OpenRouter automatic sticky selection; do not advertise both simultaneously. Scripted composed and actual SDK proofs preserve block ends and signatures. |
| Native OpenAI Chat Completions | Exact older documented models have provider-managed implicit caching; admitted newer models accept explicit breakpoints and request-wide options | Older implicit facts do not acquire modern marker/disable controls. Separate admitted legacy `in_memory`/`24h` retention and per-chat cache key preserve explicit configured body ownership. Newer request options use 30m minimum retention, not an Anthropic TTL. Native Responses-only Codex and GPT-5.5-Pro rows do not inherit Chat cache controls. Unknown dates/aliases stay unknown. |
| OpenRouter OpenAI | Gateway translates supported explicit markers and accepts OpenAI request options | Marker Anthropic TTL is dropped in this translation; native legacy retention/key are not assumed translated. Exact newer model/version admission is curated, not a broad GPT-name test. Live GPT-6-Sol read/write counts and SDK fixtures are retained. |
| Native Google GenerateContent | Automatic implicit prefix caching; reported `cachedContentTokenCount` | API-key GenerateContent is not Interactions or Vertex OAuth. Model-specific minima include 3.8 Flash/3.1 Pro 4096 and 2.5 Flash/Pro 2048. No app off switch is claimed. External cachedContent references remain guarded; managed explicit resources are not built. Warm native 3.8 Flash reports reads; appended-call absent read is unknown. |
| OpenRouter Gemini | Automatic implicit caching plus supported explicit markers | Explicit route uses fixed 5m retention without hit refresh, the last ordinary marker and an immutable first system prefix. Dynamic system tails retain their semantic position; no text is moved to a user row for a hit. Aggregate read counts do not establish an exact implicit/explicit split. Reported write/read axes can overlap; measured cost remains authoritative. |
| OpenRouter Alibaba Qwen | Exact admitted SKUs accept explicit ephemeral markers; default app markers off | Current gateway list is Qwen3 Max, Qwen Plus, Qwen3.6 Plus, Qwen3 Coder Plus and Qwen3 Coder Flash; dated endpoints are excluded. Five-minute controls are route-specific. The live Coder Plus endpoint reports Alibaba as the actual serving provider. The separately documented DeepSeek V3.2 Alibaba endpoint must not be confused with native DeepSeek implicit caching. |

Primary guides: [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching), [Google GenerateContent](https://ai.google.dev/gemini-api/docs/caching), [OpenRouter prompt caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching.md). Exact curated applicability is in `capability/sources/curated/{anthropic,openai,google,qwen}.ts`, with positive and unknown/unsupported controls in their mirrored tests.

## Other documented OpenRouter vendors and direct API differences

These direct APIs are not additional built-in native transports. Custom users configure their vendor endpoint and documented controls. The audit is not an automatic Custom support claim or a live pass for these vendors.

| Vendor | OpenRouter documented behavior | Direct primary behavior and mismatch |
| - | - | - |
| xAI/Grok | Automatic prompt caching; no app write marker needed | [xAI cache affinity](https://docs.x.ai/developers/advanced-api-usage/prompt-caching/maximizing-cache-hits): Chat uses `x-grok-conv-id`; Responses uses a different body cache key. Do not silently send the Responses control on Chat. |
| Moonshot/Kimi | Generic gateway guide says automatic/no write charge | [Current Kimi guide](https://platform.kimi.ai/docs/guide/context-caching.md): K3 supports billable writes and root `prompt_cache_options` implicit mode with 5m/1h; K2.7, highspeed and K2.6 have no write charge. TTL locks at initial write and renews on hits. Messages root cache_control is a different API, and inner markers are ignored. Native behavior is not proof of OpenRouter translation. |
| Groq | Gateway guide currently names Kimi K2 caching | [Groq](https://console.groq.com/docs/prompt-caching): direct supported list instead names GPT-OSS 20B/120B/Safeguard20B; automatic, no disable or additional write fee, idle expiration two hours. A shared model-family name does not bridge those route lists. |
| DeepSeek | Automatic prefix reuse | [DeepSeek](https://api-docs.deepseek.com/guides/kv_cache): best-effort prefix disk cache, hit/miss counters; miss tokens are uncached input, not cache writes. Alibaba explicit DeepSeek is a different endpoint. |
| Z.AI | Automatic prefix reuse | [Z.AI](https://docs.z.ai/guides/capabilities/cache): reported cached token counts; no exact minimum/TTL or implicit-disable control is inferred where absent. Model pricing is not replaced by a family multiplier. |
| Alibaba | Gateway has a narrow explicit SKU list | [Alibaba](https://www.alibabacloud.com/help/en/model-studio/context-cache): regional/deployment-specific model lists; direct implicit and explicit modes, explicit five-minute refresh, minimums and creation counters. The direct list is materially broader than the gateway marker allowlist. No self-hosted Qwen inherits Alibaba controls. |

The current OpenRouter provider directory was fetched as complete JSON (112 provider rows), then the nine relevant slugs were read separately: [Anthropic](https://openrouter.ai/provider/anthropic), [OpenAI](https://openrouter.ai/provider/openai), [Google Vertex](https://openrouter.ai/provider/google-vertex), [xAI](https://openrouter.ai/provider/xai), [Moonshot](https://openrouter.ai/provider/moonshotai), [Groq](https://openrouter.ai/provider/groq), [Alibaba](https://openrouter.ai/provider/alibaba), [DeepSeek](https://openrouter.ai/provider/deepseek), [Z.AI](https://openrouter.ai/provider/z-ai). These pages establish catalog/provider associations, not supported controls or guaranteed serving selection. Some reader extracts contain only one model description; they are not treated as a full per-endpoint control census.

## Complete-response replay and physical endpoints

Response replay is opt-in, separate from prefix depth/TTL. Precedence is fresh/per-request override, then explicit typed preset, then intentional configured cache headers, otherwise explicit false. Typed TTL is strict whole seconds 1–86400. Raw configured headers follow documented provider parsing/clamping instead of becoming a native route validation error. Configured unrelated headers are retained case-insensitively. Refresh is meaningful only when replay is enabled; fresh actions bypass and never clear a shared entry. A remote OpenRouter preset opt-out cannot be overridden or known by the local resolver.

Current implemented SDK physical witnesses:

| Arm | Actual POST | Local replay posture |
| - | - | - |
| Chat / chat-shaped utility | `/chat/completions` | Intentional send opt-in permitted; fresh turn kinds false/no Clear |
| Embedding | `/embeddings` | Explicit configured opt-in, explicit off and default false survive actual SDK conversion |
| Chat-modalities image generation | `/chat/completions` | Fresh image generation forces false/no Clear even when configured header is true |
| Image API | `/images` | Distinct physical endpoint; response replay not admitted by the implemented endpoint contract; false/no Clear |

[Response cache contract](https://openrouter.ai/docs/guides/features/response-caching): identical API key/model/endpoint/stream mode/serialized body is required; property order matters. Changed app turns normally miss. Headers are not part of the cache key. Streaming replays include tool calls, new generation identity and source identity. Current registry validation and authorization still execute; cached tool calls are not trusted side effects. Concurrent misses are not coalesced; account ZDR prevents caching. Supported local controls do not guarantee an upstream hit.

[Image API contract](https://openrouter.ai/docs/api/api-reference/images/generate-an-image.md) defines optional usage/cost. Installed SDK image conversion drops body cost; H owns the local strict translator and canonical durable carriage. Optional result fields alone are not completion. Embedding likewise requires actual physical receipt headers/body, reported cost precedence and retained readback; H integration remains separate from K outbound proofs.

## Evidence denominator and remaining limits

- Persisted scripted matrix: 34 route/control partitions × three cohorts × two actual naming values × four requested floors = **816** cells. Cohorts are 1H/1C, 2H/1C and 3H/2C. Names map owner Default/Always to `default`/`content`. Every cell includes ordinary and adjacent human/character turns; actual effective clamps, names, chunk order, funding, block ends, send and fresh traces are asserted.
- Bounded live matrix: seven prefix route representatives × cold/identical prepared retry/appended turn, plus three response replay/fresh calls = **24 physical POSTs**. See [RESULTS](RESULTS.md) and retained raw `results.jsonl`. The original battery keeps its fixed request guard. Further acceptance uses a separate declared case inventory and physical-call budget.
- UI: full affected editor/preset run passed 126 cases; an affected-only preset rerun after explicit associated-label correction passed 48. Source/editor intent is not a HIT claim.
- Canonical H ordered-leg, image/embed private persistence and native-backup integration must be verified on the combined branch. Raw live wire facts are retained so normalization regressions can be verified without another paid sweep.
- Exact upstream-transformed OpenRouter ordering is not echoed by the captured responses. Application/SDK final request order is proved; transformed upstream order remains unobserved.
- No universal cache-price multiplier, cache resource service, output-budget/tokenizer program or deleted-charge ledger is introduced.
