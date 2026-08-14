---
kind: review
status: active
updated: 2026-08-14
---

# Refinery — the CUSTOM-SCHEMA pipeline, driven live (2026-08-14, task #39 close part 2)

**VERDICT: the custom-schema pipeline works end to end against the real fleet — 8 of 9 arms PASS, 1
BLOCKED on a global settings change I refused to make. Three defects found, none of them blocking, one
of them a re-commission of the exact scar the renderer design exists to prevent** (a schema-bounded
1-10 score printed as `89%`).

This closes the gap the 2026-08-09 drive left open in one row: *"custom schema (NL generate /
flat-language / transpile / use / guided / two-stage / needsRaw / raw-door) — **NOT EXERCISED** …
This is the largest remaining gap"*
([`2026-08-09-refinery-live-e2e.md`](2026-08-09-refinery-live-e2e.md), per-checklist row 4). Every one
of those words is now driven.

## Rig

The SHARED dev stack on `:5173`/`:8788` (main), the live vLLM fleet, model
`…/Huihui-ThinkingCap-Qwen3.6-27B-abliterated-W8A8-Dynamic-Per-Token` on the `structured` role,
32 768-token window. Driven headless through the real UI (Playwright over `:5173`, the app's own
`__orb` bridge for navigation) with tRPC legs through the PAGE (same session cookie + `x-orb-csrf`)
where a verb has no reachable affordance. Driver + logs + 20 screenshots: `reports/lane-re/`
(`re-kit.ts`, `re-step0…9.ts`, `step*.log`, `wire.json`, `snaps/`) — `reports/` is gitignored, so the
receipts quoted below are quoted in full rather than cited by path alone.

Wire receipts are the live ring: `GET /api/_debug/wire/captures` with the `.env` debug token.
**Correction to the prior drive's row:** it recorded *"a body-level receipt is not obtainable …
that ring is CHAT-backend-scoped and returns `{"count":0}` for the summarize/structured lane."* That
is no longer true — the ring now carries `api:"structured"` bodies with their full `response_format`,
and every wire claim below is a body-level read off it.

## Per-arm verdicts

