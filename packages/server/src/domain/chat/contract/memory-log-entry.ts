// domain/chat/contract/memory-log-entry — narrow compatibility export for the memory subsystem's conventional
// `memory/types` surface. The declaration remains in `memory.ts`; this distinct module lets the production-Knip
// keep marker cover only `MemoryLogEntry`, not every type in the organized re-export block.

/** @public Test-anchored module surface; focused tests pin this production-local behavior. */
export type { MemoryLogEntry } from "./memory.ts";
