# Stickler review — bridge extraction (4c734060) · captureWire threading (uncommitted) · harness-matrix proposal · customParameters precedence + OR removal blueprint

Date: 2026-07-24 · Branch: retro-burn-down · Reviewer: stickler (fresh context)

Scope reviewed: commit `4c734060` (extract `createRunChatTurnBridge`), the uncommitted 6-file diff
threading `captureWire` into openrouter (cc + responses + backend deps) and custom-byo, the proposed
all-surface fidelity matrix, and the customParameters precedence question (owner-ruled mid-review:
ratify both; then REMOVE customParameters from openrouter entirely — blueprint below).

---

## FINDINGS (confirmed only, ranked)

### F1 — HIGH (honesty of the new OR capture + load-bearing for the proposal): the openrouter `captureWire` records the SDK INPUT, not the wire body; the OpenRouter SDK strips unknown keys and renames fields AFTER the capture point

- Where: `packages/server/src/infra/providers/backends/openrouter/runners/chat/chat-completions.ts:240` and `responses.ts:426` (the new capture sites), vs the SDK's serialization.
- Defect: the captured `body` is the object handed to `client.chat.send` / `beta.responses.send`. The
  SDK then runs it through `ChatRequest$outboundSchema` / `ResponsesRequest$outboundSchema` — plain
  `z.object({...})` (NO `.passthrough()`/`.catchall` — verified by grep over both model files) —
  which (a) STRIPS every unknown key, (b) REMAPS camelCase→snake_case (`maxCompletionTokens` →
  `max_completion_tokens`, etc.), and (c) can FAIL validation (`safeParse` → "Input validation
  failed", no HTTP send at all). Only then does `encodeJSON` produce the actual POSTed bytes.
- Evidence (this session):
  - `node_modules/.pnpm/@openrouter+sdk@0.13.19/.../esm/funcs/chatSend.js:19-26` — `safeParse(request, SendChatCompletionRequestRequest$outboundSchema.parse) → encodeJSON("body", payload.ChatRequest)`.
  - `esm/models/chatrequest.js` — full `ChatRequest$outboundSchema` read: closed `z.object` + `remap$` transform; `esm/models/responsesrequest.js` — same shape; `grep passthrough|catchall|looseObject` over both → zero hits.
  - `esm/models/operations/sendchatcompletionrequest.js:16` — the wrapper nests `models.ChatRequest$outboundSchema`.
- Concrete failure scenario: a preset `customParameters: { top_a: 0.5 }` (wire spelling — the natural
  ST-style spelling) merges into the runner body, is captured, and is then silently DROPPED by the SDK —
  the real wire never carries it. The captured body says it did. The existing unit test
  `tests/server/infra/providers/backends/openrouter/runners/chat/chat-completions.test.ts:141-156`
  pins exactly this illusion (asserts `top_a` present on the captured SDK request object).
- Consequences:
  1. The wire-capture doc claims are now wrong for the OR backend: `foundation/observability/debug/wire-capture.ts` header ("the stateless openai-compat path posts a literal `/v1/chat/completions` JSON body") and the `WireCaptureSink` TSDoc in `infra/providers/contract/backend.ts` ("openai-compat JSON body"). True for vllm/custom-byo (raw fetch); false for openrouter (SDK-mediated, camelCase, post-capture strip). Under Documentation-Law ("a wrong doc is worse than no doc"; drift-is-a-defect) the one-line doc correction belongs IN this uncommitted change, since this change is what extends capture to the SDK-mediated backend.
  2. For the harness proposal: an OR-row assertion on the captured body is an assertion about the SDK-INPUT vocabulary, not the wire. ABSENCE pins are sound (a key absent from the SDK input cannot appear on the wire); PRESENCE pins prove only our projection into SDK vocabulary. Label them as such — or add the recommended schema-pin test (see proposal verdict).
  3. For the owner's removal ruling: good news — non-modeled customParameters keys were ALREADY dead on openrouter. The "additive passthrough" only ever worked for keys spelled exactly as SDK camelCase fields.
- Remediation (safe): fix the two doc sites in the same commit; in the proposal, either assert
  absence-only on OR captures or run the captured body through the SDK's own outbound schema in the
  test to obtain the true wire shape (also serves as an SDK-bump tripwire).

### F2 — MEDIUM: every stateless capture has `chatId: undefined` on the live path — the debug endpoint's documented `chatId` filter can never match vllm/openrouter/custom-byo captures

- Where: `packages/server/src/entry/compose/chat.ts:295-314` (the bridge's stateless arm builds the
  `ChatRequest` WITHOUT `chatId`; only the agent-sdk seeded spread at line 291 sets it) vs
  `foundation/observability/debug/wire-capture.ts` ("keyed by chatId … the harness's correlation
  key") and `debug/routes.ts:211-220` (the `?chatId=` filter).
- Evidence: `chatId` is optional on `ChatRequestCommon` (`infra/providers/contract/chat.ts:76`);
  exhaustive sweep (grep + `pnpm ast callers runChatTurn`) shows the bridge is the ONLY prod builder
  of `ChatRequest` (pipeline.ts:474 and quiet-generate.ts:68 both consume the injected bridge), and it
  never sets `chatId` on the stateless arm. All four stateless capture sites forward `req.chatId`
  (=undefined).
- Concrete failure: WIRE_CAPTURE=on, live vllm/OR/BYO turn → `GET /api/_debug/wire/captures?chatId=<id>`
  returns `[]` for that chat forever. The harness is unaffected (it injects the sink directly), which is
  why this never bit.
- Pre-existing for vllm; the uncommitted diff extends the pattern to two more backends and the
  proposal leans on captures — flagging now. Remedy is one line in the bridge (`chatId: req.chatId`
  on the stateless arm; `TurnRequest.chatId` is always present there). NOT part of the uncommitted
  diff's own files — route as a small follow-up, ideally alongside the removal wave.

### F3 — MEDIUM (pre-existing; lying comments = defects; intersects the removal): user `providerRouting` NEVER reaches the OpenRouter wire — the promised threading hop does not exist

- Where/claims: `domain/connection/verbs/resolve-chat.ts:9-11` says providerRouting "is NOT part of the
  resolved 4-tuple … **the chat domain threads it into the providers request separately**". It does not:
  - `OpenRouterChatRequest.providerRouting` (`contract/chat.ts:105,114`) has ZERO prod writers —
    exhaustive `/usr/bin/grep -rn providerRouting packages/server/src` → only the contract fields, the
    two runner READ sites (`chat-completions.ts:144-145`, `responses.ts:175-176`), the metadata parse,
    compose:788, and the resolve-chat comment.
  - `TurnRequest` carries no providerRouting; `ResolvedConnection` = `{api, model, credential, capability}` only.
  - Even SELECTION drops it: `createResolveChat` maps only `{api, source, model}` out of
    `routableChat`; `RouteChatAssignment.providerRouting` is consumed by nobody.
  - No client/transport file references `providerRouting` (grep) — the thread is dormant end-to-end
    (nothing writes `chats.metadata.providerRouting` either), so no user is being silently ignored today.
- Ripple: the `shared.ts:291-295` comment ("Both were modelled on the contract … a user's quantization
  filter + price ceiling never reached OpenRouter" — implying the projection now fixes it) is
  misleading: the projection functions work but their input never arrives; `resolveFallbackModels`
  never sees a user `models[]` chain. Model-default pins (e.g. the Anthropic `order` pin inside
  `effectiveProviderRouting`) are the only provider prefs that reach the wire.
- Intersection with the cp removal: the ONLY currently-functioning route for user provider prefs on OR
  is `customParameters.provider` (SDK-modeled key, survives the strip; works only on non-Anthropic
  models since the owned `provider` wins on collision) — exactly the route the pipeline PD-148 test
  fixture uses (`tests/server/domain/chat/engine/pipeline.test.ts:699`,
  `{ provider: { order: ["deepinfra"] } }`). Removal closes it. If first-class provider routing is
  wanted, the missing hop must be BUILT (metadata → TurnRequest → bridge → ChatRequest); if not,
  delete the dead contract fields + fix the two lying comments. Either way the comments are defects now.

### F4 — LOW (security note, reported defensively): the custom-byo capture can retain body-borne credentials in the debug ring

- Where: `backends/custom-byo/runners/chat.ts:359` — captures `buildBody(...)` output, which includes
  the user's `includeBody` blob (`applyIncludeExclude`, `backends/kit/openai-compat/body.ts:215-232`).
- Risk: custom-byo's built-in auth rides headers (never captured), but `includeBody` exists precisely
  for endpoints with nonstandard request shapes — including key-in-body auth. Such a secret lands in
  the wire-capture ring and is readable at `/api/_debug/wire/captures` by any debug-gate passer
  (admin cookie ∪ DEBUG_TOKEN) while capture is on. Per D17 an admin is NOT the credential's owner —
  the ring is cross-user, unlike the inspector (`inspect.ts`), which is reached through the owner's own
  credential flow and scrubs headers + response by known secret VALUE (`redactSecretsFromText`).
- Mitigating facts (why LOW): WIRE_CAPTURE is default-off, dev/test-only, never persisted, ring-bounded;
  the ring already holds all users' full prompt content (pre-existing vllm/agent-sdk captures), so the
  audience/trust posture is unchanged — the marginal delta is the credential CLASS, not the audience.
- Safe remediation options: scrub the captured custom-byo body by known secret literals before
  recording (the `secretHeaderValues`/`redactSecretsFromText` seam already exists), or add one header
  line to `wire-capture.ts` documenting the accepted risk. If WIRE_CAPTURE is ever expected on in a
  multi-user deployment, route a `security-executor` pass first.

### Notes that are NOT defects (checked, deliberate or acceptable)

- `backend: "custom-openai"` is the correct BackendKey — `BACKEND_KEYS` (`contract/backend.ts:34`)
  spells the runner key with a hyphen; `custom_openai` (underscore) is the credential source. Deliberate
  distinct spellings, documented at the tuple.
- Capture placement vs retries is CORRECT and covers the retry-without-reasoning path: on OR the
  capture sits inside the `runWithPreCommitRetry` closure, so every attempt (transient retry AND the
  `run(false)` strip-and-replay) captures the body actually built for that attempt. Custom-byo builds
  its body once outside the retry and reuses it — one capture per turn is equally honest. Readers get
  newest-first from the ring. (Consequence for the harness: an OR row may see >1 capture per turn; read
  the newest.)
- Env-gating + host-only read are unchanged by the diff: the sink exists only when
  `deps.wireCapture === true || isWireCaptureEnabled()` (`entry/compose/services.ts:279-284`); with it
  off, backends receive no sink and the ring is never written. The debug read stays behind the
  admin-cookie/DEBUG_TOKEN gate (`debug/routes.ts:151-179`). Zero-cost-off preserved.
- Summarize sends are NOT captured (OR `runSummarize` posts via `client.chat.send` with no capture,
  `openrouter/index.ts:120-149`; the vllm summarize surface maps onto `engine/chat-completion`, not
  `createVllmChat`). Consistent with the feature's chat-TURN fidelity scope; named here so the scope
  call is a decision, not an accident.
- OR embed/rerank/image runners also POST bodies without capture — non-chat roles, same scope call.
- `body as Record<string, unknown>` casts compile (full `pnpm check` PASS this session).
- The bridge's `orSkinTierModels !== undefined` guard can't fall through to the stateless arm in
  practice — `getOrSkinTierModels` returns `Promise<OrSkinTierModels>` (non-optional); the guard is
  tsc narrowing only.
- PD-148's documented residual (`as "chat-completions"|"responses"` unsound for `anthropic-messages`)
  is still present at compose/chat.ts:296 — pre-tracked in the debt registry, not a new finding.

---

## (a) VERDICT — committed bridge extraction `4c734060`: APPROVED (behavior-preserving, doctrine-clean)

Byte-comparison of the two sides of the commit diff (both fully read). The actual deltas beyond the
advertised "two `input.` → `deps.` swaps":

1. `input.connection.getOrSkinTierModels()` → `deps.getOrSkinTierModels()`, wired as
   `() => input.connection.getOrSkinTierModels()` — thunk preserves the `this` binding on the
   connection service; call still happens inside the generator per invocation. Equivalent.
2. `void input.runChatTurn(chatReq)` → `void deps.runChatTurn(chatReq)`. Equivalent.
3. `onDelta` gained an explicit `: void` return annotation — type-only.
4. The agent-split spread ternary collapsed to one line — whitespace only.
5. Object-literal async generator method → returned named `async function*` — same semantics.
6. Comment moves/rewording at the call site; biome-ignore comments carried correctly (each immediately
   above its line).

Doctrine: the bridge stayed in its one home (`entry/compose/chat.ts`), exported through the compose
front door (`entry/compose/index.ts` — D2 bucket + D15 front-door discipline respected). Single-home
holds: `pnpm ast callers createRunChatTurnBridge` → exactly compose (prod) + the harness (test);
`pnpm ast callers runChatTurn` shows both domain call sites (`engine/pipeline.ts:474`,
`verbs/quiet-generate.ts:68`) consume the ONE injected bridge; a sweep for any other
`api: "chat-completions"` / `api: "responses"` request builder in prod src → none (the harness's old
facsimile is deleted). The harness genuinely drives prod code now, with fakes only at the two leaves
(canned-SSE `VllmEngineClient`, rejecting `getOrSkinTierModels` that is provably unreached on the
cc path). Re-verified green this session: harness 5/5, compose unit 8/8 + int 2/2, full `pnpm check`
PASS (all 12 stages, full output read).

## (b) VERDICT — uncommitted captureWire threading: APPROVED to commit AFTER the F1 doc-line fix; F2/F4 flagged as follow-ups

- Sink placement: correct at all four new sites — fires on the exact body built for the attempt,
  immediately before the send, including the mandatory-reasoning strip-and-replay and pre-commit
  transient retries (see the notes section). Custom-byo captures the post-include/exclude body — the
  real wire bytes (raw fetch).
- `backend` keys correct (`"openrouter"`, `"custom-openai"`); `api` axis forwarded faithfully.
- Threading shape follows the house exactOptionalPropertyTypes spread idiom at every hop
  (`providers/index.ts` openRouterDeps + custom-byo construction, `openrouter/index.ts` chatDeps,
  `shared.ts`/`runners/chat.ts` deps interfaces). `BackendRegistryDeps.captureWire` pre-existed; no
  compose change needed — gating semantics untouched.
- No new suppressions, no schema changes, no token edits, no formatting churn, no `u`-flag additions.
  `pnpm check` PASS; provider runner suites 94/94; observability suites green.
- Required in the SAME change (Documentation-Law drift rule): correct the two capture-vocabulary doc
  claims F1 invalidates (`wire-capture.ts` header; `WireCaptureSink` TSDoc) to state that the
  openrouter capture is the SDK request input (camelCase, pre-validation), the same "what WE hand the
  SDK" posture the agent-sdk capture already documents.
- KISS-suspension check: threading a per-backend optional sink through each sealed backend's own deps
  (instead of a module global) is the mandated shape (sealed-strategy isolation, Tier-3b) — not
  over-engineering. No tier-collapse, no sideways imports; foundation stays import-free of infra
  (the sink is injected downward, `backend` travels as a plain string).

## (c) VERDICT — proposal shape: RIGHT SHAPE, keep it; four adjustments

The core design is correct and doctrine-fit: ONE full 4-layer round-trip on vllm (the middle layers —
assembly/SHAPE/bridge — are backend-agnostic; re-seeding a DB per backend would test the same code
five times), plus focused WIRE-mapping rows per surface driven through the REAL
`createRunChatTurnBridge` + the REAL backend body-builders, reading the injected sink. That is
exactly the asserts-the-real posture the gate battery can't provide. Adjustments:

1. **OR rows: assert with F1 in mind.** With the owner's removal ruling, the OR cc/responses rows'
   primary job becomes the ABSENCE pin (`customParameters` never on the request — sound on the SDK
   input) plus presence pins for the modeled fields (responseFormat → `responseFormat`/`text.format`,
   tools/toolChoice) in SDK vocabulary. Recommended addition: one test that feeds a captured body
   through the SDK's own `ChatRequest$outboundSchema`/`ResponsesRequest$outboundSchema` (importable
   from `@openrouter/sdk/models`) and asserts the parse SUCCEEDS and unknown keys are stripped — this
   pins the de-facto allowlist boundary in-repo and becomes the SDK-bump tripwire.
2. **custom-byo row: there is no injectable client.** The runner calls global `fetch`
   (`runners/chat.ts:299`) — the "throwing/minimal client" trick doesn't apply. Use the existing
   custom-byo test precedent (stubbed global fetch returning a canned SSE/JSON body,
   `tests/.../custom-byo/runners/chat.test.ts`). If a throwing double is used anywhere, make it throw
   a non-retryable `ProviderError({kind:"invalid"})` so `runWithPreCommitRetry` doesn't spin backoff
   into the test.
3. **agent-sdk row is feasible hermetically** — `AgentSdkDeps.query` is an injected seam
   (`backends/agent-sdk/types.ts:23`), so the row can drive the REAL runner with a fake `query` (no
   subprocess) and read the capture (`runner.ts:129-153`, fires before the query). Capture = SDK query
   input by design (documented). Keep the row.
4. **Fold the removal's test flips into the matrix wave** (list in (d) below) so the rows and the
   flipped pins land together; expect >1 capture per OR turn when a retry/replay fires (read newest).

No simpler-correct alternative found: asserting runner `buildBody` outputs directly (unit style)
already exists and is what missed the facsimile problem; the matrix through the real bridge + real
builders + the sink is the minimal shape that closes it. Do NOT expand to per-backend DB round-trips.

## (d) ADJUDICATION + REMOVAL BLUEPRINT — customParameters

**Adjudication (owner-ruled during review; my structural evidence concurs):**

- The two precedence regimes are exactly two, proven exhaustively (ast-grep + grep over packages+tests;
  `sg` on this box is shadow-utils — sweeps used the real `ast-grep` binary and `pnpm ast`):
  - openrouter (both wires): `mergeCustomParameters(owned, cp)` → `deepMergeRequestBody(cp, owned)` —
    patch=owned ⇒ **owned wins**; non-colliding cp keys merge additively (then F1's SDK strip applies).
    Sites: `chat-completions.ts:161`, `responses.ts:199`. No other OR site consumes `req.customParameters`.
  - custom-byo: `deepMergeRequestBody(base, cp)` — patch=cp ⇒ **cp wins**, then PD-13
    `includeBody`/`excludeBody` apply LAST (`runners/chat.ts:232-244`). Ratified: BYOK is
    configure-at-your-own-risk; the endpoint's final word bounds it.
  - vllm ignores customParameters entirely (buildBody never spreads it) — consistent with the ruling.
    agent-sdk arm carries none by charter (contract comment, compose bridge comment).
- The "firewall only guards collisions" concern is real at the merge but moot at the wire: the SDK
  schema (F1) already strips every non-modeled key. The additive passthrough on OR only ever worked
  for keys spelled as SDK camelCase fields — and those bypass the resolve-chat capability funnel
  (clamps/warnings/XOR guards), which is the strongest architectural argument FOR the removal: cp on
  OR was an unaudited side door around the D41/D68 knob discipline.

**Removal blueprint (openrouter drops customParameters; custom-byo untouched):**

1. Sites to change — exactly two: delete the `mergeCustomParameters` call at
   `chat-completions.ts:161` and `responses.ts:199` (each `buildChatBody`/`buildResponsesBody` returns
   `owned` directly). The removal MUST live inside the sealed OR backend, not the bridge/contract: the
   chat-completions arm is shared by custom-byo (and vllm), the domain/bridge cannot know which
   backend `deriveRunner` picks, and Tier-3b seals backend quirks inside the backend.
2. Delete `mergeCustomParameters` outright — sole consumers are the two OR runners + the barrel
   re-export (`openrouter/index.ts:74`) + its unit tests. `deepMergeRequestBody` STAYS (custom-byo's
   Layer-2 pollution defense + kit tests).
3. Nothing legitimate breaks on OR:
   - Every real sampling knob is first-class via the modeled surface: `chatSamplingFields`
     (`shared.ts:163-178` — temperature/topP/topK/frequency/presence/repetitionPenalty/minP/topA/
     seed/logitBias/stop/maxCompletionTokens, per D68) and the responses projection
     (`responses.ts:189-192`; the narrower set is that wire's deliberate surface).
   - provider/models/plugins/tools/toolChoice/responseFormat/reasoning are all owned first-class fields.
   - The only lost capability = setting SDK-modeled NON-sampling fields via camelCase cp (`user`,
     `metadata`, `serviceTier`, `logprobs`, `topLogprobs`, `modalities`, `imageConfig`, `debug`,
     `streamOptions`, `sessionId`, `maxTokens`) + the accidental `cp.provider` routing route — all
     exactly the "unofficial bolt-on" class the ruling kills. Non-modeled keys (mirostat/DRY/XTC…)
     never reached the OR wire at all (F1) — the ST-gap-register rows (46/51/53) were only ever true
     of custom-byo.
   - CAVEAT (F3): with `cp.provider` gone, NO route for user provider routing exists on OR until the
     missing metadata→TurnRequest→bridge→ChatRequest hop is built (or the dead fields are deleted).
     Decide this in the same wave.
4. Visibility (recommended, D41 discipline / no-silent-degrade): when `req.customParameters !==
   undefined` on an OR request, emit a `custom_parameters_dropped` warning (new member of the infra
   `WARNING_CODES` tuple WITH its emit site in both runners — the tuple-is-the-truth rule). Gives the
   harness OR row a positive fingerprint and the user a loud signal when a BYO-style preset is pointed
   at OR.
5. Tests to flip/delete (they encode the now-unwanted behavior):
   - `tests/.../openrouter/runners/chat/chat-completions.test.ts:141-156` — currently pins the
     firewall AND the `top_a` additive passthrough (an F1 illusion). Flip to: cp keys (colliding and
     non-colliding) are BOTH absent from the SDK request.
   - `tests/.../openrouter/runners/chat/shared.test.ts:218-247` — four `mergeCustomParameters` tests
     die with the function.
   - `tests/.../openrouter/runners/chat/responses.test.ts` — no cp assertions exist (verified); add
     the absence pin.
   - KEEP: `tests/.../custom-byo/runners/chat.test.ts:88-143` (cp-wins + poison-scrub) and
     `tests/server/kit/custom-parameters.test.ts` (Layer-2). KEEP the domain fold tests
     `tests/server/domain/chat/engine/pipeline.test.ts:653-715` (the fold is backend-agnostic and
     still feeds custom-byo) but change the `:699` fixture away from `provider:{order:[…]}` — it
     demonstrates a route that is dying (F3).
6. Docs/ledger touchpoints: PD-148's DONE text ("customParameters … rides TurnRequest → compose →
   ChatRequest", registry line 129) and the compose bridge comment (compose/chat.ts:306-307 — "the
   preset's provider-passthrough blob rides the chat-completions/responses arm") remain TRUE (the blob
   still rides the arm; OR now ignores it) but both should gain "custom-byo is the sole consumer";
   `Core-ST-Feature-Gap-Register.md:46/51/53` read correctly once the new D-entry exists. The owner
   ruling supersedes PD-148's implicit OR reach — mint the D-entry.
7. Suggested D-entry text (owner to ratify):
   > **D<n> — customParameters is the BYO escape hatch, never a first-class-provider side door.** The
   > modeled knob surface (`UserIntent` → `resolve-chat` → each backend's owned projection) is the ONLY
   > route onto a first-class provider's wire (openrouter, vllm, agent-sdk) — one knob surface, each
   > backend projects it (the anti-ST-sprawl design; every real sampling knob is first-class per D68).
   > The openrouter runners build their bodies from owned fields exclusively and DROP
   > `req.customParameters` with a `custom_parameters_dropped` warning (D41 discipline — never a
   > silent degrade). `custom-byo` is the sanctioned passthrough home: the endpoint is user-declared,
   > so `customParameters` WINS over the base body, bounded only by the endpoint's PD-13
   > `includeBody`/`excludeBody` final word — configure-at-your-own-risk is the feature. Belt: the
   > OpenRouter SDK's closed outbound schemas already strip non-modeled keys (pinned by the
   > schema-boundary test); the runner-side drop makes the intent structural rather than
   > vendor-artifact. (Supersedes PD-148's implicit openrouter reach; the ST-gap-register
   > "exotic samplers ride customParameters" rows resolve to custom-byo only.)

---

## Verification log (everything checked this session)

- Doctrine read IN FULL: `.claude/agent-doctrine.md`, `docs/architecture/core/AGENTS.md`,
  `Core-Laws-and-Precedents.md`, `Core-Path-Registry.md` (D1–D78, both pages),
  `Documentation-Law.md`, `docs/Mission.md`, `Tier-3b-Providers.md`. Debt rows PD-148 (registry) and
  PD-13 (cleared ledger) read.
- Files read IN FULL: `entry/compose/chat.ts` (current), commit `4c734060` full diff (all 4 files),
  the uncommitted diff (all 6 files) + full current text of `custom-byo/runners/chat.ts`,
  `openrouter/runners/chat/chat-completions.ts`, `responses.ts`, `shared.ts`, `openrouter/index.ts`,
  `vllm/surfaces/chat.ts`, `providers/contract/backend.ts`, `providers/contract/chat.ts`,
  `foundation/observability/debug/wire-capture.ts`, `debug/routes.ts`,
  `kit/custom-parameters/index.ts`, `backends/kit/openai-compat/body.ts`, `custom-byo/inspect.ts`,
  `tests/server/domain/chat/wire-capture-fidelity.suite.int.test.ts`. Regions read: `services.ts:170-300`
  (capture wiring), `agent-sdk/runner.ts:120-155` (capture site), `agent-sdk/types.ts:1-60`,
  `contracts/connection` ResolvedConnection/RouteChatAssignment region, `resolve-chat.ts:1-40`,
  `chat-completions.test.ts:130-190`.
- SDK ground truth: `@openrouter/sdk@0.13.19` — `funcs/chatSend.js` (full send path),
  `models/chatrequest.js` outbound schema (full), `models/responsesrequest.js` (head + greps),
  `operations/sendchatcompletionrequest.js` wrapper; `grep passthrough|catchall|looseObject` → none.
- Structural sweeps (exhaustive, not sampled): `ast-grep run -p 'deepMergeRequestBody($A, $B)'` and
  `'mergeCustomParameters($A, $B)'` over `packages/server/src` + `tests` (arg order confirmed at every
  site); `/usr/bin/grep -rn customParameters` over providers infra, tests, and `docs/architecture/core`;
  `captureWire?.(` sweep → exactly 5 sites (vllm chat, OR cc, OR responses, custom-byo, agent-sdk);
  `providerRouting` sweep over all of `packages/server/src`, client, contracts, transport;
  `pnpm ast callers createRunChatTurnBridge` (2 sites) and `callers runChatTurn` (bridge is the sole
  prod ChatRequest builder; pipeline + quiet-generate consume the injected op); `api: "chat-completions"`
  literal-builder sweep → no second mapping site. Note: bare `sg` on this box is shadow-utils, NOT
  ast-grep — used `ast-grep` + `pnpm ast` (and `/usr/bin/grep -a` in pipelines) throughout.
- Gates/tests run this session (full outputs read):
  - `pnpm check` → **PASS**, all 12 stages (biome/eslint/types×5/execution-membership/structure/
    depcruise/knip/docs) — output file 2KB, read whole.
  - openrouter + custom-byo runner suites: 6 files, **94/94 pass**.
  - fidelity harness: **5/5 pass**.
  - compose + observability suites: 21 files, **128/128 pass**; `compose/chat.int.test.ts`
    (integration-serial) **2/2 pass**.
- Gate blind-spot checks: no DB schema change, no token edits, no biome-ignore additions, no
  mass-format churn, no new `u` regex flags in the diffs; `WireCaptureSink` home (infra contract) and
  the foundation ring keep the one-direction flow (foundation imports nothing up).

## Regions NOT read (silence does not cover these)

- `agent-sdk/runner.ts` beyond 120-155; `agent-sdk/env.ts`/session internals.
- OR embed/rerank/image runners; `vllm/surfaces/summarize.ts` beyond its header; `engine/chat-completion.ts`.
- `domain/chat/engine/pipeline.ts` in full (consulted via sweeps + the PD-148 test only);
  `resolve-chat.ts` (the infra funnel) in full.
- `tests/.../custom-byo/runners/chat.test.ts` and OR runner tests in full (read assertion regions +
  grep-swept for cp claims).
- The client preset editor's customParameters surface (`tests/client/.../preset-editor-model.test.ts`
  flagged in the sweep, not read) — removal may warrant a UI hint ("openrouter ignores these"), route
  to side-eye if the pane changes.

## Unconfirmed suspicions (low priority, not findings)

- A cp key colliding with an SDK-modeled field at the WRONG TYPE (e.g. `reasoning: "none"` when owned
  omitted reasoning) would fail the SDK's `safeParse` and kill the turn pre-send with "Input validation
  failed" — inferred from the send path, not reproduced; moot after removal.
- Whether any real preset in the wild carries camelCase-SDK-spelled cp keys (data question; if yes,
  the removal changes those users' wires — the warning in blueprint step 4 covers it).
