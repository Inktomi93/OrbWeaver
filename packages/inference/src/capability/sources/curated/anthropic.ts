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
        // SIGNED replay on BOTH routes, stated once on the family base so every Claude id inherits it: the
        // direct wire round-trips a `thinking` block with its opaque `signature`, and OpenRouter carries the
        // same material as `reasoning_details` with `format: "anthropic-claude-v1"` (it strips unsigned
        // entries). Without this cell the fail-closed `REASONING_REPLAY_FLOOR` applies and a tool loop
        // drops the model's verified reasoning on every hop (audit A1, §8.8).
        replay: "signed",
      },
      turns: {
        // False on every Claude id and route. The newer ids 400 a trailing assistant row; the 4.5 ids accept it
        // but answer a continue (the finished reply as the prefill) with three tokens of nothing — OpenRouter
        // haiku-4.5 gen-1790137541-jdHgdXhju27JwK4tK9XH, opus-4.5 gen-1790141538-eBRpWlikU1TqDrHB1EWH, direct
        // haiku-4-5 req_011CfKpkas4tLck9X6hodkK7.
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
      model: "^(anthropic/)?claude[-/].*opus-5",
    },
    generation: {
      reasoning: {
        mode: "adaptive",
        enabled: true,
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
      // The SDK's own capability table is the direct wire's truth (it strips before sending): Opus 5 REJECTS
      // sampling parameters, so the stated set is empty — a preset knob drops with `sampling_knob_dropped`
      // instead of the record claiming it applied (inference audit B3/H3). `rejectsThinkingDisabledAboveHighEffort`
      // needs no `mandatory`: our wire sends `effort` only when reasoning is ENABLED (chat.ts), so the
      // disabled+xhigh combination the SDK lowers is unreachable. This regex ALSO matches `opus-5-5`: Opus 5.5
      // shares every fact stated here, and the row below states what differs (it would 400 on this row alone).
      sampling: {},
      context: {
        window: 200_000,
        supports1M: true,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-20",
      cite: "@ai-sdk/anthropic 4.0.58 getModelCapabilities (dist/index.js:5943-5953): supportsAdaptiveThinking, supportsXhighEffort, rejectsSamplingParameters: true; no curated row existed before 2026-09-20 (opus-5 resolved as non-reasoning on the direct wire)",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/].*opus-5[-.]5(?![0-9])",
    },
    generation: {
      reasoning: {
        // Thinking CANNOT be disabled at any effort (Opus 5 allows it at `high` or below): `{type:"disabled"}` and a
        // `budget_tokens` form both 400, so the funnel clamps an explicit `none` UP with `reasoning_mandatory_clamp`.
        // Effort is the only depth control; an unset effort takes the house default (`ADAPTIVE_DEFAULT_EFFORT`).
        mandatory: true,
      },
      // Forced `tool_choice` (`any` / `tool`) 400s on this model; Opus 5 accepts both.
      // A `tools` cell restates `parallel`: a sub-fact alone is refused at parse (the cell means "accepts tools[]").
      tools: {
        parallel: true,
        forcedChoice: false,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-22",
      cite: 'live 2026-09-22 direct claude-opus-5-5: thinking.type disabled -> 400 "not supported for this model" (req_011CfKDSu4dFAHQSAt8Sttn6); tool_choice any -> 400 (req_011CfKDSuxTCH6PtrxUkqCvf); OpenRouter anthropic/claude-opus-5.5 tool_choice required -> upstream 400 (req_011CfKDWYL4K21BXuXPJ4eKU)',
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
      // Rejects sampling parameters (the SDK table) — the stated set is empty on every wire.
      sampling: {},
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
      dated: "2026-09-20",
      cite: "chat-models.ts Opus 4.8 entry; turns.ts OPUS_48_MIN; sampling {} = @ai-sdk/anthropic 4.0.58 getModelCapabilities (dist/index.js:5954-5963) rejectsSamplingParameters: true",
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
      // Rejects sampling parameters (the SDK table) — the stated set is empty on every wire.
      sampling: {},
      turns: {
        cacheMinTokens: 2048,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-20",
      cite: "turns.ts OPUS_47_MIN; effort mode = the anthropic family default (resolve-model-capability.ts FAMILY_REASONING); sampling {} = @ai-sdk/anthropic 4.0.58 getModelCapabilities (dist/index.js:5954-5963) rejectsSamplingParameters: true",
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
      model: "^(anthropic/)?claude[-/].*sonnet-5",
    },
    generation: {
      // Sonnet 5 alone of the sonnet row above rejects sampling parameters (4.5/4.6 accept them: the SDK table
      // says `rejectsSamplingParameters: false`, and the direct wire stays D68 fail-closed for them regardless).
      sampling: {},
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-20",
      cite: "@ai-sdk/anthropic 4.0.58 getModelCapabilities (dist/index.js:5954-5963) rejectsSamplingParameters: true for claude-sonnet-5; :5964-5973 false for sonnet-4-6",
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
        // Thinking CANNOT be disabled on Fable (inference audit A8, measured on both routes): the funnel clamps an
        // effort `none`/absent intent UP to the lowest level with `reasoning_mandatory_clamp` instead of the
        // direct wire 400-ing (the OpenRouter replay belt caught it there; the direct wire had no belt).
        mandatory: true,
      },
      // Rejects sampling parameters (the SDK table) — the stated set is empty on every wire.
      sampling: {},
      turns: {
        cacheMinTokens: 512,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-20",
      cite: "turns.ts FABLE_MYTHOS_MIN; mandatory = direct claude-fable-5-1 thinking.type: disabled → 400 'not supported for this model' (2026-09-19 req_011CfE8JTmHYvCZudukFufdG; 2026-09-20 rec-probe.mjs anth-fable-disabled req_011CfEBkabcoxXWyouHdYDxY), OpenRouter 'Reasoning is mandatory for this endpoint' (2026-09-19); sampling {} = @ai-sdk/anthropic 4.0.58 getModelCapabilities (dist/index.js:5954-5963) rejectsSamplingParameters: true",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/].*(fable|mythos)-5[-.]1(?![0-9])",
    },
    generation: {
      // The 5.1 point releases 400 a forced `tool_choice` (`any` / `tool`); Fable 5 and Mythos 5 accept it, which is
      // why this is its own row and not a cell on the family row above.
      // A `tools` cell restates `parallel`: a sub-fact alone is refused at parse (the cell means "accepts tools[]").
      tools: {
        parallel: true,
        forcedChoice: false,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-22",
      cite: 'live 2026-09-22 direct claude-fable-5-1: tool_choice any -> 400 "tool_choice: type tool and any are not supported for this model" (req_011CfKDSt2rkNRQpvSiYH8Ly); OpenRouter anthropic/claude-fable-5.1 tool_choice required -> upstream 400 (req_011CfKDWRATCcLYJ3wtdrpip); control claude-fable-5 tool_choice any -> 200 (req_011CfKDUqhmXPSzWjeFHjxyM). Mythos 5.1 per Anthropic docs (not available on this account)',
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
