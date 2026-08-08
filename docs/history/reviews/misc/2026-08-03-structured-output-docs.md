# Structured output — vendor docs vs. our tree (2026-08-03)

Read-only research pass. Every vendor claim below is cited to a fetched page (fetched 2026-08-03); every
tree claim is cited to `file:line`. Recommendations are marked **REC** and nothing was built.

## Sources fetched

| # | URL | What it is |
|---|---|---|
| A1 | `https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md` | Anthropic `output_config.format` + the JSON-Schema subset |
| A2 | `https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use.md` | Anthropic `strict: true` on tools |
| A3 | `https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview.md` | Anthropic tool_choice / non-strict tools |
| O1 | `https://developers.openai.com/api/docs/guides/structured-outputs` | OpenAI `json_schema` + supported subset (301 from `platform.openai.com`) |
| R1 | `https://openrouter.ai/docs/features/structured-outputs` | OpenRouter's proxy surface |

Measurement in this doc came from running our real projector over our real schemas
(`projectJsonSchema(rpgExtractionSchema)`), not from re-reading comments.

### Measured facts (projector output, today)

| Schema | bytes | object nodes | props | **optional** | required | max depth |
|---|---|---|---|---|---|---|
| `rpgExtractionSchema` | 4571 | 17 | 68 | **46** | 22 | 9 |
| `rpgPopulateSchema` | 1695 | 7 | 22 | 13 | 9 | 8 |

The **46** is an exact match for the number in Anthropic's runtime error quoted at
`packages/server/src/infra/providers/backends/openrouter/index.ts:152` — the probe matrix is accurate.

---

## (a) Unsupported keywords our projector emits

`projectJsonSchema` (`packages/kit/src/json-schema/index.ts:47-51`) is `z.toJSONSchema(schema)` plus a
recursive `additionalProperties:false` pin (`index.ts:28-40`). **It strips nothing.** Whatever zod emits for a
refinement goes on the wire verbatim. Four unsupported keywords land, not one:

| Keyword | Count (extraction / populate) | Doc says | Our source |
|---|---|---|---|
| `minLength` | **16** / 8 | A1: *"String constraints (`minLength`, `maxLength`)"* — **Not supported**. O1: *"Strings: minLength, maxLength"* — unsupported. | `packages/contracts/src/rpg/tools.ts:46` `const targetRefField = z.string().min(1);` and 15 more `.min(1)` string fields (`tools.ts:59,66,102,103,114,121,122,147,157,170,182,190,196,226`) |
| `maxLength` | **1** / 0 | same rows as above — unsupported by **both** vendors | a `.max(n)` on `scene.weather.label` (projected at `$.properties.scene.properties.weather.properties.label`) |
| `minimum` | **8** / 4 | A1: *"Numerical constraints (such as `minimum`, `maximum`, `multipleOf`)"* — **Not supported**. O1: **supported** (`minimum`, `exclusiveMinimum`) except on fine-tuned models. | `tools.ts:59` `z.number().int()`, plus `tools.ts:116,121,131,141` `z.number().int().min(1)` |
| `maximum` | **8** / 4 | same row — Anthropic **not supported**, OpenAI **supported** | same as `minimum` (zod stamps safe-integer bounds for `.int()`) |

Additional, lower-severity:

- **`$schema` rides on the wire.** `z.toJSONSchema` stamps `$schema: "https://json-schema.org/draft/2020-12/schema"`
  and only the agent-sdk arm strips it (`packages/server/src/infra/providers/backends/agent-sdk/output-schema.ts:43-48`
  strips `["$schema","$id"]`). The OpenRouter and vLLM arms pass the projector output through unmodified
  (`openrouter/index.ts:168`; `backends/kit/openai-compat/body.ts:112-120`). Neither A1 nor O1 lists `$schema`
  as a supported keyword. Not observed to 400, but it is outside both documented subsets.
- **Nesting depth 9** on the extraction schema vs O1's *"Maximum 10 levels of nesting depth"*. One nested
  object away from the OpenAI ceiling. A1 documents no depth limit.
- We are nowhere near O1's other size caps (5,000 properties / 1,000 enum values / 120,000 chars).

**The tree's own comment understates this.** `openrouter/index.ts:150` records only the *first* 400
(`"For 'integer' type, properties maximum, minimum are not supported"`) because the probe stopped there and
moved on. `minLength` x16 is the larger population and is banned by **both** vendors — it was never surfaced
because the schema never got past the integer-bounds error, and then the vehicle changed.

