// infra/plugin-host/sync-channel — one Worker's buffers for its synchronous calls to the broker, allocated once and
// reused. A guest can make a seam call per loop step, so a pair of buffers per call let one invocation allocate the
// broker past its memory ceiling and stop every user's runtimes.
//
// ONE CALL IN FLIGHT PER THREAD, so one pair is enough. `call` posts and then blocks this thread in `Atomics.wait`
// until the broker answers or the wait times out; nothing between the post and the return runs a callback, guest code
// or another `call`. A Worker is one thread with its own module instance, so the pair is never shared.
//
// A REUSED BUFFER LEAKS NOTHING BETWEEN CALLS. The broker writes an answer's bytes and then its length, and `call`
// reads exactly that length, bound-checked against the buffer, so bytes a longer earlier answer left past it are never
// read. The broker answers each call at most once, but after a timed-out wait it may still answer that abandoned call,
// so a timed-out channel takes a fresh pair: the late answer lands in buffers no later call reads.

import { PLUGIN_BROKER_SYNC_RESULT_BYTES, PLUGIN_BROKER_SYNC_TIMEOUT_MS } from "./process-protocol.ts";

/** The control words: whether the broker answered, and the answer's length in bytes. */
const CONTROL_WORDS = 2;
const ANSWERED_SLOT = 0;
const LENGTH_SLOT = 1;

/** The buffers one synchronous call posts to the broker. */
export interface SyncCallBuffers {
  readonly control: SharedArrayBuffer;
  readonly result: SharedArrayBuffer;
}

/** A synchronous call's outcome: the answer's text, or no answer inside the timeout. */
export type SyncAnswer = { readonly kind: "answered"; readonly text: string } | { readonly kind: "timed-out" };

/** One Worker's synchronous channel to its broker. */
export interface SyncChannel {
  /** Post through `post` with this channel's buffers and block until the broker answers or the wait times out.
   *  @throws Error when the answer's length does not fit the buffer, which only a broker fault produces. */
  readonly call: (post: (buffers: SyncCallBuffers) => void) => SyncAnswer;
}

function freshBuffers(): SyncCallBuffers {
  return {
    control: new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * CONTROL_WORDS),
    result: new SharedArrayBuffer(PLUGIN_BROKER_SYNC_RESULT_BYTES),
  };
}

/** Build a channel holding one pair of buffers for every call until a call times out. */
export function createSyncChannel(): SyncChannel {
  let buffers = freshBuffers();
  const decoder = new TextDecoder();
  return {
    call: (post): SyncAnswer => {
      const current = buffers;
      const control = new Int32Array(current.control);
      Atomics.store(control, ANSWERED_SLOT, 0);
      Atomics.store(control, LENGTH_SLOT, 0);
      post(current);
      if (Atomics.wait(control, ANSWERED_SLOT, 0, PLUGIN_BROKER_SYNC_TIMEOUT_MS) === "timed-out") {
        buffers = freshBuffers();
        return { kind: "timed-out" };
      }
      const length = Atomics.load(control, LENGTH_SLOT);
      if (length <= 0 || length > current.result.byteLength) {
        throw new Error("plugin broker: invalid synchronous response length");
      }
      return { kind: "answered", text: decoder.decode(new Uint8Array(current.result, 0, length)) };
    },
  };
}
