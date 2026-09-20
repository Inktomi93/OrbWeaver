# Vercel AI SDK docs mirror — ai@7.0.107

Verbatim snapshot of the upstream AI SDK documentation, taken 2026-09-19 from the `vercel/ai` repository
at tag `ai@7.0.107` (commit `08ae5ad05bc12496dd1ffcf64e34419e0831300d`, 2026-09-18) — the `content/`
tree that renders `ai-sdk.dev`. **Reference only — never edit these files; re-fetch on a version bump.**
Files are the upstream `.mdx` renamed to `.md`; bodies are byte-identical (MDX components such as
`<Note>` / `<Tabs>` are left as-is). The `docs/vendor/**` rule applies: excluded from the doc catalog,
never formatted.

Installed pins (pnpm-workspace catalog, exact, 2026-09-19): `ai@7.0.107` · `@ai-sdk/provider@4.0.17` ·
`@ai-sdk/openai-compatible@3.0.53` · `@ai-sdk/anthropic@4.0.58` · `@openrouter/ai-sdk-provider@3.0.0`.
The docs tree is cut from the same `ai@7.0.107` tag, so the core pages match the installed core exactly;
the provider packages release independently and their docs pages are whatever the monorepo carried at
that commit.

Sizes: `docs/` (~3.0 MiB, incl. the 1.2 MiB `07-reference/` API reference) · `providers/` (~1.9 MiB) ·
`cookbook/` (~0.7 MiB) · 541 files total. Upstream's `tools-registry/` (a `.ts` registry, no prose) was
skipped.

## Start here (the pages relevant to `@orb/inference`)

- `docs/03-ai-sdk-core/` — the core API: `generateText`/`streamText`, structured output, tools,
  embeddings, image generation, provider management, middleware, error handling, telemetry.
- `docs/02-foundations/` — prompts, providers & models, tools, streaming concepts.
- `docs/07-reference/01-ai-sdk-core/` — the per-function reference; `docs/07-reference/` also covers
  `ai-sdk-ui`, `ai-sdk-rsc`, stream helpers and errors.
- `providers/01-ai-sdk-providers/05-anthropic.md` — the Anthropic provider (`@ai-sdk/anthropic`).
- `providers/04-openai-compatible-providers/` — the openai-compatible provider (`@ai-sdk/openai-compatible`);
  `01-custom-providers.md` is the "write your own" guide.
- `providers/05-community-providers/32-openrouter.md` — the OpenRouter provider page in the SDK docs.
- `openrouter/` — `@openrouter/ai-sdk-provider@3.0.0`'s own `README.md` + `CHANGELOG.md` (tag `3.0.0`
  of `OpenRouterTeam/ai-sdk-provider`), plus `openrouter-docs-vercel-ai-sdk.md`, the OpenRouter-side
  integration page (`openrouter.ai/docs/guides/community/vercel-ai-sdk`, fetched 2026-09-19).
- `packages/` — the package READMEs at the tag: `ai.md`, `anthropic.md`, `openai-compatible.md`,
  `provider.md` (the provider spec package — the `LanguageModelV4` etc. interfaces our wires build on).
- `docs/08-migration-guides/` — every major-version migration guide (useful when reading older examples).
- `docs/09-troubleshooting/` — known failure modes.
- `cookbook/` — worked recipes (node, next, rsc, api-servers, guides).

## Full page list

## `docs/00-introduction/`

- `docs/00-introduction/index.md` — AI SDK by Vercel

## `docs/02-foundations/`

- `docs/02-foundations/01-overview.md` — Overview
- `docs/02-foundations/02-providers-and-models.md` — Providers and Models
- `docs/02-foundations/03-prompts.md` — Prompts
- `docs/02-foundations/04-tools.md` — Tools
- `docs/02-foundations/05-streaming.md` — Streaming
- `docs/02-foundations/06-provider-options.md` — Provider Options
- `docs/02-foundations/index.md` — Foundations

## `docs/02-getting-started/`

- `docs/02-getting-started/00-choosing-a-provider.md` — Choosing a Provider
- `docs/02-getting-started/01-navigating-the-library.md` — Navigating the Library
- `docs/02-getting-started/02-nextjs-app-router.md` — Next.js App Router
- `docs/02-getting-started/03-nextjs-pages-router.md` — Next.js Pages Router
- `docs/02-getting-started/04-svelte.md` — Svelte
- `docs/02-getting-started/05-nuxt.md` — Vue.js (Nuxt)
- `docs/02-getting-started/06-nodejs.md` — Node.js
- `docs/02-getting-started/07-expo.md` — Expo
- `docs/02-getting-started/08-tanstack-start.md` — TanStack Start
- `docs/02-getting-started/09-coding-agents.md` — Coding Agents
- `docs/02-getting-started/index.md` — Getting Started

## `docs/03-agents/`

- `docs/03-agents/01-overview.md` — Overview
- `docs/03-agents/02-building-agents.md` — Building Agents
- `docs/03-agents/03-workflows.md` — Workflow Patterns
- `docs/03-agents/04-loop-control.md` — Loop Control
- `docs/03-agents/05-configuring-call-options.md` — Configuring Call Options
- `docs/03-agents/06-memory.md` — Memory
- `docs/03-agents/06-policy-tool-approvals.md` — Policy-Based Tool Approvals
- `docs/03-agents/06-subagents.md` — Subagents
- `docs/03-agents/06-tool-approvals.md` — Tool Approvals
- `docs/03-agents/07-workflow-agent.md` — WorkflowAgent
- `docs/03-agents/08-terminal-ui.md` — Terminal UI
- `docs/03-agents/index.md` — Agents

## `docs/03-ai-sdk-core/`

