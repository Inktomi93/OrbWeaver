---
kind: adr
status: active
updated: 2026-11-11
---

# A user macro has two definition homes, the preset and the game

## Context

A user macro is authored in the active preset (`promptConfig.userMacros`) and in a game (`config.userMacros` on the game row). A game has a vocabulary of its own, such as a scene tone or a house rule, that has no place in a preset the host runs everywhere. Both homes feed one turn, so the question is where a definition lives and which one wins a name clash. ADR 0169 decides where input values and draws live, per chat; it does not decide where definitions live or which definition wins.

## Decision

A user macro is defined in the preset or in the game, with one `userMacroSchema` in `packages/contracts/src/preset/index.ts` for both. There is no global runtime registry. A game macro resolves in that game turns and leaves with the game. On a name clash the game wins, as the more specific definition. `shadowPresetUserMacros` in `packages/server/src/domain/chat/substrate/user-macros.ts` drops the preset definition before registration, so the shadow is a decision and not a registry refusal. Homes: `packages/contracts/src/rpg/config.ts`, `packages/server/src/domain/chat/assembly/user-macros.ts` and `packages/server/src/domain/rpg/verbs/game/update-config.ts`.

## Consequences

Define a macro in one of the two homes and never a third. Chat owns the shadow rule and reads the game half through the injected `ChatRpgOps.resolveUserMacros`; it never imports the rpg domain. The game list is written whole through `updateConfig`, and an omitted `userMacros` keeps the current list. A shadowed preset definition consumes no random draw and writes no draw record. Picks and draws key by macro name, not by source, so a pick made under the preset keeps applying when a game definition takes the name. The picks pane marks a game macro and the game editor marks a definition that overrides a preset macro.

## Alternatives rejected

A global runtime registry: ruled out, a macro belongs to a preset or a game. A first-wins registry refusal on a name clash: replaced by the game-wins decision, which drops the preset definition before registration. A separate schema or editor for the game: the game reuses the preset schema and the same editor dialog.