**REC-1**: the projector should carry a documented **wire-subset scrub** (drop `minLength`/`maxLength`/
`minimum`/`maximum`/`multipleOf`/`$schema` from the *wire* copy while zod keeps them as the runtime
validator). This is the same shape as the existing agent-sdk `META_KEYWORDS` strip, generalized. It is
strictly a wire concern — zod stays the one representation (D79) and validation semantics are untouched,
because these keywords were never enforced on any non-grammar wire anyway.

---

## (b) Is Anthropic's "too many optional parameters" documented?

**No. It is an undocumented runtime wall.**

- A1 (structured outputs) lists supported/unsupported keywords, string formats, `minItems` 0/1, grammar
  compilation latency, and the 24-hour compiled-grammar cache. It says **nothing** about a limit on the
  number of optional properties. On limits it explicitly does not address: schema size, nesting depth,
  max property count.
- A2 (strict tool use) covers `strict:true`, its requirements (`required` + `additionalProperties:false`),
  data retention, and states the pipeline identity — *"Strict tool use compiles tool `input_schema`
  definitions into grammars using the same pipeline as structured outputs"* — but documents **no**
  optional-parameter cap either.
- What the docs *do* say about optionals is only the mechanics: A1 lists `required` as supported and requires
  `additionalProperties:false`; unlike OpenAI, Anthropic does **not** require every property to be listed in
  `required`. A2's own examples ship schemas with genuinely optional properties (`unit`, `passengers`,
  `travelers`, `guests` are absent from `required`). So optionals are legal — there is just an undocumented
  ceiling on how many the grammar compiler will accept.
- A web search surfaced only third-party reports of the same error string, quoting a limit of **24** optional
  parameters (e.g. *"too many optional parameters (80) … (limit: 24)"*). That number is **not** in any
  Anthropic doc and should be treated as unverified folklore, not spec. Our own measured refusal was at 46.

Practical consequence, and the thing the tree does not say anywhere: **the wall is a property of grammar
compilation, not of the request shape.** `output_config.format` always compiles a grammar; a tool only
compiles one when `strict: true`. Our forced tool has **no strict field at all** — `WireTool` is
`{name, description, parameters}` with no `strict`
(`packages/server/src/infra/providers/contract/chat.ts:34-38`), and `structuredWireTool`
(`openrouter/index.ts:167-168`) sets only those three. **That is why the forced-tool vehicle returns 200 on
all three families: no grammar is compiled, so no optional-count check runs.**

The honest reading of that: on OpenRouter, the structured role currently has **zero schema enforcement**. The
`parameters` schema is a prompt-shaped hint and the model may emit anything; our salvage parse is the only
backstop (`structuredReplyText` at `openrouter/index.ts:174-178` already falls back to prose when the model
ignores `tool_choice`). That is a defensible trade — a working unenforced call beats a 400 — but the
`@orb/kit/json-schema` header currently claims the pin is *"a GRAMMAR-LEVEL PREVENTION"* on
*"an OpenRouter `strict` tool"* (`packages/kit/src/json-schema/index.ts:7-11`). **There is no such tool in
the tree**; `WireTool` cannot express `strict`. That comment is now false for the OpenRouter path and should
be corrected to name vLLM/xgrammar as the only enforcing wire we actually drive.

---

## (c) Blanket forced-tool-call vs capability-driven

Recommendation: **keep the blanket forced tool call for now. Do not build a capability fork.** Reasons, each
from a doc:

1. **OpenRouter says support is per-*provider*, not per-model.** R1: *"The same model may be served by
   multiple providers, and only some of those providers may support structured outputs."* A per-family table
   keyed on model id is therefore structurally wrong — the same id can route to a supporting and a
   non-supporting endpoint on consecutive requests.
2. **OpenRouter's own metadata is the documented signal, and it is known-unreliable in our tree.** R1 names
   `supported_parameters=structured_outputs` plus `require_parameters: true` in provider preferences as the
   supported routing mechanism. But our own capability resolver already documents that OR
   **under-advertises** exactly this axis: `packages/server/src/domain/connection/catalog/resolve-model-capability.ts:217-229`
   — *"OR's catalog omits `structured_outputs` for Claude entries (the reason `claude-sonnet-4-6` had to be
   hand-curated)"* — and floors it for anthropic-family ids. A fork keyed on a field we already patch by hand
   would be a fork keyed on a guess.
3. **Even where `response_format` is advertised, our schema would still 400 on the Anthropic family** — for
   the (a) keyword reasons *and* the undocumented (b) optional wall. So the capability bit would be true and
   the call would still fail. Capability ≠ our-schema-compatible.