- `docs/03-ai-sdk-core/01-overview.md` — Overview
- `docs/03-ai-sdk-core/05-generating-text.md` — Generating Text
- `docs/03-ai-sdk-core/10-generating-structured-data.md` — Generating Structured Data
- `docs/03-ai-sdk-core/15-tools-and-tool-calling.md` — Tool Calling
- `docs/03-ai-sdk-core/16-mcp-tools.md` — Model Context Protocol (MCP)
- `docs/03-ai-sdk-core/17-mcp-apps.md` — MCP Apps
- `docs/03-ai-sdk-core/17-runtime-and-tool-context.md` — Runtime and Tool Context
- `docs/03-ai-sdk-core/18-code-mode.md` — Code Mode
- `docs/03-ai-sdk-core/19-tool-search.md` — Tool Search
- `docs/03-ai-sdk-core/20-prompt-engineering.md` — Prompt Engineering
- `docs/03-ai-sdk-core/25-settings.md` — Settings
- `docs/03-ai-sdk-core/26-reasoning.md` — Reasoning
- `docs/03-ai-sdk-core/30-embeddings.md` — Embeddings
- `docs/03-ai-sdk-core/31-reranking.md` — Reranking
- `docs/03-ai-sdk-core/32-evaluation.md` — Evaluation
- `docs/03-ai-sdk-core/35-image-generation.md` — Image Generation
- `docs/03-ai-sdk-core/36-realtime.md` — Realtime
- `docs/03-ai-sdk-core/36-transcription.md` — Transcription
- `docs/03-ai-sdk-core/36-translation.md` — Translation
- `docs/03-ai-sdk-core/37-speech.md` — Speech
- `docs/03-ai-sdk-core/38-video-generation.md` — Video Generation
- `docs/03-ai-sdk-core/39-file-uploads.md` — File Uploads
- `docs/03-ai-sdk-core/40-middleware.md` — Language Model Middleware
- `docs/03-ai-sdk-core/41-skill-uploads.md` — Skill Uploads
- `docs/03-ai-sdk-core/42-batch.md` — Batch
- `docs/03-ai-sdk-core/45-provider-management.md` — Provider & Model Management
- `docs/03-ai-sdk-core/50-error-handling.md` — Error Handling
- `docs/03-ai-sdk-core/55-testing.md` — Testing
- `docs/03-ai-sdk-core/60-telemetry.md` — Telemetry
- `docs/03-ai-sdk-core/65-devtools.md` — DevTools
- `docs/03-ai-sdk-core/65-lifecycle-callbacks.md` — Lifecycle Callbacks
- `docs/03-ai-sdk-core/index.md` — AI SDK Core

## `docs/03-ai-sdk-harnesses/`

- `docs/03-ai-sdk-harnesses/01-overview.md` — Overview
- `docs/03-ai-sdk-harnesses/02-harness-agent.md` — HarnessAgent
- `docs/03-ai-sdk-harnesses/03-tools.md` — Tools
- `docs/03-ai-sdk-harnesses/04-skills.md` — Skills
- `docs/03-ai-sdk-harnesses/05-harness-adapters.md` — Harness Adapters
- `docs/03-ai-sdk-harnesses/06-workflow-utilities.md` — Workflow Utilities
- `docs/03-ai-sdk-harnesses/07-ui.md` — UI
- `docs/03-ai-sdk-harnesses/08-terminal-ui.md` — Terminal UI
- `docs/03-ai-sdk-harnesses/index.md` — AI SDK Harnesses

## `docs/04-ai-sdk-ui/`

- `docs/04-ai-sdk-ui/01-overview.md` — Overview
- `docs/04-ai-sdk-ui/02-chatbot.md` — Chatbot
- `docs/04-ai-sdk-ui/03-chatbot-message-persistence.md` — Chatbot Message Persistence
- `docs/04-ai-sdk-ui/03-chatbot-resume-streams.md` — Chatbot Resume Streams
- `docs/04-ai-sdk-ui/03-chatbot-tool-usage.md` — Chatbot Tool Usage
- `docs/04-ai-sdk-ui/04-generative-user-interfaces.md` — Generative User Interfaces
- `docs/04-ai-sdk-ui/05-completion.md` — Completion
- `docs/04-ai-sdk-ui/08-object-generation.md` — Object Generation
- `docs/04-ai-sdk-ui/20-streaming-data.md` — Streaming Custom Data
- `docs/04-ai-sdk-ui/21-error-handling.md` — Error Handling
- `docs/04-ai-sdk-ui/21-transport.md` — Transport
- `docs/04-ai-sdk-ui/24-reading-ui-message-streams.md` — Reading UIMessage Streams
- `docs/04-ai-sdk-ui/25-message-metadata.md` — Message Metadata
- `docs/04-ai-sdk-ui/50-stream-protocol.md` — Stream Protocols
- `docs/04-ai-sdk-ui/index.md` — AI SDK UI

## `docs/05-ai-sdk-rsc/`

- `docs/05-ai-sdk-rsc/01-overview.md` — Overview
- `docs/05-ai-sdk-rsc/02-streaming-react-components.md` — Streaming React Components
- `docs/05-ai-sdk-rsc/03-generative-ui-state.md` — Managing Generative UI State
- `docs/05-ai-sdk-rsc/03-saving-and-restoring-states.md` — Saving and Restoring States
- `docs/05-ai-sdk-rsc/04-multistep-interfaces.md` — Multistep Interfaces
- `docs/05-ai-sdk-rsc/05-streaming-values.md` — Streaming Values
- `docs/05-ai-sdk-rsc/06-loading-state.md` — Handling Loading State
- `docs/05-ai-sdk-rsc/08-error-handling.md` — Error Handling
- `docs/05-ai-sdk-rsc/09-authentication.md` — Handling Authentication
- `docs/05-ai-sdk-rsc/10-migrating-to-ui.md` — Migrating from RSC to UI
- `docs/05-ai-sdk-rsc/index.md` — AI SDK RSC

## `docs/06-advanced/`

- `docs/06-advanced/01-prompt-engineering.md` — Prompt Engineering
- `docs/06-advanced/02-stopping-streams.md` — Stopping Streams
- `docs/06-advanced/03-backpressure.md` — Backpressure
- `docs/06-advanced/04-caching.md` — Caching
- `docs/06-advanced/05-multiple-streamables.md` — Multiple Streamables
- `docs/06-advanced/06-rate-limiting.md` — Rate Limiting
- `docs/06-advanced/07-rendering-ui-with-language-models.md` — Rendering UI with Language Models
- `docs/06-advanced/08-model-as-router.md` — Language Models as Routers
- `docs/06-advanced/09-multistep-interfaces.md` — Multistep Interfaces
- `docs/06-advanced/09-sequential-generations.md` — Sequential Generations
- `docs/06-advanced/10-vercel-deployment-guide.md` — Vercel Deployment Guide
- `docs/06-advanced/11-secure-url-fetching.md` — Secure URL Fetching
- `docs/06-advanced/index.md` — Advanced

## `docs/07-reference/`

