// Curated capability rows — anthropic. DATA in ONE schema (`capabilityOverrideSchema`), checked at `tsc` through
// `satisfies` and re-parsed at load through the same zod the plugin/admin rows go through. File order is
// composition order (a later row refines an earlier one). Adding a model is a row here + the table test.

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

export const anthropicRows = [
  {
    match: {
      model: "^(anthropic/)?claude[-/]",
    },
    kind: "generation",
    generation: {
      input: ["text", "image", "file"],
      tools: {
        parallel: true,
      },
      output: {
        maxTokens: {
          min: 1,
          max: 64_000,
        },
        structured: true,
        modalities: ["text"],
      },
      context: {
        window: 200_000,
      },
      reasoning: {
        displayModes: ["summarized", "omitted"],
      },
      turns: {
        assistantPrefill: false,
        midConversationSystem: false,
        historySystemRows: false,
        roleHandlingFloor: "strict",
        explicitPromptCache: true,
        cacheMinTokens: 4096,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "domain/connection/catalog/chat-models.ts CLAUDE_CAPABILITY_FLOOR + turns.ts NON-version cells; historySystemRows UNMEASURED on every anthropic arm (turns.ts:73-81), roleHandlingFloor strict (turns.ts:90,103)",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/].*opus-4[-.]8",
    },
    generation: {
      reasoning: {
        mode: "adaptive",
        enabled: true,
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
      context: {
        window: 200_000,
        supports1M: true,
      },
      turns: {
        cacheMinTokens: 1024,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "chat-models.ts Opus 4.8 entry; turns.ts OPUS_48_MIN",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/].*opus-4[-.]7",
    },
    generation: {
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
      turns: {
        cacheMinTokens: 2048,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "turns.ts OPUS_47_MIN; effort mode = the anthropic family default (resolve-model-capability.ts FAMILY_REASONING)",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/].*opus-4[-.](5|6)",
    },
    generation: {
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
      turns: {
        cacheMinTokens: 4096,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "turns.ts OPUS_LEGACY_MIN",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/].*sonnet-(5|4[-.]6|4[-.]5)",
    },
    generation: {
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
      turns: {
        cacheMinTokens: 1024,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "chat-models.ts Sonnet 5 / Sonnet 4.6 entries; turns.ts SONNET_MODERN_MIN",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/].*haiku-4[-.]5",
    },
    generation: {
      reasoning: {
        mode: "none",
        enabled: false,
      },
      output: {
        maxTokens: {
          min: 1,
          max: 8192,
        },
      },
      turns: {
        cacheMinTokens: 4096,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "chat-models.ts Haiku 4.5 entry (HAIKU_MAX_OUTPUT); turns.ts HAIKU_45_MIN",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/].*(fable|mythos)-5",
    },
    generation: {
      reasoning: {
        mode: "adaptive",
        enabled: true,
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
      turns: {
        cacheMinTokens: 512,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "turns.ts FABLE_MYTHOS_MIN",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/].*(opus-4[-.]5|haiku-4[-.]5)",
      api: "chat-completions",
    },
    generation: {
      turns: {
        assistantPrefill: true,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "turns.ts anthropicPrefill: opus-4.5/haiku-4.5 continue a prefill on the openai-compat shape; every newer Claude does not",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/].*(opus-4[-.]5|haiku-4[-.]5)",
      api: "responses",
    },
    generation: {
      turns: {
        assistantPrefill: true,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "turns.ts anthropicPrefill on the responses shape",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/].*opus-4[-.]8",
      api: "agent-sdk",
    },
    generation: {
      turns: {
        midConversationSystem: true,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "turns.ts anthropicMidConvSystem: wire-tested, only Opus 4.8 on the anthropic-cli shape",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/]",
      wire: "anthropic-messages",
    },
    generation: {
      sampling: {
        exclusive: [["temperature", "topP"]],
      },
      turns: {
        clearAt: true,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "§8.7 mutually-exclusive knobs on the direct wire (a RESTRICTION, compatible with D68 fail-closed — no ranges ship until a dated measured/anthropic.ts entry); clearAt = @ai-sdk/anthropic's mid-conversation-system-clear-at-2026-08-21 beta (convert-to-anthropic-prompt.ts:242-262)",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/]",
      wire: "agent-sdk",
    },
    generation: {
      sampling: {},
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "the Claude runtime exposes no sampler knob (chat-models.ts `sampling: {}` on every entry); the funnel drops each preset knob with sampling_knob_dropped",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
