---
kind: adr
status: active
updated: 2026-10-03
---

# Each model role picks its preset

## Context

Background tasks (summaries, extraction, arbitration, refinery, discovery, captions) run on the Utility role. If they read the chat preset's sampling, a short chat reply cap also caps every background task. Each user chooses sampling per role; an admin does not override it.

## Decision

The Utility role carries a preset choice beside its connection, stored as `seeds.summarizePreset` in user settings: absent is task defaults (the task posture alone), `same-as-chat` follows the active preset, `preset` names one. The Chat role's preset is the active preset (`seeds.defaultPresetId`) and chat turns use the full preset. A background task takes only `ROLE_PRESET_FIELDS` from its role's preset params (`@orb/contracts/preset`): the sampler knobs, sampler order, output cap, effort and thinking budget. It never reads prompt structure, templates, macros, regex or guided actions. `CHAT_ONLY_INTENT_FIELDS` names the rest, and a type test pins that the two tuples partition `UserIntent`. The fold is `resolveSideGenSampling` in `@orb/inference`: a role preset knob wins, the task posture (`SIDE_GEN_POSTURES`) fills only the knobs it leaves unset. The server resolves the role preset in one place, `packages/server/src/entry/compose/side-gen-params.ts`. The memory digest runs on the Utility role through the same fold; there is no admin summarizer override.

## Consequences

AppSettings v10 drops `memorySummarizer` and the residue engine-launch and vLLM-concurrency keys. UserSettings v10 adds `seeds.summarizePreset`, so existing users get task defaults. Compaction and quiet generation run on the chat connection and keep the active preset.

## Alternatives rejected

Inherit the chat preset by default (rejected: a short chat reply cap silently caps background work). Store the preset on `connection_bindings` (rejected: rule and plugin actors have no preset, and the chat preset already lives in settings seeds). Keep the admin summarizer override (rejected: the owner ruled that admins do not override user sampling).