- `docs/07-reference/01-ai-sdk-core/01-generate-text.md` — generateText
- `docs/07-reference/01-ai-sdk-core/02-stream-text.md` — streamText
- `docs/07-reference/01-ai-sdk-core/05-embed.md` — embed
- `docs/07-reference/01-ai-sdk-core/06-embed-many.md` — embedMany
- `docs/07-reference/01-ai-sdk-core/06-rerank.md` — rerank
- `docs/07-reference/01-ai-sdk-core/10-generate-image.md` — generateImage
- `docs/07-reference/01-ai-sdk-core/11-stream-transcribe.md` — experimental_streamTranscribe
- `docs/07-reference/01-ai-sdk-core/11-stream-translate.md` — experimental_streamTranslate
- `docs/07-reference/01-ai-sdk-core/11-transcribe.md` — transcribe
- `docs/07-reference/01-ai-sdk-core/12-generate-speech.md` — generateSpeech
- `docs/07-reference/01-ai-sdk-core/13-generate-video.md` — experimental_generateVideo
- `docs/07-reference/01-ai-sdk-core/14-evaluate.md` — experimental_evaluate
- `docs/07-reference/01-ai-sdk-core/14-upload-file.md` — uploadFile
- `docs/07-reference/01-ai-sdk-core/14-upload-skill.md` — uploadSkill
- `docs/07-reference/01-ai-sdk-core/15-agent.md` — Agent (Interface)
- `docs/07-reference/01-ai-sdk-core/16-tool-loop-agent.md` — ToolLoopAgent
- `docs/07-reference/01-ai-sdk-core/17-create-agent-ui-stream.md` — createAgentUIStream
- `docs/07-reference/01-ai-sdk-core/18-create-agent-ui-stream-response.md` — createAgentUIStreamResponse
- `docs/07-reference/01-ai-sdk-core/18-pipe-agent-ui-stream-to-response.md` — pipeAgentUIStreamToResponse
- `docs/07-reference/01-ai-sdk-core/20-start-batch.md` — experimental_startBatch
- `docs/07-reference/01-ai-sdk-core/20-tool.md` — tool
- `docs/07-reference/01-ai-sdk-core/21-get-batch-status.md` — experimental_getBatchStatus
- `docs/07-reference/01-ai-sdk-core/22-dynamic-tool.md` — dynamicTool
- `docs/07-reference/01-ai-sdk-core/22-get-batch-results.md` — experimental_getBatchResults
- `docs/07-reference/01-ai-sdk-core/23-cancel-batch.md` — experimental_cancelBatch
- `docs/07-reference/01-ai-sdk-core/23-create-mcp-client.md` — createMCPClient
- `docs/07-reference/01-ai-sdk-core/23-get-realtime-tool-definitions.md` — experimental_getRealtimeToolDefinitions
- `docs/07-reference/01-ai-sdk-core/23-tool-search.md` — toolSearch
- `docs/07-reference/01-ai-sdk-core/24-list-batches.md` — experimental_listBatches
- `docs/07-reference/01-ai-sdk-core/24-mcp-apps.md` — MCP Apps
- `docs/07-reference/01-ai-sdk-core/24-mcp-stdio-transport.md` — Experimental_StdioMCPTransport
- `docs/07-reference/01-ai-sdk-core/25-json-schema.md` — jsonSchema
- `docs/07-reference/01-ai-sdk-core/26-zod-schema.md` — zodSchema
- `docs/07-reference/01-ai-sdk-core/27-valibot-schema.md` — valibotSchema
- `docs/07-reference/01-ai-sdk-core/28-output.md` — Output
- `docs/07-reference/01-ai-sdk-core/29-filter-active-tools.md` — filterActiveTools
- `docs/07-reference/01-ai-sdk-core/30-model-message.md` — ModelMessage
- `docs/07-reference/01-ai-sdk-core/31-ui-message.md` — UIMessage
- `docs/07-reference/01-ai-sdk-core/32-validate-ui-messages.md` — validateUIMessages
- `docs/07-reference/01-ai-sdk-core/33-safe-validate-ui-messages.md` — safeValidateUIMessages
- `docs/07-reference/01-ai-sdk-core/34-sandbox.md` — Experimental_SandboxSession
- `docs/07-reference/01-ai-sdk-core/40-provider-registry.md` — createProviderRegistry
- `docs/07-reference/01-ai-sdk-core/42-custom-provider.md` — customProvider
- `docs/07-reference/01-ai-sdk-core/50-cosine-similarity.md` — cosineSimilarity
- `docs/07-reference/01-ai-sdk-core/60-wrap-language-model.md` — wrapLanguageModel
- `docs/07-reference/01-ai-sdk-core/61-wrap-image-model.md` — wrapImageModel
- `docs/07-reference/01-ai-sdk-core/65-language-model-v2-middleware.md` — LanguageModelV4Middleware
- `docs/07-reference/01-ai-sdk-core/66-extract-reasoning-middleware.md` — extractReasoningMiddleware
- `docs/07-reference/01-ai-sdk-core/67-simulate-streaming-middleware.md` — simulateStreamingMiddleware
- `docs/07-reference/01-ai-sdk-core/68-default-instructions-middleware.md` — defaultInstructionsMiddleware
- `docs/07-reference/01-ai-sdk-core/68-default-settings-middleware.md` — defaultSettingsMiddleware
- `docs/07-reference/01-ai-sdk-core/69-add-tool-input-examples-middleware.md` — addToolInputExamplesMiddleware
- `docs/07-reference/01-ai-sdk-core/70-extract-json-middleware.md` — extractJsonMiddleware
- `docs/07-reference/01-ai-sdk-core/70-is-step-count.md` — isStepCount
- `docs/07-reference/01-ai-sdk-core/71-has-tool-call.md` — hasToolCall
- `docs/07-reference/01-ai-sdk-core/72-loop-finished.md` — isLoopFinished
- `docs/07-reference/01-ai-sdk-core/75-simulate-readable-stream.md` — simulateReadableStream
- `docs/07-reference/01-ai-sdk-core/80-smooth-stream.md` — smoothStream
- `docs/07-reference/01-ai-sdk-core/90-generate-id.md` — generateId
- `docs/07-reference/01-ai-sdk-core/91-create-id-generator.md` — createIdGenerator
- `docs/07-reference/01-ai-sdk-core/92-default-generated-file.md` — DefaultGeneratedFile
- `docs/07-reference/01-ai-sdk-core/index.md` — AI SDK Core
- `docs/07-reference/02-ai-sdk-ui/01-use-chat.md` — useChat
- `docs/07-reference/02-ai-sdk-ui/02-use-completion.md` — useCompletion
- `docs/07-reference/02-ai-sdk-ui/03-use-object.md` — useObject
- `docs/07-reference/02-ai-sdk-ui/05-use-realtime.md` — experimental_useRealtime
- `docs/07-reference/02-ai-sdk-ui/31-convert-to-model-messages.md` — convertToModelMessages
- `docs/07-reference/02-ai-sdk-ui/32-prune-messages.md` — pruneMessages
- `docs/07-reference/02-ai-sdk-ui/40-create-ui-message-stream.md` — createUIMessageStream
- `docs/07-reference/02-ai-sdk-ui/41-create-ui-message-stream-response.md` — createUIMessageStreamResponse
- `docs/07-reference/02-ai-sdk-ui/42-pipe-ui-message-stream-to-response.md` — pipeUIMessageStreamToResponse
- `docs/07-reference/02-ai-sdk-ui/43-read-ui-message-stream.md` — readUIMessageStream
- `docs/07-reference/02-ai-sdk-ui/46-infer-ui-tools.md` — InferUITools
- `docs/07-reference/02-ai-sdk-ui/47-infer-ui-tool.md` — InferUITool
- `docs/07-reference/02-ai-sdk-ui/48-mcp-app-renderer.md` — experimental_MCPAppRenderer
- `docs/07-reference/02-ai-sdk-ui/50-direct-chat-transport.md` — DirectChatTransport
- `docs/07-reference/02-ai-sdk-ui/index.md` — AI SDK UI
- `docs/07-reference/03-ai-sdk-rsc/01-stream-ui.md` — streamUI
- `docs/07-reference/03-ai-sdk-rsc/02-create-ai.md` — createAI
- `docs/07-reference/03-ai-sdk-rsc/03-create-streamable-ui.md` — createStreamableUI
- `docs/07-reference/03-ai-sdk-rsc/04-create-streamable-value.md` — createStreamableValue
- `docs/07-reference/03-ai-sdk-rsc/05-read-streamable-value.md` — readStreamableValue
- `docs/07-reference/03-ai-sdk-rsc/06-get-ai-state.md` — getAIState
- `docs/07-reference/03-ai-sdk-rsc/07-get-mutable-ai-state.md` — getMutableAIState
- `docs/07-reference/03-ai-sdk-rsc/08-use-ai-state.md` — useAIState
- `docs/07-reference/03-ai-sdk-rsc/09-use-actions.md` — useActions
- `docs/07-reference/03-ai-sdk-rsc/10-use-ui-state.md` — useUIState
- `docs/07-reference/03-ai-sdk-rsc/11-use-streamable-value.md` — useStreamableValue
- `docs/07-reference/03-ai-sdk-rsc/20-render.md` — render (Removed)
- `docs/07-reference/03-ai-sdk-rsc/index.md` — AI SDK RSC
- `docs/07-reference/04-ai-sdk-workflow/01-workflow-agent.md` — WorkflowAgent
- `docs/07-reference/04-ai-sdk-workflow/02-workflow-chat-transport.md` — WorkflowChatTransport
- `docs/07-reference/04-ai-sdk-workflow/03-generate-video.md` — generateVideo
- `docs/07-reference/04-ai-sdk-workflow/index.md` — AI SDK Workflow
- `docs/07-reference/05-ai-sdk-errors/ai-api-call-error.md` — AI_APICallError
- `docs/07-reference/05-ai-sdk-errors/ai-download-error.md` — AI_DownloadError
- `docs/07-reference/05-ai-sdk-errors/ai-empty-response-body-error.md` — AI_EmptyResponseBodyError
- `docs/07-reference/05-ai-sdk-errors/ai-evaluation-unsupported-question-type-error.md` — AI_EvaluationUnsupportedQuestionTypeError
- `docs/07-reference/05-ai-sdk-errors/ai-invalid-argument-error.md` — AI_InvalidArgumentError
- `docs/07-reference/05-ai-sdk-errors/ai-invalid-data-content-error.md` — AI_InvalidDataContentError
- `docs/07-reference/05-ai-sdk-errors/ai-invalid-message-role-error.md` — AI_InvalidMessageRoleError
- `docs/07-reference/05-ai-sdk-errors/ai-invalid-prompt-error.md` — AI_InvalidPromptError
- `docs/07-reference/05-ai-sdk-errors/ai-invalid-response-data-error.md` — AI_InvalidResponseDataError
- `docs/07-reference/05-ai-sdk-errors/ai-invalid-tool-approval-error.md` — AI_InvalidToolApprovalError
- `docs/07-reference/05-ai-sdk-errors/ai-invalid-tool-approval-signature-error.md` — AI_InvalidToolApprovalSignatureError
- `docs/07-reference/05-ai-sdk-errors/ai-invalid-tool-input-error.md` — AI_InvalidToolInputError
- `docs/07-reference/05-ai-sdk-errors/ai-json-parse-error.md` — AI_JSONParseError
- `docs/07-reference/05-ai-sdk-errors/ai-load-api-key-error.md` — AI_LoadAPIKeyError
- `docs/07-reference/05-ai-sdk-errors/ai-load-setting-error.md` — AI_LoadSettingError
- `docs/07-reference/05-ai-sdk-errors/ai-message-conversion-error.md` — AI_MessageConversionError
- `docs/07-reference/05-ai-sdk-errors/ai-no-content-generated-error.md` — AI_NoContentGeneratedError
- `docs/07-reference/05-ai-sdk-errors/ai-no-image-generated-error.md` — AI_NoImageGeneratedError
- `docs/07-reference/05-ai-sdk-errors/ai-no-object-generated-error.md` — AI_NoObjectGeneratedError
- `docs/07-reference/05-ai-sdk-errors/ai-no-output-generated-error.md` — AI_NoOutputGeneratedError
- `docs/07-reference/05-ai-sdk-errors/ai-no-speech-generated-error.md` — AI_NoSpeechGeneratedError
- `docs/07-reference/05-ai-sdk-errors/ai-no-such-model-error.md` — AI_NoSuchModelError
- `docs/07-reference/05-ai-sdk-errors/ai-no-such-provider-error.md` — AI_NoSuchProviderError
- `docs/07-reference/05-ai-sdk-errors/ai-no-such-provider-reference-error.md` — AI_NoSuchProviderReferenceError
- `docs/07-reference/05-ai-sdk-errors/ai-no-such-tool-error.md` — AI_NoSuchToolError
- `docs/07-reference/05-ai-sdk-errors/ai-no-transcript-generated-error.md` — AI_NoTranscriptGeneratedError
- `docs/07-reference/05-ai-sdk-errors/ai-no-translation-generated-error.md` — AI_NoTranslationGeneratedError
- `docs/07-reference/05-ai-sdk-errors/ai-no-video-generated-error.md` — AI_NoVideoGeneratedError
- `docs/07-reference/05-ai-sdk-errors/ai-retry-error.md` — AI_RetryError
- `docs/07-reference/05-ai-sdk-errors/ai-stream-provider-error.md` — AI_StreamProviderError
- `docs/07-reference/05-ai-sdk-errors/ai-too-many-embedding-values-for-call-error.md` — AI_TooManyEmbeddingValuesForCallError
- `docs/07-reference/05-ai-sdk-errors/ai-tool-call-not-found-for-approval-error.md` — AI_ToolCallNotFoundForApprovalError
- `docs/07-reference/05-ai-sdk-errors/ai-tool-call-repair-error.md` — ToolCallRepairError
- `docs/07-reference/05-ai-sdk-errors/ai-tool-choice-violation-error.md` — ToolChoiceViolationError
- `docs/07-reference/05-ai-sdk-errors/ai-type-validation-error.md` — AI_TypeValidationError
- `docs/07-reference/05-ai-sdk-errors/ai-ui-message-stream-error.md` — AI_UIMessageStreamError
- `docs/07-reference/05-ai-sdk-errors/ai-unsupported-functionality-error.md` — AI_UnsupportedFunctionalityError
- `docs/07-reference/05-ai-sdk-errors/index.md` — AI SDK Errors
- `docs/07-reference/06-ai-sdk-tui/01-run-agent-tui.md` — runAgentTUI
- `docs/07-reference/06-ai-sdk-tui/index.md` — AI SDK TUI
- `docs/07-reference/index.md` — Reference

