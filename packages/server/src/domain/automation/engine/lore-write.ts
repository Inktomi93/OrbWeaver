// domain/automation/engine/lore-write — THE ONE rule→world-info write belt (CC-D consumed, never forked).
// Extracted from the `insert_world_info_entry` executor at C1 so the `run_analysis` lore route and the arm
// ride the SAME enforcement set: the attach gate (the attachment IS the room's consent), the per-rule
// ≤64-entries-per-book cap, and the ruleId-namespaced title (the idempotency handle). THE ENFORCEMENT SET
// FOLLOWS THE ORIGIN by construction here — there is exactly one function that can move rule-authored bytes
// into a book, so a second path cannot quietly carry fewer belts. What DIFFERS per origin stays at the
// caller: the ARM renders its host-authored `contentTemplate` (host text is macro-legal); the ANALYSIS
// route `neutralizeMacros`-es model bytes and span-stamps its keys BEFORE they reach this belt (§2 law 7 —
// machine-authored text entering world-info's macro-execution plane is neutralized at the write boundary).

import type { RuleLoreWriteArgs, RuleLoreWriteOutcome } from "../contract/analysis.ts";
import type { ArmExecutorDeps } from "../contract/ops.ts";
import { isBookAttachedToChat, listRuleEntryTitles } from "../persistence/canon-reads.ts";

/** A rule's `insert_world_info_entry`/analysis-lore entries are title-namespaced by the ruleId so a
 *  re-upsert with the same key UPDATES its own prior entry and two rules never collide on one title. */
const AUTO_ENTRY_TITLE_PREFIX = "auto/";
/** The per-rule ≤64-entries-per-book cap — a looping inserter fills a book otherwise. */
const RULE_MAX_ENTRIES_PER_BOOK = 64;

/** The title a rule's lore write lands under (ruleId-namespaced idempotency handle). */
function ruleLoreTitle(ruleId: string, entryKey: string): string {
  return `${AUTO_ENTRY_TITLE_PREFIX}${ruleId}:${entryKey}`;
}

/** Apply one rule-origin lore write through ALL the belts. Re-checked at EVERY call — including a confirm
 *  that stashed its entries minutes ago: the attach gate and the cap answer for the room's state NOW, so a
 *  book detached (or filled) between fire and confirm refuses instead of writing on stale consent. */
export async function applyRuleLoreWrite(deps: Pick<ArmExecutorDeps, "db" | "ops">, args: RuleLoreWriteArgs): Promise<RuleLoreWriteOutcome> {
  // The book must be attached to the rule's chat — the attachment IS the room's consent.
  if (!(await isBookAttachedToChat(deps.db, args.chatId, args.bookId))) {
    return { ok: false, refused: `book ${args.bookId} is not attached to this chat` };
  }
  const owned = await listRuleEntryTitles(deps.db, args.bookId, `${AUTO_ENTRY_TITLE_PREFIX}${args.ruleId}:`);
  const titles = args.entries.map((entry) => ruleLoreTitle(args.ruleId, entry.entryKey));
  // A cap breach only counts NEW titles (an update of an existing title never grows the count).
  const netNew = new Set(titles.filter((title) => !owned.includes(title))).size;
  if (owned.length + netNew > RULE_MAX_ENTRIES_PER_BOOK) {
    return { ok: false, refused: `rule already owns ${RULE_MAX_ENTRIES_PER_BOOK} entries in book ${args.bookId}` };
  }
  await deps.ops.worldInfo.upsertEntries({
    authorUserId: args.authorUserId,
    bookId: args.bookId,
    entries: args.entries.map((entry, i) => ({
      title: titles[i] ?? ruleLoreTitle(args.ruleId, entry.entryKey),
      keys: [...entry.keys],
      content: entry.content,
    })),
  });
  return { ok: true };
}
