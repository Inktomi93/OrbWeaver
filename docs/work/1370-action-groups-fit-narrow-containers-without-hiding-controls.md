---
kind: work
status: doing
updated: 2026-10-27
priority: P2
area: client
lane: reading_geometry
---

# Action groups fit narrow containers without hiding controls

## What

Review non-wrapping action groups across feature TSX. Row defaults to single-line flex and Button defaults to non-wrapping text. The plugin consent row has a measured phone overflow and is being corrected separately. Candidates include UpdateCheckRow in plugin-row-leaves.tsx, ConnectionEditorHeader in connection-editor-unavailable.tsx, and StalenessRow in staleness-row\.tsx. Structural Row matches include nested, conditional and deliberately single-line cases; do not classify them as defects without rendered evidence.

## Why

Container ownership does not make descendants fit. Variable labels and constrained panes can push an action beyond the visible region even when imports and container placement are correct.

## Done when

Adjudicate candidate groups through production-mounted cases at narrow container widths, with long supported labels and enlarged text. Fix confirmed overflow without hiding controls or shrinking hit targets. Consolidate repeated action-group behavior into the appropriate existing or justified primitive contract. Preserve deliberately single-line layouts. Add planted overflow controls and positive controls for action visibility, keyboard reach and focus return. Do not globally make every Row wrap or baseline existing failures.

## Evidence

