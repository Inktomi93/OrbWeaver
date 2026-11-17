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
  // The direct API's own ids, as the baseline when the list read is absent — the `deepseek` model-info reader
  // restates every figure per model from the live list. 2026-11-16: `GET /v1/models` states `context_window`
  // 1_048_576 and `max_output_tokens` 393_216 on served rows (the pricing page's "1M"/"384K" are the same
  // figures rounded); the legacy names deepseek-v4-flash and deepseek-v4-flash-vision-exp are served by the
  // same Flash model.
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
  // untouched. Every cell is measured against the live API or cited from the chat-completions page
  // (api-docs.deepseek.com/quick_start/chat_completions and guides/tool_calls, live 2026-11-16):
  //   • reasoning: thinking is the default mode; `reasoning_effort` takes `low`/`high`/`max` (`/models`
  //     `effort.supported_levels`, `default_level: high`) and `none` is a real off (measured: no
  //     `reasoning_content` came back).
  //   • tools: `auto` works in both modes; `none` was measured to disable calling and answer in prose, in
  //     thinking AND non-thinking mode; `required` and a named function answer 200 with a forced call in
  //     NON-thinking mode (measured 2026-11-16) and hard-400 in thinking mode ("Thinking mode does not
  //     support this tool_choice") — the cell is one boolean, and `requiresReasoningOff` gates every tool
  //     (structured/plan.ts:195), too coarse for offered tools which DO work while thinking, so the
  //     forced-choice cells stay false. Two independent calls came back in one turn (non-thinking):
  //     `parallel` is true; `parallel_tool_calls: false` answers 200 and the model calls twice anyway
  //     (measured 2026-11-16), so the control reaches nothing and rides no request. The API reference
  //     documents none of this control: `parallel_tool_calls` appears nowhere in it.
  //   • tool history (measured 2026-11-17, two doc claims outranked): the Thinking Mode page states that a
  //     tools-carrying request MUST replay every prior turn's `reasoning_content` or the API 400s (its
  //     interleaved-thinking contract), and the Tool Calls page states the Chat Completion API "does not
  //     support inserting tool calls mid-conversation". Both measured wrong on the live API: a thinking-mode
  //     turn with an assistant `tool_calls` + `tool` history and NO replayed CoT answers 200 with a fresh
  //     call, and a client-inserted (never model-generated) call+result pair mid-history answers 200 with
  //     the result folded into the prose. The same leniency holds across the page's own MULTI-SUBTURN
  //     interleaved chain (date→weather, effort low): replaying `reasoning_content` at every sub-turn 200s
  //     with fresh CoT at each, and the same chain replayed with `reasoning_content` stripped from every
  //     assistant row ALSO 200s (measured 2026-11-17) — "or the API will return a 400 error" does not fire. Neither leniency is depended on, and none is needed: composed RPG
  //     tool rounds ride thinking ON (the wire carries `reasoning_effort` at the resolved default — proved
  //     2026-11-17: `requiresReasoningOff` gates only the STRUCTURED plan's vehicles, structured/plan.ts:195,
  //     and the vendor accepts tools+thinking), where all four shapes were measured to work in both modes.
  //     The `reasoning.replay` cell stays at its floor (`none`) and is measured in both directions
  //     (2026-11-17): a replayed prior-turn `reasoning_content` IS concatenated into context on a
  //     tools-carrying turn (the model quoted a word only the CoT held) and IS dropped on a toolless one
  //     (it denied knowing it; 61 prompt tokens — the block never entered the prompt), exactly as the
  //     Thinking Mode page states. Neither rung earns a replay cell: a toolless replay would burn tokens on
  //     a block the server itself discards, and the tool-round replay leg rides thinking-on, which the
  //     vendor takes.
  //   • structured: `response_format: json_schema` 400s on the chat-completions route in BOTH thinking modes
  //     ("This response_format type is unavailable now" — probed on/off 2026-11-17; it is route-level, not
  //     thinking-gated) — schema-enforced output rides the offered strict tool (`features.strictJson:
  //     default-on`, `structuredMode: strict-compatible` on the provider row), so `output.structured` stays
  //     false and the `response-format` vehicle is never offered. `json_object` answers 200 with thinking
  //     on/off but enforces VALID JSON only, not a schema: a prompt naming mood+hp returned an extra
  //     unrequested `description` key (measured), and the JSON-mode page states non-recognizable output is
  //     silently blanked to spaces. The vendor DOES serve schema enforcement — on the Responses API route:
  //     `POST /responses` with `text.format` json_schema answers 200 conforming to a strict mood/hp schema
  //     with thinking on, with `effort: none`, and alongside declared tools (all measured 2026-11-17). That
  //     is a different wire than the connection rides (no responses backend is wired), so the cell stays
  //     false — flipping it would mean a new backend, not a re-read of this route's facts.
  //     The route's strict grammar measured its own rules (2026-11-17, against the REAL RPG extraction
  //     schema): `strict: true` compiles an OpenAI-strict-style grammar that REJECTS optional properties
  //     ("Required properties must match all properties in the object") and a closed type-union vocabulary
  //     — a `type` array naming `array` 400s ("unknown variant `array`", a Rust-enum parser's own words)
  //     while `anyOf`-wrapped `array|null`/`string|null` compile and answer 200 with a correct `null`.
  //     Our omit=keep patch shape is therefore representable there only under a required-all + anyOf-nullable
  //     projection (kit-side, beside `projectJsonSchema`) plus a null-is-keep decode rule — no third-party
  //     schema library does that mapping. With `strict` omitted or false the route serves the CURRENT
  //     projected schema unchanged and answers 200 with a clean parseable delta (measured), so the route
  //     without the grammar is a cleaner json_object — advisory only, the lenient fold still required.
  //   • anthropic route (the same key serves `POST /anthropic/v1/messages`, per the live `/v1/models`
  //     `api_capabilities`): tools carry `input_schema`, and thinking+tools INTERLEAVE natively — one answer
  //     came back `thinking` + `tool_use` blocks, and the docs' full contract (replay the thinking blocks,
  //     omission may 400 if recovery fails) measured lenient: an assistant row replayed WITHOUT its thinking
  //     block answered 200 with the result folded (2026-11-17, one sample; the page says don't rely on it).
  //     `tool_choice: any` with client tools answers 400 in thinking ("Thinking mode does not support this
  //     tool_choice" — the same wall as the chat route's `required`) and force-calls with thinking disabled.
  //     No cell reads this route; the fact is banked for anyone wiring it.
  //   • turns: a `system` row mid-history and at the tail both answered 200 on flash and v4-pro (measured
  //     2026-11-16); a trailing assistant row is continued by the `prefix` flag (measured, beta route);
  //     context caching is provider-implicit (`usage.prompt_cache_hit_tokens` per response).
  //   • sampling: the server's own range errors state the cells exactly — "the valid range of temperature
  //     is [0, 2]" (2.0 and 0 answer 200, 2.5 400s) and "the valid range of top_p is (0, 1.0]" (1.0 and
  //     0.01 answer 200, 0 400s — the Range cell has no exclusive bound, so the 0 edge carries the server's
  //     own clear 400); temperature is inert in thinking mode, and top_p's effective value is mode- and
  //     model-dependent (docs); `frequency_penalty`/`presence_penalty` are documented deprecated no-ops, so
  //     they stay out of the set; `stop` takes up to 16 sequences (measured: [" 3"] cut "1 2 3…" at " 3").
  //   • errors: the Error Codes page is the standard status set — 401 wrong key, 402 balance, 422 (and 400)
  //     bad parameters, 429 concurrency/QPS, 408/500/503/504 transient — every one of which the shared
  //     classifier (`backends/http/error-classify.ts`) already maps; no code here needs a row quirk.
  //     Measured 2026-11-17: a wrong key answers 401 on chat AND on `/v1/models` (so the key check judges
  //     it), and an unknown model answers 400 `invalid_request_error` — NOT the LiteRouter 403 shape, so
  //     `forbiddenIsNotCredentialVerdict` stays unset and 403 keeps its default credential meaning.
  //   • caching: disk context caching is on for every account with no request knob (Context Caching guide,
  //     live 2026-11-17) — hits arrive unasked in `usage`, best-effort, entries clear hours-to-days after
  //     last use. The V4 sliding-window page states no minimum cacheable prefix (the 256-token floor was
  //     the V3-era page), so no cache cell states a number the vendor no longer states.
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
      dated: "2026-11-16",
      cite: "api-docs.deepseek.com chat_completions + guides/tool_calls + guides/kv_cache + quick_start/error_codes pages and live probes 2026-11-16/17: effort levels low|high|max default high (/models effort), reasoning_effort none = no reasoning_content; tool_choice none answers in prose (both modes), required and a named function force 200 with thinking disabled and 400 'Thinking mode does not support this tool_choice' in thinking; two calls in one turn measured, parallel_tool_calls:false answers 200 and is ignored; json_schema response_format 400 both thinking modes on chat-completions (route-level, measured both directions 2026-11-17) while the Responses API route serves text.format json_schema 200 conforming with thinking on/off and alongside tools; json_object 200 both modes but adds unrequested keys (no schema enforcement); anthropic route /anthropic/v1/messages interleaves thinking+tool_use blocks, tolerates omitted thinking blocks on replay (one sample), and 400s tool_choice any under thinking with client tools; system rows mid-history and trailing 200 on both models; prefix-flag continue works on /beta; server range errors state temperature [0, 2] and top_p (0, 1.0] verbatim; stop [' 3'] cut the reply at the sequence; assistant tool_calls+tool history answers 200 with a fresh call even in thinking mode with no replayed reasoning_content, and an inserted mid-history call+result pair is accepted and folded (measured 2026-11-17, outranking the two doc claims to the contrary); wrong key 401 on chat and /models, unknown model 400 invalid_request_error",
    },
  },
  // Vision is the Flash model only: the live list's `input_modalities` name `image` for the flash rows and
  // text-only for v4-pro, and a pro call with an image part must not be sent expecting a reply.
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
] as const satisfies readonly CapabilityOverrideInput[];
