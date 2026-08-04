// infra/plugin-host/marshal — the guest↔host VALUE boundary (01 §1.2). Only JSON-safe primitives / arrays /
// plain objects and OPAQUE HANDLES cross; nothing live. `jsToHandle` builds a fresh guest handle from a host
// JS value (the membrane host-fn RESULT direction) — the mirror of quickjs-emscripten's `ctx.dump` (the guest
// ARG direction). Every intermediate handle is disposed as it is attached (the ownership discipline the runtime
// demands); the returned top handle is the caller's to attach + dispose. Non-JSON inputs (functions, symbols,
// bigint, undefined) collapse to `null` — the membrane never leaks a live host reference into the guest.

import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";

/** Marshal a JSON-safe host value into a guest handle. Recursive; disposes every child after `setProp`/array
 *  set so only the returned top handle is outstanding. `undefined`/functions/symbols → guest `null` (a host
 *  reference must never cross the membrane as anything but inert data). */
export function jsToHandle(ctx: QuickJSContext, value: unknown): QuickJSHandle {
  if (value === null || value === undefined) {
    return ctx.null;
  }
  switch (typeof value) {
    case "boolean":
      return value ? ctx.true : ctx.false;
    case "number":
      return ctx.newNumber(value);
    case "string":
      return ctx.newString(value);
    case "object":
      return Array.isArray(value) ? arrayToHandle(ctx, value) : objectToHandle(ctx, value as Record<string, unknown>);
    case "bigint":
    case "symbol":
    case "undefined":
    case "function":
      break; // fall to the inert collapse below — enumerated (not a `default`) so the boundary is explicit.
  }
  // Non-JSON typeofs collapse to inert `null` — a function/symbol/bigint/undefined must never cross the membrane
  // as anything but dead data (the security boundary; `undefined` is also short-circuited above).
  return ctx.null;
}

function arrayToHandle(ctx: QuickJSContext, value: readonly unknown[]): QuickJSHandle {
  const arr = ctx.newArray();
  for (let i = 0; i < value.length; i++) {
    // Per-iteration `using`: the child is freed at the end of THIS iteration, exactly where the hand-written
    // `child.dispose()` sat, and a throw from a deeply-nested `setProp` no longer strands it. `arr` stays
    // hand-owned — it is the return.
    using child = jsToHandle(ctx, value[i]);
    ctx.setProp(arr, i, child);
  }
  return arr;
}

function objectToHandle(ctx: QuickJSContext, value: Record<string, unknown>): QuickJSHandle {
  const obj = ctx.newObject();
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) {
      continue; // JSON drops undefined-valued keys — mirror it (never a `null` where the source had a hole).
    }
    using childHandle = jsToHandle(ctx, child);
    ctx.setProp(obj, key, childHandle);
  }
  return obj;
}