## `docs/08-migration-guides/`

- `docs/08-migration-guides/00-versioning.md` — Versioning
- `docs/08-migration-guides/23-migration-guide-7-0.md` — Migrate AI SDK 6.x to 7.0
- `docs/08-migration-guides/24-migration-guide-6-0.md` — Migrate AI SDK 5.x to 6.0
- `docs/08-migration-guides/25-migration-guide-5-0-data.md` — Migrate Your Data to AI SDK 5.0
- `docs/08-migration-guides/26-migration-guide-5-0.md` — Migrate AI SDK 4.x to 5.0
- `docs/08-migration-guides/27-migration-guide-4-2.md` — Migrate AI SDK 4.1 to 4.2
- `docs/08-migration-guides/28-migration-guide-4-1.md` — Migrate AI SDK 4.0 to 4.1
- `docs/08-migration-guides/29-migration-guide-4-0.md` — Migrate AI SDK 3.4 to 4.0
- `docs/08-migration-guides/36-migration-guide-3-4.md` — Migrate AI SDK 3.3 to 3.4
- `docs/08-migration-guides/37-migration-guide-3-3.md` — Migrate AI SDK 3.2 to 3.3
- `docs/08-migration-guides/38-migration-guide-3-2.md` — Migrate AI SDK 3.1 to 3.2
- `docs/08-migration-guides/39-migration-guide-3-1.md` — Migrate AI SDK 3.0 to 3.1
- `docs/08-migration-guides/index.md` — Migration Guides