| # | Arm | Verdict | Receipt |
| - | - | - | - |
| 1 | Custom-schema authoring: describe-in-English → Generate on the live model → schema lands → LIVE RENDER PREVIEW renders it | **PASS** | Generate settled **17 362 ms**; JSON pane 2 283 chars, `JSON.parse` ok; preview mounted `refinery-payload-view` with **1** hero gauge + 3 field blocks, **0** `refinery-payload-skeleton`, and `/"type"\s*:\|"properties"\s*:/` against the preview's rendered text = **false** (no raw-JSON leak — the renderer floor holds). Empty-payload arms render as designed: `— /10 VIVIDNESS · Mood — · ISSUES none listed · Overall score —`. |
| 2 | Refine-instruction iteration on the generated schema | **PASS** | *"add a per-issue field naming which card field the issue is about"* → **20 115 ms**, JSON pane 2 283 → 2 576 chars, changed=true. Root props unchanged (`vividness, mood, issues, summary, overallScore`); `issues[]` item props **`["severity","note"]` → `["severity","source","note"]`**. The iteration edits the draft in place; it does not re-roll the schema. |
| 3 | The three authoring arms (`single` / `guided` / `two-stage`) | **PASS** | All three returned `kind:"draft"` on the live model, transpiled, `dropped:[]`: `single` 19 067 ms · `guided` 11 119 ms · `two-stage` 20 236 ms. The dialog's picker is visibly labelled ("How to build it") and defaults to `One pass — fastest`; the UI leg drove `single`, the other two through `refinery.generateSchema` directly. **Note the axis confusion in the brief:** these are `REFINERY_FORGE_ARMS`, not the `STRUCTURED_OUTPUT_VEHICLES` knob (`auto`/`response-format`/`forced-tool`) — that knob is a *deployment* setting and, per `contracts/role-clients`'s own header, **"vLLM has one enforcing wire … and ignores this knob."** Exercising it needs OpenRouter, i.e. arm 8. |
| 4 | The needs-raw REFUSAL belt | **PASS (both legs)** — copy defect, see D3 | *Forge leg:* two asks outside the leaf grammar both returned `kind:"needs-raw"` with the reason in the author's words and a starter skeleton — union ask: *"That shape needs the raw schema editor: The primary score field must be a UNION type … The flat list format cannot express this 'either/or' structural constraint"*; heterogeneous-list ask: *"…a list with heterogeneous entry types (string vs. object). The field-based design assumes uniform structure per list item."* *Belt leg:* a pasted schema carrying `pattern` refused at save with `"pattern" is not allowed in a refinery schema (an LLM payload needs no regex) (at #/properties/handle)`, and one missing the well-known core with `a custom score schema must keep a required "overallScore" number with minimum 1 and maximum 10 — the card's score stamp and the library sorts stay on one scale (at #/properties/overallScore)`. **Save blocked both times** (dialog stayed open; `refinery.listSchemas` still `["re_vividness"]` afterwards). |
| 5 | The strippedKeys PREFLIGHT advisory (valid schema, hosted wire would strip) | **PASS** | On the generated (valid, saveable) schema: stats line `8 fields · 0 optional · 2 choice lists · 0 unions · 3 levels deep`, kicker `On a hosted model` present (1), and one advisory `data-advisory="wire-bounds-stripped"`: *"valid — but maxLength, maximum, minimum do not ride a hosted request: the endpoint never sees them, so they are enforced when the answer comes back, not while the model writes it. Say what you want in the field's description too."* The advisory did **not** block: the same draft saved on the next press (`re_vividness`, `refinery_schema_01m00x2j7cecs9bpyf5bsmf5x6`), and the session's Setup row flipped to `score: re_vividness · analyze: fixed`. |
| 6 | The manual-rewrite dialog end to end on a run | **PASS** | `Hand-edit` → *"Hand-edit the scoped fields"* with **6** targets prefilled from the working overlay (target\[0] = 244 chars of the live description) and **6** `empty this field` checkboxes; one edit → `Save as a rewrite round` → dialog closed, a run row appended `{stage:"rewrite", model:null, durationMs:0, payloadConfig.kind:"manual"}`, the stepper reads `2 Rewrite · 1 fields · round 0 · hand-authored`, and the accept review shows the hand-authored before/after pair with the tri-state verbs. No card write (`DRAFT — THE LIVE CARD IS UNTOUCHED` still on the header). |
| 7 | A FULL custom-schema run: session → score under the custom schema → rewrite → per-block Keep/Discard → terminal | **PASS** | Score under `re_vividness` settled **9 386 ms**, run row `{stage:"score", payloadConfig.kind:"custom", durationMs:7758, strippedKeys:[]}`; payload rendered through the custom plan (hero `9 /10 VIVIDNESS`, prose summary, `Mood WRY` tone chip, `ISSUES 3 entries` with 3 assay rows, FORK-A accordion opening to `SOURCE description` / `NOTE Consider specifying the 'canal city' name or era…`). Rewrite settled **43 497 ms** → 6 blocks, `0 KEPT / 0 DISCARDED / 6 UNDECIDED`, fail-closed note *"6 blocks have no verb pressed — undecided blocks are NOT applied…"*. One Keep + one Discard → `1 KEPT / 1 DISCARDED / 4 UNDECIDED`, decided rows collapse to `KEPT` / `DISCARDED` + `Show the change again`, CTA becomes `Apply 1 kept`. Terminal `Save as copy` → outcome panel *"1 field written to the copy "re-scratch-subject (refined)". The live card is untouched — no snapshot was needed, nothing existing was written."* + a `REPLACED description` row; `character.list` gained exactly that one row. |
| 8 | reasoning × structured probe on the OpenRouter key | **BLOCKED** | The `structured` role — which every refinery stage AND every forge call rides — resolves to the local vLLM backend. Wire receipt, verbatim from the ring: `api=structured backend=vllm model=/media/inktomi/Data/vllm-models/quantized/Huihui-ThinkingCap-Qwen3.6-27B-abliterated-W8A8-Dynamic-Per-Token`, on **all 9** structured captures in the ring. `OPENROUTER_API_KEY` is present in `.env` and OpenRouter IS live on another role (the ring also holds `api=chat-completions backend=openrouter`), but nothing on the refinery path reads it: reaching it requires repointing the structured/summarize role's connection in Settings — a GLOBAL settings change this lane is fenced from making. There is also no read-only door to inspect the role wiring: `/api/_debug/{roles,role-clients,connections,config,env}` are all **404**. Orchestrator-confirmed disposition: record the block, change nothing. |
| 9 | REGRESSION: a fixed-payload run still renders the full built-in treatment | **PASS** | A second session (`re-fixed-baseline`, stage config all fixed) on the same card: score settled **28 028 ms** and rendered the blessed anatomy — hero `8 /10 OVERALL SCORE`, docked prose summary, `PER-FIELD ASSAY 5 entries` (description 9 · personality 8 · scenario 8 · greetings 9 · exampleMessages 7, each with its meter), `PRIORITY IMPROVEMENTS` as 3 bullets. 1 hero, 5 assay rows, 2 field blocks. The custom arm did not regress the built-in one. |

## Defects (mechanism named; NOT fixed here)

### D1 — a schema-bounded 1-10 score renders as a PERCENT. Both arms. The §3.4 scar, re-committed.

`refinery-schema-renderer.md` §1 rules the OG's `max = data > 10 ? 100 : 10` guess the headline failure
class, and §3.4 pins the fix as a test obligation: *"Scale honesty: a 0-5 schema renders `/5` (the
anti-`>10?100:10` pin, named for its OG scar)."* The live surface prints a percentage instead.

