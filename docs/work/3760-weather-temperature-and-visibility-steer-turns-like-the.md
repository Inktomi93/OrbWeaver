---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: rpg
---

# Weather temperature and visibility steer turns like the other scene fields

## What

rpgWeatherSchema (packages/contracts/src/rpg/ambient.ts) carries temperatureC, visibility, wind and description. type and label run the whole scene-field path: a steer clause in prose.ts, the update_scene write field, apply.ts, the reminder and {{rpgSceneState}} line, and the Waystone and scene tab. The other four never get written; description is printed by the reminder but never written. Owner ruling: RPG has no GM; scene fields feed descriptions into the turn to steer the story.

## Why

Fields that no step writes look like weather support that does not exist.

## Done when

temperatureC and visibility run the whole path: the weather steer clause asks for them when the story states them, update_scene accepts them, apply writes them, the reminder and scene macro print them, the Waystone shows the temperature and the scene tab edits both; wind and description are deleted, stored rows still parse; tests cover the write, the printed line and the edit.

## Evidence

Filled at landing: what ran and where its output is.
