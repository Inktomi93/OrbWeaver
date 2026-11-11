// infra/plugin-host/marshal — the ONE guest↔host value boundary, both directions. Only JSON-safe primitives /
// arrays / plain objects cross; nothing live.
//
// EVERY STRING CROSSES INSIDE THE ENGINE'S OWN JSON. The binding reads and writes strings as C strings
// (`getString`/`newString`, object keys through `newString`), so a NUL ended the string: a guest key `a\0b` reached
// the host as `a`, and a stored `p\0q` read back as `p`. JSON text escapes a NUL as `\u0000` (and a lone surrogate
// as `\udXXX`), so it holds no byte the C read stops at. Guest to host, a top-level string goes through the realm's
// pristine `JSON.stringify`; objects already cross through the binding's `dump`, which is the realm's JSON. Host to
// guest, a value crosses as `JSON.stringify` text handed to the realm's pristine `JSON.parse` — never `eval`, and with
// both handles captured before any guest code runs, so a guest that reassigns `JSON` cannot reach the marshalling.
// No other module reads or writes a guest string.

import type { QuickJSContext, QuickJSHandle, VmCallResult } from "quickjs-emscripten-core";

/** A guest value read into the host, or `ok: false` when the realm could not serialize it (a string too large to
 *  escape within the guest's memory limit). */
export type GuestRead = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

/** One context's marshal. Disposing it releases the captured `JSON` handles; do that before `ctx.dispose`. */
export interface GuestMarshal extends Disposable {
  /** Read a guest value into the host. A string is whole, NUL and lone surrogate included. Any other value keeps the
   *  binding's `dump`: numbers, bigints and symbols as themselves, objects through the realm's JSON. */
  readonly fromGuest: (handle: QuickJSHandle) => GuestRead;
  /** Build a guest value from JSON text with the realm's pristine `JSON.parse`. The caller owns the handle or error. */
  readonly parseIntoGuest: (json: string) => VmCallResult<QuickJSHandle>;
  /** Build a guest value from a host value; throws when the realm cannot hold it. The caller owns the handle. */
  readonly toGuest: (value: unknown) => QuickJSHandle;
  /** A guest `Error` carrying a host error's `name` and `message`, each crossing whole. The caller owns the handle. */
  readonly newGuestError: (error: { readonly name: string; readonly message: string }) => QuickJSHandle;
}

/** The JSON text a host value crosses into the guest as — what the result cap measures, since it is what crosses.
 *  The contract's stance on non-JSON values is kept: a function, symbol or bigint becomes `null` (a host reference
 *  never crosses as anything but inert data), an `undefined` property is dropped, and a bare `undefined` is `null`.
 *  JSON's own rules apply to numbers: `NaN` and the infinities become `null`, and `-0` becomes `0`. */
export function guestJson(value: unknown): string {
  if (value === undefined) {
    return "null";
  }
  return JSON.stringify(value, (_key, inner: unknown) =>
    typeof inner === "function" || typeof inner === "symbol" || typeof inner === "bigint" ? null : inner,
  );
}

/** Capture the realm's own `JSON.stringify` and `JSON.parse` for `ctx`. Call it once, right after the context is
 *  created and before any guest source runs. */
export function createGuestMarshal(ctx: QuickJSContext): GuestMarshal {
  using json = ctx.getProp(ctx.global, "JSON");
  const stringify = ctx.getProp(json, "stringify");
  const parse = ctx.getProp(json, "parse");

  const parseIntoGuest = (text: string): VmCallResult<QuickJSHandle> => {
    using handle = ctx.newString(text);
    return ctx.callFunction(parse, ctx.undefined, handle);
  };
  const toGuest = (value: unknown): QuickJSHandle => ctx.unwrapResult(parseIntoGuest(guestJson(value)));

  return {
    fromGuest: (handle): GuestRead => {
      if (ctx.typeof(handle) !== "string") {
        return { ok: true, value: ctx.dump(handle) };
      }
      const text = ctx.callFunction(stringify, ctx.undefined, handle);
      if (text.error) {
        text.error.dispose();
        return { ok: false };
      }
      using quoted = text.value;
      return { ok: true, value: JSON.parse(ctx.getString(quoted)) };
    },
    parseIntoGuest,
    toGuest,
    newGuestError: (error): QuickJSHandle => {
      const handle = ctx.newError();
      using name = toGuest(error.name);
      ctx.setProp(handle, "name", name);
      using message = toGuest(error.message);
      ctx.setProp(handle, "message", message);
      return handle;
    },
    [Symbol.dispose]: (): void => {
      stringify.dispose();
      parse.dispose();
    },
  };
}
