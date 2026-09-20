---
kind: review
status: active
updated: 2026-09-20
---

# Inference warning home and cadence audit

## Outcome

Every inference warning code has a server translation or a deliberate turn-stream filter, but its cadence and
several assigned homes do not match the inference program. Eleven adjustment warnings can become eleven
durable chat events and eleven toasts on every turn. The only suppression is whole-warning deduplication
within one backend result and across recursion depths; there is no comparison with the previous turn on the
same connection.

Three explicitly assigned homes are absent: the capability panel does not receive or render warning state,
the connection row has no `declared_overrides_measured` badge, and there is no Extras authoring row on which
to render `custom_parameters_ignored{key}`. Smart-arbitration and background degradation reach the room, but
neither implements its assigned session/shared cadence. `image_edit_dropped` is the one infra warning whose
current operation-scoped home already matches its behavior.

This is evidence, not a replacement program or work queue. Rows marked **ruled** quote the home or cadence
assigned by `orbweaver-inference-package.md` §5.3a. Rows marked **proposed** name the closest coherent home for
members that §5.3a does not enumerate individually; they require an owner ruling before implementation.

## Required cadence semantics

“Only when the dropped set changes from the previous turn on that connection” means an ordered comparison,
not a whole-session seen-set:

1. Canonicalize this turn's dropped adjustment set as `current`.
2. Compare it with the immediately previous turn's set stored for the same connection id.
3. Emit at most one aggregate when `current` is non-empty and differs from `previous`.
4. Store `current` even when it is empty, so a later recurrence after a clean turn is a change and surfaces
   again.

A session-wide “already shown” set would incorrectly silence `A → empty → A`; a global previous set would
incorrectly compare turns on different connections. The current bus warning carries neither the connection id
nor an aggregate set, so toast-level deduplication cannot implement this rule faithfully.

## Home and cadence table

| infra code | emitter | current carriage and client home | required or proposed home | gap |
| - | - | - | - | - |
| `sampling_knob_dropped` | chat/embed funnels and OpenAI-compatible wire | `settings_adjusted`; one durable warning and toast per distinct warning each turn | **ruled:** ambient capability panel plus one changed-set turn aggregate | Ambient state and cross-turn cadence absent. |
| `sampling_knob_conflict` | chat funnel exclusive-knob fold | `settings_adjusted`; one toast per conflict | **ruled:** ambient capability panel plus changed-set aggregate | Same gap. |
| `effort_dropped` | chat funnel and Anthropic/OpenAI-compatible wires | `settings_adjusted`; one toast per warning | **ruled:** ambient capability panel plus changed-set aggregate | Same gap. |
| `adaptive_budget_dropped` | adaptive-reasoning funnel | `settings_adjusted`; one toast per warning | **proposed:** ambient reasoning capability plus changed-set aggregate | Current turn toast repeats; §5.3a does not name this member individually. |
| `display_dropped` | reasoning-display funnel | `settings_adjusted`; one toast per warning | **proposed:** ambient reasoning capability plus changed-set aggregate | Current turn toast repeats. |
| `verbosity_dropped` | verbosity funnel and Anthropic wire | `settings_adjusted`; one toast per warning | **proposed:** ambient output capability plus changed-set aggregate | Current turn toast repeats. |
| `dynamic_context_demoted` | dynamic-context funnel and Anthropic wire | `settings_adjusted`; one toast per warning | **proposed:** one changed-set aggregate; ambient only where the selected connection descriptor predicts it | Current turn toast repeats. |
| `image_edit_dropped` | image/edit belts in Anthropic and OpenAI-compatible backends | Imagery result warning rendered beside the edit outcome; chat image generation maps it to one room warning | **proposed:** keep the existing operation-scoped image caveat | No cadence defect demonstrated. |
| `reasoning_mandatory_clamp` | reasoning funnel | `settings_adjusted`; one toast per warning | **proposed:** ambient reasoning capability plus changed-set aggregate | Current turn toast repeats. |
| `reasoning_budget_clamped` | reasoning budget funnel | `settings_adjusted`; one toast per warning | **proposed:** one changed-set aggregate, with applied budget | Current turn toast repeats. |
| `custom_parameters_ignored{key}` | OpenAI-compatible/OpenRouter/Anthropic extras folds | `key` reaches infra, then the server drops it and emits a generic toast with “Open Connections” | **ruled:** inline on the offending Extras row at authoring | Key is lost; no client Extras editor or row exists. |
| `tool_result_error_dropped` | OpenAI-compatible history conversion | `settings_adjusted`; one toast per warning | **proposed:** one changed-set aggregate | Current turn toast repeats; no ambient authoring control exists. |
| `reasoning_dropped_for_prefill` | OpenAI-compatible request-body fold | `settings_adjusted`; one toast per warning | **proposed:** one changed-set aggregate | Current turn toast repeats. |
| `declared_overrides_measured` | capability synthesis, one warning per overlapping field | Filtered before the turn bus | **ruled:** connection-row badge with overridden-field count, never turn stream | Stream exclusion exists; badge is absent. |
| `background_task_degraded` | task resolution when the connection cannot fund background work | Plain room warning and toast per occurrence | **ruled:** one shared background-degrade notice | Shared/outage cadence absent. |
| `sdk_unsupported_setting` | V4 SDK warning translation | Reclassified as `sampling_knob_dropped`; one toast per warning | **proposed:** changed-set aggregate; ambient only if capability evidence predicts the setting | SDK provenance is lost at the chat boundary and cadence repeats. |
| `sdk_unsupported_tool` | V4 options/result warning translation | Reclassified as `tools_unsupported`; one room toast | **proposed:** keep the room home, aggregate with the turn's other drops | No aggregate carrier; SDK provenance is lost. |
| `sdk_compatibility` | V4 SDK compatibility/deprecation warning translation | `provider_compatibility_mode`; one toast per warning | **proposed:** one changed-set aggregate | Current turn toast repeats. |
| `smart_arbitration_degraded` (chat-domain code) | smart arbitration fallback in the turn verb | One room warning and toast on every degraded arbitration | **ruled:** room notice aggregated per session | Session episode state absent. |

