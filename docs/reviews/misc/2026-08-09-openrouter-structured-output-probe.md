---
kind: receipt
status: active
updated: 2026-08-09
---

# OpenRouter structured-output probe — 2026-08-09 (task #36)

**Why this file exists.** `backends/openrouter/index.ts` carries a 2026-08-02 ruling — "OpenRouter's
`response_format: {type:"json_schema"}` is NOT servable across its hosted families" — which the owner
challenged with OpenRouter's own docs. This is the live re-probe that settles it, kept in the tree because a
ruling correction whose evidence lives in an agent transcript is a ruling nobody can re-check.

**Method.** 23 live `POST https://openrouter.ai/api/v1/chat/completions` calls with the owner's
`OPENROUTER_API_KEY`, raw `fetch` (not the SDK) so the receipt is the literal wire. Three families, chosen
off `GET /models?supported_parameters=structured_outputs` (308 models returned):
`anthropic/claude-sonnet-5`, `openai/gpt-5.6-luna`, `google/gemini-3.6-flash`. Wire copies were produced by
the tree's own `scrubWireSchema` modes, so the shapes below are the shapes we actually send.

## Finding 1 — the variable is the SCHEMA SHAPE, not `provider.require_parameters`

`require_parameters: true` changed **no cell** of the matrix, in either direction. It rides on the new
vehicle anyway (routing to an endpoint that advertises the parameter is correct hygiene), but any future note
claiming it is what makes `response_format` work should be checked against this table first.

## Finding 2 — a meta-schema with OPEN KEY MAPS is unservable, and fails SILENTLY on Anthropic

The first design under test was "a JSON Schema constraining JSON Schemas": `properties` modelled as an open
`additionalProperties: <node union>` map, node union expanded to depth 3 (34 KB).

| model | vehicle | shape | result |
| - | - | - | - |
| anthropic/claude-sonnet-5 | `response_format` | hosted-common | **200 — and `{"properties":{},"required":[]}`** |
| anthropic/claude-sonnet-5 | `response_format` | strict-compatible | 200, same empty design |
| openai/gpt-5.6-luna | `response_format` | hosted-common | 400 `'required' is required to be supplied and to be an array including every key in properties. Missing 'enum'` |
| openai/gpt-5.6-luna | `response_format` | strict-compatible | 400 `11 levels of nesting exceeds limit of 10` |
| google/gemini-3.6-flash | `response_format` | either | 400 `INVALID_ARGUMENT` |
| anthropic | forced tool | hosted-common | 200, a REAL schema (hints, tones, enum) |
| openai / google | forced tool | hosted-common | 200 — and `"properties":{}` again |

The Anthropic row is the dangerous one and the reason this design was abandoned: an open key map compiles to
"no keys permitted", so the model is **structurally unable to emit a field** and the failure arrives as a
200 with a well-formed, empty answer. That is the instruments-lie class this repo hunts, on a wire.

## Finding 3 — the FLAT LEAF LANGUAGE is servable everywhere

The shipped grammar (`@orb/contracts/refinery/schema-forge` — one row per leaf field, nesting carried in a
`path` string, arrays of closed objects only, 1.4 KB projected):

| model | routed provider | vehicle + shape | result |
| - | - | - | - |
| anthropic/claude-sonnet-5 | Amazon Bedrock | `response_format` + strict-compatible + `strict:true` + require_parameters | **200**, 4 fields incl. `issues[].severity` with per-member tones |
| openai/gpt-5.6-luna | OpenAI | same | **200**, 4 fields |
| google/gemini-3.6-flash | Google AI Studio | same | **200** (hit the probe's own 1 600-token cap) |
| google/gemini-3.6-flash | Google AI Studio | `response_format` + hosted-common, no `strict` | **200**, 4 fields |

Intermediate failures worth keeping, because they name the two walls the `strict-compatible` shape exists to
clear: Anthropic 400'd on `maxItems` (`For 'array' type, property 'maxItems' is not supported` — the shape's
bound strip fixes it) and OpenAI 400'd on all-required (`Missing 'enum'` — the shape's null-union fixes it).

## What landed from this

- The forge's grammar is the flat leaf language, transpiled server-side. Enforced everywhere; the save belt
  remains the final authority on the transpiled document.
- `structuredOutputVehicle` (`auto` | `response-format` | `forced-tool`), floor `auto`, composing with — not
  replacing — the D126 `structuredOutputShape` knob. `auto` reads the resolved model's capability, so a model
  without structured-output endpoints and every caller that does not ask for the enforcing vehicle keeps the
  2026-08-02 forced-tool path byte-for-byte. Nothing was ripped out.
- The 2026-08-02 header block is corrected in place with a pointer here, and the backend test that encoded
  "never response_format" is re-framed as the extraction rail's fence.

## Not probed

Reasoning/thinking × structured output per family (the OG extension had to disable `reasoning_effort` for
Anthropic structured calls on its TOOL vehicle), and the Response Healing plugin. Both are open questions,
not claims either way.
