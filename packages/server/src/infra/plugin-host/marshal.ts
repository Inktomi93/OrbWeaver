// infra/plugin-host/marshal — the ONE guest↔host value boundary, both directions. Only JSON-safe primitives /
// arrays / plain objects cross; nothing live.
//
// EVERY GUEST OR STORED STRING CROSSES INSIDE THE ENGINE'S OWN JSON. The binding reads and writes strings as C strings
// (`getString`/`newString`, object keys through `newString`), so a NUL ended the string: a guest key `a\0b` reached
// the host as `a`, and a stored `p\0q` read back as `p`. JSON text escapes a NUL as `\u0000` (and a lone surrogate
// as `\udXXX`), so it holds no byte the C read stops at. Guest to host, a top-level string goes through the realm's
// pristine `JSON.stringify`, and so does every string an object walk reads, key or value. Host to
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
// HOST VALUES CROSS WITHOUT GUEST CODE. A host refusal's error and the host's own strings (the grant list, a minted
// id, the chat token) are built with the binding's allocators and `defineProp`, which call no guest function and no
// guest setter. A host error also takes its brand through one call into the realm, which runs no guest code but can
// meet the interrupt past the window; that failure is the guest's and crosses as `GuestCallFailure`, like any other
// realm call's. A host error is an object on the realm's
// `Error.prototype`, never `newError()`: the engine's error constructor captures a stack, which runs the guest's
// `Error.prepareStackTrace`, and the binding's own path for a thrown error (`newError` through `setProp`) also runs a
// guest setter. A guest result settles through `Promise.resolve` and `Promise.prototype.then` captured here, never
// the guest's global `Promise`. An error the engine itself builds during a host call (a `JSON.parse` failure, the
// interrupt) still runs `prepareStackTrace`; each such call is inside a span (D346).
//
// A HOST CALL PAST THE WINDOW ENDS THE GUEST (D346). The interrupt is polled only about every ten thousand steps and
// never while the host works, so a guest whose time goes into host calls, or into its own callbacks a host read runs,
// can outlive its window without bound. Every host function therefore asks `cpuWindowPassed` (the interrupt's own
// reading) before any read, and again before every read or write that can run a guest callback (`readGuestProp`,
// `setHostProp`, each step of the depth walk): the binding drops a callback's interrupt, so without a check per call
// one host call could run many callbacks past the window, each a whole poll period. Past the window the host runs a
// host-owned endless step in the realm, which the interrupt stops at its first poll, and hands that exception back unchanged.
// It is the engine's interrupt, the one exception a guest `catch` or `finally` cannot hold, so the invocation ends
// exactly as a busy loop does; a host-built error would be caught and the loop would go on.
//
// AN OBJECT IS READ ONCE, BY THE WALK THAT BOUNDS IT. The binding's `dump` serializes on the host call stack, and a
// deep enough tree overflows it and corrupts the runtime (`budgets.ts`). A bound checked by one walk and a `dump` that
// walks again can see two different trees: a getter, a proxy trap or a `toJSON` can answer shallow to the check and
// deep to the dump. So no guest object reaches `dump`. `fromGuest` walks it with an explicit stack under the depth and
// node guards and builds the host value from the very reads it bounded, so what the host holds is exactly what was
// checked. A `toJSON` would be guest code choosing a second tree after the check; the walk does not call it.
//
// A PROMISE IS REFUSED BEFORE ANY READ. The binding's `dump` disposes the handle of a promise it reads, a handle the
// host still owns, which then aborts the engine at teardown. `fromGuest` asks the engine's promise state first, which
// runs nothing.
//
// A STRING PAST ITS ALLOWANCE IS REFUSED UNREAD. Reading a string copies it several times over: the realm's JSON
// text, the host string, its parse. A value refused for its size after that read has already cost those copies, and
// Workers looping such calls can carry the broker past its memory ceiling. A read given a `ReadAllowance` measures
// each string's length first, which copies nothing.
// No other module reads or writes a guest string.

