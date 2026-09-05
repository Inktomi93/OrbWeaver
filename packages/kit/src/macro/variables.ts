// kit/macro/variables — the runtime variable delta model (D46). The macro mutation handlers record their
// mutations here as ordered `VarOp`s; the chat domain persists that log per message-variant and REPLAYS it
// (`foldVarOps`) along the selected-variant chain to derive the current runtime state — derive-don't-stamp,
// so a swipe/fork rewinds by re-folding (avoids the ST swipe-clobber issue #3263). `applyVarOp` is the ONE home for
// mutation semantics: BOTH the live handlers (registry.ts) and the fold call it, so record-time and
// replay-time can never diverge.

import type { MacroEnv, VarOp } from "./types.ts";

const DECIMAL_RADIX = 10;

/** THE TWO OWN-KEY ACCESSORS for a string-keyed variable plane, and the reason they exist (#1564).
 *
 *  A variable key is validated for LENGTH and nothing else, at every door: the `{{setvar}}` macro, the
 *  automation `set_variable` arm, the plugin bridge. So `__proto__` is a legal variable name — and on a plane
 *  that does not already own that key, plain property syntax silently does the wrong thing BOTH ways:
 *    • `plane[key] = value` hits the SETTER inherited from `Object.prototype` and creates NO own property.
 *      The write reports success and the value is gone — including out of `Object.entries`/`JSON.stringify`,
 *      so a `set` never reaches `chats.runtime_variables` at all.
 *    • `plane[key]` returns `Object.prototype` — an OBJECT where every caller expects a string, which is how
 *      a `.trim()` downstream becomes a crash instead of a value.
 *  `defineProperty` and `Object.hasOwn` are correct for every key, reserved or not, so these are the plane's
 *  accessors and property syntax is not used on it anywhere. (`{{hasvar}}` has always used `Object.hasOwn`,
 *  which is exactly why `hasvar::__proto__` said "false" while `getvar::__proto__` said "[object Object]".)
 *
 *  They are exported because the plane has readers and writers OUTSIDE this engine — the automation arm
 *  executors and the analysis vars route mirror onto the same in-memory map — and a second spelling of this
 *  rule is how one of them drifts back. */
// `NoInfer` on the value is what keeps the PLANE the inference source: without it a `string` value narrows
// `T` and a `Record<string, unknown>` plane (`MacroEnv`) stops being assignable.
export function setVarKey<T>(plane: Record<string, T>, key: string, value: NoInfer<T>): void {
  Object.defineProperty(plane, key, { value, writable: true, enumerable: true, configurable: true });
}

export function readVarKey<T>(plane: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(plane, key) ? plane[key] : undefined;
}

/** Apply one {@link VarOp} to `env` IN PLACE — the single source of runtime-variable mutation semantics
 *  (parse-or-zero inc/dec, string-concat add). Every read and write goes through the own-key accessors
 *  above; the parse-or-zero coercion itself is untouched (its own question is #1557). */
export function applyVarOp(env: MacroEnv, op: VarOp): void {
  switch (op.op) {
    case "set":
      setVarKey(env, op.key, op.value);
      break;
    case "add":
      setVarKey(env, op.key, `${String(readVarKey(env, op.key) ?? "")}${op.value}`);
      break;
    case "inc":
      setVarKey(env, op.key, String((Number.parseInt(String(readVarKey(env, op.key) ?? "0"), DECIMAL_RADIX) || 0) + 1));
      break;
    case "dec":
      setVarKey(env, op.key, String((Number.parseInt(String(readVarKey(env, op.key) ?? "0"), DECIMAL_RADIX) || 0) - 1));
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
  // `fromEntries` DEFINES each property, so a `__proto__` key that survived the fold above survives the
  // stringification too (#1564) — a loop of `out[key] = …` dropped it here even when the env held it, which
  // is the second half of the same hole and the one that reaches `chats.runtime_variables`.
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, String(value ?? "")]));
}
