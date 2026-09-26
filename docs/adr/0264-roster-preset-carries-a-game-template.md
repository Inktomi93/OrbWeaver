---
kind: adr
status: active
updated: 2026-09-26
---

# A roster preset carries a game template and starts through startChat's game birth

## Context

A roster preset starts a chat in one action (D263). An RPG campaign needs its game at that start, so the first turn is in-game. Chat's startChat already births a game in the room's own creation batch when it carries startAsGame; rpg contributes the rows through its injected planGameBirth op.

## Decision

A roster preset may carry a game template: rpg's RpgGameTemplate in @orb/contracts/rpg, the same shape startChat's startAsGame takes. The template is stored in roster_presets.game_template and parsed at the create and update verbs. NULL means the roster starts a plain chat. The one client start door, useStartRoster, hands the template to startChat as startAsGame. The room, its seats and its game then commit in chat's single creation batch, so a failed birth leaves no room. The roster-preset domain holds no rpg op and no chat-start op. applyToChat never creates a game: the template applies only at a start. The seed manifest marks a campaign roster with startsGame, and the user seed stores rpg's default template on it. Homes: packages/contracts/src/rpg/ruleset.ts, packages/contracts/src/roster-preset/index.ts, packages/client/src/features/roster-preset/hooks/use-start-roster.ts, packages/default-content/src/manifest.ts.

## Consequences

A stored template whose ruleset a later build removes fails that start whole, inside the creation batch. Update is a full replace, so an editor that renames a roster echoes its template. A roster saved from a room carries no template.

## Alternatives rejected

A server rosterPreset.start verb that calls rpg's createGame after the room exists: it is a second start path, it is not atomic, and a failed game create would need a compensating room delete. An rpg create op injected into the roster-preset domain has the same defects.
