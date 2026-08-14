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
