---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the inference fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `inference`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `costStateEntrySchema.type` | `inference/src/backends/agent-sdk/session/frames.ts:338` | unreferenced | delete | delete the key |
| `costStateEntrySchema.sessionId` | `inference/src/backends/agent-sdk/session/frames.ts:339` | unreferenced | delete | delete the key |
| `UnliftableTool.tool` | `inference/src/backends/agent-sdk/terminal-tools.ts:30` | never-read | delete | delete the field and its writes (`inference/src/backends/agent-sdk/terminal-tools.ts:47`) |
| `UnliftableTool.construct` | `inference/src/backends/agent-sdk/terminal-tools.ts:31` | unreferenced | delete | delete the field |
| `UnliftableTool.path` | `inference/src/backends/agent-sdk/terminal-tools.ts:32` | unreferenced | delete | delete the field |
| `headerSchema.session_id` | `inference/src/backends/agent-sdk/wire-read.ts:10` | unreferenced | delete | delete the key |
| `textBlockSchema.text` | `inference/src/backends/agent-sdk/wire-read.ts:12` | unreferenced | delete | delete the key |
| `thinkingBlockSchema.thinking` | `inference/src/backends/agent-sdk/wire-read.ts:13` | unreferenced | delete | delete the key |
| `toolBlockSchema.id` | `inference/src/backends/agent-sdk/wire-read.ts:14` | unreferenced | delete | delete the key |
| `toolBlockSchema.name` | `inference/src/backends/agent-sdk/wire-read.ts:14` | unreferenced | delete | delete the key |
| `toolBlockSchema.input` | `inference/src/backends/agent-sdk/wire-read.ts:14` | unreferenced | delete | delete the key |
| `assistantSchema.message.stop_reason` | `inference/src/backends/agent-sdk/wire-read.ts:16` | unreferenced | delete | delete the key |
| `assistantSchema.error` | `inference/src/backends/agent-sdk/wire-read.ts:17` | unreferenced | delete | delete the key |
| `assistantSchema.request_id` | `inference/src/backends/agent-sdk/wire-read.ts:18` | unreferenced | delete | delete the key |
| `resultSchema.is_error` | `inference/src/backends/agent-sdk/wire-read.ts:22` | unreferenced | delete | delete the key |
| `resultSchema.num_turns` | `inference/src/backends/agent-sdk/wire-read.ts:23` | unreferenced | delete | delete the key |
| `resultSchema.terminal_reason` | `inference/src/backends/agent-sdk/wire-read.ts:24` | unreferenced | delete | delete the key |
| `resultSchema.stop_reason` | `inference/src/backends/agent-sdk/wire-read.ts:25` | unreferenced | delete | delete the key |
| `resultSchema.total_cost_usd` | `inference/src/backends/agent-sdk/wire-read.ts:26` | unreferenced | delete | delete the key |
| `resultSchema.usage` | `inference/src/backends/agent-sdk/wire-read.ts:27` | unreferenced | delete | delete the key |
| `resultSchema.usage.input_tokens` | `inference/src/backends/agent-sdk/wire-read.ts:28` | unreferenced | delete | delete the key |
| `resultSchema.usage.output_tokens` | `inference/src/backends/agent-sdk/wire-read.ts:29` | unreferenced | delete | delete the key |
| `resultSchema.usage.cache_read_input_tokens` | `inference/src/backends/agent-sdk/wire-read.ts:30` | unreferenced | delete | delete the key |
| `resultSchema.usage.cache_creation_input_tokens` | `inference/src/backends/agent-sdk/wire-read.ts:31` | unreferenced | delete | delete the key |
| `resultSchema.usage.cache_creation` | `inference/src/backends/agent-sdk/wire-read.ts:32` | unreferenced | delete | delete the key |
| `resultSchema.usage.cache_creation.ephemeral_5m_input_tokens` | `inference/src/backends/agent-sdk/wire-read.ts:32` | unreferenced | delete | delete the key |
| `resultSchema.usage.cache_creation.ephemeral_1h_input_tokens` | `inference/src/backends/agent-sdk/wire-read.ts:32` | unreferenced | delete | delete the key |
| `resultSchema.modelUsage` | `inference/src/backends/agent-sdk/wire-read.ts:34` | unreferenced | delete | delete the key |
| `resultSchema.modelUsage.inputTokens` | `inference/src/backends/agent-sdk/wire-read.ts:37` | unreferenced | delete | delete the key |
| `resultSchema.modelUsage.outputTokens` | `inference/src/backends/agent-sdk/wire-read.ts:38` | unreferenced | delete | delete the key |
| `resultSchema.modelUsage.costUSD` | `inference/src/backends/agent-sdk/wire-read.ts:39` | unreferenced | delete | delete the key |
| `resultSchema.modelUsage.webSearchRequests` | `inference/src/backends/agent-sdk/wire-read.ts:40` | unreferenced | delete | delete the key |
| `resultSchema.modelUsage.contextWindow` | `inference/src/backends/agent-sdk/wire-read.ts:41` | unreferenced | delete | delete the key |
| `resultSchema.modelUsage.maxOutputTokens` | `inference/src/backends/agent-sdk/wire-read.ts:42` | unreferenced | delete | delete the key |
| `resultSchema.permission_denials` | `inference/src/backends/agent-sdk/wire-read.ts:45` | unreferenced | delete | delete the key |
| `resultSchema.permission_denials.tool_name` | `inference/src/backends/agent-sdk/wire-read.ts:45` | unreferenced | delete | delete the key |
| `successfulResultSchema.result` | `inference/src/backends/agent-sdk/wire-read.ts:48` | unreferenced | delete | delete the key |
| `successfulResultSchema.ttft_ms` | `inference/src/backends/agent-sdk/wire-read.ts:49` | unreferenced | delete | delete the key |
| `successfulResultSchema.duration_api_ms` | `inference/src/backends/agent-sdk/wire-read.ts:50` | unreferenced | delete | delete the key |
| `successfulResultSchema.api_error_status` | `inference/src/backends/agent-sdk/wire-read.ts:51` | unreferenced | delete | delete the key |
| `successfulResultSchema.warm_spare_claimed` | `inference/src/backends/agent-sdk/wire-read.ts:52` | unreferenced | delete | delete the key |
| `failedResultSchema.errors` | `inference/src/backends/agent-sdk/wire-read.ts:54` | unreferenced | delete | delete the key |
| `compactBoundarySchema.compact_metadata` | `inference/src/backends/agent-sdk/wire-read.ts:56` | unreferenced | delete | delete the key |
| `compactBoundarySchema.compact_metadata.trigger` | `inference/src/backends/agent-sdk/wire-read.ts:57` | unreferenced | delete | delete the key |
| `compactBoundarySchema.compact_metadata.pre_tokens` | `inference/src/backends/agent-sdk/wire-read.ts:58` | unreferenced | delete | delete the key |
| `compactBoundarySchema.compact_metadata.post_tokens` | `inference/src/backends/agent-sdk/wire-read.ts:59` | unreferenced | delete | delete the key |
| `compactBoundarySchema.compact_metadata.duration_ms` | `inference/src/backends/agent-sdk/wire-read.ts:60` | unreferenced | delete | delete the key |
| `retrySchema.error` | `inference/src/backends/agent-sdk/wire-read.ts:64` | unreferenced | delete | delete the key |
| `retrySchema.attempt` | `inference/src/backends/agent-sdk/wire-read.ts:65` | unreferenced | delete | delete the key |
| `retrySchema.max_retries` | `inference/src/backends/agent-sdk/wire-read.ts:66` | unreferenced | delete | delete the key |
| `retrySchema.retry_delay_ms` | `inference/src/backends/agent-sdk/wire-read.ts:67` | unreferenced | delete | delete the key |
| `retrySchema.error_status` | `inference/src/backends/agent-sdk/wire-read.ts:68` | unreferenced | delete | delete the key |
| `statusSchema.status` | `inference/src/backends/agent-sdk/wire-read.ts:70` | unreferenced | delete | delete the key |
| `statusSchema.compact_result` | `inference/src/backends/agent-sdk/wire-read.ts:70` | unreferenced | delete | delete the key |
| `statusSchema.compact_error` | `inference/src/backends/agent-sdk/wire-read.ts:70` | unreferenced | delete | delete the key |
| `thinkingTokensSchema.estimated_tokens` | `inference/src/backends/agent-sdk/wire-read.ts:71` | unreferenced | delete | delete the key |
| `refusalSchema.original_model` | `inference/src/backends/agent-sdk/wire-read.ts:72` | unreferenced | delete | delete the key |
| `refusalSchema.api_refusal_category` | `inference/src/backends/agent-sdk/wire-read.ts:72` | unreferenced | delete | delete the key |
| `refusalSchema.api_refusal_explanation` | `inference/src/backends/agent-sdk/wire-read.ts:72` | unreferenced | delete | delete the key |
| `fallbackSchema.fallback_model` | `inference/src/backends/agent-sdk/wire-read.ts:73` | unreferenced | delete | delete the key |
| `initModelSchema.model` | `inference/src/backends/agent-sdk/wire-read.ts:74` | unreferenced | delete | delete the key |
| `rateLimitSchema.rate_limit_info` | `inference/src/backends/agent-sdk/wire-read.ts:76` | unreferenced | delete | delete the key |
| `rateLimitSchema.rate_limit_info.status` | `inference/src/backends/agent-sdk/wire-read.ts:77` | unreferenced | delete | delete the key |
| `rateLimitSchema.rate_limit_info.rateLimitType` | `inference/src/backends/agent-sdk/wire-read.ts:78` | unreferenced | delete | delete the key |
| `rateLimitSchema.rate_limit_info.resetsAt` | `inference/src/backends/agent-sdk/wire-read.ts:79` | unreferenced | delete | delete the key |
| `rateLimitSchema.rate_limit_info.utilization` | `inference/src/backends/agent-sdk/wire-read.ts:80` | unreferenced | delete | delete the key |
| `rateLimitSchema.rate_limit_info.isUsingOverage` | `inference/src/backends/agent-sdk/wire-read.ts:81` | unreferenced | delete | delete the key |
| `rateLimitSchema.rate_limit_info.surpassedThreshold` | `inference/src/backends/agent-sdk/wire-read.ts:82` | unreferenced | delete | delete the key |
| `rateLimitSchema.rate_limit_info.overageStatus` | `inference/src/backends/agent-sdk/wire-read.ts:83` | unreferenced | delete | delete the key |
| `rateLimitSchema.rate_limit_info.overageResetsAt` | `inference/src/backends/agent-sdk/wire-read.ts:84` | unreferenced | delete | delete the key |
| `rateLimitSchema.rate_limit_info.overageDisabledReason` | `inference/src/backends/agent-sdk/wire-read.ts:85` | unreferenced | delete | delete the key |
| `rateLimitSchema.rate_limit_info.errorCode` | `inference/src/backends/agent-sdk/wire-read.ts:86` | unreferenced | delete | delete the key |
| `authStatusSchema.isAuthenticating` | `inference/src/backends/agent-sdk/wire-read.ts:89` | unreferenced | delete | delete the key |
| `authStatusSchema.error` | `inference/src/backends/agent-sdk/wire-read.ts:89` | unreferenced | delete | delete the key |
| `messageDeltaSchema.stop_reason` | `inference/src/backends/agent-sdk/wire-read.ts:92` | unreferenced | delete | delete the key |
| `ANTHROPIC_EXTRAS_SCHEMAS.taskBudget.type` | `inference/src/backends/anthropic-messages/extras.ts:48` | unreferenced | delete | delete the key |
| `ANTHROPIC_EXTRAS_SCHEMAS.taskBudget.total` | `inference/src/backends/anthropic-messages/extras.ts:48` | unreferenced | delete | delete the key |
| `ANTHROPIC_EXTRAS_SCHEMAS.taskBudget.remaining` | `inference/src/backends/anthropic-messages/extras.ts:48` | unreferenced | delete | delete the key |
| `ANTHROPIC_EXTRAS_SCHEMAS.fallbacks.model` | `inference/src/backends/anthropic-messages/extras.ts:54` | unreferenced | delete | delete the key |
| `ANTHROPIC_EXTRAS_SCHEMAS.fallbacks.max_tokens` | `inference/src/backends/anthropic-messages/extras.ts:55` | unreferenced | delete | delete the key |
| `ANTHROPIC_EXTRAS_SCHEMAS.fallbacks.speed` | `inference/src/backends/anthropic-messages/extras.ts:56` | unreferenced | delete | delete the key |
| `ANTHROPIC_EXTRAS_SCHEMAS.contextManagement.edits` | `inference/src/backends/anthropic-messages/extras.ts:64` | unreferenced | delete | delete the key |
| `ANTHROPIC_EXTRAS_SCHEMAS.contextManagement.edits.type` | `inference/src/backends/anthropic-messages/extras.ts:64` | unreferenced | delete | delete the key |
| `tensorMetadataSchema.dtype` | `inference/src/backends/local-light/st-head.ts:44` | unreferenced | delete | delete the key |
| `openRouterRoutingSchema.order` | `inference/src/backends/openai-compat/chat.ts:98` | unreferenced | delete | delete the key |
| `openRouterRoutingSchema.allow_fallbacks` | `inference/src/backends/openai-compat/chat.ts:99` | unreferenced | delete | delete the key |
| `openRouterRoutingSchema.require_parameters` | `inference/src/backends/openai-compat/chat.ts:100` | unreferenced | delete | delete the key |
| `openRouterRoutingSchema.data_collection` | `inference/src/backends/openai-compat/chat.ts:101` | unreferenced | delete | delete the key |
| `openRouterRoutingSchema.only` | `inference/src/backends/openai-compat/chat.ts:102` | unreferenced | delete | delete the key |
| `openRouterRoutingSchema.ignore` | `inference/src/backends/openai-compat/chat.ts:103` | unreferenced | delete | delete the key |
| `openRouterRoutingSchema.quantizations` | `inference/src/backends/openai-compat/chat.ts:104` | unreferenced | delete | delete the key |
| `openRouterRoutingSchema.sort` | `inference/src/backends/openai-compat/chat.ts:105` | unreferenced | delete | delete the key |
| `openRouterRoutingSchema.max_price` | `inference/src/backends/openai-compat/chat.ts:106` | unreferenced | delete | delete the key |
| `openRouterPluginSchema.id` | `inference/src/backends/openai-compat/chat.ts:274` | unreferenced | delete | delete the key |
| `openRouterPluginSchema.max_results` | `inference/src/backends/openai-compat/chat.ts:274` | unreferenced | delete | delete the key |
| `openRouterPluginSchema.search_prompt` | `inference/src/backends/openai-compat/chat.ts:274` | unreferenced | delete | delete the key |
| `openRouterPluginSchema.engine` | `inference/src/backends/openai-compat/chat.ts:274` | unreferenced | delete | delete the key |
| `openRouterPluginSchema.max_files` | `inference/src/backends/openai-compat/chat.ts:275` | unreferenced | delete | delete the key |
| `openRouterPluginSchema.pdf` | `inference/src/backends/openai-compat/chat.ts:275` | unreferenced | delete | delete the key |
| `openRouterPluginSchema.pdf.engine` | `inference/src/backends/openai-compat/chat.ts:275` | unreferenced | delete | delete the key |
| `openRouterPluginSchema.allowed_models` | `inference/src/backends/openai-compat/chat.ts:278` | unreferenced | delete | delete the key |
| `openRouterDebugSchema.echo_upstream_body` | `inference/src/backends/openai-compat/chat.ts:288` | unreferenced | delete | delete the key |
| `openRouterWebSearchSchema.max_results` | `inference/src/backends/openai-compat/chat.ts:294` | unreferenced | delete | delete the key |
| `openRouterWebSearchSchema.search_prompt` | `inference/src/backends/openai-compat/chat.ts:295` | unreferenced | delete | delete the key |
| `openRouterWebSearchSchema.engine` | `inference/src/backends/openai-compat/chat.ts:296` | unreferenced | delete | delete the key |
| `EmbedOnceArgs.call` | `inference/src/backends/openai-compat/embed.ts:109` | never-read | delete | delete the field and its writes (`inference/src/backends/openai-compat/embed.ts:177`) |
| `WireMessage.role` | `inference/src/backends/openai-compat/image-embed.ts:28` | never-read | delete | delete the field and its writes (`inference/src/backends/openai-compat/image-embed.ts:42`) |
| `WireMessage.content` | `inference/src/backends/openai-compat/image-embed.ts:29` | never-read | delete | delete the field and its writes (`inference/src/backends/openai-compat/image-embed.ts:42`) |
| `embeddingsResponseSchema.data.index` | `inference/src/backends/openai-compat/image-embed.ts:33` | unreferenced | delete | delete the key |
| `ollamaChatResponseSchema.model` | `inference/src/backends/openai-compat/ollama-native.ts:368` | unreferenced | delete | delete the key |
| `ollamaChatResponseSchema.error` | `inference/src/backends/openai-compat/ollama-native.ts:369` | unreferenced | delete | delete the key |
| `ollamaChatResponseSchema.done` | `inference/src/backends/openai-compat/ollama-native.ts:370` | unreferenced | delete | delete the key |
| `ollamaChatResponseSchema.done_reason` | `inference/src/backends/openai-compat/ollama-native.ts:371` | unreferenced | delete | delete the key |
| `ollamaChatResponseSchema.prompt_eval_count` | `inference/src/backends/openai-compat/ollama-native.ts:372` | unreferenced | delete | delete the key |
| `ollamaChatResponseSchema.eval_count` | `inference/src/backends/openai-compat/ollama-native.ts:373` | unreferenced | delete | delete the key |
| `ollamaChatResponseSchema.prompt_eval_cached_count` | `inference/src/backends/openai-compat/ollama-native.ts:374` | unreferenced | delete | delete the key |
| `ollamaChatResponseSchema.message` | `inference/src/backends/openai-compat/ollama-native.ts:375` | unreferenced | delete | delete the key |
| `ollamaChatResponseSchema.message.content` | `inference/src/backends/openai-compat/ollama-native.ts:377` | unreferenced | delete | delete the key |
| `ollamaChatResponseSchema.message.thinking` | `inference/src/backends/openai-compat/ollama-native.ts:378` | unreferenced | delete | delete the key |
| `ollamaChatResponseSchema.message.tool_calls` | `inference/src/backends/openai-compat/ollama-native.ts:379` | unreferenced | delete | delete the key |
| `ollamaChatResponseSchema.message.tool_calls.id` | `inference/src/backends/openai-compat/ollama-native.ts:383` | unreferenced | delete | delete the key |
| `ollamaChatResponseSchema.message.tool_calls.function` | `inference/src/backends/openai-compat/ollama-native.ts:384` | unreferenced | delete | delete the key |
| `ollamaChatResponseSchema.message.tool_calls.function.name` | `inference/src/backends/openai-compat/ollama-native.ts:384` | unreferenced | delete | delete the key |
| `ollamaChatResponseSchema.message.tool_calls.function.arguments` | `inference/src/backends/openai-compat/ollama-native.ts:384` | unreferenced | delete | delete the key |
| `ScoreParam.content` | `inference/src/backends/openai-compat/rerank.ts:38` | never-read | delete | delete the field and its writes (`inference/src/backends/openai-compat/rerank.ts:53`) |
| `ClampLog.side` | `inference/src/backends/openai-compat/rerank.ts:66` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ClampLog.index` | `inference/src/backends/openai-compat/rerank.ts:67` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ClampLog.chars` | `inference/src/backends/openai-compat/rerank.ts:68` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ClampLog.clampedToChars` | `inference/src/backends/openai-compat/rerank.ts:69` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ClampLog.budget` | `inference/src/backends/openai-compat/rerank.ts:70` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `anthropicBagSchema.inputTransformations.type` | `inference/src/backends/wire/provider-metadata.ts:56` | unreferenced | delete | delete the key |
| `koboldVersionSchema.result` | `inference/src/catalog/detect.ts:14` | unreferenced | delete | delete the key |
| `llamaCppPropsSchema.build_info` | `inference/src/catalog/detect.ts:17` | unreferenced | delete | delete the key |
| `llamaCppPropsSchema.chat_template_caps` | `inference/src/catalog/detect.ts:18` | unreferenced | delete | delete the key |
| `ollamaVersionSchema.version` | `inference/src/catalog/detect.ts:20` | unreferenced | delete | delete the key |
| `vllmModelsSchema.data` | `inference/src/catalog/detect.ts:22` | unreferenced | delete | delete the key |
| `ollamaShowSchema.thinking.values` | `inference/src/catalog/endpoint.ts:238` | unreferenced | delete | delete the key |
| `ollamaShowSchema.thinking.default` | `inference/src/catalog/endpoint.ts:238` | unreferenced | delete | delete the key |
| `llamaCppPropsSchema.modalities.vision` | `inference/src/catalog/endpoint.ts:465` | unreferenced | delete | delete the key |
| `llamaCppPropsSchema.modalities.video` | `inference/src/catalog/endpoint.ts:465` | unreferenced | delete | delete the key |
| `llamaCppPropsSchema.modalities.audio` | `inference/src/catalog/endpoint.ts:465` | unreferenced | delete | delete the key |
| `AgentSdkLog.base` | `inference/src/contract/agent-sdk-backend.ts:94` | never-read | delete | delete the field and its writes (`inference/src/backends/agent-sdk/log.ts:12`) |
| `AgentSdkDeps.log` | `inference/src/contract/agent-sdk-backend.ts:138` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AgentSdkDeps.sessionStore` | `inference/src/contract/agent-sdk-backend.ts:140` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AgentSdkDeps.sessionWriter` | `inference/src/contract/agent-sdk-backend.ts:141` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `TurnStreamContext.resumed` | `inference/src/contract/agent-sdk-backend.ts:162` | never-read | delete | delete the field and its writes (`inference/src/backends/agent-sdk/runner.ts:224`) |
| `ProviderTurnLog.turnId` | `inference/src/contract/agent-sdk-backend.ts:223` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnLog.chatId` | `inference/src/contract/agent-sdk-backend.ts:224` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnLog.sessionId` | `inference/src/contract/agent-sdk-backend.ts:225` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnLog.apiKeySource` | `inference/src/contract/agent-sdk-backend.ts:226` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnLog.requestedModel` | `inference/src/contract/agent-sdk-backend.ts:227` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnLog.servedModel` | `inference/src/contract/agent-sdk-backend.ts:228` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnLog.disposition` | `inference/src/contract/agent-sdk-backend.ts:229` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnLog.terminalReason` | `inference/src/contract/agent-sdk-backend.ts:230` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnLog.numTurns` | `inference/src/contract/agent-sdk-backend.ts:232` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnLog.durationMs` | `inference/src/contract/agent-sdk-backend.ts:233` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnLog.ttftMs` | `inference/src/contract/agent-sdk-backend.ts:234` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnLog.ok` | `inference/src/contract/agent-sdk-backend.ts:235` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnLog.usage` | `inference/src/contract/agent-sdk-backend.ts:236` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnLog.contextUsage` | `inference/src/contract/agent-sdk-backend.ts:237` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `InferenceRuntime.funnel` | `inference/src/contract/api.ts:66` | never-read | delete | delete the field and its writes (`inference/src/index.ts:396`) |
| `WireMeta.cacheBreakpoint` | `inference/src/contract/chat.ts:30` | never-written | delete | delete the field and the branch that reads its default at `inference/src/backends/anthropic-messages/chat.ts:102` |
| `WireMeta.effort` | `inference/src/contract/chat.ts:32` | never-written | delete | delete the field and the branch that reads its default at `inference/src/backends/anthropic-messages/chat.ts:112` |
| `ChatRequestBase.posture` | `inference/src/contract/chat.ts:153` | never-written | delete | delete the field and the branch that reads its default at `inference/src/backends/anthropic-messages/chat.ts:381` |
| `ContextUsage.totalTokens` | `inference/src/contract/chat.ts:308` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ContextUsage.maxTokens` | `inference/src/contract/chat.ts:309` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ContextUsage.percentage` | `inference/src/contract/chat.ts:310` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ContextUsage.model` | `inference/src/contract/chat.ts:311` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AgentMcpServerHealth.name` | `inference/src/contract/chat.ts:315` | never-read | delete | delete the field and its writes (`inference/src/backends/agent-sdk/agent-runner.ts:71`) |
| `AgentMcpServerHealth.error` | `inference/src/contract/chat.ts:317` | never-read | delete | delete the field and its writes (`inference/src/backends/agent-sdk/agent-runner.ts:71`) |
| `ChatResult.reasoningRedacted` | `inference/src/contract/chat.ts:333` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatResult.apiErrorStatus` | `inference/src/contract/chat.ts:341` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatResult.contextUsage` | `inference/src/contract/chat.ts:368` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatResult.mcpServerHealth` | `inference/src/contract/chat.ts:369` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatResult.rateLimit` | `inference/src/contract/chat.ts:371` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RateLimitSnapshot.surpassedThreshold` | `inference/src/contract/events.ts:23` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RateLimitSnapshot.overageStatus` | `inference/src/contract/events.ts:24` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RateLimitSnapshot.overageResetsAt` | `inference/src/contract/events.ts:25` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RateLimitSnapshot.overageDisabledReason` | `inference/src/contract/events.ts:26` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RateLimitSnapshot.errorCode` | `inference/src/contract/events.ts:27` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `FetchJsonResult.status` | `inference/src/contract/http.ts:51` | never-read | delete | delete the field and its writes (`inference/src/backends/http/fetch-json.ts:143`) |
| `FetchJsonResult.headers` | `inference/src/contract/http.ts:52` | never-read | delete | delete the field and its writes (`inference/src/backends/http/fetch-json.ts:143`) |
| `ProviderTurnUsage.tokensIn` | `inference/src/contract/http.ts:69` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnUsage.tokensOut` | `inference/src/contract/http.ts:70` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnUsage.reasoningTokens` | `inference/src/contract/http.ts:71` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnUsage.cacheReadTokens` | `inference/src/contract/http.ts:72` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnUsage.cacheWriteTokens` | `inference/src/contract/http.ts:73` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderTurnUsage.costUsd` | `inference/src/contract/http.ts:74` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderCapabilityDrop.code` | `inference/src/contract/http.ts:132` | unreferenced | delete | delete the field |
| `ProviderCapabilityDrop.message` | `inference/src/contract/http.ts:133` | unreferenced | delete | delete the field |
| `ProviderCacheLog.turnId` | `inference/src/contract/http.ts:138` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderCacheLog.cacheReadTokens` | `inference/src/contract/http.ts:139` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderCacheLog.cacheWriteTokens` | `inference/src/contract/http.ts:140` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderCacheLog.breakpointsPlaced` | `inference/src/contract/http.ts:141` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderCacheLog.breakpointOffsets` | `inference/src/contract/http.ts:142` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderCacheLog.hitRatio` | `inference/src/contract/http.ts:143` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderCacheLog.minCacheTokens` | `inference/src/contract/http.ts:144` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ProviderSamplingDrop.knob` | `inference/src/contract/http.ts:174` | unreferenced | delete | delete the field |
| `ProviderSamplingDrop.reason` | `inference/src/contract/http.ts:175` | unreferenced | delete | delete the field |
| `LocalLightPrefetchRecord.status` | `inference/src/contract/local-light.ts:70` | never-read | delete | delete the field and its writes (`inference/src/backends/local-light/prefetch.ts:40`) |
| `LocalLightPrefetchRecord.updatedAt` | `inference/src/contract/local-light.ts:72` | never-read | delete | delete the field and its writes (`inference/src/backends/local-light/prefetch.ts:40`) |
| `BackendDef.serves` | `inference/src/contract/registry.ts:6` | never-read | delete | delete the field and its writes (`inference/src/registry/backends.ts:41`) |
| `ResolvedEmbedKnobs.warnings` | `inference/src/contract/resolve.ts:97` | never-read | delete | delete the field and its writes (`inference/src/funnel/resolve-embed.ts:21`) |
| `ImageGenerateRequest.owner` | `inference/src/contract/roles.ts:113` | unreferenced | delete | delete the field |
| `endpointModelSchema.contextFloor` | `inference/src/contract/runtime.ts:76` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/catalog/endpoint.ts:330` |
| `endpointModelSchema.toolChoice.required` | `inference/src/contract/runtime.ts:99` | unreferenced | delete | delete the key |
| `endpointModelSchema.toolChoice.named` | `inference/src/contract/runtime.ts:99` | unreferenced | delete | delete the key |
| `endpointModelSchema.toolChoice.none` | `inference/src/contract/runtime.ts:99` | unreferenced | delete | delete the key |
| `endpointModelSchema.toolChoice.parallel` | `inference/src/contract/runtime.ts:99` | unreferenced | delete | delete the key |
| `InferenceDeps.app.name` | `inference/src/contract/runtime.ts:223` | never-read | delete | delete the field and its writes (`server/src/entry/compose/services.ts:721`) |
| `InferenceDeps.app.url` | `inference/src/contract/runtime.ts:223` | never-read | delete | delete the field and its writes (`server/src/entry/compose/services.ts:721`) |
| `PlanRow.text` | `inference/src/contract/v4.ts:162` | never-read | delete | delete the field and its writes (`inference/src/backends/v4/prompt.ts:235`) |
| `OpenRouterRouting.order` | `inference/src/contract/wire.ts:6` | never-read | delete | delete the field and its writes (`inference/src/backends/wire/cache-control.ts:70`) |
| `OpenRouterRouting.allow_fallbacks` | `inference/src/contract/wire.ts:7` | never-read | delete | delete the field and its writes (`inference/src/backends/wire/cache-control.ts:70`) |
| `AnthropicCacheDirective.type` | `inference/src/contract/wire.ts:67` | never-read | delete | delete the field and its writes (`inference/src/backends/wire/cache-control.ts:16`) |
| `AnthropicCacheDirective.ttl` | `inference/src/contract/wire.ts:69` | never-read | delete | delete the field and its writes (`inference/src/backends/wire/cache-control.ts:16`) |
| `Hop.actorKind` | `inference/src/resolve/precedence.ts:13` | unreferenced | delete | delete the field |
| `Hop.actorId` | `inference/src/resolve/precedence.ts:14` | unreferenced | delete | delete the field |
| `Hop.task` | `inference/src/resolve/precedence.ts:15` | unreferenced | delete | delete the field |
| `FoldResult.via` | `inference/src/resolve/precedence.ts:35` | never-read | delete | delete the field and its writes (`inference/src/resolve/precedence.ts:51`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
