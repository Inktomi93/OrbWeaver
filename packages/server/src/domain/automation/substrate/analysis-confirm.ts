// domain/automation/substrate/analysis-confirm — the CONFIRM executor for the `{via:"analysis"}` payload
// arm (S5's confirm-routed outputs). Homed in substrate/ because the confirm VERB is its one caller and a
// verb reaches a named subsystem only through substrate/ (`domain-substrate-mediates-subsystems`); the
// engine half it mediates is the ONE lore belt (`engine/lore-write.ts` — the same attach gate + per-rule
// cap the `insert_world_info_entry` arm rides, re-checked at confirm time because consent may have moved
// since the card was raised).
//
// The acts arrive FULLY RESOLVED from the stash (model bytes neutralized, lore keys span-stamped) — nothing
// here renders or re-derives (§2 law 6: machine-authored content never re-enters a template pass), which is
// the whole reason this is not a `via:"arm"` stash of a synthesized arm (that path would macro-render model
// bytes at confirm). The WATERMARK advances here for a confirmed lore apply and ONLY here for the confirm
// class (§3-S5.5: advanced on successful apply; a dismissed/expired card leaves it unmoved so the next pass
// re-covers the span — the retryability contract, confirm-shaped).

import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import type { AnalysisConfirmAct } from "../contract/analysis.ts";
import type { AnalysisConfirmDeps, PendingSuggestion, RuleRow } from "../contract/ops.ts";
import { applyRuleLoreWrite } from "../engine/lore-write.ts";
import { advanceSettledWatermark, selectRuleState, upsertRuleState } from "../persistence/rule-state.ts";

/** Execute one CONFIRMED analysis act. Throws on refusal — the confirm verb maps it to `action_error`
 *  (errors-as-data at the verb, matching the stashed-arm path). */
export async function runAnalysisConfirm(deps: AnalysisConfirmDeps, pending: PendingSuggestion, rule: RuleRow, act: AnalysisConfirmAct): Promise<void> {
  const ruleId: AutomationRuleId = rule.id;
  const chatId: ChatId = pending.chatId;
  const authorUserId: UserId = rule.ownerId;
  switch (act.kind) {
    case "steer": {
      // Adopt the guidance VERBATIM (the slice bound is the write's — `upsertRuleState` owns it).
      const { state } = await selectRuleState(deps.db, ruleId);
      await upsertRuleState(deps.db, { ruleId, state, guidance: act.guidance, nowMs: deps.nowMs });
      return;
    }
    case "lore": {
      // The SAME belt the arm rides (attach gate + cap, re-checked NOW), then the watermark advance the
      // apply earns.
      const written = await applyRuleLoreWrite(deps, { authorUserId, chatId, ruleId, bookId: act.bookId, entries: act.entries });
      if (!written.ok) {
        throw new Error(written.refused);
      }
      // The watermark advance the apply earns, as ONE statement (#1418): the read-then-merge this used to
      // do could revert a concurrent pass's arc/twist bank, and it left a wider window between the
      // already-committed book write and the coverage record. `advanceSettledWatermark` touches exactly the
      // one JSON path, monotonically.
      await advanceSettledWatermark(deps.db, { ruleId, throughSeq: act.spanEnd, nowMs: deps.nowMs });
      return;
    }
    case "rewrite": {
      // C3 — the CONFIRM-ONLY op (never on `ops`, so no arm can reach it). The two pins travel with the act
      // and are re-checked INSIDE the chat verb against the room as it stands now: a swipe between ask and yes
      // refuses `superseded`, an edit refuses `stale`, and neither touches canon. Nothing renders here — the
      // bytes were neutralized at the stash (§2 law 7), and the write is a NEW VARIANT of the audited slot, so
      // the audited text survives as a swipe and the rewrite is revertible with the control the room has.
      await deps.applyProseRewrite({
        authorUserId,
        chatId,
        messageId: act.messageId,
        variantId: act.variantId,
        expectedContentHash: act.contentHash,
        content: act.content,
      });
      return;
    }
    case "suggestTurn": {
      // The same seam trigger_turn rides — cascade depth, initiator membership, and frozen host funding all
      // resolve INSIDE requestTurn; the author frame holds (§3-S4's identity law).
      await deps.ops.chat.requestTurn({ authorUserId, chatId, automationDepth: act.automationDepth, guided: act.steerText });
      return;
    }
    default: {
      const exhaustive: never = act;
      throw new Error(`unhandled analysis confirm act: ${JSON.stringify(exhaustive)}`);
    }
  }
}
