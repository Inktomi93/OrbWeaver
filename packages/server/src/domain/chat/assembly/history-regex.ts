// domain/chat/assembly/history-regex — THE PROMPT-BUILD HISTORY LEG (`PROMPT_HISTORY`), the one regex leg
// that is EPHEMERAL BY CONSTRUCTION.
//
// WHY IT EXISTS. Every other prompt-side leg runs at PERSIST time: `USER_INPUT` rewrites the composer draft
// before the row is written (`assembly/context.ts`), `AI_OUTPUT`/`REASONING` rewrite the reply before it is
// committed (`engine/pipeline.ts`). What those legs produce IS canon — which makes ST's oldest regex idiom,
// "strip this from the prompt but keep it in the log", unspellable here. This leg is that idiom: it runs
// over the ASSEMBLED history, hands the transformed copy to SHAPE, and never touches a row. It is also the
// only leg that HAS a depth axis — depth is a position in the assembled history, which no persist-time leg
// possesses (which is why D121-E's drop of the never-executed `minDepth`/`maxDepth` was correct, and why
// the semantic comes back HERE and only here).
//
// EPHEMERALITY IS STRUCTURAL, NOT A PROMISE. This module is pure: it takes rows, returns NEW rows, holds no
// `Db`, and its only caller (`assembly/shape.ts::toShapeCanon`) already builds throwaway `CanonRow`s from
// the loaded `MessageView`s. Nothing it produces is written anywhere — the four persisted planes
// (`messages.content`, the compaction digest, an export bundle, a fork's copied rows) all read the ROW, and
// the row never sees this output. The pins live in `tests/server/domain/chat/assembly/history-regex*`.
//
// THE ORDER, per D121-E: the row's own macros resolve FIRST (`renderHistoryMacros`, inside `toShapeCanon`),
// THEN this leg runs; the replacement TEMPLATE gets its own macro pass inside the executor and the captured
// history text splices in verbatim — so a model line containing `{{setvar::x::y}}` can no more mutate turn
// state on the way into the prompt than it can on the way into canon.
//
// THE REDOS POSTURE, stated. A history-wide pass is O(rows × scripts) regex executions where every other
// leg is O(1) — so the history length would be a ReDoS MULTIPLIER against the server's 50 ms per-call
// watchdog (200 rows × one catastrophic pattern = 10 s of watchdog on one turn). The cap is EVICTION: the
// first time a script fails (bad compile, or a watchdog timeout), it is dropped for the REST of the pass.
// A pathological pattern therefore costs ONE watchdog window per turn, not one per message, and the leg's
// worst case is bounded by the SCRIPT COUNT — which the library owner controls — rather than by how long
// the conversation has run. Every eviction is reported through `onScriptFailure` (already a logged warn at
// both call sites), so the log cannot disagree with what applied.

import type { RegexScriptInput } from "@orb/kit/regex";
import { executeRegexScripts, HISTORY_DEPTH_PLACEMENT } from "@orb/kit/regex";
import type { PromptHistoryRegexEnv } from "../contract/regex";

/** The minimum a row must expose for the leg to rewrite it — deliberately structural, so `CanonRow` (which
 *  is file-local to `assembly/shape.ts`) does not have to be exported to be transformed here. */
interface TextRow {
  readonly content: string;
}

/**
 * Apply the `PROMPT_HISTORY` leg over the assembled history. `rows` are in canon order (oldest first), so a
 * row's DEPTH is its distance from the end — index `rows.length - 1` is depth 0, the newest message.
 *
 * Returns a NEW array of NEW rows; `rows` and its elements are never mutated (the ephemerality pin asserts
 * exactly this). When no supplied script runs on this leg the ORIGINAL array is returned untouched, so a
 * chat with no history scripts is byte-identical and allocation-identical to before the leg existed.
 */
export function applyPromptHistoryRegex<T extends TextRow>(rows: readonly T[], env: PromptHistoryRegexEnv): readonly T[] {
  const candidates = env.scripts.filter((script) => script.enabled && script.placement.includes(HISTORY_DEPTH_PLACEMENT));
  if (candidates.length === 0 || rows.length === 0) {
    return rows;
  }

  // Eviction set (see the header's ReDoS posture): a script that fails once is dropped for the rest of the
  // pass, so history length can never multiply a watchdog trip.
  const evicted = new Set<RegexScriptInput>();
  const onScriptFailure = (err: unknown, script: RegexScriptInput): void => {
    evicted.add(script);
    env.onScriptFailure(err, script);
  };

  const out = [...rows];
  // NEWEST FIRST — the same direction depth counts, so the rows a reader cares about most are transformed
  // before any eviction can shrink the working set.
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = out[index];
    if (row === undefined || row.content.length === 0) {
      continue;
    }
    const live = candidates.filter((script) => !evicted.has(script));
    if (live.length === 0) {
      break;
    }
    const content = executeRegexScripts({
      text: row.content,
      scripts: live,
      placement: HISTORY_DEPTH_PLACEMENT,
      depth: rows.length - 1 - index,
      ctx: env.macroCtx,
      applyReplace: env.applyReplace,
      onScriptFailure,
    });
    if (content !== row.content) {
      out[index] = { ...row, content };
    }
  }
  return out;
}
