// domain/automation/substrate/cel-env — build the LIVE CEL activation for a dispatch. Where the
// dry-run runs over an empty/host-supplied env, this reads the REAL planes for a firing rule: the chat's
// runtime fold cache (`vars`) + config-plane picks (`choice`) through the injected chat ops, the rule AUTHOR's
// per-user globals (never the triggering member's namespace), the narrow chat projection, and the
// once-per-dispatch clock. The resolved `event` fact rides `event`. The predicate then evaluates via the
// dry-run's `evaluatePredicate` (one CEL path for test + live).

import type { AutomationCelEnv, TriggerFact } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { AutomationOps } from "../contract/ops.ts";
import { countChatMessages } from "../persistence/canon-reads.ts";
import { listGlobalVariables } from "../persistence/queries.ts";
import { nowFields } from "./dry-run.ts";

/** The author's per-user globals as the CEL `global` map. */
export async function authorGlobals(db: Db, authorUserId: UserId): Promise<Record<string, string>> {
  const rows = await listGlobalVariables(db, authorUserId);
  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.key] = row.value;
  }
  return out;
}

/** Build the live CEL activation for a rule dispatch. `chatId` is the RULE's chat (a domain-bus event has no
 *  chat of its own — the rule's chat supplies vars/choice/messageCount), or NULL for an owner-GLOBAL rule.
 *
 *  A GLOBAL RULE DOES THREE FEWER READS, and that is correctness before it is cost: there is no room whose
 *  variable fold, choice picks or message count could be read, so the chat plane is built EMPTY. It is also
 *  never BOUND — the binding builders omit the three chat-keyed roots entirely for a chat-less frame
 *  (`substrate/dry-run.ts::toCelBindings`, `substrate/macro-render.ts`), so nothing can read these empties and
 *  mistake them for a real quiet room. The fields exist only because `AutomationCelEnv` keeps them REQUIRED,
 *  which is the ruling that leaves every existing preset predicate and the cel-goldens vector untouched. */
export async function buildCelEnv(args: {
  readonly ops: AutomationOps;
  readonly db: Db;
  readonly authorUserId: UserId;
  readonly chatId: ChatId | null;
  readonly fact: TriggerFact;
  readonly nowMs: number;
}): Promise<AutomationCelEnv> {
  const { ops, db, authorUserId, chatId, fact, nowMs } = args;
  if (chatId === null) {
    const global = await authorGlobals(db, authorUserId);
    return { event: fact, vars: {}, choice: {}, global, chat: { id: "", messageCount: 0 }, now: nowFields(nowMs) };
  }
  const [vars, choice, global, messageCount] = await Promise.all([
    ops.chat.readVariables(chatId),
    ops.chat.readChoicePicks(chatId),
    authorGlobals(db, authorUserId),
    countChatMessages(db, chatId),
  ]);
  return { event: fact, vars, choice, global, chat: { id: chatId, messageCount }, now: nowFields(nowMs) };
}
