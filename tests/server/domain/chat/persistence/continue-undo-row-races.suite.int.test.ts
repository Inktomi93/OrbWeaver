// @subject packages/server/src/domain/chat/persistence/canon-write.ts
// A stale undoContinue refuses when a competing continuation, swipe or membership change lands while the restore is held at its native write.
import { RESTORE_ROW_RACES, registerRestoreRaces } from "./continue-restore-races.fixtures.ts";

registerRestoreRaces("undoContinue", RESTORE_ROW_RACES);
