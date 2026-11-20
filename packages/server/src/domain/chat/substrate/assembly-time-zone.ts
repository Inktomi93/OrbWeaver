import type { IanaTimeZone } from "@orb/kit/time";
import { UTC_TIME_ZONE } from "@orb/kit/time";

/** The zone a chat render's time macros read: the one its caller names, else UTC. The ONE home of the
 *  no-viewer clock; the server's own zone is no user's. */
export function assemblyTimeZone(timeZone: IanaTimeZone | undefined): IanaTimeZone {
  return timeZone ?? UTC_TIME_ZONE;
}
