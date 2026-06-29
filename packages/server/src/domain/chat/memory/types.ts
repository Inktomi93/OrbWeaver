// domain/chat/memory/types — the subsystem's type surface (chat.md Part I §memory `types.ts`). The
// declarations live in `../contract/memory` (the `types-in-contract` one-home gate); this conventional-slot
// file RE-EXPORTS them so every `memory/` file imports its types from `./types` / `../types` (the connection/
// context.ts re-export precedent). No declaration here — re-export only.

export type {
  BlockSpan,
  DigestRow,
  MemoryBuildTrace,
  MemoryConfig,
  MemoryLog,
  MemoryLogEntry,
  MemoryPassCounts,
  MemoryRecallTrace,
  MemoryScope,
  MsgRow,
  ResolvedMemoryConfig,
  WitnessInterval,
} from "../contract/memory";
