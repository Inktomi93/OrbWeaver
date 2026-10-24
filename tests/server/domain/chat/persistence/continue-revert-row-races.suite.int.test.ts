// @subject packages/server/src/domain/chat/persistence/canon-write.ts
// A stale revertContinue refuses when a competing continuation, swipe or membership change lands while the restore is held at its native write.
import { RESTORE_ROW_RACES, registerRestoreRaces } from "./continue-restore-races.fixtures.ts";

registerRestoreRaces("revertContinue", RESTORE_ROW_RACES);
