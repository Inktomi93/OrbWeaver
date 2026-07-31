// domain/rpg — COMPOSITION ROOT: wires the lite verbs (§4.4) over one shared `RpgContext` (zero logic of its
// own — see contract/service.ts for the `RpgContext` injected-op seam + the `RpgService` verb contract). The
// verbs are grouped by concern (game/quest/journal/checkpoint/read) + the single-verb files
// (patch-sheet/edit-snapshot/roll-dice); each `create<Verb>` factory closes over the ctx and returns its slice.

import { createRpgContext } from "./context";
import type { RpgContextDeps, RpgService } from "./contract/service";
import { createCreateCheckpoint, createListCheckpoints, createRestoreCheckpoint } from "./verbs/checkpoint";
import { createEditSnapshot } from "./verbs/edit-snapshot";
import { createCreateGame, createDetachDanglingPointer, createResyncFromStory, createUpdateConfig } from "./verbs/game";
import { createAddJournalEntry, createDeleteJournalEntry, createEditJournalEntry } from "./verbs/journal";
import { createPatchSheet } from "./verbs/patch-sheet";
import { createDeleteQuest, createUpsertQuest } from "./verbs/quest";
import { createGetConfigView, createGetGame, createGetTrackerView, createListJournal, createRevealHidden } from "./verbs/read";
import { createRollDice } from "./verbs/roll-dice";

export function createRpgService(deps: RpgContextDeps): RpgService {
  const ctx = createRpgContext(deps);
  return {
    ...createCreateGame(ctx),
    ...createUpdateConfig(ctx),
    ...createDetachDanglingPointer(ctx),
    ...createResyncFromStory(ctx),
    ...createPatchSheet(ctx),
    ...createEditSnapshot(ctx),
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
    ...createGetConfigView(ctx),
    ...createRevealHidden(ctx),
  };
}
