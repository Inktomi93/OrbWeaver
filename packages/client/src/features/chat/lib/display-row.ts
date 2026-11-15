// The display pass's per-row input, read off the row's own data and never off its rendered text: the author
// stamps, the target, the depth, and the room's present human seats an author scope reads.
//
// DEPTH counts the transcript's rows from the newest: 0 is the newest, and the count admits only rows that would
// reach the model, so a system row, a row hidden from the AI and a kind the prompt leaves out (`PROMPT_KINDS`)
// take no depth (undefined), which a depth-bounded script reads as "no position" and passes. A row the prompt's
// compaction summary covers still counts here: it is older than every uncovered row, so no uncovered row's depth
// differs from the prompt's. The live ghost counts where it sits: at the tail it is 0 and the rows
// above count on from 1, so the committed reply keeps the ghost's depth and its cached display answer; a swipe's
// ghost takes its target's slot and depth. A transcript whose loaded pages do not reach the live tail (an anchored
// window, or pages still catching up) cannot count from the newest row, so its settled rows take no depth rather
// than a wrong one.

import type { MessageView } from "@orb/contracts/chat";
import { PROMPT_KINDS } from "@orb/contracts/chat";
import type { CharacterId, MessageId } from "@orb/kit/ids";
import type { MessageKind } from "@orb/kit/message-author";
import type { RegexRowStamps } from "@orb/kit/regex";
import { messageTargetOf } from "@orb/kit/regex";
// The LEAF, not the `#lib` barrel, for the reason `message-render-context.ts` states.
import type { DisplayRowCall } from "#src/lib/message-render.ts";
import type { TranscriptEdges } from "./move-neighbours.ts";

type StampedRow = Pick<MessageView, "role" | "kind" | "authorUserId" | "characterId" | "personaId">;

const REASONING_TARGET = "REASONING" satisfies DisplayRowCall["target"];
const SYSTEM_ROLE = "system" satisfies MessageView["role"];
type DepthItem = { readonly kind: "message"; readonly view: Pick<MessageView, "id" | "role" | "kind" | "excludedFromPrompt"> } | { readonly kind: "ghost" };

/** Each row's display depth, the settled rows by id and the live ghost apart. A row the count skips has no entry. */
export interface DisplayDepths {
  readonly rows: ReadonlyMap<MessageId, number>;
  readonly ghost: number | undefined;
}

function stampsOf(message: StampedRow): RegexRowStamps {
  return { role: message.role, kind: message.kind, authorUserId: message.authorUserId, characterId: message.characterId, personaId: message.personaId };
}

/** The display call over a settled row's body. */
export function bodyDisplayRow(message: StampedRow, depth: number | undefined): DisplayRowCall {
  return { target: messageTargetOf(message), row: stampsOf(message), depth };
}

/** The display call over a settled row's reasoning block, which is its own target. */
export function reasoningDisplayRow(message: StampedRow, depth: number | undefined): DisplayRowCall {
  return { target: REASONING_TARGET, row: stampsOf(message), depth };
}

/** The stamps of the reply the live ghost will commit as: always the AI side, voiced by the turn's speaker. */
export function ghostStamps(kind: MessageKind, characterId: CharacterId | null): RegexRowStamps {
  return { role: "assistant", kind, authorUserId: null, characterId, personaId: null };
}

/** Each row's display depth over the merged item list, newest last; see the file header for what the count admits. */
export function displayDepthsOf(items: readonly DepthItem[], edges: Pick<TranscriptEdges, "later" | "settling">): DisplayDepths {
  const reachesTail = !(edges.later || edges.settling);
  const rows = new Map<MessageId, number>();
  let ghost: number | undefined;
  let next = 0;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item === undefined) {
      continue;
    }
    // The ghost is the newest row at the tail even when the pages above it stop short.
    const counted = reachesTail || (item.kind === "ghost" && index === items.length - 1);
    if (item.kind === "ghost") {
      ghost = counted ? next : undefined;
      next += 1;
      continue;
    }
    if (!counted || item.view.role === SYSTEM_ROLE || item.view.excludedFromPrompt || !PROMPT_KINDS.includes(item.view.kind)) {
      continue;
    }
    rows.set(item.view.id, next);
    next += 1;
  }
  return { rows, ghost };
}