## `docs/09-troubleshooting/`

- `docs/09-troubleshooting/01-azure-stream-slow.md` — Azure OpenAI Slow to Stream
- `docs/09-troubleshooting/03-server-actions-in-client-components.md` — Server Actions in Client Components
- `docs/09-troubleshooting/04-strange-stream-output.md` — useChat/useCompletion stream output contains 0:... instead of text
- `docs/09-troubleshooting/05-streamable-ui-errors.md` — Streamable UI Errors
- `docs/09-troubleshooting/05-tool-invocation-missing-result.md` — Tool Invocation Missing Result Error
- `docs/09-troubleshooting/06-streaming-not-working-when-deployed.md` — Streaming Not Working When Deployed
- `docs/09-troubleshooting/06-streaming-not-working-when-proxied.md` — Streaming Not Working When Proxied
- `docs/09-troubleshooting/06-timeout-on-vercel.md` — Getting Timeouts When Deploying on Vercel
- `docs/09-troubleshooting/07-unclosed-streams.md` — Unclosed Streams
- `docs/09-troubleshooting/08-use-chat-failed-to-parse-stream.md` — useChat Failed to Parse Stream
- `docs/09-troubleshooting/09-client-stream-error.md` — Server Action Plain Objects Error
- `docs/09-troubleshooting/10-use-chat-tools-no-response.md` — useChat No Response
- `docs/09-troubleshooting/11-use-chat-custom-request-options.md` — Custom headers, body, and credentials not working with useChat
- `docs/09-troubleshooting/12-typescript-performance-zod.md` — TypeScript performance issues with Zod and AI SDK 5
- `docs/09-troubleshooting/12-use-chat-an-error-occurred.md` — useChat "An error occurred
- `docs/09-troubleshooting/13-repeated-assistant-messages.md` — Repeated assistant messages in useChat
- `docs/09-troubleshooting/14-stream-abort-handling.md` — onEnd not called when stream is aborted
- `docs/09-troubleshooting/14-tool-calling-with-structured-outputs.md` — Tool calling with structured outputs
- `docs/09-troubleshooting/15-abort-breaks-resumable-streams.md` — Abort and resumable streams
- `docs/09-troubleshooting/15-stream-text-not-working.md` — streamText fails silently
- `docs/09-troubleshooting/16-streaming-status-delay.md` — Streaming Status Shows But No Text Appears
- `docs/09-troubleshooting/17-use-chat-stale-body-data.md` — Stale body values with useChat
- `docs/09-troubleshooting/18-ontoolcall-type-narrowing.md` — Type Error with onToolCall
- `docs/09-troubleshooting/19-unsupported-model-version.md` — Unsupported model version error
- `docs/09-troubleshooting/20-no-object-generated-content-filter.md` — Object generation failed with OpenAI
- `docs/09-troubleshooting/21-missing-tool-results-error.md` — Missing Tool Results Error
- `docs/09-troubleshooting/30-model-is-not-assignable-to-type.md` — Model is not assignable to type "LanguageModelV1
- `docs/09-troubleshooting/40-typescript-cannot-find-namespace-jsx.md` — TypeScript error "Cannot find namespace 'JSX
- `docs/09-troubleshooting/50-react-maximum-update-depth-exceeded.md` — React error "Maximum update depth exceeded
- `docs/09-troubleshooting/60-jest-cannot-find-module-ai-rsc.md` — Jest: cannot find module '@ai-sdk/rsc
- `docs/09-troubleshooting/70-high-memory-usage-with-images.md` — High memory usage when processing many images
- `docs/09-troubleshooting/index.md` — Troubleshooting

## `providers/01-ai-sdk-providers/`

