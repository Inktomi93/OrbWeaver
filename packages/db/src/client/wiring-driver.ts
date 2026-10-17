// Only a physical connection owner creates the handle supplied to composition.
import type { Db } from "./index.ts";
import type { DatabaseHandle } from "./wiring-capabilities.ts";
import { databaseHandle as admitDatabase } from "./wiring-capabilities.ts";

/** This physical-owner door publishes admission, not the private owner conversion API. */
export function databaseHandle(db: Db): DatabaseHandle {
  return admitDatabase(db);
}
