---
kind: adr
status: active
updated: 2026-10-05
supersedes: docs/adr/0299-each-model-role-picks-its-preset.md
---

# Each model role picks its preset, including its reasoning tag pair

## Context

Background tasks (summaries, extraction, arbitration, refinery, discovery, captions) run on the Utility role. If they read the chat preset's sampling, a short chat reply cap also caps every background task. Each user chooses sampling per role; an admin does not override it. A model that wraps its reasoning in custom tags needs its preset's tag pair applied to background replies too.

## Decision

The Utility role carries a preset choice beside its connection, stored as seeds.summarizePreset in user settings: absent is task defaults (the task posture alone), same-as-chat follows the active preset, preset names one. The Chat role's preset is the active preset (seeds.defaultPresetId) and chat turns use the full preset. A background task takes ROLE_PRESET_FIELDS from its role's preset params (@orb/contracts/preset): the sampler knobs, sampler order, output cap, effort and thinking budget, plus the reasoningParse tag pair when its auto-parse is on, which splits reasoning out of the reply and never reaches the wire. It never reads other prompt structure, templates, macros, regex or guided actions. CHAT_ONLY_INTENT_FIELDS names the rest, and a type test pins that the two tuples partition UserIntent. The fold is resolveSideGenSampling in @orb/inference: a role preset knob wins, and the task posture (SIDE_GEN_POSTURES) fills only the knobs it leaves unset. The server resolves the role preset in one place, packages/server/src/entry/compose/side-gen-params.ts. The memory digest runs on the Utility role through the same fold; there is no admin summarizer override.

## Consequences

AppSettings v10 drops memorySummarizer and the residue engine-launch and vLLM-concurrency keys. UserSettings v10 adds seeds.summarizePreset, so existing users get task defaults. Compaction and quiet generation run on the chat connection and take only temperature, topP and output cap from the host's active preset. The memory digest's output cap is clamped to half the summarizer window so a block always fits. A preset imported from SillyTavern splits background reasoning on its own pair.

## Alternatives rejected

Inherit the chat preset by default (rejected: a short chat reply cap silently caps background work). Store the preset on connection_bindings (rejected: rule and plugin actors have no preset, and the chat preset already lives in settings seeds). Keep the admin summarizer override (rejected: the owner ruled that admins do not override user sampling). Keep the tag pair chat-only (rejected: custom reasoning tags leak into every summary).
