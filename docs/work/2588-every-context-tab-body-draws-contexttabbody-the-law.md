---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: client
plan: cross-surface-consistency
---

# Every CONTEXT tab body draws ContextTabBody, the law names it, and the census counts every registered body

## What

The density law gives the CONTEXT panel viewport one inset, and many bodies spell it by hand with a section-gap Stack root, most without the block padding: the character Overview, Links, Look and Trust tabs, This chat, the rpg tabs, the preset readout and the Insights tabs. ContextTabBody gains the kinds they need (own scroll, height fill) once. Bodies not yet read to their root (character History, Members, plugin context panels, Labels, the log and teacher bodies) are read and placed on a kind or their difference is recorded. The regex and world-info context bodies wait for the shared list branch. Sites: the class 4 table in the survey rulings for item 1766 under reports/cb-survey-1766.

## Why

One inset is ruled for the CONTEXT viewport and most bodies spell it by hand.

## Done when

Each registered body uses a ContextTabBody kind or records why its root differs, the density law names the owner, and the context-tab census cohort lists every body a registration declares.

## Sites

| Site | What it is |
| - | - |
| `packages/client/src/features/character/components/character-facet-inspector.tsx:43` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/character/components/character-chats-projection-shell.tsx:47` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/character/components/character-relations-tab.tsx:58` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/character/components/character-appearance-tab.tsx:96` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/character/components/character-trust-tab.tsx:116` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/chat/components/settings-context-tab.tsx:227` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/chat/components/settings-context-tab.tsx:353` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/rpg/components/rpg-status-tab.tsx:135` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/rpg/components/rpg-inventory-tab.tsx:117` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/rpg/components/rpg-scene-tab.tsx:243` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/rpg/components/rpg-quests-tab.tsx:299` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/rpg/components/rpg-journal-tab.tsx:344` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/rpg/components/rpg-game-tab.tsx:401` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/preset/components/readout/preset-readout.tsx:58` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/preset/components/readout/preset-readout.tsx:111` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/stats/components/analytics-models-tab.tsx:46` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/stats/components/analytics-models-tab.tsx:65` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/stats/components/analytics-time-tab.tsx:37` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/stats/components/analytics-time-tab.tsx:58` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/stats/components/analytics-personas-tab.tsx:27` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/stats/components/analytics-personas-tab.tsx:46` | Roots that spell the CONTEXT inset per file |
| `packages/client/src/features/character/components/character-history-tab.tsx:30` | Roots not yet read |
| `packages/client/src/features/chat/components/committed-members-tab.tsx:55` | Roots not yet read |
| `packages/client/src/features/plugin/components/plugin-context-panels.tsx:22` | Roots not yet read |
| `packages/client/src/features/tag/components/labels-panes.tsx` | Roots not yet read |
| `packages/client/src/features/automation/lib/activity-context-tab.tsx:29` | Roots not yet read |
| `packages/client/src/features/automation/components/room-activity-log.tsx:57` | Roots not yet read |
| `packages/client/src/features/config/components/config-teacher.tsx:143` | Roots not yet read |
| `packages/client/src/features/config/components/config-teacher.tsx:183` | Roots not yet read |
| `packages/client/src/features/config/components/config-teacher.tsx:196` | Roots not yet read |
| `packages/client/src/features/config/components/config-teacher.tsx:209` | Roots not yet read |
| `packages/client/src/features/chat/components/assembly-preview-panel.tsx:43` | Roots not yet read |
| `packages/client/src/features/discovery/components/corpus-artifact-context.tsx:11` | Roots not yet read |

## Evidence

Filled at landing: what ran and where its output is.