4. **`ModelCapability.output.structured` exists** (`packages/contracts/src/connection/index.ts:166-167`,
   *"accepts `response_format`/JSON-schema constrained output"*), so the signal is available if we ever want
   it — but per (2) it is a floored synthesis, not a fact.

**REC-2 (the arm I'd take):** leave the vehicle blanket, and make the *schema* the thing that gets fixed
(REC-1 + REC-3). A wire-subset-clean, low-optional schema is servable as `response_format` on more families
than the current one, at which point a capability fork becomes cheap to add and cheap to be wrong about.
Fixing the schema removes the reason to fork; forking now just routes a broken schema down two paths.

**REC-2b (if a fork is wanted anyway):** the only defensible signal is **OR's per-endpoint
`supported_parameters` combined with `require_parameters: true`** (R1's own mechanism), never a per-family
table and never our floored `ModelCapability.output.structured` — with the forced tool call as the
unconditional fallback on any 400. Do not use the Claude floor at `resolve-model-capability.ts:228` as the
gate; it is deliberately optimistic.

---

## (d) Does OpenAI strict forbid omit-means-keep?

**No — there is a documented pattern that preserves the semantics, and it also happens to clear Anthropic's
optional wall.**

O1 states both halves plainly:

- *"All fields or function parameters must be specified as `required`."* — so `required` must list every
  property, and
- *"Emulate optional parameters using union with null: `"type": ["string", "null"]`"* — the documented way to
  express "this field may carry nothing".

So strict-compatible omit-means-keep is: every property in `required`, every optional property's type
widened with `null`, and **`null` mapped to "absent / no change" at parse time**. The wire changes; the
semantics (`omit = keep`, D112) do not — the model emits `null` instead of omitting the key.

Two consequences worth naming:

1. **This also kills Anthropic's (b) wall.** If nothing is optional, the optional count is 0 and the grammar
   compiler has nothing to complain about. The same edit unblocks `strict` on OpenAI-family *and*
   `output_config.format` on Anthropic-family. That is the single highest-leverage change in this review.
2. **Spell the null union as `anyOf`, not a type array, for Anthropic.** A1's supported list names
   `anyOf`/`allOf` and the `null` type, but does not document the JSON-Schema type-array form
   (`"type": ["string","null"]`). `anyOf: [{type:"string"},{type:"null"}]` is inside both documented subsets;
   the type array is only documented by OpenAI.

Cost, honestly: the model must emit 46 explicit `null`s per extraction, which is more output tokens and a
measurably worse prompt for small local models. That is a real trade against `xgrammar`'s populate lever
(the vLLM strict pin at `packages/server/src/infra/providers/vllm/surfaces/chat.ts:137,147-149` exists
precisely because *"an 8B skips optional fields unless the compiled grammar requires the shape"* — under a
required+nullable schema the 8B would be *forced* to consider every field, which is arguably better for that
wire and worse for token spend).

**REC-3:** treat "required + nullable-union, `null` ≡ absent at parse" as a **candidate** schema-projection
mode, not an automatic yes. It is the documented route to strict on both vendors, and the only route past
Anthropic's optional wall — but it changes the wire shape of the rpg extraction contract, so it wants an
owner decision and a live A/B (hosted Claude/GPT vs local 8B) before anyone builds it.

**Also worth correcting regardless:** the extraction contract's header still says the schema is passed as
`output_config.format` (`packages/contracts/src/rpg/extraction.ts:3` — *"ONE `z.object` the structured
extraction turn passes as `output_config.format`"*). On the OpenRouter path that has been false since
2026-08-02: it is passed as a forced tool's `parameters`. The `ResponseFormat.name` doc comment
(`packages/contracts/src/role-clients/index.ts:23`, *"OpenAI `json_schema.name`; Anthropic tool name"*) is
still accurate.

---

## (e) Left on the table

1. **Refusals are a first-class field on both vendors, and we read neither.** O1: safety refusals appear in a
   separate `refusal` field *"rather than following your schema"*. A1 notes refusals may not match the schema.
   Our structured path reads `toolCalls[…].function.arguments` or falls back to the prose reply
   (`openrouter/index.ts:174-178`); a refusal lands in that fallback as unparseable prose and is logged as a
   normal `ok: true` item with a text that fails salvage. Cheap improvement: tag a salvage-failure whose text
   looks like a refusal distinctly in the `rpg.extraction.stripped` trail rather than as "the model wrote
   garbage".
2. **Grammar-compilation latency and the 24h schema cache.** A1: *"the first time you use a specific schema,
   there is additional latency while the grammar compiles"*, cached 24h from last use, and the cache is
   invalidated by *"the JSON schema structure"* or *"the set of tools in your request"* — but **not** by
   `name`/`description` changes. Our `constrainExtractionSchema` rewrites the schema **per call** with the
   live refs (`packages/server/src/entry/compose/rpg.ts:581,820,1061`), so every turn with a changed cast/
   tracker set is a fresh grammar compile if we ever move to an enforcing wire. `cacheStableExtractionRefs`
   (visible at `tests/contracts/rpg/extraction.contract.test.ts:313,331`) already exists to blunt this —
   that machinery should be treated as load-bearing, not incidental, before any strict flip.
3. **Streaming structured output.** O1 documents streaming with structured outputs and progressive field
   parsing; A1 does not address it. Our structured role is non-streaming batch (`runOrBatch`,
   `openrouter/index.ts:227-240`). Not a gap today — extraction is fire-and-parse — but it is the documented
   route if extraction latency ever becomes user-visible.
4. **`tool_choice` nuance we already get right, and one we don't.** A3 documents
   `{type:"auto", disable_parallel_tool_use:true}`. We force `{mode:"tool", name}`
   (`openrouter/index.ts:187`) which is stronger and correct for a single-call vehicle — but we do **not** set
   `disable_parallel_tool_use`, so a model may emit the forced tool more than once;
   `structuredReplyText` takes the **first** match (`openrouter/index.ts:176`) and silently drops the rest.
   That is a silent-fork risk of exactly the class D112 (3) bans. Low cost to close.
5. **Anthropic HIPAA/PHI caveat on compiled schemas** (A2): compiled tool schemas are cached separately and
   *"do not receive the same PHI protections as prompts and responses"* — do not put user data in property
   names, `enum`/`const` values, or `pattern`. `constrainExtractionSchema` injects **live actor names and
   tracker keys as enum values** (`compose/rpg.ts:581,1061`; the enum behavior is pinned across
   `tests/contracts/rpg/extraction.contract.test.ts:129-298`). That is user-authored content landing in a
   24h-cached compiled grammar on any enforcing wire. Not a defect for a self-hosted single-tenant app, but
   it is a documented data-handling boundary we currently cross without acknowledging it.
6. **OpenRouter's `require_parameters: true`** (R1) — provider-preference routing that restricts a request to
   endpoints advertising the parameters we sent. We don't use it anywhere
   (`grep supported_parameters` finds only catalog read paths). It is the vendor's own answer to "this model
   sometimes supports structured outputs", and it would be the mechanism behind REC-2b.

---

## Summary of RECs (none built)

| ID | Rec | Why |
|---|---|---|
| REC-1 | Wire-subset scrub in the projector: drop `minLength`/`maxLength`/`minimum`/`maximum`/`multipleOf`/`$schema` from the wire copy | 33 emitted keywords across the two rpg schemas are outside Anthropic's documented subset; 17 are outside OpenAI's too |
| REC-2 | Keep the blanket forced-tool vehicle; fix the schema instead of forking on capability | OR support is per-provider not per-model (R1); our `structured` capability bit is a hand-floored guess (`resolve-model-capability.ts:217-229`) |
| REC-2b | If a fork is mandated: OR `supported_parameters` + `require_parameters:true`, forced tool as fallback — never a family table | It is the vendor's own documented mechanism |
| REC-3 | Evaluate required+nullable-union (`anyOf` with `null`), `null` ≡ absent at parse, as a projection mode | The **only** documented route past Anthropic's undocumented optional wall, and it makes us OpenAI-strict-compatible without changing omit-means-keep |
| REC-4 | Set `disable_parallel_tool_use` on the forced structured call | A duplicate forced call is currently dropped silently at `openrouter/index.ts:176` |
| REC-5 | Correct three stale comments (below) | Docs-are-law; these three now assert things the code does not do |

### Stale comments named

- `packages/kit/src/json-schema/index.ts:7-11` — claims the `additionalProperties` pin is grammar-level
  prevention on *"an OpenRouter `strict` tool"*. `WireTool` has no `strict` field
  (`providers/contract/chat.ts:34-38`); no such tool exists in the tree. vLLM guided decoding
  (`vllm/surfaces/chat.ts:147-149`) is our only enforcing wire.
- `packages/contracts/src/rpg/extraction.ts:3` — *"passes as `output_config.format`"*. On OpenRouter it is a
  forced tool's `parameters` since 2026-08-02 (`openrouter/index.ts:145-168`).
- `packages/server/src/infra/providers/backends/openrouter/index.ts:150` — records the integer-bounds 400 as
  the keyword problem. It is one of four unsupported keyword classes we emit, and the smaller one;
  `minLength` x16 is banned by both vendors and was never reached by the probe.
