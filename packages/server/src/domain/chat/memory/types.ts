// domain/chat/memory/types — the subsystem's type surface. The
// declarations live in `../contract/memory` (the `types-in-contract` one-home gate); this conventional-slot
// file RE-EXPORTS them so every `memory/` file imports its types from `./types` / `../types` (the connection/
// context.ts re-export precedent). No declaration here — re-export only.

export type {
  BlockSpan,
  DigestRow,
  MemoryConfig,
  MemoryLogEntry,
  MemoryPassCounts,
  MemoryRecallInputs,
  MemoryRecallTrace,
  MemoryScope,
  MsgRow,
  ParsedDigest,
  ResolvedMemoryConfig,
  WitnessInterval,
} from "../contract/memory";
