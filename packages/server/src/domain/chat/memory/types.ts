// domain/chat/memory/types — the subsystem's type surface. The
// declarations live in `../contract/memory` (the `types-in-contract` one-home gate); this conventional-slot
// file RE-EXPORTS them so every `memory/` file imports its types from `./types` / `../types` (the connection/
// context.ts re-export precedent). `MemoryLogEntry` uses a narrow contract re-export so its test-anchored keep
// marker does not exempt the entire organized re-export block from production Knip.

export type {
  BlockSpan,
  DigestRow,
  MemoryConfig,
  MemoryEmbedSpace,
  MemoryPassCounts,
  MemoryRecallFilter,
  MemoryRecallRecord,
  MemoryRecallRecorder,
  MemoryRecallResult,
  MemoryRecallWarningEpisode,
  MemoryScope,
  MsgRow,
  ParsedDigest,
  ResolvedMemoryConfig,
  SegmentChunk,
  SegmentPassCounts,
  SummarizerBudget,
  WitnessInterval,
} from "../contract/memory.ts";

/** @public Test-anchored module surface; focused tests pin this production-local behavior. */
export type { MemoryLogEntry } from "../contract/memory-log-entry.ts";
