// The owner-conversion door: every capability conversion except the boot grant's mint, which only `../wiring-boot.ts`
// publishes. The exports map points `@orb/db/wiring-owner` here, so a static and a dynamic import both miss the mint (D335).
export {
  awaitableStatementForOwner,
  awaitableStatementToken,
  batchForOwner,
  batchHandle,
  bootDatabaseForOwner,
  databaseForOwner,
  databaseHandle,
  statementForOwner,
  statementToken,
} from "../wiring-capabilities.ts";
