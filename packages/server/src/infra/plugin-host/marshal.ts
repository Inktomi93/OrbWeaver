// infra/plugin-host/marshal — the ONE guest↔host value boundary, both directions. Only JSON-safe primitives /
// arrays / plain objects cross; nothing live.
//
// EVERY GUEST OR STORED STRING CROSSES INSIDE THE ENGINE'S OWN JSON. The binding reads and writes strings as C strings
// (`getString`/`newString`, object keys through `newString`), so a NUL ended the string: a guest key `a\0b` reached
// the host as `a`, and a stored `p\0q` read back as `p`. JSON text escapes a NUL as `\u0000` (and a lone surrogate
// as `\udXXX`), so it holds no byte the C read stops at. Guest to host, a top-level string goes through the realm's
// pristine `JSON.stringify`; objects already cross through the binding's `dump`, which is the realm's JSON. Host to
// guest, a value that can hold guest or stored text crosses as `JSON.stringify` text handed to the realm's pristine
// `JSON.parse` — never `eval`, and with every captured handle taken before any guest code runs, so a guest that
// reassigns `JSON` or `Promise` cannot reach the marshalling.
//
// A CALL INTO THE REALM CAN FAIL, AND THE FAILURE IS THE GUEST'S. QuickJS polls the CPU interrupt on every call, a
// native one included, so past the guest's window `JSON.stringify` or `Promise.reject` can fail with the interrupt.
// That exception stops the guest only while it stays the same, uncatchable object. A host function therefore hands
// it back unchanged (`GuestCallFailure` through `newHostFunction`), never as a new error: a guest that catches and
// loops would otherwise meet every later interrupt inside a host call and run past its window without bound.
//
// HOST TEXT CROSSES WITHOUT GUEST CODE. A host refusal's `Error` and the host's own strings (the grant list, a
// minted id, the chat token) are built with the binding's allocators and `defineProp`, which call no guest function
// and no guest setter, so building one cannot fail on the guest's account.
//
// A PROMISE IS REFUSED BEFORE ANY READ. The binding's `dump` disposes the handle of a promise it reads, a handle the
// host still owns, which then aborts the engine at teardown. `fromGuest` asks the engine's promise state first, which
// runs nothing.
// No other module reads or writes a guest string.

import type { QuickJSContext, QuickJSHandle, VmCallResult, VmFunctionImplementation } from "quickjs-emscripten-core";

/** A guest value read into the host. `promise`: the value is a promise, refused unread. `thrown`: the realm failed
 *  while serializing it (the CPU interrupt, or its memory limit); the caller owns that exception handle. */
export type GuestRead =
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "promise" }
  | { readonly kind: "thrown"; readonly error: QuickJSHandle };

/** A call into the realm, made inside a host function, failed. Thrown inside a host function built by
 *  {@link GuestMarshal.newHostFunction}, which hands `thrown` back to the guest unchanged. */
export class GuestCallFailure extends Error {
  readonly thrown: QuickJSHandle;

  constructor(thrown: QuickJSHandle) {
    super("plugin host: a call into the guest realm failed");
    this.name = "GuestCallFailure";
    this.thrown = thrown;
  }
}

/** A host-authored error as it crosses: its `name`, its `message`, and any further string fields. */
export interface HostErrorFields {
  readonly name: string;
  readonly message: string;
}

