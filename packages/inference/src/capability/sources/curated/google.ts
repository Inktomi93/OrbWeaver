// Curated capability rows — google. DATA in ONE schema (`capabilityOverrideSchema`), checked at `tsc` through
// `satisfies` and re-parsed at load through the same zod the plugin/admin rows go through. File order is
// composition order (a later row refines an earlier one). Adding a model is a row here + the table test.

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

export const googleRows = [
  {
    match: {
      model: "^(google/|models/)?gemini-(2[-.]5-(flash|flash-lite|pro)|3-flash-preview|3[-.]1-(flash-lite|pro-preview)|3[-.]5-flash(-lite)?|3[-.][678]-flash)$",
      provider: "google",
      wire: "google-generative-ai",
    },
    generation: { turns: { providerImplicitPromptCache: true, explicitPromptCache: false, promptCacheDefaultEnabled: false } },
    evidence: {
      tier: "curated",
      dated: "2026-10-05",
      cite: "https://ai.google.dev/gemini-api/docs/generate-content/caching: implicit caching automatically enabled on Gemini 2.5 and newer, no hit/savings guarantee and no request opt-in. This row covers current native text models only; managed cachedContents resource creation is owner-parked, not an app marker control.",
    },
  },
  {
    match: {
      model: "^(google/|models/)?gemini-(?!embedding)",
    },
    kind: "generation",
    generation: {
      input: ["text", "image", "video", "audio", "file"],
      sampling: { temperature: { min: 0, max: 2 }, topP: { min: 0, max: 1 }, topK: { min: 1, max: 64 }, seed: true, stop: true },
      reasoning: { mode: "none", enabled: false, replay: "none" },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "resolve-model-capability.ts FAMILY_REASONING.google (budget) with ANTHROPIC_BUDGET_RANGE — the tree's existing cell; OR's advertised row supersedes when present",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-(?!embedding)" },
    // Gemini keeps a system message only as the leading system instruction: no route leaves a later one in place, so
    // a system row that ends or sits inside the history folds, on every route. The message-handling floor is not
    // stated: adjacent same-role rows pass everywhere, but whether a history may open on a model turn is unmeasured.
    generation: { turns: { midConversationSystem: false, historySystemRows: false } },
    evidence: {
      tier: "curated",
      dated: "2026-10-03",
      cite: "@ai-sdk/google 4.0.87 dist/index.js:372: a system message after the first user or assistant message throws 'system messages are only supported at the beginning of the conversation'; https://ai.google.dev/gemini-api/docs/text-generation#system-instructions (a request's system instruction is one field beside contents). scripts/probes/hosted-families/RESULTS.md (2026-10-03): the OpenAI-compatible layer accepts a later system message and lifts it into the instruction, OpenRouter hoists it to systemInstruction, and native contents refuse role system on 3.5-flash-lite, 3.6, 3.7 and 3.8-flash (400 'Role 'system' is not supported'); a hoisted trailing row went unobeyed on OpenRouter 3.1-flash-lite and 3.1-pro-preview; user,user and model,model 200 on every route",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-(?!embedding)(?!.*(image|transcribe|tts|live))" },
    generation: { tools: { parallel: true }, output: { structured: true } },
    evidence: {
      tier: "curated",
      dated: "2026-09-30",
      cite: "https://ai.google.dev/gemini-api/docs/models: general Gemini text models support function calling and structured output; specialized media models do not inherit these tasks",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-(2[-.]5|3)(?!.*(transcribe|tts|live))" },
    generation: { reasoning: { mode: "budget", enabled: true, budgetRange: { min: 1024, max: 32_000 }, replay: "signed" } },
    evidence: {
      tier: "curated",
      dated: "2026-09-30",
      cite: "https://ai.google.dev/gemini-api/docs/thinking: Gemini 2.5 and 3 support thinking; route rows spell budget versus effort",
    },
  },
  {
    match: {
      model: "^(google/|models/)?gemini-(2[-.]5-flash-image|3-pro-image|3[-.]1-flash-image|3[-.]1-flash-lite-image)(-preview)?$",
    },
    generation: {
      input: ["text", "image"],
      output: {
        modalities: ["text", "image"],
      },
      imageEdit: true,
      imageReferences: true,
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "§6.7 'go look at nano banana' — a chat model whose output modalities include image and that edits prior pictures across turns",
    },
  },
  // The window is Google's input token limit and the output cap its output token limit. The direct route is the
  // OpenAI-compatible layer, whose `/models` lists bare `{id, object, owned_by}` rows with a `models/` id prefix, so
  // these rows take that prefix too.
  {
    match: {
      model:
        "^(google/|models/)?gemini-(3[-.]8-flash|3[-.]7-flash|3[-.]6-flash|3[-.]5-flash|3[-.]5-flash-lite|3[-.]1-flash-lite|3[-.]1-pro-preview|3-flash-preview|2[-.]5-flash|2[-.]5-flash-lite|2[-.]5-pro)$",
    },
    generation: {
      context: {
        window: 1_048_576,
      },
      output: {
        maxTokens: { min: 1, max: 65_536 },
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "Input token limit 1,048,576, output token limit 65,536: ai.google.dev/gemini-api/docs/models/<id> for each listed id; the compatibility list shape per discuss.ai.google.dev/t/openai-comp-get-model-details/66120",
    },
  },
  {
    match: {
      model: "^(google/|models/)?gemini-3[-.]1-flash-image(-preview)?$",
    },
    generation: {
      context: {
        window: 131_072,
      },
      output: {
        maxTokens: { min: 1, max: 32_768 },
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "Input token limit 131,072, output token limit 32,768: ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image",
    },
  },
  {
    match: {
      model: "^(google/|models/)?gemini-(2[-.]5-flash-image|3-pro-image)(-preview)?$",
    },
    generation: {
      context: {
        window: 65_536,
      },
      output: {
        maxTokens: { min: 1, max: 32_768 },
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "Input token limit 65,536, output token limit 32,768: ai.google.dev/gemini-api/docs/models/{gemini-2.5-flash-image,gemini-3-pro-image}",
    },
  },
  {
    match: {
      model: "^(google/|models/)?gemini-3[-.]1-flash-lite-image(-preview)?$",
    },
    generation: {
      context: {
        window: 65_536,
      },
      output: {
        maxTokens: { min: 1, max: 4096 },
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "Input token limit 65,536, output token limit 4,096: ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image",
    },
  },
  // The direct route: a `custom-openai` row against Google's OpenAI-compatible layer. That layer takes reasoning as
  // `reasoning_effort`; a token budget needs its `extra_body.google.thinking_config`, which the openai-compatible
  // transport never sends, and its thought signatures ride tool calls, not a replayed reasoning part. The image ids
  // are not in its effort table and keep the family cell.
  {
    match: {
      model: "^(models/)?gemini-(2[-.]5|3)(?!.*-image)",
      provider: "custom-openai",
    },
    generation: {
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["minimal", "low", "medium", "high"],
        replay: "none",
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "ai.google.dev/gemini-api/docs/openai 'Thinking': reasoning_effort minimal, low, medium and high map to thinking_level on Gemini 3 and thinking_budget 1,024/1,024/8,192/24,576 on Gemini 2.5; thinking_budget only through extra_body.google.thinking_config. Reasoning-part replay remains none; required tool-call thought signatures are preserved separately by backends/v4/stream.ts and prompt.ts, including when reasoning carry is off.",
    },
  },
  {
    match: {
      model: "^(models/)?gemini-(3[-.]|2[-.]5-pro)(?!.*-image)",
      provider: "custom-openai",
    },
    generation: {
      reasoning: {
        mandatory: true,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "ai.google.dev/gemini-api/docs/openai: 'you can set reasoning_effort to \"none\" for 2.5 models. Reasoning cannot be turned off for Gemini 2.5 Pro or 3 models.'",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-embedding-001$" },
    kind: "embedding",
    embedding: { dims: 3072, mrl: true, maxInputTokens: 2048, input: ["text"], output: ["vector"], instructionAware: false, retrievalTaskType: true },
    evidence: {
      tier: "curated",
      dated: "2026-09-30",
      cite: "https://ai.google.dev/gemini-api/docs/embeddings: Embedding 1 dimensions, token limits, task types and normalization",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-embedding-2(-preview)?$" },
    kind: "embedding",
    embedding: {
      dims: 3072,
      mrl: true,
      maxInputTokens: 8192,
      input: ["text", "image", "video", "audio", "file"],
      output: ["vector"],
      instructionAware: true,
      promptScaffold: "gemini-retrieval",
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-30",
      cite: "https://ai.google.dev/gemini-api/docs/embeddings: Embedding 2 retrieval query/document scaffolds, multimodal inputs, dimensions and normalization",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-(3[-.]|2[-.]5-pro)(?!.*-image)" },
    generation: { reasoning: { mandatory: true } },
    evidence: { tier: "curated", dated: "2026-09-30", cite: "https://ai.google.dev/gemini-api/docs/thinking: Gemini 3 and 2.5 Pro cannot disable thinking" },
  },
  {
    match: { model: "^(google/|models/)?gemini-3(?!.*-image)", wire: "google-generative-ai" },
    generation: { reasoning: { mode: "effort", effortLevels: ["minimal", "low", "medium", "high"], replay: "signed" } },
    evidence: { tier: "curated", dated: "2026-09-30", cite: "https://ai.google.dev/gemini-api/docs/thinking: native Gemini 3 thinkingLevel" },
  },
  {
    match: { model: "^(google/|models/)?gemini-3(?!.*-image)" },
    generation: {
      sampling: {
        temperature: { min: 0, max: 2 },
        topP: { min: 0, max: 1 },
        topK: { min: 1, max: 64 },
        seed: true,
        stop: true,
        frequencyPenalty: { min: -2, max: 2 },
        presencePenalty: { min: -2, max: 2 },
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-30",
      cite: "@ai-sdk/google/src/google-language-model.ts: native 2.5 drops frequencyPenalty and presencePenalty; Gemini 3 generationConfig forwards both",
    },
  },
  // Google's OpenAI-compatible layer refuses `top_k` by name, so the two sets above lose it on that route.
  {
    match: { model: "^(models/)?gemini-(?!embedding)", provider: "custom-openai" },
    generation: { sampling: { temperature: { min: 0, max: 2 }, topP: { min: 0, max: 1 }, seed: true, stop: true } },
    evidence: {
      tier: "curated",
      dated: "2026-10-03",
      cite: "scripts/probes/hosted-families/RESULTS.md, Gemini OpenAI-compat samplers: top_k, min_p, repetition_penalty and top_a each 400 'Unknown name' on every model (gemini-2.5-* and 3.1-pro-preview included); the rest of the family set is unchanged",
    },
  },
  {
    match: { model: "^(models/)?gemini-3(?!.*-image)", provider: "custom-openai" },
    generation: {
      sampling: {
        temperature: { min: 0, max: 2 },
        topP: { min: 0, max: 1 },
        seed: true,
        stop: true,
        frequencyPenalty: { min: -2, max: 2 },
        presencePenalty: { min: -2, max: 2 },
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-10-03",
      cite: "scripts/probes/hosted-families/RESULTS.md, Gemini OpenAI-compat samplers: top_k 400 'Unknown name' on gemini-3-flash-preview, 3.1-flash-lite, 3.1-pro-preview, 3.5-flash, 3.5-flash-lite, 3.6-flash, 3.7-flash, 3.8-flash; the Gemini 3 set above otherwise",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-(3[-.]7-flash|3[-.]8-flash|3[-.]1-pro-preview)$" },
    generation: { reasoning: { effortLevels: ["low", "medium", "high"] } },
    evidence: { tier: "curated", dated: "2026-09-30", cite: "https://ai.google.dev/gemini-api/docs/thinking: supported thinking levels by model" },
  },
  {
    match: { model: "^(google/|models/)?gemini-3-pro-preview$" },
    generation: { reasoning: { effortLevels: ["low", "high"] } },
    evidence: { tier: "curated", dated: "2026-09-30", cite: "https://ai.google.dev/gemini-api/docs/thinking: Gemini 3 Pro supports low and high thinking" },
  },
  {
    match: { model: "^(google/|models/)?gemini-2[-.]5-flash-image(-preview)?$" },
    generation: { reasoning: { mode: "none", enabled: false, replay: "none" } },
    evidence: {
      tier: "curated",
      dated: "2026-09-30",
      cite: "https://ai.google.dev/gemini-api/docs/image-generation: thinking applies to Gemini 3 image models",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-3[-.]1-flash(-lite)?-image(-preview)?$" },
    generation: { reasoning: { mode: "effort", enabled: true, mandatory: true, effortLevels: ["minimal", "high"] } },
    evidence: {
      tier: "curated",
      dated: "2026-09-30",
      cite: "https://ai.google.dev/gemini-api/docs/image-generation: Gemini 3.1 image thinking supports minimal and high and cannot be disabled",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-3-pro-image(-preview)?$" },
    generation: { reasoning: { mandatory: true } },
    evidence: {
      tier: "curated",
      dated: "2026-09-30",
      cite: "https://ai.google.dev/gemini-api/docs/image-generation: Gemini 3 image thinking cannot be disabled; SDK keeps Pro image on the budget mapping",
    },
  },
  // A conversation that ends on a model turn: continued by the older ids, refused by the newer ones, the same split on
  // the native API, Google's OpenAI-compatible layer and OpenRouter.
  {
    match: { model: "^(google/|models/)?gemini-(3-flash-preview|3[-.]1-flash-lite|3[-.]5-flash)$" },
    generation: { turns: { assistantPrefill: true } },
    evidence: {
      tier: "curated",
      dated: "2026-10-03",
      cite: "scripts/probes/hosted-families/RESULTS.md, case c5 (assistant tail 'A B C D E'): CONTINUES on gemini-3-flash-preview, 3.1-flash-lite and 3.5-flash through native generateContent, the OpenAI-compatible layer and OpenRouter. Earlier, native 3-flash-preview took the final model prefix 'The secret word is' and returned only ' ORBIT.' under an exact-response prompt (2026-09-30)",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-(3[-.]5-flash-lite|3[-.][678]-flash)$" },
    generation: { turns: { assistantPrefill: false } },
    evidence: {
      tier: "curated",
      dated: "2026-10-03",
      cite: "scripts/probes/hosted-families/RESULTS.md, case c5: 400 'Requests ending with a model turn are not supported.' on gemini-3.5-flash-lite, 3.6-flash, 3.7-flash and 3.8-flash through native generateContent, the OpenAI-compatible layer and OpenRouter",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-embedding-2(-preview)?$", wire: "openai-compat" },
    embedding: { input: ["text"] },
    evidence: {
      tier: "curated",
      dated: "2026-09-30",
      cite: "The compatibility embedding transport sends scalar input strings; its imageEmbed method uses the vLLM messages dialect. Native Google carries per-value multimodal content. Advertised or declared route evidence may refine the compatibility input set.",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-2[-.]5-flash$", wire: "google-generative-ai" },
    generation: { reasoning: { budgetRange: { min: 1, max: 24_576 } } },
    evidence: {
      tier: "curated",
      dated: "2026-09-30",
      cite: "https://ai.google.dev/gemini-api/docs/generate-content/thinking: model-specific positive thinking budget; zero is the explicit-off sentinel",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-2[-.]5-flash-lite$", wire: "google-generative-ai" },
    generation: { reasoning: { budgetRange: { min: 512, max: 24_576 } } },
    evidence: {
      tier: "curated",
      dated: "2026-09-30",
      cite: "https://ai.google.dev/gemini-api/docs/generate-content/thinking: model-specific positive thinking budget; zero is the explicit-off sentinel",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-2[-.]5-pro$", wire: "google-generative-ai" },
    generation: { reasoning: { budgetRange: { min: 128, max: 32_768 } } },
    evidence: {
      tier: "curated",
      dated: "2026-09-30",
      cite: "https://ai.google.dev/gemini-api/docs/generate-content/thinking: model-specific positive thinking budget; zero is the explicit-off sentinel",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-(?!.*(image|tts|live|transcribe))(2[-.]5-(flash|flash-lite|pro)(-|$)|3[-.])", provider: "openrouter" },
    generation: { turns: { explicitPromptCache: true, cacheMinTokens: 4096, fixedCacheTtl: "5m", promptCacheDefaultEnabled: false } },
    evidence: {
      tier: "curated",
      dated: "2026-09-30",
      cite: "https://openrouter.ai/docs/guides/best-practices/prompt-caching: Gemini explicit content markers, fixed five-minute retention and minimum prefix; dynamic system tails cannot stay outside a cached system instruction",
    },
  },
  {
    match: { model: "^(google/|models/)?gemini-2[-.]5-flash$", provider: "openrouter" },
    generation: { turns: { cacheMinTokens: 1024 } },
    evidence: {
      tier: "curated",
      dated: "2026-09-30",
      cite: "https://openrouter.ai/docs/guides/best-practices/prompt-caching: OpenRouter Gemini 2.5 Flash explicit-cache minimum is 1024 tokens; native implicit caching has separate thresholds",
    },
  },
  {
    // Only OpenRouter reached these: the direct key got 404 for 2.5 and a quota 429 for 3.1-pro-preview.
    match: { model: "^google/gemini-(2[-.]5-(flash|flash-lite|pro)|3[-.]1-pro-preview)$", provider: "openrouter" },
    generation: { turns: { assistantPrefill: true } },
    evidence: {
      tier: "curated",
      dated: "2026-10-03",
      cite: "scripts/probes/hosted-families/RESULTS.md, OpenRouter google case c5: CONTINUES on gemini-2.5-flash, 2.5-flash-lite, 2.5-pro and 3.1-pro-preview. Earlier, OpenRouter Gemini 3.1 Pro took the final assistant prefix 'The answer is' and returned only ' ORBIT.' (2026-09-30)",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
