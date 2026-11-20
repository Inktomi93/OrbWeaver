// Curated capability rows — deepseek. DATA in ONE schema (`capabilityOverrideSchema`), checked at `tsc` through
// `satisfies` and re-parsed at load through the same zod the plugin/admin rows go through. File order is
// composition order (a later row refines an earlier one). Adding a model is a row here + the table test.

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

export const deepseekRows = [
  {
    match: {
      model: "^deepseek/",
    },
    kind: "generation",
    generation: {
      reasoning: {
        mode: "none",
        enabled: false,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "resolve-model-capability.ts FAMILY_REASONING.deepseek (no reasoning by family; OR advertises the reasoner variants)",
    },
  },
  // The direct API's own ids, the baseline when the list read is absent — the `deepseek` model-info reader
  // restates every figure per model from the live list. The pricing page's "1M"/"384K" are these figures
  // rounded, and the two legacy names are served by the same Flash model.
  {
    match: {
      model: "^deepseek-(flash|v4-pro|v4-flash|v4-flash-vision-exp)$",
    },
    generation: {
      context: {
        window: 1_048_576,
      },
      output: {
        maxTokens: { min: 1, max: 393_216 },
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-11-16",
      cite: "live GET https://api.deepseek.com/v1/models (2026-11-16): context_window 1048576, max_output_tokens 393216 per row",
    },
  },
  // The direct API's own row facts, provider-scoped so an admin route serving a same-named id elsewhere is
  // untouched. Provenance for every cell is in `cite`; the why the cells read as they do:
  //   • the forced-choice cells stay false because `requiresReasoningOff` is one flag over every tool
  //     (structured/plan.ts:195), too coarse for the offered tools that DO work while thinking.
  //   • `reasoning.replay` stays none: a replayed prior-turn block is concatenated on a tools-carrying turn and
  //     dropped on a toolless one, so neither rung earns a cell.
  //   • `output.structured` stays false: `response_format: json_schema` 400s on this route in both thinking
  //     modes; the Responses route that serves it is a different api, governed by its own api-scoped cell.
  //   • the same key serves `POST /anthropic/v1/messages` (native thinking+tool interleave; `tool_choice: any`
  //     answers 400 under thinking); no cell reads that route.
  //   • temperature is inert in thinking mode and top_p's effective value is mode- and model-dependent; the
  //     documented-deprecated penalties stay out of the set; `stop` holds up to 16 sequences.
  //   • every error status the vendor's Error Codes page lists already maps in the shared classifier
  //     (`backends/http/error-classify.ts`), so no code needs a row quirk; an unknown model answers 400, not
  //     403, so `forbiddenIsNotCredentialVerdict` stays unset.
  //   • no cache cell states a minimum: the current pages state none.
  {
    match: {
      provider: "deepseek",
      model: "^deepseek-(flash|v4-pro|v4-flash|v4-flash-vision-exp)$",
    },
    generation: {
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["low", "high", "max"],
        defaultEnabled: true,
        defaultEffort: "high",
      },
      tools: {
        parallel: true,
        requiredChoice: false,
        namedChoice: false,
        noneChoice: true,
        parallelControl: false,
      },
      output: {
        structured: false,
      },
      turns: {
        assistantPrefill: true,
        midConversationSystem: true,
        historySystemRows: true,
        // Notes ride as system rows wherever the two booleans gate delivery. `merge` (not `none`) so same-role
        // merging keeps running as under the fail-closed `strict` floor — only the fold placement changes.
        roleHandlingFloor: "merge",
        providerImplicitPromptCache: true,
      },
      sampling: {
        temperature: { min: 0, max: 2 },
        topP: { min: 0, max: 1 },
        stop: true,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-11-17",
      cite: "api-docs.deepseek.com chat_completions + guides/tool_calls + guides/kv_cache + quick_start/error_codes pages and live probes 2026-11-16/17: effort levels low|high|max default high (/models effort), reasoning_effort none = no reasoning_content; tool_choice none answers in prose (both modes), required and a named function force 200 with thinking disabled and 400 'Thinking mode does not support this tool_choice' in thinking; two calls in one turn measured, parallel_tool_calls:false answers 200 and is ignored; json_schema response_format 400 both thinking modes on chat-completions (route-level, measured both directions 2026-11-17) while the Responses API route serves text.format json_schema 200 conforming with thinking on/off and alongside tools; json_object 200 both modes but adds unrequested keys (no schema enforcement); anthropic route /anthropic/v1/messages interleaves thinking+tool_use blocks, tolerates omitted thinking blocks on replay (one sample), and 400s tool_choice any under thinking with client tools; system rows mid-history and trailing 200 on both models (the stated basis for roleHandlingFloor merge — placement anywhere, merging preserved; a system row directly above a prefix continue row also continued 3/3, docs/law/deepseek-api-surface.md); prefix-flag continue works on /beta; server range errors state temperature [0, 2] and top_p (0, 1.0] verbatim; stop [' 3'] cut the reply at the sequence; assistant tool_calls+tool history answers 200 with a fresh call even in thinking mode with no replayed reasoning_content, and an inserted mid-history call+result pair is accepted and folded (measured 2026-11-17, outranking the two doc claims to the contrary); wrong key 401 on chat and /models, unknown model 400 invalid_request_error",
    },
  },
  // Vision is the Flash model only: the live list names `image` on the flash rows and text on v4-pro, and a pro
  // call with an image part is accepted with the content dropped.
  {
    match: {
      provider: "deepseek",
      ids: ["deepseek-flash", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp"],
    },
    generation: {
      input: ["text", "image"],
    },
    evidence: {
      tier: "curated",
      dated: "2026-11-17",
      cite: "live GET /v1/models input_modalities [text, image] on the flash rows; measured 2026-11-17: solid 600×600 PNGs answered 'Black' and 'white' correctly (thinking off) — real reading, both controls; a corrupt-PNG data URL 400s 'unsupported image', so flash validates image content it is sent",
    },
  },
  {
    match: {
      provider: "deepseek",
      ids: ["deepseek-v4-pro"],
    },
    generation: {
      input: ["text"],
    },
    evidence: {
      tier: "curated",
      dated: "2026-11-17",
      cite: "live GET /v1/models input_modalities [text] on deepseek-v4-pro; measured 2026-11-17: an image part is accepted with 200 and the content is dropped — solid black answered 'White', solid white answered 'Red', no validation of the bytes (the list's own claim that nothing reads it, confirmed by wrong answers on both controls)",
    },
  },
  // The `/responses` protocol cells (api-scoped; `backends/openai-compat/responses.ts` is the runner). The
  // api-scoped match layers over the provider-scoped chat cell, so only what this route differs on is restated.
  // The vendor's `api_capabilities` declares only `anthropic_messages` — nothing about `/responses` — and
  // Vercel's catalog names flash + v4-pro only, so neither list bounds the served set: every curated id carries
  // the cells.
  // `structured` is true because the `strict-compatible` scrub IS the route's grammar (required-all + anyOf-null
  // + closed, `wire-subset.ts:287-296`); with `strict` omitted the route enforces nothing, which is why the plan
  // overrides the SDK's default-on strictness (`responses.ts`) instead of trusting it. No third-party schema
  // library performs that mapping.
  // `assistantPrefill` is false because the `prefix` continue flag is a chat-route `/beta` body field this
  // protocol has no arm for, and a trailing assistant turn here is unmeasured. `stop` is silently ignored on
  // this route, so its cell is false. Replay needs no item-id carry: a function_call + output round trip answers
  // with the reasoning item kept, stripped or omitted. The terminal `response.completed` event carries the usage
  // and there is no `[DONE]` line, so no per-event cell is needed.
  {
    match: {
      provider: "deepseek",
      model: "^deepseek-(flash|v4-pro|v4-flash|v4-flash-vision-exp)$",
      wire: "openai-compat",
      api: "responses",
    },
    generation: {
      output: {
        structured: true,
        structuredLimits: { maxOptionalProps: 0 },
      },
      turns: {
        assistantPrefill: false,
        midConversationSystem: true,
        historySystemRows: true,
        // Same ruling as the chat arm: `merge` over `none` leaves merging untouched and only loosens the fold.
        roleHandlingFloor: "merge",
        providerImplicitPromptCache: true,
      },
      sampling: {
        temperature: { min: 0, max: 2 },
        topP: { min: 0, max: 1 },
        stop: false,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-11-17",
      cite: "live probes on https://api.deepseek.com/v1/responses 2026-11-17: all four ids answer 200 (plus the chat/reasoner aliases); json_schema strict:true compiles the projected RPG schema (optional-props and type-array rules measured verbatim), strict omitted answers the unprojected schema advisory-only; tool strict:true accepted, suggestive at best (n=4); system row mid-input 200 (the stated basis for roleHandlingFloor merge, matching the chat arm); function_call+output replay 200 with the reasoning item kept-id, stripped-id and omitted; effort none/medium/max pass through and effort none + tool_choice required forces the call (required/named under thinking 400 'Thinking mode does not support this tool_choice', the chat route's wall); temperature 2.5 and top_p 0 400 with the chat route's range words, stop:[' 3'] silently ignored on a '1 2 3 4 5' count; second identical prompt reports input_tokens_details.cached_tokens 384; terminal response.completed carries usage and there is no [DONE] line",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
