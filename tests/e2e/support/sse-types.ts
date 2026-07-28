// The wire subset of a `chat.streamMessages` yielded event the reasoning-strip spec asserts on — declared
// LOCALLY (the e2e-support import-free-of-package-trees rule, the trpc.ts `CanonMessage` posture). Only the
// fields the assertions read: the event `type`, a `delta`'s channel `kind` + text, and a committed `view`'s
// `content` + `reasoning`. `type`/`kind` stay `string` (specs compare to literals; the no-inline-union-redecl
// gate bans re-spelling the homed ChatBusEvent/ChatDeltaEvent tuples here).

/** A `delta` event's channel payload (text | reasoning), the mid-stream instrument. */
interface DeltaLite {
  readonly kind: string;
  readonly text: string;
}

/** A committed/edited message view (the at-commit instrument): `reasoning` is the channel a deception-active
 *  member must never receive; `content` carries the body (the `<lie>` span is stripped from it for a member). */
interface ViewLite {
  readonly content?: string;
  readonly reasoning?: string | null;
}

/** One yielded `chat.streamMessages` event — the union members the spec inspects, flattened to optional
 *  fields (a given event carries only the ones for its `type`). */
export interface ChatBusEventLite {
  readonly type: string;
  readonly delta?: DeltaLite;
  readonly view?: ViewLite;
}