**CUSTOM arm — visible.** `data-field="overallScore"`, rendered text verbatim:

```
Overall score ⏎  ⏎ Overall score ⏎ 89% ⏎ x
```

with the element receipt

```
role="meter" aria-valuemin="1" aria-valuemax="10" aria-valuenow="9" aria-valuetext="89%"
data-slot="meter"  →  meter-label "Overall score" · meter-value "89%"
```

(`x` is Base UI's 1×1 `clip-path: inset(50%)` live-region span — invisible, an `innerText` artifact, not
a defect; I chased it and it is clean.)

**BUILT-IN fixed arm — audible.** The same computation reaches the blessed payload through
`aria-valuetext`, where nothing visible reveals it: on `re-fixed-baseline`,
`aria-label="Overall score" aria-valuemin="1" aria-valuemax="10" aria-valuenow="8"
aria-valuetext="78%"`, and each per-field assay meter likewise (`aria-label="Score"`, 9 → `"89%"`,
8 → `"78%"`). **The hero gauge is the same:** its printed numeral is correct (`9 /10`) while its own
meter announces `aria-valuetext="89%"`. A screen-reader user hears "89 percent" for a 9-out-of-10
character score, on the shipped built-in payload, today.

**Mechanism (source-pinned).** `@orb/ui` `Meter` renders `<BaseMeter.Value>{formatValue ?? null}</…>`
(`packages/ui/src/charts/meter/meter.tsx:181-183`). With `formatValue` undefined, Base UI's
`Meter.Value` falls through to its DEFAULT formatter — the value as a **percentage of (min,max)** —
and it fills `aria-valuetext` with the same string whether or not `showValue` is set. Every refinery
call site omits `formatValue`: `GaugeRow` (`payload-view.tsx:277`, `showValue={true}` ⇒ the percent
becomes visible), the plain gauge arm (`:227`), and the assay row's score meter (`:406`). So the
percent is a **`@orb/ui` Meter default**, not a refinery bug — which is why it reaches the built-in
payload too, and why the fix belongs at the primitive (a `formatValue`/`getAriaValueText` that speaks
the schema's own bounds) rather than at three call sites. `78%` = (8−1)/(10−1) confirms the min-offset
arithmetic.

### D2 — `GaugeRow` prints its field label TWICE, side by side

Same element as D1: `GaugeRow` renders `<Text>{field.label}</Text>` **and** passes `label={field.label}`
into a `showValue` Meter, which renders `Meter.Label` with the same string. Rendered result, measured
at 1600×1100 in a 656px-wide field row: `Overall score   Overall score  89%`. One of the two is the
Meter's accessible name (the Meter deliberately drops `aria-label` when `showValue`, `meter.tsx:168`),
so the fix is to drop the outer `<Text>`, not the Meter's — the accessible name must survive.

### D3 — the save REFUSAL renders the raw zod issue ARRAY, not the sentence it was written to show

`schema-editor-dialog.tsx`'s own header states the intent: *"a belt REFUSAL (`RefusalNote`, verbatim,
blocks the save)"*, and `RefusalNote`'s doc comment: *"the lift belt's construct + path text IS the
teaching surface."* What an author actually sees, verbatim from the rendered `refinery-schema-refusal`
node:

```
[ { "code": "custom", "path": [ "schema" ], "message": "\"pattern\" is not allowed in a refinery schema (an LLM payload needs no regex) (at #/properties/handle)" } ]
```

**Mechanism:** `RefusalNote` prints `String(error.message)` — and a tRPC input-validation rejection's
`message` IS the serialized `ZodError` issue array, so the carefully-worded belt sentence arrives
wrapped in brackets, escaped quotes and JSON keys. It degrades further when two issues stack: my
second fixture also tripped the schema-NAME grammar, and the author is shown a two-element array whose
first entry is `"name must match ^[a-zA-Z_][a-zA-Z0-9_]*$"` with `origin`/`format`/`pattern` keys
beside it. The teaching text is present and correct; the presentation buries it. Fix is a parse-seam
at the note (pull `.message` off each issue, render them as lines), not new copy.

## Observations — not defects, worth an owner's eye

- **Every forge arm produces TWO `role:"hero"` nodes.** The author asks for "rating 1-10" and gets
  their field *plus* the spliced well-known core, both hinted hero (`"role": "hero"` ×2 in 3/3 arms).
  The renderer handles it correctly — one hero gauge, the loser demoted to a gauge row — but the
  author's schema now carries two scores that mean the same thing, and the demoted one is the
  canonical `overallScore`. The splice is right (`schema-forge.ts` header: *"the prompt says so, and
  the model spends no field on it"*); what is missing is the forge prompt telling the model not to
  design its own overall rating.
- **An unchanged rewrite entry still renders as a REPLACED before/after pair.** In arm 7 the model
  returned `description` byte-identical to the original and the accept review drew a full Before/After
  block for it. Cheap tell to suppress; today it costs the user a decision on a no-op.
- **The assay row's header renders an enum member through `scalarText`, losing its authored tone
  chip.** `issues[].severity` carries `x-orb-ui.tone {minor:info, major:warn}`; the row header prints a
  bare `minor`. The chip does appear when the field is rendered as a top-level `chip-enum` (`Mood WRY`
  is correctly tinted), so this is the `RowsBlock` header arm only (`payload-view.tsx:388-393`).
- **The Setup tab's schema editor is hardcoded `stage="score"` and `editing={null}`**
  (`refinery-context-tabs.tsx:133-141`). From the live surface there is therefore **no way to author a
  custom ANALYZE schema and no way to EDIT a saved one** — both verbs exist and work
  (`refinery.updateSchema`, `refinerySchemaStageSchema = ["score","analyze"]`). Unwired, not unbuilt.
- **`__orb.nav.contextTab("setup")` returns `{ok:true}` and does not switch the tab.** The panel was
  already open and the Runs body stayed mounted; only a real click on the `Setup` tab worked. This is
  the same bridge the 2026-08-09 drive flagged for not opening the panel it targets — a second
  symptom of one bridge gap.
- **Both shell side panels persist COLLAPSED**, and at 1440–1600px a collapsed list panel lays its rows
  out at `x ≈ −338` — present in the DOM and in `innerText`, unclickable. Any future drive must read
  `__orb.shell().panels[].mode` rather than blind-toggling; a blind toggle closes what the last run
  opened. (Harness lesson, not a product defect.)

## Wire receipts (the ring, verbatim shape)

Ten captures after the drive; every refinery call is `backend=vllm`, `response_format=json_schema`,
`additionalProperties=false`, no `tools`, no `guided_json` key on the body:

| `json_schema.name` | root properties | what it is |
| - | - | - |
| `re_vividness` | `vividness, mood, issues, summary, overallScore` | the CUSTOM score run (×2) |
| `refinery_score` | `fieldScores, overallScore, priorityImprovements, summary` | the built-in score (arm 9) |
| `refinery_rewrite` | `fields` | the rewrite stage |
| `refinery_schema_design` | `name, description, fields, needsRaw, needsRawReason` | the forge (×4 — one per generate/refine call) |
| `refinery_schema_preview` | `vividness, mood, issues, summary, overallScore` | the editor's test drill |

Two things this pins that no test can: the custom stored schema reaches the wire **projected and
closed** (`additionalProperties:false`, per `transpileForgeDesign`'s task-#41 note that closure is
proven at the projection choke point), and the forge's own envelope is the leaf-list grammar, not a
meta-schema — `needsRaw` is a real wire field the model fills, which is how arm 4's honest refusal is
possible at all.

## Appendix — scratch data (KEEP; repro substrate for the D1 fix lane)

All `re-`-prefixed, all created by this lane, nothing of the owner's touched. **Safe to delete once
the Meter fix lands** — until then this is the exact repro for D1/D2:

| Item | Id | Why keep |
| - | - | - |
| character `re-scratch-subject` | `character_01m00wd3mhe069d96hkr95p02a` | the subject both sessions pin |
| character `re-scratch-subject (refined)` | minted by `applyAsCopy` | arm 7's terminal receipt |
| schema `re_vividness` (score) | `refinery_schema_01m00x2j7cecs9bpyf5bsmf5x6` | the schema whose `overallScore` renders `89%` |
| session `re-custom-schema-drive` | `refinery_session_01m00wek62e069d97c8bm8gzpx` | custom arm: score + model rewrite + manual rewrite rows |
| session `re-fixed-baseline` | `refinery_session_01m00xejhpecs9bq1b68baze0z` | built-in arm: the `aria-valuetext="78%"` receipt |

Open `re-custom-schema-drive`, run score, and read `[data-field="overallScore"]` — D1 and D2 are both
in that one element.

---

# ARM 8 REAL-BUG — the OpenRouter structured 500 is `provider.require_parameters`, NOT the schema shape (2026-08-14, lane `os-` / or-shape-test)

Arm 8 above recorded a BLOCK ("record the block, change nothing") because the structured/summarize role
resolved to local vLLM and repointing it is a global settings change. The owner AUTHORIZED the supervised
flip and asked the direct question the m4-or-probe finding left open: **the OpenRouter structured call 500s
in 83-174 ms — does flipping `structuredOutputShape` to D126 `strict-compatible` clear it?**

**Verdict: (b) a REAL CODE BUG, not config.** `strict-compatible` does NOT clear it — and cannot, because
the D126 shape knob is **not read on this path at all**. The 500 is OpenRouter returning **HTTP 404 "No
endpoints found that can handle the requested parameters"**, caused by `provider.require_parameters: true`
riding on the `response_format` structured vehicle. Drop that one field and the identical wire returns
**200** with a valid structured reply. The shape knob (`as-projected` vs `strict-compatible`) is a no-op
here in two independent ways: the source hardcodes the strict-compatible projection, and both settings
produced byte-identical wires.

## Restore receipt (verified FIRST, on the live stack, after the drive)

Independent re-read + a live structured call, `reports/lane-os/step4.log` (verbatim):

```
SETTINGS shape resolved="as-projected" override=null overrideKeys=["structuredOutputShape"]
SETTINGS roleDefaults={}
SETTINGS summarize="<unset>"
scratch os- cards present=[] (total 0)
STRUCTURED CALL ok=true ms=494
NEWEST WIRE CAPTURE backend=vllm api=structured model=…/Huihui-ThinkingCap-Qwen3.6-27B-abliterated-W8A8-Dynamic-Per-Token
FINAL scratch os- cards=[] (total 0)
```

- **structuredOutputShape** — resolved back to the floor `as-projected` (the recorded before-value). The
  raw override sits at `null`, the verb's DOCUMENTED clear sentinel (`domain/settings/verbs/app-settings.ts:44`
  — "can clear an override to the `null` sentinel"); `resolveStructuredOutput` reads `override ?? DEFAULT`,
  so `null` and absent are behavior-identical. Not restored to key-absent because `updateAppSettings` has no
  key-delete path and raw-KV surgery on a live stack was not worth the risk — flagged, not hidden.