import type { QuickJSContext, QuickJSHandle, VmCallResult, VmFunctionImplementation } from "quickjs-emscripten-core";
import { PLUGIN_DUMP_DEPTH_GUARD, PLUGIN_DUMP_NODE_GUARD } from "./budgets.ts";
import { cpuWindowPassed } from "./cpu-guard.ts";
import { CodedHostUnavailableError, PluginLlmFailureError } from "./process-protocol.ts";

/** A guest value read into the host. `promise`: the value is a promise, refused unread. `thrown`: the realm failed
 *  while serializing it (the CPU interrupt, its memory limit, or a guest trap or getter that threw); the caller owns
 *  that exception handle. `unreadable`: an object past the read's depth or node guard, holding a value JSON
 *  cannot write, or a string past the read's {@link ReadAllowance}, refused before any of it reached the host. */
export type GuestRead =
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "promise" }
  | { readonly kind: "thrown"; readonly error: QuickJSHandle }
  | { readonly kind: "unreadable" };

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

/** The string length, in UTF-16 units, that the reads of one host call may still copy out of the realm. Each guest
 *  string, key or value, is measured by its `length` before it is read and charged against `units`; one longer than
 *  what is left is refused unread and leaves `units` below zero. A string's JSON text is never shorter in UTF-8 bytes
 *  than its length in units, so an allowance set to a byte cap refuses only what that cap would refuse after the read. */
export interface ReadAllowance {
  units: number;
}

/** A host-authored error as it crosses: its `name`, its `message`, and any further string fields. */
export interface HostErrorFields {
  readonly name: string;
  readonly message: string;
}

