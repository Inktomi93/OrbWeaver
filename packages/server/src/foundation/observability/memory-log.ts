// foundation/observability/memory-log — the chat-memory subsystem's structured-log SINK (PD-72). The
// memory build/recall pipeline emits diagnostic events (`memory.build`, `memory.recall`, …) that were
// logged via an INLINE `getLog().debug({ memory: entry }, entry.event)` closure at the composition root
// (entry/compose/chat.ts) — a dedicated sink never existed. This is it: the same thin tagged-`getLog()`
// shape `recordClientError` (`clientError: true`) and `securityEvent` (`security: true`) already use, so
// memory events land in the SAME pino stream + ring the rest of observability feeds, greppable/filterable
// apart via the `memory: true` tag and their `event` string. `debug` level (memory logs are verbose
// diagnostics, not warnings) — the pino ring + `/api/_debug/logs` pick them up for free.
//
// Domain-agnostic BY THE CAKE: `foundation` sits BELOW `domain/chat`, so this sink cannot import
// `MemoryLogEntry` (an upward dep). It takes a foundation-local `MemoryLogRecord` shape (the ONE required
// field is `event`); the chat memory `log` op passes its concrete `MemoryLogEntry` in — structurally
// assignable — exactly as `recordClientError` owns `ClientErrorReport` rather than a transport type.

import { getLog } from "./logger";

/** A memory-subsystem structured log record. Foundation-local + domain-agnostic (see the header): the ONE
 *  required field is `event` (the greppable tag, e.g. `memory.build`/`memory.recall`); everything else the
 *  memory pipeline attaches rides through as structured fields. */
export interface MemoryLogRecord {
  readonly event: string;
  readonly [field: string]: unknown;
}

/**
 * Record a memory-subsystem event into the shared pino log stream + ring, tagged `memory: true` for
 * grep/filter (mirrors `recordClientError`'s `clientError: true` and `securityEvent`'s `security: true`).
 * `event` is the log message; never throws — a log call must not break the memory pipeline that fired it.
 */
export function recordMemoryLog(record: MemoryLogRecord): void {
  getLog().debug({ memory: true, ...record }, record.event);
}