The eleven members from `sampling_knob_dropped` through `reasoning_dropped_for_prefill`, excluding
`image_edit_dropped` and `custom_parameters_ignored`, are the persistent adjustment set that can fan into
eleven notices. SDK warnings can add further notices after that set.

## Current path

The infra tuple and detail payload live at `packages/inference/src/contract/resolve.ts:8-81`. Backend warning
events are folded to stream chunks by `packages/server/src/entry/compose/chat.ts:675-712`, keyed by the entire
warning. The recurse loop performs the same whole-warning deduplication across depths at
`packages/server/src/domain/chat/engine/pipeline.ts:990-1008`.

`emitCapabilityDropWarnings` filters only `declared_overrides_measured`, then emits every other runner warning
independently at `packages/server/src/domain/chat/engine/engine.ts:2264-2273`. Its translation at
`engine.ts:2291-2335` drops the custom-parameter key, collapses SDK setting/tool warnings into existing chat
codes, and maps each adjustment member to one `settings_adjusted` event. The bus immediately invokes
`onWarning` for every event at `packages/client/src/data/bus/apply-chat-bus-event.ts:70-74`; the chat feature
immediately calls `notify.warn` at `packages/client/src/features/chat/components/chat-content.tsx:47-56`.
The notification seam explicitly performs no client coalescing at `packages/client/src/lib/notify.ts:18-22`.

The ambient read is incomplete. `connection.resolveChatCapability` projects only `ResolvedConnectionView` at
`packages/server/src/domain/connection/verbs/resolve.ts:36-40`, and the client narrows that to the generation
descriptor at `packages/client/src/features/preset/lib/chat-capability.ts:1-10`. The existing per-row
`connection.capabilities` read does return `capability + warnings + tasks` at
`packages/server/src/domain/connection/verbs/resolve.ts:43-58`, but no client consumes it. The capability panel
has no connection selector and omits unsupported controls rather than greying them.

