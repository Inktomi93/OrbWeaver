import type { ChatApi, PromptCacheSettings } from "@orb/contracts/inference";

export const LIVE_POST_LIMIT = 24;
export const SCENARIO_POST_LIMIT = 3;
const MARKERS = { enabled: true, cacheSystem: true, historyDepth: null, ttl: "5m" } as const satisfies PromptCacheSettings;
const OFF = { ...MARKERS, enabled: false } as const;

export const SCENARIOS = [
  {
    id: "anthropic-native",
    provider: "anthropic",
    model: "claude-sonnet-5",
    api: "anthropic-messages",
    keyNames: ["ANTHROPIC_API_KEY"],
    settings: MARKERS,
    replay: false,
    minimum: 1024,
  },
  {
    id: "anthropic-or",
    provider: "openrouter",
    model: "anthropic/claude-sonnet-5",
    api: "chat-completions",
    keyNames: ["OPENROUTER_PROBE_KEY", "OPENROUTER_API_KEY"],
    settings: MARKERS,
    replay: false,
    minimum: 1024,
  },
  {
    id: "openai-native",
    provider: "openai",
    model: "gpt-6-sol",
    api: "chat-completions",
    keyNames: ["OPENAI_PROBE_KEY", "OPENAI_API_KEY"],
    settings: { ...MARKERS, disableImplicit: true },
    replay: false,
    minimum: 1024,
  },
  {
    id: "openai-or",
    provider: "openrouter",
    model: "openai/gpt-6-sol",
    api: "chat-completions",
    keyNames: ["OPENROUTER_PROBE_KEY", "OPENROUTER_API_KEY"],
    settings: { ...MARKERS, disableImplicit: true },
    replay: false,
    minimum: 1024,
  },
  {
    id: "google-native",
    provider: "google",
    model: "gemini-3.8-flash",
    api: "google-generative-ai",
    keyNames: ["GEMINI_PROBE_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"],
    settings: OFF,
    replay: false,
    minimum: 4096,
  },
  {
    id: "google-or",
    provider: "openrouter",
    model: "google/gemini-3.8-flash",
    api: "chat-completions",
    keyNames: ["OPENROUTER_PROBE_KEY", "OPENROUTER_API_KEY"],
    settings: MARKERS,
    replay: false,
    minimum: 4096,
  },
  {
    id: "alibaba-or",
    provider: "openrouter",
    model: "qwen/qwen3-coder-plus",
    api: "chat-completions",
    keyNames: ["OPENROUTER_PROBE_KEY", "OPENROUTER_API_KEY"],
    settings: MARKERS,
    replay: false,
    minimum: null,
  },
  {
    id: "response-replay-or",
    provider: "openrouter",
    model: "openai/gpt-6-sol",
    api: "chat-completions",
    keyNames: ["OPENROUTER_PROBE_KEY", "OPENROUTER_API_KEY"],
    settings: { ...OFF, disableImplicit: true },
    replay: true,
    minimum: null,
  },
] as const satisfies readonly {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly api: ChatApi;
  readonly keyNames: readonly string[];
  readonly settings: PromptCacheSettings;
  readonly replay: boolean;
  readonly minimum: number | null;
}[];
export type Scenario = (typeof SCENARIOS)[number];

export const PREPARED_SOURCE_PATHS = [
  "packages/contracts/src/inference/cache-policy.ts",
  "packages/contracts/src/inference/capability/generation.ts",
  "packages/contracts/src/inference/prompt-cache.ts",
  "packages/contracts/src/preset/index.ts",
  "packages/contracts/src/preset/response-cache.ts",
  "packages/inference/src/capability/sources/curated/anthropic.ts",
  "packages/inference/src/capability/sources/curated/openai.ts",
  "packages/inference/src/capability/sources/curated/google.ts",
  "packages/inference/src/capability/sources/curated/qwen.ts",
  "packages/inference/src/funnel/resolve-cache.ts",
  "packages/inference/src/backends/kit/cache-control.ts",
  "packages/inference/src/backends/kit/response-cache.ts",
  "packages/inference/src/backends/openai-compat/chat.ts",
  "packages/inference/src/backends/openai-compat/model.ts",
  "packages/inference/src/backends/openai-compat/body.ts",
  "packages/inference/src/backends/anthropic-messages/chat.ts",
  "packages/inference/src/backends/google/chat.ts",
  "packages/inference/src/backends/google/options.ts",
  "packages/inference/src/backends/v4/prompt.ts",
  "packages/inference/src/backends/v4/result.ts",
  "packages/inference/src/backends/v4/options.ts",
  "packages/inference/src/backends/anthropic-messages/model.ts",
  "packages/inference/src/backends/google/model.ts",
  "packages/inference/src/roles/chat-request.ts",
  "packages/server/src/domain/connection/verbs/resolve.ts",
  "packages/server/src/domain/preset/verbs/resolve-effective.ts",
  "packages/server/src/entry/compose/services.ts",
  "packages/server/src/entry/compose/chat.ts",
  "packages/server/src/domain/chat/engine/pipeline.ts",
  "packages/server/src/domain/chat/assembly/shape.ts",
  "scripts/probes/caching/run.ts",
  "scripts/probes/caching/scenario.ts",
] as const;
