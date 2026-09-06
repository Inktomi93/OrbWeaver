// kit/macro/variables — the runtime variable delta model (D46). The macro mutation handlers record their
// mutations here as ordered `VarOp`s; the chat domain persists that log per message-variant and REPLAYS it
// (`foldVarOps`) along the selected-variant chain to derive the current runtime state — derive-don't-stamp,
// so a swipe/fork rewinds by re-folding (kills ST's swipe-clobber #3263). `applyVarOp` is the ONE home for
// mutation semantics: BOTH the live handlers (registry.ts) and the fold call it, so record-time and
// replay-time can never diverge.

import type { MacroEnv, VarOp } from "./types.ts";

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

/** A COMPLETE DECIMAL integer spelling, or null — the ONE parser for both the macro engine's `inc`/`dec` and
 *  the automation `set_variable` arm (`arm-executors.ts` imports it; its former local copy was retired at the
 *  #1557 fold, 2026-09-07). Minted for #1420, aligned here by OWNER RULING (#1557, 2026-09-05): one engine, one behavior. `Number.parseInt` is a PREFIX parser (`"5cats"` → 5, `"3.9"` → 3) that silently
 *  applied a value the author never wrote to a counter later predicates read; a bare `Number()` is too
 *  generous the OTHER way (`"0x10"` → 16, `"1e3"` → 1000). Leading/trailing whitespace is trimmed (a
 *  rendered template legitimately carries it) but the empty string is not a zero — "nothing rendered" is a
 *  mistake to name, not a value to invent. */
const DECIMAL_INTEGER_RE = /^[+-]?\d+$/;

export function parseCompleteInteger(text: string): number | null {
  const trimmed = text.trim();
  if (!DECIMAL_INTEGER_RE.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/** Apply one {@link VarOp} to `env` IN PLACE — the single source of runtime-variable mutation semantics.
 *  Every read and write goes through the own-key accessors above. Returns whether the op actually mutated
 *  the env: `set`/`add`/`delete` always succeed; `inc`/`dec` REFUSE (leave `env` untouched) when the
 *  variable's CURRENT value is not a complete integer (#1557, OWNER RULING: align with #1420's
 *  complete-bounded-integer refusal — a non-numeric counter used to silently rebase to 0 instead of
 *  surfacing the corruption). An ABSENT variable is still a fresh counter at 0, not a refusal: the read
 *  below defaults to `"0"` before the parse runs. The refusal is UNIFORM for both callers — the live
 *  handlers (registry.ts, which turn a `false` into a visible `MacroDiagnostic`) and `foldVarOps`'s replay
 *  (which has no diagnostics sink and simply leaves the stored value unchanged) — so record-time and
 *  replay-time can never diverge on which values are legal counters. */
export function applyVarOp(env: MacroEnv, op: VarOp): boolean {
  switch (op.op) {
    case "set":
      setVarKey(env, op.key, op.value);
      return true;
    case "add":
      setVarKey(env, op.key, `${String(readVarKey(env, op.key) ?? "")}${op.value}`);
      return true;
    case "inc":
    case "dec": {
      const current = parseCompleteInteger(String(readVarKey(env, op.key) ?? "0"));
      if (current === null) {
        return false;
      }
      setVarKey(env, op.key, String(op.op === "inc" ? current + 1 : current - 1));
      return true;
    }
    case "delete":
      // `delete` operator is banned by house style; `Reflect.deleteProperty` removes the own property.
      Reflect.deleteProperty(env, op.key);
      return true;
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
