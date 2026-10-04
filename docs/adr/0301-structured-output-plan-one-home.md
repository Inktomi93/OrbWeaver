---
kind: adr
status: active
updated: 2026-10-04
supersedes: docs/adr/0126-structured-output-wire-shape-app-setting.md
---

# Structured output has one plan per request

## Context

Structured output reached the wire through several spellers: raw schemas on most local and direct wires, a separate scrub in the agent-sdk and direct Anthropic backends, a vehicle guess at the role seam, and a deployment-wide admin knob for the schema shape. Providers fail differently on a schema they cannot carry: Anthropic and OpenAI answer 400 on documented complexity ceilings, while llama.cpp, Ollama, KoboldCpp and Gemini skip unsupported keywords silently.

## Decision

One structured-output layer serves every wire. A caller states a need: candidate schemas, or tools and a tool choice. planStructured in packages/inference/src/structured/plan.ts turns the need into the one request the endpoint can carry, or into typed violations, and every backend sends that plan and spells nothing of its own. The plan works on two axes: the wire class (features.structuredMode, one JSON-Schema vocabulary per mode in packages/contracts/src/inference/wire-subset.ts) and the enforcer (output.structuredLimitsFrom with output.structuredLimits merged field by field). It picks the first format and vehicle that fit (response-format, forced-tool, offered-tool); otherwise it refuses before the call, and a provider's own schema refusal maps onto the same violations. A reshape that makes optionals nullable records the reshaped paths, and the reply drops a null only there, so a nullable field the author declared keeps its null; an optional and nullable field under a reshape is refused. Response-format strictness follows the mode; features.strictJson governs strict tool input only. There is no deployment knob for the shape or the vehicle: the only inputs are the connection's capability and the two Custom body fields. Callers outside the inference package ask planStructuredFor, carriesStructured or forcesToolRound, and the structured-plan-one-home gate keeps scrubs, vehicle names and tool-choice writes out of them.

## Consequences

A model whose capability states neither structured output nor tool calls has no vehicle, and a structured call on it is refused with the typed violation instead of running free text. A Custom connection reaches a richer vocabulary only through server detection or its capability rows. The structured_output_unsupported chat warning, the admin structured-output section and the AppSettings fields structuredOutputShape and structuredOutputVehicle are gone; a stored blob that carries either key loses it at parse.

## Alternatives rejected

A per-vendor mode (two vendors with one vocabulary would carry two tables that drift). A per-connection vehicle or shape setting (the owner names the capability settings and the body fields as the only inputs). A runtime retry on a provider 400 (the ceilings are documented and the scrub is deterministic, so a refusal is known before the call). Dropping every null in a reshaped reply (a declared nullable field would lose its value).
