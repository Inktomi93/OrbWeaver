# Gemini tools and structured output

Native Google and actual OpenRouter Gemini Flash/Pro complete the ordinary registry tool loop and both structured payload vehicles. The app preserves OpenRouter's required opaque tool metadata independently of optional reasoning carry. Native and the measured default OpenRouter routes cannot provide the requested parallel-disable behavior.

Independent review and integration remain owned by the root session. This report does not claim a full launch verdict.

## Routes and adapters

| Route | Published model id | Actual adapter | Evidence |
| - | - | - | - |
| Native Flash | gemini-3.8-flash | @ai-sdk/google 4.0.87 | Live native Generate Content requests |
| Native Pro | gemini-3.1-pro-preview | @ai-sdk/google 4.0.87 | Live native Generate Content requests |
| OpenRouter Flash | google/gemini-3.8-flash | @openrouter/ai-sdk-provider 3.1.0 | OpenRouter HTTP requests; serving provider Google |
| OpenRouter Pro | google/gemini-3.1-pro-preview | @openrouter/ai-sdk-provider 3.1.0 | OpenRouter HTTP requests; serving provider Google |

Google's Custom compatibility endpoint is not OpenRouter and is not used as OpenRouter evidence here. The app imports `createOpenRouter` in `packages/inference/src/backends/openai-compat/model.ts`, not `@openrouter/sdk`.