The [surface consistency report](../reviews/surface-consistency-repair.md#bounded-action-group-extension) records qualified families, production fixes, native results and limitations. This item remains open for the source candidates below.

## Remaining source candidates

These groups are not demonstrated defects or certified maximum-text layouts. Qualify their actual production states before changing them. Preserve conditional and deliberately single-line compositions.

| Source group | Current source disposition |
| - | - |
| [auth/components/login-pending-join.tsx:140](../../packages/client/src/features/auth/components/login-pending-join.tsx) | Create account and join/Not now (pending Joining); real auth-state branch, no user-supplied button copy. |
| [auth/components/login-signup-form.tsx:164](../../packages/client/src/features/auth/components/login-signup-form.tsx) | I already have an account/Not now. Existing login pending-join tests prove form/focus behavior, not enlarged-text layout. |
| [automation/components/rule-row.tsx:294](../../packages/client/src/features/automation/components/rule-row.tsx) | Edit/Test with menu; rule name is outside the action copy. |
| [character/components/character-create-actions.tsx:229](../../packages/client/src/features/character/components/character-create-actions.tsx) | New character/Import a card finite pair. |
| [character/components/character-library-body.tsx:99](../../packages/client/src/features/character/components/character-library-body.tsx) | Clear search/Clear filters finite recovery actions. |
| [character/components/greeting-studio.tsx:115](../../packages/client/src/features/character/components/greeting-studio.tsx) | Preview Discard/Accept and ready Make new/Rewrite are separate finite action pairs. |
| [character/components/greeting-studio.tsx:167](../../packages/client/src/features/character/components/greeting-studio.tsx) | Preview Discard/Accept and ready Make new/Rewrite are separate finite action pairs. |
| [chat/anchors/character-gallery-dialog.tsx:202](../../packages/client/src/features/chat/anchors/character-gallery-dialog.tsx) | Add images/Close finite gallery actions. |
| [chat/components/message-tool-calls.tsx:53](../../packages/client/src/features/chat/components/message-tool-calls.tsx) | Finite action cluster; source-only candidate. No native overflow conclusion. |
| [config/components/config-collection-landing.tsx:231](../../packages/client/src/features/config/components/config-collection-landing.tsx) | Create/Cancel finite inline creation actions. |
| [credentials/components/connection-fact-rows.tsx:97](../../packages/client/src/features/credentials/components/connection-fact-rows.tsx) | Finite Reset/Override or Cancel/Save pair inside an already container-responsive fact editor. |
| [credentials/components/connection-fact-rows.tsx:153](../../packages/client/src/features/credentials/components/connection-fact-rows.tsx) | Finite Reset/Override or Cancel/Save pair inside an already container-responsive fact editor. |
| [credentials/components/credential-key-row.tsx:90](../../packages/client/src/features/credentials/components/credential-key-row.tsx) | Revoked Clear revoked/Remove versus live Replace/Revoke; four JSX buttons represent two mutually exclusive pairs. Dialog bodies are portaled, not inline siblings. |
| [notifications/components/notification-inbox-row.tsx:190](../../packages/client/src/features/notifications/components/notification-inbox-row.tsx) | Payload branches choose invite Accept/Decline, handoff Accept, plugin Review/Open Plugins, plus Dismiss. Six JSX buttons are not six concurrent actions. |
| [persona/components/persona-editor.tsx:211](../../packages/client/src/features/persona/components/persona-editor.tsx) | Duplicate/Export/Delete footer: three finite visible actions, not a long persona-named button. |
| [persona/components/persona-list.tsx:172](../../packages/client/src/features/persona/components/persona-list.tsx) | Two icon-only import/from-character controls + New persona. |
| [plugin/components/plugin-install-card.tsx:412](../../packages/client/src/features/plugin/components/plugin-install-card.tsx) | Install/Cancel, not Install plugin-name; full manifest identity is above the controls. |
| [preset/components/preset-editor-header.tsx:92](../../packages/client/src/features/preset/components/preset-editor-header.tsx) | Rename icon + Active badge or Activate command in the existing min-inline-0 identity row; reset is a separate icon. |
| [preset/surfaces/preset-library-surface.tsx:191](../../packages/client/src/features/preset/surfaces/preset-library-surface.tsx) | Clear search/New preset finite empty-filter recovery pair. |
| [refinery/components/context-tabs.tsx:117](../../packages/client/src/features/refinery/components/context-tabs.tsx) | Runs View/Use for apply-or-Use latest instead; snapshots Compare-or-Hide compare/Restore. Distinct finite conditional pairs. |
| [refinery/components/context-tabs.tsx:363](../../packages/client/src/features/refinery/components/context-tabs.tsx) | Runs View/Use for apply-or-Use latest instead; snapshots Compare-or-Hide compare/Restore. Distinct finite conditional pairs. |
| [refinery/components/session-masthead.tsx:83](../../packages/client/src/features/refinery/components/session-masthead.tsx) | Open card/Edit scope finite commands; long card name is elsewhere in wrapping masthead. |
| [roster-preset/components/roster-picker.tsx:114](../../packages/client/src/features/roster-preset/components/roster-picker.tsx) | Finite Start/Add to chat + icon Delete; no roster name appears in visible button copy (name is in accessible qualifiers). |
| [rpg/components/rpg-game-tab.tsx:100](../../packages/client/src/features/rpg/components/rpg-game-tab.tsx) | Tracker label/value editor plus three fixed icon verbs; displayed tracker name is not repeated as a variable action label. |
| [tag/components/labels-suggestions.tsx:228](../../packages/client/src/features/tag/components/labels-suggestions.tsx) | Accept/Reject actions qualify subject accessibly; full suggestion names are not both painted on the controls. |
| [user-admin/components/admin-override-field.tsx:172](../../packages/client/src/features/user-admin/components/admin-override-field.tsx) | Save or Saving + optional Reset to defaults; no per-knob label inside the buttons. |
| [workloads/components/import-library-section.tsx:108](../../packages/client/src/features/workloads/components/import-library-section.tsx) | Import/Cancel finite import commit/cancel pair. |
| [workloads/components/persona-collision-review.tsx:166](../../packages/client/src/features/workloads/components/persona-collision-review.tsx) | Merge all/Keep all bulk choices only when more than one collision; not per-persona dynamic names. |
| [workloads/components/schedules-section.tsx:170](../../packages/client/src/features/workloads/components/schedules-section.tsx) | Edit/Delete plus enable switch. Schedule identity is in accessible qualifiers, not visible text. |
| [workloads/components/workload-row.tsx:107](../../packages/client/src/features/workloads/components/workload-row.tsx) | Cancel for active states versus Retry for failed states; both JSX nodes are not proof both appear simultaneously. |
