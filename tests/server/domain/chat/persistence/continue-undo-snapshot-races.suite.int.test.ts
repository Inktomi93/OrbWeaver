// @subject packages/server/src/domain/chat/persistence/canon-write.ts
// A stale undoContinue refuses when a competing write to the stored variant snapshot lands while the restore is held at its native write.
import { RESTORE_SNAPSHOT_RACES, registerRestoreRaces } from "./continue-restore-races.fixtures.ts";

registerRestoreRaces("undoContinue", RESTORE_SNAPSHOT_RACES);
