// The chat-memory subsystem's structured-log sink. Foundation sits below domain/chat, so this sink cannot
// import the domain's MemoryLogEntry; it takes a foundation-local MemoryLogRecord shape (only `event` is
// required), and the chat memory `log` op passes its concrete entry in — structurally assignable.

import type { Logger, MemoryLogRecord } from "./contract/logging.ts";
import { getLog } from "./logger.ts";

/** Record a memory-subsystem event into the shared pino log stream + ring, tagged `memory: true`, through the
 *  request's logger or else the root's `base`. Never throws — a log call must not break the memory pipeline
 *  that fired it. */
export function recordMemoryLog(record: MemoryLogRecord, base: Logger): void {
  getLog(base).debug({ memory: true, ...record }, record.event);
}
