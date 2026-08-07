// domain/rpg — COMPOSITION ROOT: wires the lite verbs (§4.4) over one shared `RpgContext` (zero logic of its
// own — see contract/service.ts for the `RpgContext` injected-op seam + the `RpgService` verb contract). The
// verbs are grouped by concern (game/quest/journal/checkpoint/read) + the single-verb files
// (patch-sheet/edit-snapshot/patch-actor/dismiss-actor/promote-actor/roll-dice); each `create<Verb>` factory
// closes over the ctx and returns its slice.

import { createRpgContext } from "./context.ts";
import type { RpgContextDeps, RpgService } from "./contract/service.ts";
import { createCreateCheckpoint, createListCheckpoints, createRestoreCheckpoint } from "./verbs/checkpoint/index.ts";
import { createDismissActor } from "./verbs/dismiss-actor.ts";
import { createEditSnapshot } from "./verbs/edit-snapshot.ts";
import { createCreateGame, createDetachDanglingPointer, createPopulateFromCharacter, createResyncFromStory, createUpdateConfig } from "./verbs/game/index.ts";
import { createAddJournalEntry, createDeleteJournalEntry, createEditJournalEntry } from "./verbs/journal/index.ts";
import { createPatchActor } from "./verbs/patch-actor.ts";
import { createPatchSheet } from "./verbs/patch-sheet.ts";
import { createPromoteActor } from "./verbs/promote-actor.ts";
import { createDeleteQuest, createUpsertQuest } from "./verbs/quest/index.ts";
import {
  createGetConfigView,
  createGetGame,
  createGetTrackerView,
  createListJournal,
  createListTurnToolCalls,
  createRevealHidden,
} from "./verbs/read/index.ts";
import { createRollDice } from "./verbs/roll-dice.ts";

export function createRpgService(deps: RpgContextDeps): RpgService {
  const ctx = createRpgContext(deps);
  return {
    ...createCreateGame(ctx),
    ...createUpdateConfig(ctx),
    ...createDetachDanglingPointer(ctx),
    ...createResyncFromStory(ctx),
    ...createPopulateFromCharacter(ctx),
    ...createPatchSheet(ctx),
    ...createEditSnapshot(ctx),
    ...createPatchActor(ctx),
    ...createDismissActor(ctx),
    ...createPromoteActor(ctx),
    ...createUpsertQuest(ctx),
    ...createDeleteQuest(ctx),
    ...createAddJournalEntry(ctx),
    ...createEditJournalEntry(ctx),
    ...createDeleteJournalEntry(ctx),
    ...createCreateCheckpoint(ctx),
    ...createRestoreCheckpoint(ctx),
    ...createListCheckpoints(ctx),
    ...createRollDice(ctx),
    ...createGetGame(ctx),
    ...createGetTrackerView(ctx),
    ...createListJournal(ctx),
    ...createListTurnToolCalls(ctx),
    ...createGetConfigView(ctx),
    ...createRevealHidden(ctx),
  };
}