/** One context's marshal. Disposing it releases the captured realm handles; do that before `ctx.dispose`. */
export interface GuestMarshal extends Disposable {
  /** Read a guest value into the host. A string is whole, NUL and lone surrogate included. A non-object primitive keeps
   *  the binding's `dump`. An object is read in one bounded walk that builds the host value as it goes, with JSON's
   *  shape rules (own enumerable string keys, arrays by `length`, `undefined` and functions dropped or `null`); a guest
   *  `toJSON` is not called. Call it inside a host function: the walk runs guest getters and proxy traps. With an
   *  `allowance`, every string is measured against it before it is read. */
  readonly fromGuest: (handle: QuickJSHandle, allowance?: ReadAllowance) => GuestRead;
  /** {@link GuestMarshal.fromGuest} for a value a guest invocation settled to, read inside that invocation's span and
   *  outside any host function. The engine's interrupt bounds the guest code the read runs there, so the read asks no
   *  window first: a past-window invocation's own error still reads. */
  readonly fromSettledGuest: (handle: QuickJSHandle) => GuestRead;
  /** Build a guest value from JSON text with the realm's pristine `JSON.parse`. The caller owns the handle or error. */
  readonly parseIntoGuest: (json: string) => VmCallResult<QuickJSHandle>;
  /** A guest string from host text. The caller owns the handle. */
  readonly newHostString: (text: string) => QuickJSHandle;
  /** A guest array of host strings. The caller owns the handle. */
  readonly newHostStrings: (texts: readonly string[]) => QuickJSHandle;
  /** A guest `Error` carrying a host error's `name`, `message` and `fields`. The caller owns the handle.
   *  @throws {@link GuestCallFailure} when the realm fails during the build, as it does past the window; the caller owns
   *  its exception and hands it back to the guest unchanged or releases it. */
  readonly newHostError: (error: HostErrorFields, fields?: Readonly<Record<string, string>>) => QuickJSHandle;
  /** A guest promise already rejected with a host error, or the realm's own failure to make one — return it from a
   *  host function as it is. */
  readonly rejectedWith: (error: HostErrorFields) => VmCallResult<QuickJSHandle>;
  /** The settlement of a guest value as a guest promise would settle it, through the realm's `Promise.resolve` and
   *  `Promise.prototype.then` captured before guest code ran, never the guest's globals. The caller owns the handle it
   *  settles with. Call it inside a span: resolving reads the value's own `then` and `constructor`. */
  readonly settlementOf: (handle: QuickJSHandle) => Promise<VmCallResult<QuickJSHandle>>;
  /** A host function that ends a guest past its CPU window before it reads anything ({@link GuestMarshal.stopPastWindow}),
   *  hands a {@link GuestCallFailure}'s exception back to the guest unchanged, and builds any other throw with
   *  {@link GuestMarshal.newHostError}. Every host function the realm and the membrane install is built here. */
  readonly newHostFunction: (name: string, fn: VmFunctionImplementation<QuickJSHandle>) => QuickJSHandle;
  /** Throw {@link GuestCallFailure} carrying the engine's interrupt when the guest's CPU window has passed. Call it
   *  inside a host function before a read that can run guest code. */
  readonly stopPastWindow: () => void;
  /** Read a property of a guest object — which can run a guest getter or proxy trap — after the window check. A getter
   *  or trap that throws throws {@link GuestCallFailure} carrying the guest's exception. The caller owns the handle. */
  readonly readGuestProp: (target: QuickJSHandle, key: string | QuickJSHandle) => QuickJSHandle;
  /** Set a property on a host-made object the guest receives — which can run a guest setter on a prototype — after
   *  the window check. `defineProp` would run none, but the binding cannot make it writable, and the surface stays
   *  writable for the guest. */
  readonly setHostProp: (target: QuickJSHandle, key: string, value: QuickJSHandle) => void;
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

/** What the realm-side classifier answers for an object handle. */
const OBJECT_KIND = { null: 0, array: 1, record: 2, error: 3 } as const;
// Evaluated before any guest code runs, with every builtin it calls bound then, so a guest that replaces one later is
// not asked. Each check is a brand check: it reads no property and runs no proxy trap. A host-built error (see
// `newHostError`) is an object on `Error.prototype`, which `Error.isError` refuses, so it carries its own brand in a
// `WeakSet` the second function adds to. A guest stack hook can take that function and brand its own object; that
// gains nothing, because the brand only adds the root `name`, `message` and `stack` reads a real `Error` already gets.
const CLASSIFY_OBJECT_SOURCE = `((isArray, isError, apply, has, add, hostErrors) => [
  (value) => (value === null ? ${OBJECT_KIND.null} : isArray(value) ? ${OBJECT_KIND.array} : isError(value) || apply(has, hostErrors, [value]) ? ${OBJECT_KIND.error} : ${OBJECT_KIND.record}),
  (value) => { apply(add, hostErrors, [value]); },
])(Array.isArray, Error.isError, Reflect.apply, WeakSet.prototype.has, WeakSet.prototype.add, new WeakSet())`;
/** The fields the binding's `dump` adds for an error at the root of a read, which the walk reads the same way:
 *  `message` and `stack` are own non-enumerable and `name` is inherited, so own enumerable keys alone would drop them. */
const ROOT_ERROR_FIELDS = ["name", "message", "stack"] as const;

/** A walked value JSON drops from an object and writes as `null` in an array: `undefined`, a function, a symbol. */
const DROPPED = Symbol("dropped");

/** One value the object walk still has to read: its handle, its depth from the root, whether the walk owns the
 *  handle, and where the value it reads goes. */
interface WalkFrame {
  readonly handle: QuickJSHandle;
  readonly depth: number;
  readonly owned: boolean;
  readonly place: (value: unknown) => void;
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

/** What the object walk needs from one context's marshal: the context, the realm's captured `JSON.stringify`, object
 *  classifier and property read, and the window check each read that can run guest code asks first. */
interface ObjectWalk {
  readonly ctx: QuickJSContext;
  readonly stringify: QuickJSHandle;
  readonly classify: QuickJSHandle;
  readonly getProperty: QuickJSHandle;
  readonly checkWindow: () => void;
  readonly allowance?: ReadAllowance;
}

type StringRead = { readonly text: string } | { readonly thrown: QuickJSHandle } | { readonly overAllowance: true };

// A guest string as host text, through the realm's own JSON so a NUL survives. A string's own `length` runs no guest
// code: it is not inherited, so no getter a guest defines can answer it.
function stringOf(walk: ObjectWalk, handle: QuickJSHandle): StringRead {
  const { allowance } = walk;
  if (allowance !== undefined) {
    const length = propertyOf(walk, handle, "length");
    if (length.error) {
      return { thrown: length.error };
    }
    allowance.units -= length.value.consume((units) => walk.ctx.getNumber(units));
    if (allowance.units < 0) {
      return { overAllowance: true };
    }
  }
  const quoted = walk.ctx.callFunction(walk.stringify, walk.ctx.undefined, handle);
  if (quoted.error) {
    return { thrown: quoted.error };
  }
  using json = quoted.value;
  // The realm's JSON of a string is a JSON string literal, so it parses back to that string.
  return { text: String(JSON.parse(walk.ctx.getString(json))) };
}

// One property read, which can run a guest getter or proxy trap. It goes through the realm's own captured read rather
// than the binding's `getProp`, whose answer to a throwing getter is no value and an exception left pending in the
// context; a call hands the guest's throw back as the result's error.
function propertyOf(walk: ObjectWalk, target: QuickJSHandle, key: WalkEntry["read"]): VmCallResult<QuickJSHandle> {
  walk.checkWindow();
  const { ctx } = walk;
  if (typeof key !== "string" && typeof key !== "number") {
    return ctx.callFunction(walk.getProperty, ctx.undefined, target, key);
  }
  using keyHandle = typeof key === "string" ? ctx.newString(key) : ctx.newNumber(key);
  return ctx.callFunction(walk.getProperty, ctx.undefined, target, keyHandle);
}

function disposeFrames(frames: readonly WalkFrame[]): void {
  for (const frame of frames) {
    if (frame.owned) {
      frame.handle.dispose();
    }
  }
}

/** One value a container holds: the key it is read by and where its read goes. */
interface WalkEntry {
  readonly read: string | number | QuickJSHandle;
  readonly place: WalkFrame["place"];
}

// Queue `frame`'s values. They are pushed straight onto the walk's own stack, so a read that fails midway leaves
// nothing the walk's release does not reach, and then the pushed run is reversed so each container receives its values
// in the guest's own order.
function queueValues(walk: ObjectWalk, frames: WalkFrame[], frame: WalkFrame, entries: readonly WalkEntry[]): GuestRead | undefined {
  const start = frames.length;
  for (const { read, place } of entries) {
    const value = propertyOf(walk, frame.handle, read);
    if (value.error) {
      return { kind: "thrown", error: value.error };
    }
    frames.push({ handle: value.value, depth: frame.depth + 1, owned: true, place });
  }
  frames.push(...frames.splice(start).reverse());
  return undefined;
}

// An array's elements by `length`, as JSON reads it. An array longer than the node guard has room left for is refused
// before any element is read.
function readArray(walk: ObjectWalk, frames: WalkFrame[], frame: WalkFrame, room: number): GuestRead | undefined {
  const { ctx } = walk;
  const lengthRead = propertyOf(walk, frame.handle, "length");
  if (lengthRead.error) {
    return { kind: "thrown", error: lengthRead.error };
  }
  using lengthHandle = lengthRead.value;
  const length = ctx.typeof(lengthHandle) === "number" ? ctx.getNumber(lengthHandle) : Number.NaN;
  if (!Number.isInteger(length) || length < 0 || length > room) {
    return { kind: "unreadable" };
  }
  const array: unknown[] = Array.from({ length }, () => null);
  frame.place(array);
  const entries = Array.from(
    { length },
    (_unused, index): WalkEntry => ({
      read: index,
      place: (value: unknown): void => {
        array[index] = value === DROPPED ? null : value;
      },
    }),
  );
  return queueValues(walk, frames, frame, entries);
}

// An object's own enumerable string keys, as JSON reads them, after any `extra` fields read by name.
function readRecord(walk: ObjectWalk, frames: WalkFrame[], frame: WalkFrame, extra: readonly string[]): GuestRead | undefined {
  walk.checkWindow();
  const names = walk.ctx.getOwnPropertyNames(frame.handle, { strings: true, numbersAsStrings: true, onlyEnumerable: true });
  if (names.error) {
    return { kind: "thrown", error: names.error };
  }
  using keys = names.value;
  const record: Record<string, unknown> = {};
  const entryFor = (key: string, read: string | QuickJSHandle): WalkEntry => ({
    read,
    place: (value: unknown): void => {
      if (value !== DROPPED) {
        // Defined, never assigned: a guest key `__proto__` is an own property here, as JSON makes it.
        Object.defineProperty(record, key, { value, enumerable: true, writable: true, configurable: true });
      }
    },
  });
  const entries = extra.map((key) => entryFor(key, key));
  for (const keyHandle of keys) {
    const key = stringOf(walk, keyHandle);
    if ("thrown" in key) {
      return { kind: "thrown", error: key.thrown };
    }
    if ("overAllowance" in key) {
      return { kind: "unreadable" };
    }
    if (!extra.includes(key.text)) {
      entries.push(entryFor(key.text, keyHandle));
    }
  }
  frame.place(record);
  return queueValues(walk, frames, frame, entries);
}

// Read one object or `null` into its place and queue its values, or answer the failure that ends the read.
function readContainer(walk: ObjectWalk, frames: WalkFrame[], frame: WalkFrame, room: number): GuestRead | undefined {
  const kind = walk.ctx.callFunction(walk.classify, walk.ctx.undefined, frame.handle);
  if (kind.error) {
    return { kind: "thrown", error: kind.error };
  }
  switch (kind.value.consume((answer) => walk.ctx.getNumber(answer))) {
    case OBJECT_KIND.null:
      frame.place(null);
      return;
    case OBJECT_KIND.array:
      return readArray(walk, frames, frame, room);
    case OBJECT_KIND.error:
      return readRecord(walk, frames, frame, frame.depth === 1 ? ROOT_ERROR_FIELDS : []);
    default:
      return readRecord(walk, frames, frame, []);
  }
}

// Read one walked value into its place and queue the values it holds, or answer the failure that ends the read.
function readFrame(walk: ObjectWalk, frames: WalkFrame[], frame: WalkFrame, room: number): GuestRead | undefined {
  const { ctx } = walk;
  switch (ctx.typeof(frame.handle)) {
    case "string": {
      const read = stringOf(walk, frame.handle);
      if ("thrown" in read) {
        return { kind: "thrown", error: read.thrown };
      }
      if ("overAllowance" in read) {
        return { kind: "unreadable" };
      }
      frame.place(read.text);
      return;
    }
    case "number": {
      const number = ctx.getNumber(frame.handle);
      frame.place(Number.isFinite(number) ? number : null);
      return;
    }
    case "boolean":
      frame.place(ctx.dump(frame.handle));
      return;
    case "bigint":
      return { kind: "unreadable" };
    case "object":
      return readContainer(walk, frames, frame, room);
    default:
      frame.place(DROPPED);
      return;
  }
}

// The bounded object walk `fromGuest` reads with (see the header): the depth and node guards are checked on the same
// reads that build the value. Every handle the walk opens is released here, on every exit.
function readObject(walk: ObjectWalk, root: QuickJSHandle): GuestRead {
  let value: unknown;
  let visited = 0;
  const frames: WalkFrame[] = [
    {
      handle: root,
      depth: 1,
      owned: false,
      place: (read: unknown): void => {
        value = read;
      },
    },
  ];
  try {
    for (let frame = frames.pop(); frame !== undefined; frame = frames.pop()) {
      visited += 1;
      try {
        if (frame.depth > PLUGIN_DUMP_DEPTH_GUARD || visited > PLUGIN_DUMP_NODE_GUARD) {
          return { kind: "unreadable" };
        }
        const failed = readFrame(walk, frames, frame, PLUGIN_DUMP_NODE_GUARD - visited);
        if (failed !== undefined) {
          return failed;
        }
      } finally {
        if (frame.owned) {
          frame.handle.dispose();
        }
      }
    }
    return { kind: "value", value };
  } finally {
    disposeFrames(frames);
  }
}

/** Capture the realm's own `JSON.stringify`, `JSON.parse`, `Promise`, `Promise.reject`, `Promise.resolve`,
 *  `Promise.prototype.then` and `Error.prototype` for `ctx`. Call it once,
 *  right after the context is created and before any guest source runs. */
export function createGuestMarshal(ctx: QuickJSContext): GuestMarshal {
  using captured = new DisposableStack();
  using json = ctx.getProp(ctx.global, "JSON");
  const stringify = captured.adopt(ctx.getProp(json, "stringify"), (handle) => handle.dispose());
  const parse = captured.adopt(ctx.getProp(json, "parse"), (handle) => handle.dispose());
  const promise = captured.adopt(ctx.getProp(ctx.global, "Promise"), (handle) => handle.dispose());
  const reject = captured.adopt(ctx.getProp(promise, "reject"), (handle) => handle.dispose());
  const resolve = captured.adopt(ctx.getProp(promise, "resolve"), (handle) => handle.dispose());
  using promisePrototype = ctx.getProp(promise, "prototype");
  const then = captured.adopt(ctx.getProp(promisePrototype, "then"), (handle) => handle.dispose());
  using errorConstructor = ctx.getProp(ctx.global, "Error");
  const errorPrototype = captured.adopt(ctx.getProp(errorConstructor, "prototype"), (handle) => handle.dispose());
  // A host-owned step that never returns on its own. No window is open yet, so evaluating it cannot be interrupted.
  const endless = captured.adopt(ctx.unwrapResult(ctx.evalCode("(() => { for (;;) {} })")), (handle) => handle.dispose());
  using classifiers = ctx.unwrapResult(ctx.evalCode(CLASSIFY_OBJECT_SOURCE));
  const classify = captured.adopt(ctx.getProp(classifiers, 0), (handle) => handle.dispose());
  const brandHostError = captured.adopt(ctx.getProp(classifiers, 1), (handle) => handle.dispose());
  const getProperty = captured.adopt(ctx.unwrapResult(ctx.evalCode("((target, key) => target[key])")), (handle) => handle.dispose());
  const owned = captured.move();

  // `defineProp`, never `setProp`: a guest can put a setter for any key on a prototype, and `setProp` would run it.
  const defineText = (target: QuickJSHandle, key: string, text: string): void => {
    using value = ctx.newString(hostText(text));
    ctx.defineProp(target, key, { value, configurable: true, enumerable: false });
  };

  // An object on the realm's `Error.prototype`, not `newError()`: the engine's error constructor captures a stack, which
  // runs the guest's `Error.prepareStackTrace`. The guest still reads it as an `Error` (`instanceof`, `name`,
  // `message`, `String`); it has no `stack`.
  const newHostError = (error: HostErrorFields, fields: Readonly<Record<string, string>> = {}): QuickJSHandle => {
    using built = new DisposableStack();
    const handle = built.adopt(ctx.newObject(errorPrototype), (made) => made.dispose());
    defineText(handle, "name", error.name);
    defineText(handle, "message", error.message);
    // A coded refusal says why beside its name, on every path a host error reaches the guest by.
    if (error instanceof CodedHostUnavailableError) {
      defineText(handle, "code", error.code);
    }
    // A failed model call says why by its closed kind and a retry flag, never by the upstream text.
    if (error instanceof PluginLlmFailureError) {
      defineText(handle, "kind", error.kind);
      ctx.defineProp(handle, "retryable", { value: error.retryable ? ctx.true : ctx.false, configurable: true, enumerable: false });
    }
    for (const [key, text] of Object.entries(fields)) {
      defineText(handle, key, text);
    }
    // The brand lets the walk read `name` and `message` when this error crosses back, as it reads a real error's.
    const branded = ctx.callFunction(brandHostError, ctx.undefined, handle);
    if (branded.error) {
      throw new GuestCallFailure(branded.error);
    }
    branded.value.dispose();
    built.move();
    return handle;
  };

  // A host error, or the realm's failure while building it. The failure is handed back unchanged, so an interrupt met
  // during the build stays the one exception a guest cannot catch.
  const hostErrorOrFailure = (error: HostErrorFields): { readonly failed: boolean; readonly handle: QuickJSHandle } => {
    try {
      return { failed: false, handle: newHostError(error) };
    } catch (failure) {
      if (failure instanceof GuestCallFailure) {
        return { failed: true, handle: failure.thrown };
      }
      throw failure;
    }
  };

  // Past the window, run the endless step: the interrupt's own reading answers at its first poll, and the engine's
  // interrupt exception is what crosses back. The step cannot return while the window stays passed, which it does
  // for the rest of this synchronous host call; the plain error after it is the type's other arm.
  const stopPastWindow = (): void => {
    if (!cpuWindowPassed(ctx)) {
      return;
    }
    const ended = ctx.callFunction(endless, ctx.undefined);
    if (ended.error) {
      throw new GuestCallFailure(ended.error);
    }
    ended.value.dispose();
    throw new Error("plugin host: the guest's CPU window has passed");
  };

  // Inside a host function the binding drops a callback's interrupt, so every read asks the window first (D346).
  const checkedWalk: ObjectWalk = { ctx, stringify, classify, getProperty, checkWindow: stopPastWindow };
  // A settled value is read inside its invocation's span and outside any host function, where the engine's own
  // interrupt ends a getter that runs past the window and so ends the read.
  const settledWalk: ObjectWalk = { ...checkedWalk, checkWindow: (): void => undefined };

  const readFrom = (walk: ObjectWalk, handle: QuickJSHandle): GuestRead => {
    const type = ctx.typeof(handle);
    if (type === "object") {
      return isPromise(ctx, handle) ? { kind: "promise" } : readObject(walk, handle);
    }
    if (type !== "string") {
      return { kind: "value", value: ctx.dump(handle) };
    }
    const read = stringOf(walk, handle);
    if ("overAllowance" in read) {
      return { kind: "unreadable" };
    }
    return "thrown" in read ? { kind: "thrown", error: read.thrown } : { kind: "value", value: read.text };
  };

  return {
    fromGuest: (handle, allowance): GuestRead => readFrom(allowance === undefined ? checkedWalk : { ...checkedWalk, allowance }, handle),
    fromSettledGuest: (handle): GuestRead => readFrom(settledWalk, handle),
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
      const reason = hostErrorOrFailure(error);
      if (reason.failed) {
        return { error: reason.handle };
      }
      using built = reason.handle;
      return ctx.callFunction(reject, promise, built);
    },
    settlementOf: (handle): Promise<VmCallResult<QuickJSHandle>> => {
      const resolved = ctx.callFunction(resolve, promise, handle);
      if (resolved.error) {
        return Promise.resolve({ error: resolved.error });
      }
      using settling = resolved.value;
      return new Promise((settle) => {
        // The engine keeps these two as the promise's reactions and never hands them to guest code, so they take no
        // window check; each runs inside the pump that settles the promise.
        using onFulfilled = ctx.newFunction("fulfilled", (value) => {
          settle({ value: value.dup() });
        });
        using onRejected = ctx.newFunction("rejected", (reason) => {
          settle({ error: reason.dup() });
        });
        const chained = ctx.callFunction(then, settling, onFulfilled, onRejected);
        if (chained.error) {
          settle({ error: chained.error });
          return;
        }
        chained.value.dispose();
      });
    },
    newHostFunction: (name, fn): QuickJSHandle =>
      ctx.newFunction(name, (...args) => {
        try {
          // Before any argument is read: every read past this point may run guest code.
          stopPastWindow();
          return fn.call(ctx.undefined, ...args);
        } catch (error) {
          if (error instanceof GuestCallFailure) {
            return { error: error.thrown };
          }
          return { error: hostErrorOrFailure(error instanceof Error ? error : { name: "Error", message: String(error) }).handle };
        }
      }),
    stopPastWindow,
    readGuestProp: (target, key): QuickJSHandle => {
      const read = propertyOf(checkedWalk, target, key);
      if (read.error) {
        throw new GuestCallFailure(read.error);
      }
      return read.value;
    },
    setHostProp: (target, key, value): void => {
      stopPastWindow();
      ctx.setProp(target, key, value);
    },
    [Symbol.dispose]: (): void => {
      owned.dispose();
    },
  };
}