The connection list projection carries only the saved row, provider label, and tasks
(`packages/server/src/domain/connection/contract/results.ts:8-20`; connection row construction at
`packages/server/src/domain/connection/verbs/connections.ts:92-99`). Its UI renders task badges but no warning
badge at `packages/client/src/features/credentials/components/connections-list-section.tsx:104-149`.

The Extras ruling currently has no target. A literal scan of credential and preset client TS/TSX found no
Extras/custom-parameter editor. The fenced add dialog contains fields for URL, credential, model, API, label,
and background permission; its header states that `declared · features · extras · transport` are deferred.
The preset-editor model's old header still says `customParameters` is authored there, but the current
`PromptConfig` merge carries no such field.

`smart_arbitration_degraded` is emitted directly on each degraded smart arbitration at
`packages/server/src/domain/chat/verbs/turn.ts:825-832,886`. `background_task_degraded` is appended during each
unfundable background resolution at `packages/inference/src/resolve/resolve-task.ts:257-264`. Both therefore
reach the same immediate per-event toast path; neither has episode state.

`image_edit_dropped` already has two explicit operation homes: the imagery bridge narrows it at
`packages/server/src/entry/compose/imagery.ts:98-106`, and the edit surface renders every returned caveat at
`packages/client/src/features/imagery/components/image-edit-body.tsx:71-79`. Chat-authored images map it onto
the chat warning bus at `packages/server/src/domain/chat/verbs/generate-image.ts:95-101`.

## Evidence boundary

Snapshot: local commit `f106f1bf8`, 2026-09-20. This was a read-only audit; no runtime was started.

- Literal census: `rg` over `packages/client`, `packages/server`, `packages/contracts`, and
  `packages/inference/src` for every warning spelling, `warningNotice`, `onWarning`, capability reads, Extras,
  and warning/session/connection state.
- Structural census: raw `ast-grep` was run separately for TS and TSX over client, server, and inference.
  `$X.onWarning` found one TS access (`apply-chat-bus-event.ts:73`) and zero TSX accesses.
  `$X.resolveChatCapability` found six TS and three TSX accesses. `$X.warnings` found 31 TS accesses and one
  TSX access. The structural scope contained 2,802 `.ts`/`.tsx` files.
- Negative cadence claim: no `Map<ChatWarning>`, `Set<ChatWarning>`, previous-drop, same-connection-warning,
  or session-warning state was found by the structural pass or a second `rg` pass. The only nearby stateful
  warning precedent is the memory rerank episode, which dedupes within one gathered turn at
  `packages/server/src/domain/chat/memory/recall/rerank-warning.ts:1-21`; it does not compare connections or
  successive turns.
- Existing tests pin warning production, whole-warning transport, per-warning server translation, client
  copy, and smart-arbitration emission. Representative homes are
  `tests/server/entry/compose/chat.test.ts:397-483`,
  `tests/server/domain/chat/engine/engine.test.ts:73-150`,
  `tests/client/features/chat/lib/warning-notice.test.ts:55-125`, and
  `tests/server/domain/chat/verbs/turn.int.test.ts:832-885`. None pins ambient warning rendering,
  connection-row override badges, same-connection previous-turn comparison, or session aggregation.

## Implementation boundaries exposed by the audit

The smallest faithful turn-cadence change needs a structured aggregate and the actual connection id at the
domain-to-bus seam. The engine has the resolved connection on `TurnPrep`, but currently calls the warning
emitter with only `chatId` and the pipeline result (`packages/server/src/domain/chat/engine/engine.ts:1840`).
Changing only the toast mapper would compare neither the complete turn set nor the correct connection.

Ambient rendering can use the existing owner-gated `connection.capabilities({connectionId})` read, but the
panel still needs an explicit selected connection and UI for unsupported/adjusted controls. The override badge
can use the same read or a deliberately extended list projection. Extras authoring cannot be completed in the
present scope without releasing the connection editor fence or approving a new adjacent edit surface; adding
only the runtime key to the toast would not satisfy the authoring-time ruling.