The public [Flash endpoint catalog](https://openrouter.ai/api/v1/models/google/gemini-3.8-flash/endpoints) and [Pro endpoint catalog](https://openrouter.ai/api/v1/models/google/gemini-3.1-pro-preview/endpoints) each listed Google AI Studio and Google Vertex standard, flex and priority endpoints. None advertised `parallel_tool_calls`. All advertised tools and tool choice. The combined model catalog advertised tools, tool choice, response format and structured outputs for both model ids.

## Funded denominator

Main matrix run: `chat_turn_01m46jxqt0f249ymdvnbc3aa5k`. Exact observations are retained in [results.jsonl](results.jsonl).

The ordinary matrix made exactly 28 generation requests: four routes, seven requests per route. Every HTTP response was 200. It produced twenty functional acceptance cells and four parallel-control observations, not twenty-four unconditional capability passes.

| Case | Native Flash | Native Pro | OpenRouter Flash | OpenRouter Pro |
| - | - | - | - | - |
| Ordinary AUTO registry execution and continuation | Two calls, pass | Two calls, pass | Two calls, pass | Two calls, pass |
| Required tool choice | Two returned calls | Two returned calls | Two returned calls | Two returned calls |
| Named lookup_beta choice | Only requested name | Only requested name | Only requested name | Only requested name |
| Parallel disable | Unsupported warning; two calls | Unsupported warning; two calls | Sent false; two calls | Sent false; two calls |
| Response-format payload | Validated | Validated | Validated | Validated |
| Forced-tool payload | Validated | Validated | Validated | Validated |

The shared structured payload exercises a local definition reference, an optional field, a required nullable field and an integer bound. This is richer than a speaker-name enum. It does not prove every JSON Schema construct or every application payload.

The Pro diagnostic output budget was 16,384. No product default, tokenizer, history-fit or output-budget policy changed.

The authorized strict-routing extension made two additional requests, bringing the total to 30. Both returned HTTP 404 with `parallel_tool_calls: false`, `provider.require_parameters: true` and both original tool definitions on the sent body. Run: `chat_turn_01m46kx4d5exvrn35dmp9113dh`. The retained vendor error classification is unclassified; the report does not claim these refusals name only the parallel parameter.

The [tool-calling guide](https://openrouter.ai/docs/guides/features/tool-calling) describes false as sequential-only. The [provider-selection guide](https://openrouter.ai/docs/guides/routing/provider-selection) states that default routing permits unsupported parameters to be ignored, while `require_parameters: true` avoids unsupported providers. Endpoint metadata, the sent false field, two calls in one response and the strict-routing refusals explain the current default-route limitation. They do not establish a limitation across all OpenRouter models or future endpoints.

## Ordinary tool continuity

The live AUTO cases run the production chat pipeline, compose bridge, inference executor and tool-use registry. The real recurse loop creates `receivedToolExchangeMessages`; the probe does not fabricate function-response history.

Native responses carry the first call's thought signature on that original call. The second call remains unsigned. The continuation preserves exact call ids, order and signature placement without the SDK's signature-validator sentinel.

OpenRouter returns `reasoning.encrypted` details in `google-gemini-v1` format. Its SDK assigns the accumulated details to the first tool call. The app now preserves that exact assignment as host-only tool provenance. It does not copy it to every parallel call or coerce it into a Google signature string.

The same-request OpenRouter echo shows the next upstream native model frame contains the original function ids and the first function-call signature. The following user frame contains the ordered function responses. Both models returned the expected registry values.

A deterministic fixture also places the opaque detail after the SDK emits the tool call. The stream reducer retains the SDK-assigned metadata reference until drain completion, then validates and copies the final JSON into the canonical call. This prevents late signature loss. Native immediate signatures remain unchanged.

Both initial and continuation tool declarations have the same names in the real-SDK fixture. The original live rows retain the `tools` body key on both legs, but their old summary did not retain declaration names or counts. Do not present that older summary as a raw full-definition comparison.

Host-only metadata survives canonical parse, selected snapshot replay, continuation undo/revert snapshots and native chat-bundle serialization. Actual committed/member projections contain neither the opaque bytes nor a metadata field. Public ToolCallRecord remains unchanged.

## Structured modes and limits

| Topic | Mapped or proven behavior | Limit of the evidence |
| - | - | - |
| Native JSON schema | SDK sends responseMimeType and responseJsonSchema; live mixed shape validates | Plain JSON-only is SDK-mapped, not a separate app option |
| OpenRouter response format | SDK sends response_format.json_schema; upstream echo sends native responseJsonSchema | Gateway strictness is not a universal schema guarantee |
| Forced-tool vehicle | Shared planner selects named tool; native SDK sends ANY with allowedFunctionNames | ANY forces a function call, not prose co-emission |
| AUTO / required / named / none | Native SDK maps AUTO / ANY / ANY+allowlist / NONE; AUTO, required and named live-proven | NONE is documented and SDK-mapped, not funded separately |
| Native strict tool input | SDK maps explicit strict AUTO tools to VALIDATED | VALIDATED is group-level schema adherence, not OpenAI's per-tool strict field |
| OpenRouter strict tool flag | Installed adapter omits V4 tool.strict; builtin features now declare strictJson never and the planner reports the downgrade | Response-format strict remains independent and true in the real-adapter fixture |
| Optional and nullable | Native keeps authored distinction; OpenRouter's strict-compatible projection records nullable reshapes and removes only its introduced nulls | Optional-and-nullable collision is refused under the reshaping mode |
| Bounds | Native keeps inclusive number and array bounds; unsupported string/object bounds become instruction notes | Local validators still enforce the authored schema |
| oneOf | Google accepts syntax but treats it as anyOf; planner refuses the semantic weakening | No claim that oneOf syntax itself is unsupported |
| Unsupported semantics | not, conditionals, dependencies, property-name/pattern maps, uniqueness, contains and unevaluated constraints refuse as typed violations | Ordinary non-strict caller tools remain prompt material under existing planner policy |
| Reference siblings | Native payload refuses non-$ siblings beside $ref | $-prefixed annotations are allowed |
| Recursive references | Required recursive pointer edges refuse; optional edges remain available, including required root admission of an optionally recursive definition | Anchor-based cycles are not judged by the existing reference graph |
| Numeric schema complexity ceilings | None documented for Gemini in the examined primary docs; capability ceilings remain absent | Large/deep schema rejection remains vendor-determined; do not borrow Anthropic numbers |

Primary native documentation: [Generate Content function calling](https://ai.google.dev/gemini-api/docs/generate-content/function-calling), [thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures), [structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), and the [Generate Content API reference](https://ai.google.dev/api/generate-content). These are Generate Content contracts, not the Interactions API.

The API reference lists responseJsonSchema's supported properties and required-recursion restrictions. The installed Google SDK forwards function `parametersJsonSchema` verbatim and sanitizes response-schema const into a single-value enum. The report does not equate the legacy OpenAPI parameters field with those JSON Schema carriers.

SDK AST evidence: native source scan covered 66 TypeScript files and located the live `prepareTools` call. The installed OpenRouter JavaScript scan located tool-call enqueue sites at 4863, 4918 and 4982. Literal reads confirmed the mutable accumulated reasoning-details assignment and the strict-function mapper. Exact installed versions are in their package manifests.

## Consumer coverage

The identity-resolved `pnpm ast callers runStructuredTurn --in packages/server/src --json` scan covered 1,500 server TypeScript files and returned ten complete call sites. Literal search confirmed the role-client structured requests and separate RPG planner entry.

| Consumer | Production path | Coverage here |
| - | - | - |
| Ordinary chat tools | chat/engine/pipeline.ts → entry/compose/chat.ts → executor | Live four-route registry loop and deterministic persisted replay |
| Smart arbiter | chat/engine/smart-arbitrate.ts:212; entry/compose/chat.ts:782 | Shared structured role/validation mapped; prior Smart evidence remains separate |
| RPG | entry/compose/rpg.ts:533, 1388, 1475 | Shared planner, structured chat and forced round mapped; H's terminal/recovery evidence is not registry proof |
| Refinery | entry/compose/refinery.ts:86; refinery verbs and schema-forge | Fit and generation share the planner; schema refusals covered by focused planner fixtures |
| Discovery | discovery/verbs/analyze.ts:77,135 and distill.ts:296 | Shared structured role and bounded validation retry mapped |
| Image captions | embeddings/indexer/caption.ts:120,127 | Structured role and image-breakdown validation mapped; not another image-generation acceptance |
| Automation analysis | automation/engine/analysis-arm.ts:478 | Shared structured validation mapped |
| Memory digests | chat/memory/generate/digests.ts:92; generate/substrate/parse.ts | Prose summarize with a three-part parser, not a JSON-schema structured consumer |

No claim that every consumer ran a new paid acceptance suite. The runtime/planner contract is shared; consumer-specific source mappings and prior evidence retain their own limits.

## Verification

- Native parallel-control regression: new test red on old source, then green.
- OpenRouter opaque metadata: real pipeline fixture red on missing replay, then green.
- Late SDK detail: first fixture green and late fixture red, then both green after final drain normalization.
- Gemini semantic schema and required-recursion fixtures: five new failures against old source, then green with positive controls.
- Measured OpenRouter parallel-control row: red before the row, then green.
- OpenRouter strict tool declaration: resolved builtin row fixture red before the feature, then green with a real adapter body and strict response-format positive control.
- Focused node suite command passed 113 tests across seven files. Artifact: reports/runs/test/orbweaver-launch-gemini-capabilities-733377-2026-10-05T18-06-08-620Z/test-report.json.
- The final strict-tool correction passed the two affected suites, 18 tests. Artifact: reports/runs/test/orbweaver-launch-gemini-capabilities-773832-2026-10-05T18-18-56-260Z/test-report.json. Unchanged focused suites reuse the preceding completed results.
- Independent R1 found an inline-pointer required-cycle bypass. The exact reviewer case failed before correction on the scrubber and planner; the existing graph now separates schema-pointer identity from diagnostic value paths and definition scope. Both payload carriers refuse the required inline cycle. Optional, acyclic, escaped-name and sibling-prefix controls pass alongside the retained recursion corpus: 56 tests across the two affected suites. Artifact: reports/runs/test/orbweaver-launch-gemini-capabilities-1035674-2026-10-05T19-38-21-306Z/test-report.json. No hosted requests were repeated; independent R2 confirmed the correction with no remaining required P0–P2 finding.
- Scoped compiler programs passed: tsconfig.json, packages/contracts/tsconfig.json, packages/inference/tsconfig.json and packages/server/tsconfig.json.
- Scoped ESLint passed the changed TypeScript paths under their four compiler owners.
- Scripted full matrix passed before the funded matrix and again on the final source. The final source emits unsupported-control warnings and omits ineffective parallel fields. Strict-routing scripted emission control passed before its two requests.

Independent source review is clear after R2. Shared/full verification and release judgment remain root-owned; the final implementation commit uses normal hooks. No push, production restart, owner engine operation or key-management action occurred.

## Remaining limits

- The strict-routing 404 error wording was not retained. It is not a parallel-only refusal proof.
- The original OpenRouter echo reader did not decode the forwarded toolConfig spelling; forwarded choice modes remain unverified in the retained summary.
- The original live ordinary summaries did not retain exact tool declaration counts/names, though both legs contain tools and the real-SDK fixture proves the declarations remain unchanged.
- Anchor-cycle schema preflight is not implemented. External reference support and schema-size ceilings remain unknown rather than invented.
- Simultaneous ordinary tools plus response-format schemas were not part of the funded matrix.
- Native VALIDATED is group-level function schema adherence, not OpenAI per-function strict semantics. The OpenRouter adapter's explicit strict tool flag is now downgraded loudly; no OpenRouter strict-input acceptance is claimed.