/** One context's marshal. Disposing it releases the captured realm handles; do that before `ctx.dispose`. */
export interface GuestMarshal extends Disposable {
  /** Read a guest value into the host. A string is whole, NUL and lone surrogate included. Any other value keeps the
   *  binding's `dump`: numbers, bigints and symbols as themselves, objects through the realm's JSON. */
  readonly fromGuest: (handle: QuickJSHandle) => GuestRead;
  /** Build a guest value from JSON text with the realm's pristine `JSON.parse`. The caller owns the handle or error. */
  readonly parseIntoGuest: (json: string) => VmCallResult<QuickJSHandle>;
  /** A guest string from host text. The caller owns the handle. */
  readonly newHostString: (text: string) => QuickJSHandle;
  /** A guest array of host strings. The caller owns the handle. */
  readonly newHostStrings: (texts: readonly string[]) => QuickJSHandle;
  /** A guest `Error` carrying a host error's `name`, `message` and `fields`. The caller owns the handle. */
  readonly newHostError: (error: HostErrorFields, fields?: Readonly<Record<string, string>>) => QuickJSHandle;
  /** A guest promise already rejected with a host error, or the realm's own failure to make one — return it from a
   *  host function as it is. */
  readonly rejectedWith: (error: HostErrorFields) => VmCallResult<QuickJSHandle>;
  /** A host function that hands a {@link GuestCallFailure}'s exception back to the guest unchanged. Every host
   *  function the realm and the membrane install is built here. */
  readonly newHostFunction: (name: string, fn: VmFunctionImplementation<QuickJSHandle>) => QuickJSHandle;
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

const NUL = "\u0000";
/** How a NUL in host text crosses: as visible escape text. The binding writes host text as a C string, which would
 *  end at the NUL; host text can quote guest text (a schema refusal names the guest's own key), so it may hold one. */
const NUL_SHOWN = "\\u0000";

function hostText(text: string): string {
  return text.replaceAll(NUL, NUL_SHOWN);
}

// The release half of a promise-state read: a settled promise's state holds a fresh handle; a non-promise's holds the
// caller's own handle, which is not ours to release.
function isPromise(ctx: QuickJSContext, handle: QuickJSHandle): boolean {
  const state = ctx.getPromiseState(handle);
  switch (state.type) {
    case "pending":
      return true;
    case "rejected":
      state.error.dispose();
      return true;
    case "fulfilled":
      if (state.notAPromise === true) {
        return false;
      }
      state.value.dispose();
      return true;
    default: {
      const exhaustive: never = state;
      throw new Error(`plugin host: unknown promise state ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Capture the realm's own `JSON.stringify`, `JSON.parse`, `Promise` and `Promise.reject` for `ctx`. Call it once,
 *  right after the context is created and before any guest source runs. */
export function createGuestMarshal(ctx: QuickJSContext): GuestMarshal {
  using captured = new DisposableStack();
  using json = ctx.getProp(ctx.global, "JSON");
  const stringify = captured.adopt(ctx.getProp(json, "stringify"), (handle) => handle.dispose());
  const parse = captured.adopt(ctx.getProp(json, "parse"), (handle) => handle.dispose());
  const promise = captured.adopt(ctx.getProp(ctx.global, "Promise"), (handle) => handle.dispose());
  const reject = captured.adopt(ctx.getProp(promise, "reject"), (handle) => handle.dispose());
  const owned = captured.move();

  // `defineProp`, never `setProp`: a guest can put a setter for any key on a prototype, and `setProp` would run it.
  const defineText = (target: QuickJSHandle, key: string, text: string): void => {
    using value = ctx.newString(hostText(text));
    ctx.defineProp(target, key, { value, configurable: true, enumerable: false });
  };

  const newHostError = (error: HostErrorFields, fields: Readonly<Record<string, string>> = {}): QuickJSHandle => {
    using built = new DisposableStack();
    const handle = built.adopt(ctx.newError(), (made) => made.dispose());
    defineText(handle, "name", error.name);
    defineText(handle, "message", error.message);
    for (const [key, text] of Object.entries(fields)) {
      defineText(handle, key, text);
    }
    built.move();
    return handle;
  };

  return {
    fromGuest: (handle): GuestRead => {
      const type = ctx.typeof(handle);
      if (type === "object" && isPromise(ctx, handle)) {
        return { kind: "promise" };
      }
      if (type !== "string") {
        return { kind: "value", value: ctx.dump(handle) };
      }
      const text = ctx.callFunction(stringify, ctx.undefined, handle);
      if (text.error) {
        return { kind: "thrown", error: text.error };
      }
      using quoted = text.value;
      return { kind: "value", value: JSON.parse(ctx.getString(quoted)) };
    },
    parseIntoGuest: (text): VmCallResult<QuickJSHandle> => {
      using handle = ctx.newString(text);
      return ctx.callFunction(parse, ctx.undefined, handle);
    },
    newHostString: (text): QuickJSHandle => ctx.newString(hostText(text)),
    newHostStrings: (texts): QuickJSHandle => {
      using built = new DisposableStack();
      const array = built.adopt(ctx.newArray(), (made) => made.dispose());
      texts.forEach((text, index) => {
        using value = ctx.newString(hostText(text));
        ctx.defineProp(array, String(index), { value, configurable: true, enumerable: true });
      });
      built.move();
      return array;
    },
    newHostError,
    rejectedWith: (error): VmCallResult<QuickJSHandle> => {
      using reason = newHostError(error);
      return ctx.callFunction(reject, promise, reason);
    },
    newHostFunction: (name, fn): QuickJSHandle =>
      ctx.newFunction(name, (...args) => {
        try {
          return fn.call(ctx.undefined, ...args);
        } catch (error) {
          if (error instanceof GuestCallFailure) {
            return { error: error.thrown };
          }
          throw error;
        }
      }),
    [Symbol.dispose]: (): void => {
      owned.dispose();
    },
  };
}
