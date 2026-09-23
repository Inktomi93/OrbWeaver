---
kind: adr
status: active
updated: 2026-09-23
---

# Prompt sections keep their prompt-order position on every model

## Context

Per-turn system-region sections moved to a trailing system row on models that accept one, which overrode the preset's order to save the prompt cache. SillyTavern and Marinara never relocate a section.

## Decision

Every prompt section stays where the prompt order puts it. A per-turn section above Chat History is system-region content on every model. A system row at depth N or below Chat History stays a real system row where turns.midConversationSystem or historySystemRows and the role-handling level allow it, else it folds to user in place. Keyword-fired world info follows its entry's anchor within the per-turn half. The static/dynamic split and its cache marker stay. Under carried reasoning on models that bind thinking to its prefix, a section the preset places in a moving or per-turn position costs the carried thinking after it; that is the preset author's choice, and requests set prefix_mismatch_behavior drop_block so the turn still succeeds.

## Consequences

A preset that lists memory or fired lore above Chat History loses the history cache when that content changes. Preset authors who want the cache list it below Chat History.

## Alternatives rejected

Relocate per-turn system content to the tail on capable models: removed, because it silently overrides the preset. Relocate only under carried reasoning on binding models: rejected by the owner.
