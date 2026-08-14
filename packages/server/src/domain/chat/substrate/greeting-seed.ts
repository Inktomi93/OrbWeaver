// domain/chat/substrate/greeting-seed — the ONE builder for VERBATIM greeting canon rows.
//
// A "greeting" is a character's card greeting committed as a plain assistant slot: no generation, no
// economics, one variant. Two verbs seed them and they must agree byte-for-byte, so the row shape lives here
// rather than twice:
//   • `verbs/start-chat.ts` — the founding cast's greetings, at seq 1..N inside the creation batch;
//   • `verbs/roster.ts` — a character ADDED while the greeting window is still open (F6,
//     chat-creation-draft-mode-replacement.md §4.8), at the canon head.
//
// FLAG[greeting-macro]: the text is seeded RAW. Identity macros stay per-view (resolved at read against the
// character + the chat anchor persona); volatile macros bake at the first user turn
// (`freezeGreetingVolatiles`, verbs/turn.ts) — which is also the instant the greeting WINDOW closes, so a
// row seeded through here is always still malleable at the moment it lands.
//
// Determinism: every id and timestamp is caller-stamped (the `canon-write` rule) — no ambient mint here.

import type { MessageView } from "@orb/contracts/chat";
import type { BatchStmt } from "@orb/db/kit";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import { buildCommittedMessageView, insertCanonMessageStatements } from "../persistence/canon-write.ts";

/** One character's resolved greeting text. An empty/whitespace text seeds NO row (a cleared greeting). */
interface GreetingText {
  readonly characterId: CharacterId;
  readonly text: string;
}

interface GreetingSeedArgs {
  readonly chatId: ChatId;
  readonly now: number;
  /** The canon head to append AFTER — the first seeded row lands at `startSeq + 1`. 0 for a founding room. */
  readonly startSeq: number;
  readonly greetings: readonly GreetingText[];
}

/** Build the verbatim greeting canon statements (+ their committed views), oldest-first from `startSeq + 1`.
 *  A character with an empty greeting is SKIPPED — it consumes no seq, so a cleared greeting leaves no gap. */
export function buildGreetingSeed(ctx: ChatContext, args: GreetingSeedArgs): { stmts: BatchStmt[]; views: MessageView[] } {
  const stmts: BatchStmt[] = [];
  const views: MessageView[] = [];
  let seq = args.startSeq;
  for (const g of args.greetings) {
    if (g.text.trim().length === 0) {
      continue;
    }
    seq += 1;
    const params = {
      messageId: ctx.newMessageId(),
      variantId: ctx.newMessageVariantId(),
      chatId: args.chatId,
      seq,
      role: "assistant" as const,
      characterId: g.characterId,
      now: args.now,
      variant: { content: g.text },
    };
    stmts.push(...insertCanonMessageStatements(ctx.db, params));
    views.push(buildCommittedMessageView(params));
  }
  return { stmts, views };
}
