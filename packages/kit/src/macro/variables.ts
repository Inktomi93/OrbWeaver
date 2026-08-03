// kit/macro/variables — the runtime variable delta model (D46). The macro mutation handlers record their
// mutations here as ordered `VarOp`s; the chat domain persists that log per message-variant and REPLAYS it
// (`foldVarOps`) along the selected-variant chain to derive the current runtime state — derive-don't-stamp,
// so a swipe/fork rewinds by re-folding (kills ST's swipe-clobber #3263). `applyVarOp` is the ONE home for
// mutation semantics: BOTH the live handlers (registry.ts) and the fold call it, so record-time and
// replay-time can never diverge.

import type { MacroEnv, VarOp } from "./types.ts";

const DECIMAL_RADIX = 10;

/** Apply one {@link VarOp} to `env` IN PLACE — the single source of runtime-variable mutation semantics
 *  (parse-or-zero inc/dec, string-concat add). */
export function applyVarOp(env: MacroEnv, op: VarOp): void {
  switch (op.op) {
    case "set":
      env[op.key] = op.value;
      break;
    case "add":
      env[op.key] = `${String(env[op.key] ?? "")}${op.value}`;
      break;
    case "inc":
      env[op.key] = String((Number.parseInt(String(env[op.key] ?? "0"), DECIMAL_RADIX) || 0) + 1);
      break;
    case "dec":
      env[op.key] = String((Number.parseInt(String(env[op.key] ?? "0"), DECIMAL_RADIX) || 0) - 1);
      break;
    case "delete":
      // `delete` operator is banned by house style; `Reflect.deleteProperty` removes the own property.
      Reflect.deleteProperty(env, op.key);
      break;
    default: {
      const exhaustive: never = op;
      throw new Error(`unknown VarOp: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Fold ordered per-variant deltas (the message chain in `seq` order, each message's SELECTED variant)
 *  into the current runtime variable state. Pure — replays every op over a fresh env; the result is the
 *  string-valued cache (`Record<string,string>`) the chat materializes on `chats.runtime_variables`. */
export function foldVarOps(deltas: readonly (readonly VarOp[])[]): Record<string, string> {
  const env: MacroEnv = {};
  for (const delta of deltas) {
    for (const op of delta) {
      applyVarOp(env, op);
    }
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] = String(value ?? "");
  }
  return out;
}
