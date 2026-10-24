// The owner-conversion door: recoveries and operand tokens only. The boot mint is published by `../wiring-boot.ts`
// and the driver-admission mint by `../wiring-driver.ts`; the exports map points `@orb/db/wiring-owner` here, so a
// static and a dynamic import both miss both mints (D335). A domain forwards the handle its caller supplied.
export {
  awaitableStatementForOwner,
  awaitableStatementToken,
  batchForOwner,
  batchHandle,
  bootDatabaseForOwner,
  databaseForOwner,
  statementForOwner,
  statementToken,
} from "../wiring-capabilities.ts";