- **structured/summarize role** — fully pristine (`roleDefaults={}`, summarize unset), and a live structured
  call re-resolves to **local vLLM** (`backend=vllm api=structured`), the recorded before-connection.
- **scratch** — every `os-` card deleted; `character.list` = 0. The owner's cards/chats were never touched;
  only the summarize (structured-carrier) role moved, so the chat/sub dogfooding was unaffected throughout.

## The shape × complexity matrix — all six cells 500, one error, one wire

Driven through `refinery.testSchema` (the structured wire; ring name `refinery_schema_preview`) on a minted
`os-scratch-subject` card. Model per the owner's guidance (STRONG reasoning SKU): `anthropic/claude-sonnet-5`
for the 2×2, `google/gemini-3.1-pro-preview` to rule out model-specificity. Every cell returned the SAME
tRPC error: `openrouter structured item 0 failed: Response validation failed` (`HTTP 500`,
`INTERNAL_SERVER_ERROR`). Timings 46-554 ms — the m4 "too fast to be generation" tell.

| shape | complexity | model | result |
| - | - | - | - |
| `as-projected` | simple (1 optional) | sonnet-5 | 500 · 554 ms |
| `as-projected` | complex (`re_vividness`) | sonnet-5 | 500 · 53 ms |
| `strict-compatible` | simple | sonnet-5 | 500 · 49 ms |
| `strict-compatible` | complex | sonnet-5 | 500 · 46 ms |
| `as-projected` | simple | gemini-3.1-pro | 500 · 49 ms |
| `strict-compatible` | simple | gemini-3.1-pro | 500 · 46 ms |

