import type { WarningCode } from "@orb/contracts/inference";
import type { ChatEvent } from "@orb/inference";

/** The codes of the warning events a turn emitted, in emission order. */
export function warningCodes(events: readonly ChatEvent[]): WarningCode[] {
  return events.flatMap((event) => (event.kind === "warning" ? [event.code] : []));
}
