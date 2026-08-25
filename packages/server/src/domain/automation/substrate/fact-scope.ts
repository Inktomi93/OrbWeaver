// domain/automation/substrate/fact-scope — the ONE reading of "which domain row does this CHAT-LESS fact
// name?", and therefore the one home of the ownership question two independent consumers ask about it:
//
//   • the PLUGIN fan-out's visibility gate — may this installer SEE this fact? (`substrate/plugin-subscribers`)
//   • the OWNER-GLOBAL rule gate — may this author's chat-less rule ACT on this fact? (`engine/dispatch`)
//
// They are different questions with the same answer shape, and they MUST agree, which is why the mapping
// from a fact to its subject lives here rather than twice. The domain bus is a single global firehose: every
// user's character imports, persona edits and book writes flow through it, and `loadEnabledDomainRules`
// matches enabled domain rules ACROSS every owner. So without this gate one author's owner-global rule would
// fire on ANOTHER user's card import — spending the first author's model budget to illustrate a stranger's
// character into the first author's own gallery. The chat lane never had this exposure (a chat rule's
// authority is re-checked against that room's roster), so the gate arrives WITH the global lane.
//
// A CHAT-SCOPED fact returns `null` here and is NOT this module's business: its scope is a room, answered by
// membership/host authority in `substrate/authority.ts`.

import type { TriggerFact } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { FactSubject } from "../contract/ops.ts";
import { isDomainRowOwnedBy } from "../persistence/canon-reads.ts";

/** The row this fact names, or `null` when it names none (a chat-scoped fact, or a domain event whose
 *  payload carries no owned row).
 *
 *  EXHAUSTIVE BY FIELD, not by `fact.type`: the fact shape is the resolver's projection and the id-bearing
 *  fields ARE the vocabulary (`substrate/fact-resolver.ts`'s `FACT_SHAPE` table is what fills them). A new
 *  domain trigger that carries an owned row adds a field there and an arm here — and until it does, it
 *  answers `null`, which both consumers read as FAIL-CLOSED. */
function chatLessFactSubject(fact: TriggerFact): FactSubject | null {
  if (fact.chatId !== null) {
    return null;
  }
  if (fact.character !== undefined) {
    return { kind: "character", id: fact.character.id };
  }
  if (fact.assetId !== undefined) {
    return { kind: "asset", id: fact.assetId };
  }
  if (fact.personaId !== undefined) {
    return { kind: "persona", id: fact.personaId };
  }
  if (fact.worldBookId !== undefined) {
    return { kind: "worldBook", id: fact.worldBookId };
  }
  return null;
}

/** Does `userId` OWN the row this chat-less fact names? Fail-CLOSED on a fact that names none — a rule or a
 *  subscriber may only act on a chat-less fact it can be shown to own, and "I could not identify a subject"
 *  is not ownership. */
export async function ownsFactSubject(db: Db, fact: TriggerFact, userId: UserId): Promise<boolean> {
  const subject = chatLessFactSubject(fact);
  if (subject === null) {
    return false;
  }
  return await isDomainRowOwnedBy(db, subject.kind, subject.id, userId);
}
