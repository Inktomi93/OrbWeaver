// domain/chat/assembly/history-regex — THE PROMPT PASS OVER THE HISTORY, the server's ephemeral regex leg.
//
// WHY IT EXISTS. The save pass rewrites text before it is stored: the composer draft (`assembly/context.ts`)
// and the reply (`engine/pipeline.ts`), so what it produces IS canon. A script on the prompt pass changes only
// the copy the model reads, "strip this from the prompt but keep it in the log": this leg runs it over the
// ASSEMBLED history, hands the transformed copy to SHAPE, and never touches a row.
//
// DEPTH AND AUTHOR, as SillyTavern counts them. Depth 0 is the newest row in the prompt history and counts
// backwards; on a continue the reply being extended is the newest row and sits at -1. The history here is the
// rows that enter the prompt (no system, hidden, compaction-covered or comment row), which is SillyTavern's own
// count over the non-system chat. Each row's target is its role's (`messageTargetOf`: a user row is
// `USER_INPUT`, every other row `AI_OUTPUT`), and an author scope reads the row's stamps against the room's
// present seats.
//
// EPHEMERALITY IS STRUCTURAL, NOT A PROMISE. This module is pure: it takes rows, returns NEW rows, holds no
// `Db`, and its only caller (`assembly/shape.ts::toShapeCanon`) already builds throwaway `CanonRow`s from
// the loaded `MessageView`s. Nothing it produces is written anywhere — the four persisted planes
// (`messages.content`, the compaction digest, an export bundle, a fork's copied rows) all read the ROW, and
// the row never sees this output.
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
// the conversation has run. Eviction does not catch a script that stays just under the watchdog on every row, so
// the whole history also shares one pass budget that grows with the row count (`openRegexPass`); past it, every
// remaining script is skipped. Every eviction and skip is reported through `onScriptFailure` (already a logged
// warn at both call sites), so the log cannot disagree with what applied.

import type { RegexDepth, RegexPass, RegexRowStamps, RegexScriptInput } from "@orb/kit/regex";
import { messageTargetOf, regexScriptRendersMacros } from "@orb/kit/regex";
import { sha256Hex } from "#primitives/content-hash";
import type { PromptHistoryRegexEnv } from "../contract/regex.ts";

/** The minimum a row must expose for the leg to rewrite it — deliberately structural, so `CanonRow` (which
 *  is file-local to `assembly/shape.ts`) does not have to be exported to be transformed here. */
interface TextRow {
  readonly content: string;
}

const NO_WINDOW = -1;
const PROMPT_PASS = "prompt" satisfies RegexPass;

// The deepest depth at which a scope can still flip a row in or out as the history grows. Depth only grows, so a
// row past a finite `max` stays out forever, and a row at or past `min` with no `max` stays in forever.
function unsettledThrough(scope: RegexDepth | undefined): number {
  if (scope === undefined) {
    return NO_WINDOW;
  }
  return scope.max ?? scope.min - 1;
}

/**
 * Apply the prompt pass over the assembled history. `rows` are in canon order (oldest first) and `stamps[i]` is
 * the stamps of `rows[i]`; a row's DEPTH is its distance from the end, less one on a continue.
 *
 * Returns a NEW array of NEW rows; `rows` and its elements are never mutated (the ephemerality pin asserts
 * exactly this). When no supplied script runs on this leg the ORIGINAL array is returned untouched, so a
 * chat with no history scripts is byte-identical and allocation-identical to before the leg existed.
 *
 * A row a depth-scoped script can still rewrite on a later turn (it will enter or leave the scope) comes back
 * with `depthVolatile`, so SHAPE pins the prompt cache above it, as it does above a depth-N injection.
 */
export function applyPromptHistoryRegex<T extends TextRow>(
  rows: readonly T[],
  stamps: readonly RegexRowStamps[],
  env: PromptHistoryRegexEnv,
): readonly (T | (T & { readonly depthVolatile: true }))[] {
  const candidates = env.scripts.filter((script) => script.enabled && script.passes.includes(PROMPT_PASS));
  if (candidates.length === 0 || rows.length === 0) {
    return rows;
  }

  const memoKey = env.memo === null || candidates.some(regexScriptRendersMacros) ? null : promptHistoryKey(rows, stamps, candidates, env);
  const remembered = memoKey === null ? undefined : env.memo?.read(memoKey);
  const out = remembered === undefined ? runPromptPass(rows, stamps, candidates, env) : rows.map((row, index) => withContent(row, remembered[index]));
  if (memoKey !== null && remembered === undefined) {
    env.memo?.write(
      memoKey,
      out.map(({ content }) => content),
    );
  }
  const window = Math.max(NO_WINDOW, ...candidates.map((script) => unsettledThrough(script.depth)));
  return window === NO_WINDOW ? out : out.map((row, index) => (depthOf(env, rows.length, index) <= window ? { ...row, depthVolatile: true as const } : row));
}

// THE MEMO (a repeated read of an unchanged room). With no macro in any script, the leg's output is a function of the
// rows' text, their stamps, the scripts, the room's seats and whether the build continues; the key digests all of
// them, so an edit, a new row or a script change misses. A macro can read the clock or the room's variables, which
// the key cannot see, so a set that renders one always runs.
function promptHistoryKey(
  rows: readonly TextRow[],
  stamps: readonly RegexRowStamps[],
  candidates: readonly RegexScriptInput[],
  env: PromptHistoryRegexEnv,
): string {
  return sha256Hex(JSON.stringify([candidates, env.room, env.continuing, stamps, rows.map(({ content }) => content)]));
}

function withContent<T extends TextRow>(row: T, content: string | undefined): T {
  return content === undefined || content === row.content ? row : { ...row, content };
}

const depthOf = (env: PromptHistoryRegexEnv, rowCount: number, index: number): number => rowCount - 1 - index - (env.continuing ? 1 : 0);

function runPromptPass<T extends TextRow>(
  rows: readonly T[],
  stamps: readonly RegexRowStamps[],
  candidates: readonly RegexScriptInput[],
  env: PromptHistoryRegexEnv,
): T[] {
  // Eviction set (see the header's ReDoS posture): a script that fails once is dropped for the rest of the
  // pass, so history length can never multiply a watchdog trip.
  const evicted = new Set<RegexScriptInput>();
  const onScriptFailure = (err: unknown, script: RegexScriptInput): void => {
    evicted.add(script);
    env.onScriptFailure(err, script);
  };

  // One pass for the whole history, its budget sized by the row count (D53).
  const pass = env.openRegexPass(rows.length);
  const out = [...rows];
  // NEWEST FIRST — the same direction depth counts, so the rows a reader cares about most are transformed
  // before any eviction can shrink the working set.
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = out[index];
    const stamp = stamps[index];
    if (row === undefined || stamp === undefined || row.content.length === 0) {
      continue;
    }
    const live = candidates.filter((script) => !evicted.has(script));
    if (live.length === 0) {
      break;
    }
    const content = pass.execute({
      text: row.content,
      scripts: live,
      call: { pass: PROMPT_PASS, target: messageTargetOf(stamp), row: stamp, room: env.room, depth: depthOf(env, rows.length, index) },
      ctx: env.macroCtx,
      onScriptFailure,
    });
    if (content !== row.content) {
      out[index] = { ...row, content };
    }
  }
  return out;
}
