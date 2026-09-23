// Curated capability rows — anthropic. DATA in ONE schema (`capabilityOverrideSchema`), checked at `tsc` through
// `satisfies` and re-parsed at load through the same zod the plugin/admin rows go through. File order is
// composition order (a later row refines an earlier one). Adding a model is a row here + the table test.

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

/** The Claude ids measured to take a `system` row inside `messages` (matrix §7, handling (b)): a tail row and a
 *  legal mid-array row both return 200 on the direct wire. Anchored so an unmeasured sibling (a point release, a
 *  dated snapshot) stays on the fail-closed family cell. haiku-4-5 is absent: it 400s any system row. */
const SYSTEM_ROW_MODELS = "^(anthropic/)?claude[-/](opus-5([-.]5)?|fable-5([-.]1)?|sonnet-5|opus-4[-.]8)$";

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
      cite: "domain/connection/catalog/chat-models.ts CLAUDE_CAPABILITY_FLOOR + turns.ts NON-version cells; roleHandlingFloor strict (turns.ts:90,103). midConversationSystem/historySystemRows stay false on the family cell as the fail-closed default: SHAPING-MATRIX §7 measured a tail and a legal mid-array system row at 200 on opus-5, opus-5-5, fable-5, fable-5-1, sonnet-5 and opus-4-8 (the SYSTEM_ROW_MODELS rows below), 400 on haiku-4-5 for any system row (req_011CfKhZ8ALv97q91yH4eqep), and opus-5 failing a mid-array row on OpenRouter (the OpenRouter opus-5 row below)",
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
      output: {
        maxTokens: {
          min: 1,
          max: 128_000,
        },
      },
      context: {
        window: 1_000_000,
      },
      turns: {
        cacheMinTokens: 512,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-23",
      cite: "@ai-sdk/anthropic 4.0.58 getModelCapabilities (dist/index.js:5943-5953): supportsAdaptiveThinking, supportsXhighEffort, rejectsSamplingParameters: true; Models API 2026-09-23 max_input_tokens 1,000,000 / max_tokens 128,000 / thinking adaptive only (opus-5 req_011CfKrpkFiR5L4pT2WAm3oB, opus-5-5 req_011CfKrpmWsQRi4sLnPujdx9); cacheMinTokens 512 = a 555-token prefix cached and a 504-token one did not (opus-5 req_011CfKrvqD3Be1mTJTWssMeJ / req_011CfKrudXJBP64sXedecYct, opus-5-5 req_011CfKrw9dKMDf2PWQv4YasA / req_011CfKruzHTfrbWs8aMaoosm)",
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
        // Replayed thinking is bound to the conversation prefix (preserved thinking), so a carried block asks the
        // API to drop itself on a prefix mismatch instead of a 400.
        prefixBound: true,
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
      cite: 'live 2026-09-22 direct claude-opus-5-5: thinking.type disabled -> 400 "not supported for this model" (req_011CfKDSu4dFAHQSAt8Sttn6); tool_choice any -> 400 (req_011CfKDSuxTCH6PtrxUkqCvf); OpenRouter anthropic/claude-opus-5.5 tool_choice required -> upstream 400 (req_011CfKDWYL4K21BXuXPJ4eKU); prefixBound = preserved thinking per the Claude API model-migration notes (the 400 lands on accounts created from 2026-08-31; this key predates it: edited-prefix replay 200 req_011CfKs6JMgTb3Y9up4Y1F3N, drop_block accepted req_011CfKs6a4VLio7HdQpBMWwz)',
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
      output: {
        maxTokens: {
          min: 1,
          max: 128_000,
        },
      },
      context: {
        window: 1_000_000,
      },
      turns: {
        cacheMinTokens: 1024,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-23",
      cite: "chat-models.ts Opus 4.8 entry; turns.ts OPUS_48_MIN; sampling {} = @ai-sdk/anthropic 4.0.58 getModelCapabilities (dist/index.js:5954-5963) rejectsSamplingParameters: true; Models API 2026-09-23 max_input_tokens 1,000,000 / max_tokens 128,000 / thinking adaptive only (req_011CfKrpnME92ak8htGAZfQK)",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/].*opus-4[-.]7",
    },
    generation: {
      reasoning: {
        mode: "adaptive",
        enabled: true,
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
      // Rejects sampling parameters (the SDK table) — the stated set is empty on every wire.
      sampling: {},
      output: {
        maxTokens: {
          min: 1,
          max: 128_000,
        },
      },
      context: {
        window: 1_000_000,
      },
      turns: {
        cacheMinTokens: 2048,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-23",
      cite: "turns.ts OPUS_47_MIN; sampling {} = @ai-sdk/anthropic 4.0.58 getModelCapabilities (dist/index.js:5954-5963) rejectsSamplingParameters: true; Models API 2026-09-23 max_input_tokens 1,000,000 / max_tokens 128,000 / thinking adaptive only (req_011CfKrpo1QuJJXt5KDz6ZRQ)",
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
      // Sonnet 5 thinks adaptively only (the shared sonnet row above states effort for 4.5/4.6).
      reasoning: {
        mode: "adaptive",
      },
      // Sonnet 5 alone of the sonnet row above rejects sampling parameters (4.5/4.6 accept them: the SDK table
      // says `rejectsSamplingParameters: false`, and the direct wire stays D68 fail-closed for them regardless).
      sampling: {},
      output: {
        maxTokens: {
          min: 1,
          max: 128_000,
        },
      },
      context: {
        window: 1_000_000,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-23",
      cite: "@ai-sdk/anthropic 4.0.58 getModelCapabilities (dist/index.js:5954-5963) rejectsSamplingParameters: true for claude-sonnet-5; :5964-5973 false for sonnet-4-6; Models API 2026-09-23 max_input_tokens 1,000,000 / max_tokens 128,000 / thinking adaptive only (req_011CfKrpqBszB95ktdqBoGas)",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/].*haiku-4[-.]5",
    },
    generation: {
      // Extended thinking with a token budget (`thinking: {type: "enabled", budget_tokens}`) and no effort. The
      // budget stays below the 64k output cap, which the SDK enforces on `max_tokens` + budget.
      reasoning: {
        mode: "budget",
        enabled: true,
        budgetRange: {
          min: 1024,
          max: 63_000,
        },
      },
      output: {
        maxTokens: {
          min: 1,
          max: 64_000,
        },
      },
      turns: {
        cacheMinTokens: 4096,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-23",
      cite: "turns.ts HAIKU_45_MIN; Models API 2026-09-23 claude-haiku-4-5: max_input_tokens 200,000 / max_tokens 64,000 / thinking enabled (budget), adaptive and effort unsupported (req_011CfKrpqx2Hs1U4Rg1DZ9C6); direct budget_tokens 1024 -> 200 with a thinking block (req_011CfKrzCmQjgUPfUvzv1MBC)",
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
      output: {
        maxTokens: {
          min: 1,
          max: 128_000,
        },
      },
      context: {
        window: 1_000_000,
      },
      turns: {
        cacheMinTokens: 512,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-23",
      cite: "Models API 2026-09-23 max_input_tokens 1,000,000 / max_tokens 128,000 / thinking adaptive only (fable-5 req_011CfKrpofqzmcm2uuqUF1FC, fable-5-1 req_011CfKrppViCfcxQkR1Qiurp); turns.ts FABLE_MYTHOS_MIN; mandatory = direct claude-fable-5-1 thinking.type: disabled → 400 'not supported for this model' (2026-09-19 req_011CfE8JTmHYvCZudukFufdG; 2026-09-20 rec-probe.mjs anth-fable-disabled req_011CfEBkabcoxXWyouHdYDxY), OpenRouter 'Reasoning is mandatory for this endpoint' (2026-09-19); sampling {} = @ai-sdk/anthropic 4.0.58 getModelCapabilities (dist/index.js:5954-5963) rejectsSamplingParameters: true",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/].*(fable|mythos)-5[-.]1(?![0-9])",
    },
    generation: {
      // Replayed thinking is bound to the conversation prefix on the 5.1 point releases (preserved thinking).
      reasoning: {
        prefixBound: true,
      },
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
      cite: 'live 2026-09-22 direct claude-fable-5-1: tool_choice any -> 400 "tool_choice: type tool and any are not supported for this model" (req_011CfKDSt2rkNRQpvSiYH8Ly); OpenRouter anthropic/claude-fable-5.1 tool_choice required -> upstream 400 (req_011CfKDWRATCcLYJ3wtdrpip); control claude-fable-5 tool_choice any -> 200 (req_011CfKDUqhmXPSzWjeFHjxyM). Mythos 5.1 per Anthropic docs (not available on this account); prefixBound = preserved thinking per the Claude API model-migration notes (drop_block accepted on fable-5-1: req_011CfKs7QaWYrtm7Zhq5SnGE)',
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
        roleHandlingFloor: "slotted",
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-23",
      cite: "turns.ts anthropicMidConvSystem: wire-tested, only Opus 4.8 on the anthropic-cli shape; the tail row rides the hook (obeyed 2/2, chat_01m36759qtf689cr8ptn0bps6c). Floor slotted so the level keeps it (SHAPING-MATRIX §3, §5)",
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
      model: SYSTEM_ROW_MODELS,
      wire: "anthropic-messages",
    },
    generation: {
      turns: {
        midConversationSystem: true,
        historySystemRows: true,
        roleHandlingFloor: "slotted",
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-23",
      cite: "SHAPING-MATRIX §7 handling (b), direct, n=3 per cell: a tail system row and a legal-slot [u,S,a] row return 200 on opus-5 (req_011CfKhAEdeEh6hy5HbSgemF…), opus-5-5 (req_011CfKhJ4rzXWr39mUEhXSKo…), fable-5 (req_011CfKhJ4omUcAHiNHB3tvWb…), fable-5-1 (req_011CfKhJ4omHQU8PuX1mRUEn…), sonnet-5 (req_011CfKhYub3yrLNLnBRDfNb4…), opus-4-8 (req_011CfKhYuVMPxhZ1UbNk9JiX…); an illegal [a,S,u] slot 400s (req_011CfKZSZSFUfW1Jdarpf5Cb), so the floor is slotted. haiku-4-5 400s any system row (req_011CfKhZ8ALv97q91yH4eqep) and is not on this row",
    },
  },
  {
    match: {
      model: SYSTEM_ROW_MODELS,
      provider: "openrouter",
    },
    generation: {
      turns: {
        midConversationSystem: true,
        historySystemRows: true,
        roleHandlingFloor: "slotted",
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-23",
      cite: "SHAPING-MATRIX §7: OpenRouter keeps a legal-slot system row as a `system` message in place (gen-1790135915-ad0nXVocOBSoE6gyplfQ, gen-1790135918-wkRaFfoNuh31C0pxEMFf) and folds an illegal one into bare user text with no signal (gen-1790135916-nTEe5GaIsluqhqHSU4sW), so the floor is slotted",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/]opus-5$",
      provider: "openrouter",
    },
    generation: {
      turns: {
        historySystemRows: false,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-23",
      cite: "owner ruling on the SHAPING-MATRIX follow-up: opus-5 fails a mid-array system row on OpenRouter; the tail row stands",
    },
  },
  {
    match: {
      model: "^(anthropic/)?claude[-/]",
      wire: "agent-sdk",
    },
    generation: {
      sampling: {},
      // The spawn pins `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` (`backends/agent-sdk/env.ts`), which caps the runtime's
      // window at 200k on every id; this row states the window that route serves. Lifting the pin lifts this row.
      context: {
        window: 200_000,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-23",
      cite: "the Claude runtime exposes no sampler knob (chat-models.ts `sampling: {}` on every entry); the funnel drops each preset knob with sampling_knob_dropped; window = runtime-reported contextWindow with the 1M pin set: 200,000 (claude-opus-5 session 00e4fcde-278d-4b8a-b81b-bd1d38275462, claude-sonnet-5 4080457f-12cb-43c4-8084-af4da34fe705), 1,000,000 without it (9d89eb4f-05b1-4d1f-85c2-b8baafb194f5)",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
