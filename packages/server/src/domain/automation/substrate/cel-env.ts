// domain/automation/substrate/cel-env — build the LIVE CEL activation for a dispatch (02 §1). Where the
// dry-run runs over an empty/host-supplied env, this reads the REAL planes for a firing rule: the chat's
// runtime fold cache (`vars`) + config-plane picks (`choice`) through the injected chat ops, the rule AUTHOR's
// per-user globals (never the triggering member's namespace — 02 §4), the narrow chat projection, and the
// once-per-dispatch clock. The resolved `event` fact rides `event`. The predicate then evaluates via the
// dry-run's `evaluatePredicate` (one CEL path for test + live).

import type { AutomationCelEnv, TriggerFact } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { AutomationOps } from "../contract/ops.ts";
import { countChatMessages } from "../persistence/canon-reads.ts";
import { listGlobalVariables } from "../persistence/queries.ts";
import { nowFields } from "./dry-run.ts";

/** The author's per-user globals as the CEL `global` map (02 §4). */
export async function authorGlobals(db: Db, authorUserId: UserId): Promise<Record<string, string>> {
  const rows = await listGlobalVariables(db, authorUserId);
  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.key] = row.value;
  }
  return out;
}

/** Build the live CEL activation for a rule dispatch. `chatId` is the RULE's chat (a domain-bus event has no
 *  chat of its own — the rule's chat supplies vars/choice/messageCount). */
export async function buildCelEnv(args: {
  readonly ops: AutomationOps;
  readonly db: Db;
  readonly authorUserId: UserId;
  readonly chatId: ChatId;
  readonly fact: TriggerFact;
  readonly nowMs: number;
}): Promise<AutomationCelEnv> {
  const { ops, db, authorUserId, chatId, fact, nowMs } = args;
  const [vars, choice, global, messageCount] = await Promise.all([
    ops.chat.readVariables(chatId),
    ops.chat.readChoicePicks(chatId),
    authorGlobals(db, authorUserId),
    countChatMessages(db, chatId),
  ]);
  return { event: fact, vars, choice, global, chat: { id: chatId, messageCount }, now: nowFields(nowMs) };
}