- `providers/01-ai-sdk-providers/00-ai-gateway.md` — AI Gateway
- `providers/01-ai-sdk-providers/01-xai.md` — xAI Grok
- `providers/01-ai-sdk-providers/03-openai.md` — OpenAI
- `providers/01-ai-sdk-providers/04-azure.md` — Azure OpenAI
- `providers/01-ai-sdk-providers/05-anthropic.md` — Anthropic
- `providers/01-ai-sdk-providers/06-open-responses.md` — Open Responses
- `providers/01-ai-sdk-providers/07-anthropic-aws.md` — Claude Platform on AWS
- `providers/01-ai-sdk-providers/08-amazon-bedrock.md` — Amazon Bedrock
- `providers/01-ai-sdk-providers/09-groq.md` — Groq
- `providers/01-ai-sdk-providers/10-fal.md` — Fal
- `providers/01-ai-sdk-providers/100-assemblyai.md` — AssemblyAI
- `providers/01-ai-sdk-providers/100-gmicloud.md` — GMI Cloud
- `providers/01-ai-sdk-providers/105-typesafe-ai.md` — TypeSafe
- `providers/01-ai-sdk-providers/11-deepinfra.md` — DeepInfra
- `providers/01-ai-sdk-providers/110-deepgram.md` — Deepgram
- `providers/01-ai-sdk-providers/12-black-forest-labs.md` — Black Forest Labs
- `providers/01-ai-sdk-providers/120-gladia.md` — Gladia
- `providers/01-ai-sdk-providers/15-google.md` — Google
- `providers/01-ai-sdk-providers/150-hume.md` — Hume
- `providers/01-ai-sdk-providers/16-google-vertex.md` — Google Vertex AI
- `providers/01-ai-sdk-providers/160-revai.md` — Rev.ai
- `providers/01-ai-sdk-providers/170-baseten.md` — Baseten
- `providers/01-ai-sdk-providers/170-huggingface.md` — Hugging Face
- `providers/01-ai-sdk-providers/180-quiverai.md` — QuiverAI
- `providers/01-ai-sdk-providers/190-fish-audio.md` — Fish Audio
- `providers/01-ai-sdk-providers/20-mistral.md` — Mistral AI
- `providers/01-ai-sdk-providers/200-zai.md` — Z.AI
- `providers/01-ai-sdk-providers/24-togetherai.md` — Together.ai
- `providers/01-ai-sdk-providers/25-cohere.md` — Cohere
- `providers/01-ai-sdk-providers/26-fireworks.md` — Fireworks
- `providers/01-ai-sdk-providers/27-voyage.md` — Voyage AI
- `providers/01-ai-sdk-providers/30-deepseek.md` — DeepSeek
- `providers/01-ai-sdk-providers/31-moonshotai.md` — Moonshot AI
- `providers/01-ai-sdk-providers/32-alibaba.md` — Alibaba
- `providers/01-ai-sdk-providers/33-minimax.md` — MiniMax
- `providers/01-ai-sdk-providers/40-cerebras.md` — Cerebras
- `providers/01-ai-sdk-providers/60-replicate.md` — Replicate
- `providers/01-ai-sdk-providers/65-prodia.md` — Prodia
- `providers/01-ai-sdk-providers/70-perplexity.md` — Perplexity
- `providers/01-ai-sdk-providers/80-luma.md` — Luma
- `providers/01-ai-sdk-providers/85-bytedance.md` — ByteDance
- `providers/01-ai-sdk-providers/85-klingai.md` — Kling AI
- `providers/01-ai-sdk-providers/90-elevenlabs.md` — ElevenLabs
- `providers/01-ai-sdk-providers/95-cartesia.md` — Cartesia
- `providers/01-ai-sdk-providers/index.md` — AI SDK Providers

## `providers/02-ai-sdk-harnesses/`

- `providers/02-ai-sdk-harnesses/01-claude-code.md` — Claude Code
- `providers/02-ai-sdk-harnesses/02-codex.md` — Codex
- `providers/02-ai-sdk-harnesses/03-pi.md` — Pi
- `providers/02-ai-sdk-harnesses/04-opencode.md` — OpenCode
- `providers/02-ai-sdk-harnesses/05-deepagents.md` — Deep Agents
- `providers/02-ai-sdk-harnesses/06-acp.md` — Agent Client Protocol
- `providers/02-ai-sdk-harnesses/07-grok-build.md` — Grok Build
- `providers/02-ai-sdk-harnesses/08-cline.md` — Cline
- `providers/02-ai-sdk-harnesses/09-cursor.md` — Cursor
- `providers/02-ai-sdk-harnesses/10-fx.md` — fx
- `providers/02-ai-sdk-harnesses/11-github-copilot.md` — GitHub Copilot
- `providers/02-ai-sdk-harnesses/index.md` — AI SDK Harnesses

## `providers/03-observability/`

- `providers/03-observability/arize-ax.md` — Arize AX
- `providers/03-observability/axiom.md` — Axiom
- `providers/03-observability/braintrust.md` — Braintrust
- `providers/03-observability/confident-ai.md` — Confident AI
- `providers/03-observability/helicone.md` — Helicone
- `providers/03-observability/index.md` — Observability Integrations
- `providers/03-observability/laminar.md` — Laminar
- `providers/03-observability/langfuse.md` — Langfuse
- `providers/03-observability/langsmith.md` — LangSmith
- `providers/03-observability/langwatch.md` — LangWatch
- `providers/03-observability/latitude.md` — Latitude
- `providers/03-observability/maxim.md` — Maxim
- `providers/03-observability/mlflow.md` — MLflow
- `providers/03-observability/patronus.md` — Patronus
- `providers/03-observability/posthog.md` — PostHog
- `providers/03-observability/raindrop.md` — Raindrop
- `providers/03-observability/respan.md` — Respan
- `providers/03-observability/scorecard.md` — Scorecard
- `providers/03-observability/sentry.md` — Sentry
- `providers/03-observability/signoz.md` — SigNoz
- `providers/03-observability/traceloop.md` — Traceloop
- `providers/03-observability/weave.md` — Weave

## `providers/04-openai-compatible-providers/`

- `providers/04-openai-compatible-providers/01-custom-providers.md` — Writing a Custom Provider
- `providers/04-openai-compatible-providers/30-lmstudio.md` — LM Studio
- `providers/04-openai-compatible-providers/35-nim.md` — NVIDIA NIM
- `providers/04-openai-compatible-providers/40-modelrush.md` — ModelRush
- `providers/04-openai-compatible-providers/45-clarifai.md` — Clarifai
- `providers/04-openai-compatible-providers/45-heroku.md` — Heroku
- `providers/04-openai-compatible-providers/50-nearai.md` — NEAR AI Cloud
- `providers/04-openai-compatible-providers/index.md` — OpenAI Compatible Providers

## `providers/05-community-providers/`

