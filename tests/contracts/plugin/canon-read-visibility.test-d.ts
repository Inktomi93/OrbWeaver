// The plugin canon read takes chat's whole visibility answer, which only chat's resolver mints: a non-member
// branch or a defaulted floor has no value to pass.
// @subject packages/contracts/src/plugin/owner-reads.ts
// @subject packages/contracts/src/chat/owner-ops.ts
import type { HistoryFloorSeq, ResolveViewerVisibility } from "@orb/contracts/chat";
import type { PluginChatReads } from "@orb/contracts/plugin";
import { expectTypeOf } from "vitest";

type ReadOptions = Parameters<PluginChatReads["listMessages"]>[1];
type Resolved = Awaited<ReturnType<ResolveViewerVisibility>>;
interface HandBuilt {
  readonly role: "member";
  readonly historyFloorSeq: HistoryFloorSeq;
  readonly readsHidden: false;
}

// A present member's resolved answer reads.
expectTypeOf<{ readonly visibility: NonNullable<Resolved> }>().toExtend<ReadOptions>();
// @ts-expect-error The resolver's non-member answer is `null`, and the read has no spelling for it.
expectTypeOf<{ readonly visibility: Resolved }>().toExtend<ReadOptions>();
// @ts-expect-error A hand-built answer with a defaulted floor is not a minted visibility.
expectTypeOf<{ readonly visibility: HandBuilt }>().toExtend<ReadOptions>();
// @ts-expect-error The floor and the hidden-content verdict no longer travel as loose fields.
expectTypeOf<{ readonly floorSeq: HistoryFloorSeq; readonly readsHidden: boolean }>().toExtend<ReadOptions>();
