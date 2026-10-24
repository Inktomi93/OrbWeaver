// The prior exchange a speakerless generation reads, written through the native transcript import.

import type { TranscriptLine } from "@orb/testkit/node/composed";

// An owner line and one reply by the room's first seat, written by the native transcript import.
export function priorExchange(speakerHandle: string, reply: string): readonly TranscriptLine[] {
  return [
    { role: "user", content: "hello" },
    { role: "assistant", speakerHandle, content: reply },
  ];
}
