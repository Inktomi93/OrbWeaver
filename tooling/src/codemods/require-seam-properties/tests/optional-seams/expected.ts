import type { IdSource } from "@orb/kit/ids";
import type { ScheduleOp } from "@orb/kit/time";

export interface RegexComposeDeps {
  readonly db: DatabaseHandle;
  readonly idSource: IdSource;
  /** Kept with its doc comment. */
  readonly scheduleTimeout: ScheduleOp;
  readonly label?: string;
}
