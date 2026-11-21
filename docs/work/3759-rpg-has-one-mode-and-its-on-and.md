---
kind: work
status: open
updated: 2026-11-21
priority: P2
area: rpg
---

# RPG has one mode and its on and off switch is the only lifecycle

## What

RPG_GAME_MODES is lite and full in packages/contracts/src/rpg/enums.ts, every game is minted lite (packages/server/src/domain/rpg/game-mint.ts) and nothing branches on full. RPG_GAME_STATUSES has setup, ready, active and concluded, and every game is minted active and never changes. The lite naming runs through the config (lite.steeringNote), game-mint and the client's lite tabs. Owner ruling: there is one RPG, no full mode; a chat leaves game mode and returns to it, and while off it is a normal chat whose turns RPG does not touch.

## Why

Vocabulary members nothing builds and a mode axis with one value mislead every reader.

## Done when

The mode field, RPG_GAME_MODES and the status field with its unbuilt members are deleted, the lite naming leaves config, code and comments, a numbered migration drops the columns and lifts steeringNote to the config root, the engaged pointer is the one on and off switch, and a test proves a disengaged game adds no RPG prompt, reminder, macro or tool to a turn and an engaged one does.

## Evidence

Filled at landing: what ran and where its output is.