- `providers/05-community-providers/01-custom-providers.md` — Writing a Custom Provider
- `providers/05-community-providers/02-a2a.md` — A2A
- `providers/05-community-providers/03-acp.md` — ACP (Agent Client Protocol)
- `providers/05-community-providers/04-aihubmix.md` — Aihubmix
- `providers/05-community-providers/05-aimlapi.md` — AI/ML API
- `providers/05-community-providers/06-anthropic-vertex-ai.md` — Anthropic Vertex
- `providers/05-community-providers/07-automatic1111.md` — Automatic1111
- `providers/05-community-providers/08-azure-ai.md` — Azure AI
- `providers/05-community-providers/09-browser-ai.md` — Browser AI
- `providers/05-community-providers/10-claude-code.md` — Claude Code
- `providers/05-community-providers/11-cloudflare-ai-gateway.md` — Cloudflare AI Gateway
- `providers/05-community-providers/12-cloudflare-workers-ai.md` — Cloudflare Workers AI
- `providers/05-community-providers/13-codex-cli.md` — Codex CLI
- `providers/05-community-providers/14-crosshatch.md` — Crosshatch
- `providers/05-community-providers/15-dify.md` — Dify
- `providers/05-community-providers/16-firemoon.md` — Firemoon
- `providers/05-community-providers/17-friendliai.md` — FriendliAI
- `providers/05-community-providers/18-gemini-cli.md` — Gemini CLI
- `providers/05-community-providers/19-helicone.md` — Helicone
- `providers/05-community-providers/20-inflection-ai.md` — Inflection AI
- `providers/05-community-providers/21-jina-ai.md` — Jina AI
- `providers/05-community-providers/22-langdb.md` — LangDB
- `providers/05-community-providers/23-letta.md` — Letta
- `providers/05-community-providers/24-llama-cpp.md` — llama.cpp
- `providers/05-community-providers/25-llamagate.md` — LlamaGate
- `providers/05-community-providers/26-mcp-sampling.md` — MCP Sampling AI Provider
- `providers/05-community-providers/27-mem0.md` — Mem0
- `providers/05-community-providers/28-minimax.md` — MiniMax
- `providers/05-community-providers/29-mixedbread.md` — Mixedbread
- `providers/05-community-providers/30-ollama.md` — Ollama
- `providers/05-community-providers/31-opencode-sdk.md` — OpenCode
- `providers/05-community-providers/32-openrouter.md` — OpenRouter
- `providers/05-community-providers/33-portkey.md` — Portkey
- `providers/05-community-providers/34-qwen.md` — Qwen
- `providers/05-community-providers/35-react-native-apple.md` — React Native Apple
- `providers/05-community-providers/36-requesty.md` — Requesty
- `providers/05-community-providers/37-runpod.md` — Runpod
- `providers/05-community-providers/38-sambanova.md` — SambaNova
- `providers/05-community-providers/39-sap-ai.md` — SAP AI Core
- `providers/05-community-providers/40-sarvam.md` — Sarvam
- `providers/05-community-providers/41-soniox.md` — Soniox
- `providers/05-community-providers/41-spark.md` — Spark
- `providers/05-community-providers/42-supermemory.md` — Supermemory
- `providers/05-community-providers/43-voyage-ai.md` — Voyage AI
- `providers/05-community-providers/44-zhipu.md` — Zhipu AI (Z.AI)
- `providers/05-community-providers/45-vectorstores.md` — vectorstores
- `providers/05-community-providers/46-codex-app-server.md` — Codex CLI (App Server)
- `providers/05-community-providers/47-apertis.md` — Apertis
- `providers/05-community-providers/48-ollm.md` — OLLM
- `providers/05-community-providers/49-cencori.md` — Cencori
- `providers/05-community-providers/50-hindsight.md` — Hindsight
- `providers/05-community-providers/51-nia.md` — Nia
- `providers/05-community-providers/51-zeroentropy.md` — ZeroEntropy
- `providers/05-community-providers/52-crusoe.md` — Crusoe
- `providers/05-community-providers/52-neon-ai-gateway.md` — Neon AI Gateway
- `providers/05-community-providers/53-qvac.md` — QVAC
- `providers/05-community-providers/54-interfaze.md` — Interfaze
- `providers/05-community-providers/55-telnyx.md` — Telnyx
- `providers/05-community-providers/98-flowise.md` — Flowise
- `providers/05-community-providers/index.md` — Community Providers

## `providers/06-adapters/`

- `providers/06-adapters/01-langchain.md` — LangChain
- `providers/06-adapters/02-llamaindex.md` — LlamaIndex
- `providers/06-adapters/index.md` — Adapters

## `cookbook/00-guides/`

- `cookbook/00-guides/01-rag-chatbot.md` — RAG Agent
- `cookbook/00-guides/02-multi-modal-chatbot.md` — Multi-Modal Agent
- `cookbook/00-guides/03-slackbot.md` — Slackbot Agent Guide
- `cookbook/00-guides/04-natural-language-postgres.md` — Natural Language Postgres
- `cookbook/00-guides/05-computer-use.md` — Get started with Computer Use
- `cookbook/00-guides/06-agent-skills.md` — Add Skills to Your Agent
- `cookbook/00-guides/07-custom-memory-tool.md` — Build a Custom Memory Tool
- `cookbook/00-guides/08-agent-context-compaction.md` — Compact Agent Context
- `cookbook/00-guides/17-gemini.md` — Get started with Gemini 3
- `cookbook/00-guides/18-claude-4.md` — Get started with Claude 4
- `cookbook/00-guides/19-openai-responses.md` — OpenAI Responses API
- `cookbook/00-guides/20-google-gemini-image-generation.md` — Google Gemini Image Generation
- `cookbook/00-guides/20-sonnet-3-7.md` — Get started with Claude 3.7 Sonnet
- `cookbook/00-guides/21-llama-3_1.md` — Get started with Llama 3.1
- `cookbook/00-guides/23-gpt-5.md` — Get started with GPT-5
- `cookbook/00-guides/23-o1.md` — Get started with OpenAI o1
- `cookbook/00-guides/24-o3.md` — Get started with OpenAI o3-mini
- `cookbook/00-guides/25-r1.md` — Get started with DeepSeek R1
- `cookbook/00-guides/26-deepseek-v3-2.md` — Get started with DeepSeek V3.2
- `cookbook/00-guides/index.md` — Guides

## `cookbook/01-next/`