**The shape knob changed nothing.** The `as-projected` and `strict-compatible` cells produced **byte-identical
outbound wire** (`reports/lane-os/results.json`): both `required:["overallScore","note"]`, both `note` as
`anyOf:[{string},{null}]`, both with bounds moved into `"[Constraints: …]"` description text, both
`additionalProperties:false`, `strict:true`. That is the strict-compatible projection — emitted even in the
`as-projected` cell — because `structuredResponseFormat` hardcodes
`scrubWireSchema(format.schema, "strict-compatible")` (`backends/openrouter/index.ts:238-248`). **The D126
`structuredOutputShape` AppSetting is never consulted on the OpenRouter `response_format` path.**

## The definitive evidence — a raw replay of the captured wire (the response body m4 could not get)

The SDK's "Response validation failed" is the Speakeasy client's RESPONSE-schema zod rejecting OpenRouter's
reply — it swallows OR's actual body (which is exactly why the m4 probe could not see it). So I replayed the
**exact captured wire body** as a raw `fetch` to `https://openrouter.ai/api/v1/chat/completions` with the
owner's key (`reports/lane-os/step3.log` / `raw-replay.json`), one variable at a time:

| replayed body | result |
| - | - |
| APP wire, verbatim (`response_format` + `provider.require_parameters:true`) | **404** `No endpoints found that can handle the requested parameters` · 227 ms |
| APP wire, DROP `response_format` (keep `require_parameters`) | **404** same message · 43 ms |
| APP wire, DROP `provider.require_parameters` (keep `response_format` + `strict:true`) | **200** · 16 563 ms · Amazon Bedrock · valid `{"overallScore":6.8,"note":"…"}` |
| APP wire, `strict:false` (keep `require_parameters`) | **404** same message · 47 ms |
| APP wire (gemini-3.1-pro), verbatim | **404** same message · 36 ms |

