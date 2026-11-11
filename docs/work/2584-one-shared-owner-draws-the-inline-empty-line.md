---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: client
plan: cross-surface-consistency
---

# One shared owner draws the inline empty line of a list inside a surface

## What

The empty state of a list inside a surface is one shape, a muted sentence with an optional ghost action, spelled by QueryInlineState, by RpgDoorwayLine and by a bare Text across many sites, filter-miss lines included. One client-shared owner holds it and every site reads it. EmptyState stays the owner of a surface's own empty state. It is a wide rewrite over client Text sites, so it runs after the prose cap codemod. Sites: survey table 2b for item 1766 under reports/cb-survey-1766.

## Why

The same line reads differently per feature and nothing holds its voice.

## Done when

One client-shared component owns the line, every site in the survey table reads it (by codemod where the shape is mechanical), RpgDoorwayLine and the QueryInlineState empty case are gone or delegate to it, and the census lists the cohort.

## Sites

| Site | What it is |
| - | - |
| `packages/client/src/components/entry-list-editor.tsx:86` | Inline muted empty lines |
| `packages/client/src/components/relation-manager-section.tsx:71` | Inline muted empty lines |
| `packages/client/src/components/relation-manager-section.tsx:94` | Inline muted empty lines |
| `packages/client/src/data/query-inline-states.tsx:35` | Inline muted empty lines |
| `packages/client/src/features/automation/components/owner-automation-sections.tsx:148` | Inline muted empty lines |
| `packages/client/src/features/automation/components/room-activity-log.tsx:44` | Inline muted empty lines |
| `packages/client/src/features/automation/components/rule-book-field.tsx:73` | Inline muted empty lines |
| `packages/client/src/features/automation/components/rule-fire-log.tsx:47` | Inline muted empty lines |
| `packages/client/src/features/automation/components/rule-preset-knob-field.tsx:233` | Inline muted empty lines |
| `packages/client/src/features/automation/components/rules-section.tsx:127` | Inline muted empty lines |
| `packages/client/src/features/automation/components/rule-tool-fields.tsx:155` | Inline muted empty lines |
| `packages/client/src/features/character/components/character-facet-editor.tsx:332` | Inline muted empty lines |
| `packages/client/src/features/character/components/character-filter-rail-parts.tsx:164` | Inline muted empty lines |
| `packages/client/src/features/character/components/character-history-tab.tsx:80` | Inline muted empty lines |
| `packages/client/src/features/character/components/character-tags-row.tsx:83` | Inline muted empty lines |
| `packages/client/src/features/chat/components/add-chat-script-dialog.tsx:143` | Inline muted empty lines |
| `packages/client/src/features/chat/components/assembly-preview-diagnostics.tsx:150` | Inline muted empty lines |
| `packages/client/src/features/chat/components/assembly-preview-diagnostics.tsx:255` | Inline muted empty lines |
| `packages/client/src/features/chat/components/chat-books-section.tsx:90` | Inline muted empty lines |
| `packages/client/src/features/chat/components/chat-documents-section.tsx:213` | Inline muted empty lines |
| `packages/client/src/features/chat/components/injections-manager.tsx:130` | Inline muted empty lines |
| `packages/client/src/features/chat/components/macro-picks-section.tsx:364` | Inline muted empty lines |
| `packages/client/src/features/chat/components/members-panel.tsx:387` | Inline muted empty lines |
| `packages/client/src/features/chat/components/members-panel.tsx:394` | Inline muted empty lines |
| `packages/client/src/features/chat/components/memory-recall-detail.tsx:81` | Inline muted empty lines |
| `packages/client/src/features/chat/components/regex-on-screen-group.tsx:67` | Inline muted empty lines |
| `packages/client/src/features/chat/components/regex-tier-group.tsx:101` | Inline muted empty lines |
| `packages/client/src/features/config/components/config-search-input.tsx:148` | Inline muted empty lines |
| `packages/client/src/features/credentials/components/add-connection-provider-fields.tsx:290` | Inline muted empty lines |
| `packages/client/src/features/credentials/components/connection-transport-editor.tsx:202` | Inline muted empty lines |
| `packages/client/src/features/discovery/components/corpus-duplicate-rows.tsx:48` | Inline muted empty lines |
| `packages/client/src/features/discovery/components/corpus-duplicate-rows.tsx:67` | Inline muted empty lines |
| `packages/client/src/features/discovery/components/corpus-duplicate-rows.tsx:99` | Inline muted empty lines |
| `packages/client/src/features/discovery/components/corpus-similarity-tab.tsx:124` | Inline muted empty lines |
| `packages/client/src/features/discovery/components/corpus-visuals-tab.tsx:164` | Inline muted empty lines |
| `packages/client/src/features/discovery/components/corpus-visuals-tab.tsx:199` | Inline muted empty lines |
| `packages/client/src/features/discovery/surfaces/corpus-artifact-surface.tsx:137` | Inline muted empty lines |
| `packages/client/src/features/discovery/surfaces/corpus-dossier-surface.tsx:224` | Inline muted empty lines |
| `packages/client/src/features/discovery/surfaces/corpus-dossier-surface.tsx:305` | Inline muted empty lines |
| `packages/client/src/features/discovery/surfaces/corpus-moment-surface.tsx:117` | Inline muted empty lines |
| `packages/client/src/features/discovery/surfaces/corpus-moment-surface.tsx:132` | Inline muted empty lines |
| `packages/client/src/features/notifications/components/notification-inbox-older.tsx:59` | Inline muted empty lines |
| `packages/client/src/features/notifications/components/notification-bell.tsx:63` | Inline muted empty lines |
| `packages/client/src/features/persona/components/persona-connected-characters.tsx:48` | Inline muted empty lines |
| `packages/client/src/features/plugin/components/plugin-distribute-section.tsx:189` | Inline muted empty lines |
| `packages/client/src/features/plugin/components/plugin-grant-list.tsx:316` | Inline muted empty lines |
| `packages/client/src/features/plugin/components/plugin-log-panel.tsx:36` | Inline muted empty lines |
| `packages/client/src/features/plugin/components/plugin-row.tsx:300` | Inline muted empty lines |
| `packages/client/src/features/plugin/components/plugins-installed-section.tsx:36` | Inline muted empty lines |
| `packages/client/src/features/plugin/components/snippet-console.tsx:121` | Inline muted empty lines |
| `packages/client/src/features/preset/components/params-deck.tsx:218` | Inline muted empty lines |
| `packages/client/src/features/preset/components/preset-import-dialog.tsx:247` | Inline muted empty lines |
| `packages/client/src/features/preset/components/prompt-assembly/assembly-preview.tsx:52` | Inline muted empty lines |
| `packages/client/src/features/preset/components/prompt-assembly/assembly-preview.tsx:95` | Inline muted empty lines |
| `packages/client/src/features/preset/components/prompt-assembly/assembly-preview.tsx:151` | Inline muted empty lines |
| `packages/client/src/features/preset/components/readout/data-readout.tsx:24` | Inline muted empty lines |
| `packages/client/src/features/preset/components/readout/readout-parts.tsx:117` | Inline muted empty lines |
| `packages/client/src/features/preset/components/variable-editor-dialog.tsx:81` | Inline muted empty lines |
| `packages/client/src/features/preset/components/actions-view.tsx:161` | Inline muted empty lines |
| `packages/client/src/features/refinery/components/manual-rewrite-dialog.tsx:97` | Inline muted empty lines |
| `packages/client/src/features/refinery/components/original-card-dialog.tsx:62` | Inline muted empty lines |
| `packages/client/src/features/refinery/components/payload-view.tsx:384` | Inline muted empty lines |
| `packages/client/src/features/rpg/components/rpg-attribute-grid.tsx:39` | Inline muted empty lines |
| `packages/client/src/features/rpg/components/rpg-character-detail.tsx:187` | Inline muted empty lines |
| `packages/client/src/features/rpg/components/rpg-character-detail.tsx:296` | Inline muted empty lines |
| `packages/client/src/features/rpg/components/rpg-game-tab.tsx:232` | Inline muted empty lines |
| `packages/client/src/features/rpg/components/rpg-game-tab.tsx:411` | Inline muted empty lines |
| `packages/client/src/features/rpg/components/rpg-hint-map-editor.tsx:47` | Inline muted empty lines |
| `packages/client/src/features/rpg/components/rpg-inventory-tab.tsx:174` | Inline muted empty lines |
| `packages/client/src/features/rpg/components/rpg-journal-tab.tsx:190` | Inline muted empty lines |
| `packages/client/src/features/rpg/components/rpg-journal-tab.tsx:259` | Inline muted empty lines |
| `packages/client/src/features/rpg/components/rpg-scene-cards.tsx:113` | Inline muted empty lines |
| `packages/client/src/features/rpg/components/rpg-scene-npcs.tsx:140` | Inline muted empty lines |
| `packages/client/src/features/rpg/components/rpg-stat-profile-editor.tsx:158` | Inline muted empty lines |
| `packages/client/src/features/rpg/components/rpg-status-tab.tsx:74` | Inline muted empty lines |
| `packages/client/src/features/rpg/components/rpg-tracker-grants.tsx:111` | Inline muted empty lines |
| `packages/client/src/features/rpg/components/rpg-veiled-section.tsx:60` | Inline muted empty lines |
| `packages/client/src/features/stats/components/analytics-models-tab.tsx:76` | Inline muted empty lines |
| `packages/client/src/features/stats/components/analytics-personas-tab.tsx:58` | Inline muted empty lines |
| `packages/client/src/features/stats/components/analytics-time-tab.tsx:73` | Inline muted empty lines |
| `packages/client/src/features/stats/surfaces/analytics-overview-surface.tsx:299` | Inline muted empty lines |
| `packages/client/src/features/user-admin/components/admin-approvals-section.tsx:60` | Inline muted empty lines |
| `packages/client/src/features/user-admin/components/admin-link-sso-section.tsx:60` | Inline muted empty lines |
| `packages/client/src/features/user-admin/components/share-invite-picker.tsx:44` | Inline muted empty lines |
| `packages/client/src/features/regex/components/regex-collection-rows.tsx:163` | Inline muted empty lines |
| `packages/client/src/features/regex/components/regex-context-body.tsx:178` | Inline muted empty lines |
| `packages/client/src/features/regex/components/regex-context-body.tsx:221` | Inline muted empty lines |
| `packages/client/src/components/regex-script-picker.tsx:151` | Inline muted empty lines |
| `packages/client/src/features/tag/components/label-attached-entities.tsx:38` | Inline muted empty lines |
| `packages/client/src/features/tag/components/labels-suggestions.tsx:64` | Inline muted empty lines |
| `packages/client/src/features/world-info/components/world-info-collection-rows.tsx:105` | Inline muted empty lines |
| `packages/client/src/features/world-info/components/book-attachments.tsx:98` | Inline muted empty lines |
| `packages/client/src/features/world-info/components/book-attachments.tsx:159` | Inline muted empty lines |
| `packages/client/src/features/roster-preset/components/roster-picker.tsx:164` | Inline muted empty lines |

## Evidence

Filled at landing: what ran and where its output is.