- `cookbook/01-next/10-generate-text.md` — Generate Text
- `cookbook/01-next/11-generate-text-with-chat-prompt.md` — Generate Text with Chat Prompt
- `cookbook/01-next/12-generate-image-with-chat-prompt.md` — Generate Image with Chat Prompt
- `cookbook/01-next/122-caching-middleware.md` — Caching Middleware
- `cookbook/01-next/20-stream-text.md` — Stream Text
- `cookbook/01-next/21-stream-text-with-chat-prompt.md` — Stream Text with Chat Prompt
- `cookbook/01-next/22-stream-text-with-image-prompt.md` — Stream Text with Image Prompt
- `cookbook/01-next/23-chat-with-pdf.md` — Chat with PDFs
- `cookbook/01-next/24-stream-text-multistep.md` — streamText Multi-Step Cookbook
- `cookbook/01-next/25-markdown-chatbot-with-memoization.md` — Markdown Chatbot with Memoization
- `cookbook/01-next/30-generate-object.md` — Generate Object
- `cookbook/01-next/31-generate-object-with-file-prompt.md` — Generate Object with File Prompt through Form Submission
- `cookbook/01-next/40-stream-object.md` — Stream Object
- `cookbook/01-next/70-call-tools.md` — Call Tools
- `cookbook/01-next/72-call-tools-multiple-steps.md` — Call Tools in Multiple Steps
- `cookbook/01-next/73-mcp-tools.md` — Model Context Protocol (MCP) Tools
- `cookbook/01-next/74-use-shared-chat-context.md` — Share useChat State Across Components
- `cookbook/01-next/75-human-in-the-loop.md` — Human-in-the-Loop with Next.js
- `cookbook/01-next/77-track-agent-token-usage.md` — Track Agent Token Usage
- `cookbook/01-next/80-send-custom-body-from-use-chat.md` — Send Custom Body from useChat
- `cookbook/01-next/85-custom-stream-format.md` — Streaming with Custom Format
- `cookbook/01-next/90-render-visual-interface-in-chat.md` — Render Visual Interface in Chat
- `cookbook/01-next/index.md` — Next.js

## `cookbook/05-node/`

- `cookbook/05-node/10-generate-text.md` — Generate Text
- `cookbook/05-node/100-retrieval-augmented-generation.md` — Retrieval Augmented Generation
- `cookbook/05-node/101-knowledge-base-agent.md` — Knowledge Base Agent
- `cookbook/05-node/11-generate-text-with-chat-prompt.md` — Generate Text with Chat Prompt
- `cookbook/05-node/12-generate-text-with-image-prompt.md` — Generate Text with Image Prompt
- `cookbook/05-node/20-stream-text.md` — Stream Text
- `cookbook/05-node/21-stream-text-with-chat-prompt.md` — Stream Text with Chat Prompt
- `cookbook/05-node/22-stream-text-with-image-prompt.md` — Stream Text with Image Prompt
- `cookbook/05-node/23-stream-text-with-file-prompt.md` — Stream Text with File Prompt
- `cookbook/05-node/30-generate-object-reasoning.md` — Generate Object with a Reasoning Model
- `cookbook/05-node/30-generate-object.md` — Generate Object
- `cookbook/05-node/40-stream-object.md` — Stream Object
- `cookbook/05-node/41-stream-object-with-image-prompt.md` — Stream Object with Image Prompt
- `cookbook/05-node/45-stream-object-record-token-usage.md` — Record Token Usage After Streaming Object
- `cookbook/05-node/46-stream-object-record-final-object.md` — Record Final Object after Streaming Object
- `cookbook/05-node/50-call-tools.md` — Call Tools
- `cookbook/05-node/51-call-tools-in-parallel.md` — Call Tools in Parallel
- `cookbook/05-node/52-call-tools-with-image-prompt.md` — Call Tools with Image Prompt
- `cookbook/05-node/53-call-tools-multiple-steps.md` — Call Tools in Multiple Steps
- `cookbook/05-node/54-mcp-tools.md` — Model Context Protocol (MCP) Tools
- `cookbook/05-node/55-manual-agent-loop.md` — Manual Agent Loop
- `cookbook/05-node/56-web-search-agent.md` — Web Search Agent
- `cookbook/05-node/57-mcp-elicitation.md` — Model Context Protocol (MCP) Elicitation
- `cookbook/05-node/60-embed-text.md` — Embed Text
- `cookbook/05-node/61-embed-text-batch.md` — Embed Text in Batch
- `cookbook/05-node/70-intercept-fetch-requests.md` — Intercepting Fetch Requests
- `cookbook/05-node/80-local-caching-middleware.md` — Local Caching Middleware
- `cookbook/05-node/85-repair-json-with-jsonrepair.md` — Repair Malformed JSON with jsonrepair
- `cookbook/05-node/90-dynamic-prompt-caching.md` — Dynamic Prompt Caching
- `cookbook/05-node/index.md` — Node

## `cookbook/15-api-servers/`

- `cookbook/15-api-servers/10-node-http-server.md` — Node.js HTTP Server
- `cookbook/15-api-servers/20-express.md` — Express
- `cookbook/15-api-servers/30-hono.md` — Hono
- `cookbook/15-api-servers/40-fastify.md` — Fastify
- `cookbook/15-api-servers/50-nest.md` — Nest.js
- `cookbook/15-api-servers/index.md` — API Servers

## `cookbook/20-rsc/`

- `cookbook/20-rsc/10-generate-text.md` — Generate Text
- `cookbook/20-rsc/11-generate-text-with-chat-prompt.md` — Generate Text with Chat Prompt
- `cookbook/20-rsc/20-stream-text.md` — Stream Text
- `cookbook/20-rsc/21-stream-text-with-chat-prompt.md` — Stream Text with Chat Prompt
- `cookbook/20-rsc/30-generate-object.md` — Generate Object
- `cookbook/20-rsc/40-stream-object.md` — Stream Object
- `cookbook/20-rsc/50-call-tools.md` — Call Tools
- `cookbook/20-rsc/51-call-tools-in-parallel.md` — Call Tools in Parallel
- `cookbook/20-rsc/60-save-messages-to-database.md` — Save Messages To Database
- `cookbook/20-rsc/61-restore-messages-from-database.md` — Restore Messages From Database
- `cookbook/20-rsc/90-render-visual-interface-in-chat.md` — Render Visual Interface in Chat
- `cookbook/20-rsc/91-stream-updates-to-visual-interfaces.md` — Stream Updates to Visual Interfaces
- `cookbook/20-rsc/92-stream-ui-record-token-usage.md` — Record Token Usage after Streaming User Interfaces
- `cookbook/20-rsc/index.md` — React Server Components

## `packages/` and `openrouter/`

- `packages/ai.md` — `ai` README
- `packages/anthropic.md` — `@ai-sdk/anthropic` README
- `packages/openai-compatible.md` — `@ai-sdk/openai-compatible` README
- `packages/provider.md` — `@ai-sdk/provider` README (the spec package)
- `openrouter/README.md` — `@openrouter/ai-sdk-provider` README (3.0.0)
- `openrouter/CHANGELOG.md` — `@openrouter/ai-sdk-provider` changelog through 3.0.0
- `openrouter/openrouter-docs-vercel-ai-sdk.md` — OpenRouter's own AI SDK integration page