**Single-variable conclusion: `provider.require_parameters: true` is the 404.** It is present ⇒ 404,
regardless of `response_format`, `strict`, model, or schema complexity; it is absent ⇒ 200 with a correct
schema-honoring structured reply from Amazon Bedrock. The 404 is fast (36-227 ms), which is the entire
"too fast to be generation" symptom — it is OpenRouter's provider-routing layer rejecting before any model
runs.

## The two defects

**D-ARM8-1 (PRIMARY, blocks the whole hosted structured path).** `require_parameters:true` on the
`response-format` vehicle (`backends/openrouter/index.ts:274-276`) makes OpenRouter's router demand an
endpoint advertising EVERY request parameter and find none → 404. The `response_format` structured role on
OpenRouter is therefore **100% broken today**, for every model and every schema. Fix belongs at that one
site: drop `provider: { requireParameters: true }` (the 2026-08-09 note already labelled it "routing
hygiene, NOT the fix" — it has since become the breaker), or make it conditional/removable. Localized hop:
`packages/server/src/infra/providers/backends/openrouter/index.ts:274-276` (the `provider: { requireParameters: true }`
spread on the `vehicle === "response-format"` arm).

**D-ARM8-2 (SECONDARY, observability).** A non-2xx OpenRouter response reaches the caller as the opaque
`Response validation failed` — the SDK's response-schema zod chokes on OR's `{error:{message,code}}`
envelope and `errorMessage(err)` (`index.ts:311`) keeps only the SDK's generic sentence, discarding OR's
own `"No endpoints found…"` text. This is precisely why the m4 probe "couldn't get the response body," and
why this diagnosis needed a raw replay. The error path should surface OR's HTTP status + body (the
`instruments-lie` class: an upstream 404 presenting as an internal validation error).

## Corrections to prior receipts (verify-before-building)

- **`2026-08-09-openrouter-structured-output-probe.md` Finding 1 is now FALSE.** It ruled
  "`require_parameters:true` changed NO cell of the matrix, in either direction" and warned "any future note
  claiming it is what makes `response_format` work should be checked against this table first." Five days
  later `require_parameters:true` flips EVERY cell 200 → 404. OpenRouter's provider-routing behaviour for
  that flag (or the set of endpoints advertising these params) has changed since 2026-08-09. The flat-leaf
  grammar + `strict-compatible` + `strict:true` shape the 2026-08-09 probe validated is STILL 200 — only the
  `require_parameters` rider is now fatal.
- **The owner's hypothesis (flip to `strict-compatible` clears it) does not hold, but not because
  `strict-compatible` is wrong** — the OR `response_format` path already emits strict-compatible
  unconditionally, and the blocker is the routing flag, orthogonal to schema shape.

## Config-default recommendation

**None — this is not a config question.** The D126 `structuredOutputShape` default should stay
`as-projected`; it is inert on the OpenRouter `response_format` path either way. The fix is code
(D-ARM8-1), routed to a follow-up lane; no board config-default change is warranted.

## Scratch data (lane `os-`, all deleted; receipts in `reports/lane-os/`, gitignored)

`os-scratch-subject`, `os-restore-probe`, `os-verify-probe` — all minted and removed by this lane;
`character.list` = 0 afterward. Driver + logs: `os-kit.ts`, `os-step1…4*.ts`, `step1…4.log`,
`results.json`, `raw-replay.json`, `debug-errors.json`, `wire-outcomes.json`.
