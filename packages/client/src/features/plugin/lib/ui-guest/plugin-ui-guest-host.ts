// plugin-ui-guest-host — the MAIN-THREAD half of the Tier-C guest (plugin-ui-plane #679 U4, §4.6/§4.9). It
// owns the worker: spawn, boot, deliver events, relay host calls, and — the part that matters most — KILL.
//
// THE WALL-CLOCK DEADLINE IS THIS FILE'S REASON TO EXIST (the D46 review's P1-A lesson, inherited from birth).
// A single-threaded interpreter cannot preempt itself once it stops running bytecode: `new Promise(() => {})`,
// an `await` that never resumes, a `while(true)` that the interrupt handler catches only while it is executing
// — the in-guest budget is blind to some of these by construction. The only bound that always holds is a timer
// on ANOTHER thread plus `worker.terminate()`, which is a kill the guest cannot refuse. So every guest
// operation this host starts arms a timer, and expiry means: terminate, collapse the surface to null, log, and
// report the crash into the SAME 3-strike policy a throwing server handler drives.
//
// ZERO NETWORK ON KEYSTROKE is the other half of the contract, and it is a property of what this file does
// NOT do: `deliverEvent` posts a message and returns. There is no fetch, no query invalidation, no mutation —
// the guest re-renders from its own state and publishes a tree. A host call happens only if the GUEST asks for
// one, which a filter box never does.
//
// LIFECYCLE: one host per (plugin × worker), created lazily by the mount when one of its scripted surfaces is
// on screen and disposed on unmount/disable. `dispose()` is idempotent and safe to call from a React cleanup.

import type { PluginLogLevel, PluginSurfaceSpec } from "@orb/contracts/plugin";
import { pluginSurfaceSpecSchema } from "@orb/contracts/plugin";
import type { UiGuestInbound, UiGuestOutbound, UiGuestSettledMessage } from "#lib";
import { timeLib, UI_GUEST_BOOT_WALL_MS, UI_GUEST_WALL_MS } from "#lib";

/** What the host reports OUT to its React owner. Every arm is a rendered outcome, not an internal event: the
 *  component maps them straight to what a person sees. */
interface PluginUiGuestEvents {
  /** A VALIDATED tree for one surface. Already through `pluginSurfaceSpecSchema` and already past the
   *  publish guard, so a caller may set state with it unconditionally. */
  readonly onTree: (surfaceId: string, tree: PluginSurfaceSpec) => void;
  /** The guest died: hung past its wall, threw at boot, or published something the schema refused. The surface
   *  collapses to null and the caller reports the crash. `reason` is operator-facing. */
  readonly onCrash: (reason: string) => void;
  /** A guest log line — surfaced through the plugin log affordance, never the console. */
  readonly onLog: (level: PluginLogLevel, message: string) => void;
  /** Relay a proxied host call. Resolves with the server's inert JSON result; rejects with a message the guest
   *  sees. The caller wires this to `trpc.plugin.uiHostCall` — this module never touches the network itself,
   *  which is what keeps the tRPC client out of a module that also owns an untrusted worker. */
  readonly onHostCall: (fn: string, argsJson: string) => Promise<string>;
}

export interface PluginUiGuestOptions {
  /** The `ui.js` source, already fetched from the owner-gated bytes route as TEXT. */
  readonly source: string;
  /** The plugin's granted capabilities — display-only inside the guest (see the protocol). */
  readonly grants: readonly string[];
  /** The scripted surface ids this plugin registered; a `render` naming anything else is dropped. */
  readonly surfaceIds: readonly string[];
  readonly events: PluginUiGuestEvents;
}

/** The live guest handle. */
export interface PluginUiGuest {
  /** Deliver a UI event INTO the guest. Fire-and-forget by design — the RESULT of an event is whatever tree the
   *  guest publishes next, not a return value, so there is nothing for a caller to await. */
  readonly deliverEvent: (
    surfaceId: string,
    event: { type: "action"; actionId: string } | { type: "field"; name: string; value: string },
    values: Record<string, string>,
  ) => void;
  /** Terminate and release. Idempotent. */
  readonly dispose: () => void;
  /** True until `dispose()` (or a crash) has torn the worker down. */
  readonly alive: () => boolean;
}

/** Build the worker. A separate function so the CT can see exactly one construction site, and so the
 *  `new URL(..., import.meta.url)` form vite requires for worker bundling lives in one place. */
function spawnWorker(): Worker {
  return new Worker(new URL("./ui-guest.worker.ts", import.meta.url), { type: "module", name: "orb-plugin-ui-guest" });
}

/** Start a Tier-C guest. Returns immediately; the guest boots asynchronously and the first `onTree` is what a
 *  caller waits for (there is deliberately no "ready" promise — a surface that never boots must render nothing,
 *  which is the same arm as a surface that has not published yet, §4.9). */
export function startPluginUiGuest(options: PluginUiGuestOptions): PluginUiGuest {
  const worker = spawnWorker();
  let disposed = false;
  /** The wall-clock timer for the operation currently in flight (boot, or one event). `undefined` = idle. */
  let wallTimer: ReturnType<typeof setTimeout> | undefined;
  /** The LAST tree published per surface, as its serialized form — the PUBLISH GUARD. */
  const published = new Map<string, string>();

  function clearWall(): void {
    if (wallTimer !== undefined) {
      clearTimeout(wallTimer);
      wallTimer = undefined;
    }
  }

  function kill(reason: string): void {
    if (disposed) {
      return;
    }
    disposed = true;
    clearWall();
    // THE KILL. `terminate()` stops the thread mid-instruction — the one thing a hung interpreter cannot argue
    // with, and the reason the interpreter is in a worker rather than on the main thread at all.
    worker.terminate();
    options.events.onCrash(reason);
  }

  /** Arm the wall for an operation. Re-arming while one is live is legitimate (a burst of keystrokes): the
   *  guest is single-threaded and processes them in order, so the LATEST deadline is the one that matters — an
   *  earlier timer firing mid-queue would kill a guest that is working normally. */
  function armWall(ms: number, what: string): void {
    clearWall();
    wallTimer = setTimeout(() => kill(`the plugin's interface did not respond within ${ms}ms (${what})`), ms);
  }

  function handleRender(surfaceId: string, treeJson: string): void {
    // THE PUBLISH GUARD (§4.6: "the host applies it behind a content-equality publish guard so a re-render loop
    // cannot form"), and it is placed BEFORE the parse on purpose: the common case is a guest re-publishing an
    // identical tree on every event, and comparing the serialized form is both the cheapest comparison
    // available and the exact one — two trees with the same JSON render the same pixels.
    if (published.get(surfaceId) === treeJson) {
      return;
    }
    let parsed: unknown;
    // @orb-gate-ignore caught-failure-ownership(default:catch): a malformed tree kills the guest with a named
    // reason (§4.9's fail-closed posture) — the failure is surfaced, not swallowed. Ends if `kill` stops being
    // called on this path.
    try {
      parsed = JSON.parse(treeJson);
    } catch {
      kill("the plugin's interface published something that was not a valid tree");
      return;
    }
    // THE TRUST BOUNDARY. The worker boundary validated nothing; this does. Same schema, same caps (32 KiB /
    // 256 nodes / depth 8 / every string bounded) the server applies at registration — depth-in-depth, and out
    // here it is the ONLY defence, because a scripted tree never passed through the server at all.
    const result = pluginSurfaceSpecSchema.safeParse(parsed);
    if (!result.success) {
      kill("the plugin's interface published a layout that failed validation");
      return;
    }
    published.set(surfaceId, treeJson);
    options.events.onTree(surfaceId, result.data);
  }

  async function handleHostCall(callId: number, fn: string, argsJson: string): Promise<void> {
    // The relay. Note what is NOT here: any decision about whether the call is allowed. The server re-gates
    // every one against the caller's own row, and duplicating that judgment here would create a second,
    // divergeable copy of the rule — the client's view of its grants is display-only by design.
    // @orb-gate-ignore caught-failure-ownership(empty:err): the failure is relayed back to the guest as a
    // rejected hostResult with the error's own message — fully propagated, never swallowed. Ends if the
    // message stops being sent.
    try {
      const resultJson = await options.events.onHostCall(fn, argsJson);
      send({ kind: "hostResult", callId, ok: true, resultJson });
    } catch (err) {
      send({ kind: "hostResult", callId, ok: false, message: err instanceof Error ? err.message : String(err) });
    }
  }

  function send(message: UiGuestInbound): void {
    if (!disposed) {
      worker.postMessage(message);
    }
  }

  worker.onmessage = (event: MessageEvent<UiGuestOutbound>): void => {
    if (disposed) {
      return;
    }
    const message = event.data;
    // An IF-CHAIN, not a switch, and that is a tooling fact rather than a taste one: biome's type service calls
    // every `case` of a switch over a cross-module discriminated union "unreachable" while tsc is fine
    // (`noUnnecessaryConditions`; paid on #764). Exhaustiveness is kept by the `settled` annotation at the tail
    // — a new outbound member fails `tsc` THERE until it is handled above.
    if (message.kind === "render") {
      handleRender(message.surfaceId, message.treeJson);
      return;
    }
    if (message.kind === "log") {
      options.events.onLog(message.level, message.message);
      return;
    }
    if (message.kind === "hostCall") {
      // @orb-gate-ignore caught-failure-ownership(promise:handleHostCall): handleHostCall already catches its
      // own await internally and always resolves (it sends a rejected hostResult instead of throwing) — this
      // outer catch is belt-and-suspenders. Ends if handleHostCall stops catching internally.
      void handleHostCall(message.callId, message.fn, message.argsJson).catch(() => undefined);
      return;
    }
    if (message.kind === "ready") {
      clearWall();
      if (!message.ok) {
        kill(`the plugin's interface failed to start: ${message.message}`);
      }
      return;
    }
    const settled: UiGuestSettledMessage = message;
    clearWall();
    if (!settled.ok) {
      // A THROWING handler is a crash like any other: §4.9's posture is that a broken surface renders nothing
      // and the counter hears about it, rather than leaving a half-updated widget on screen.
      kill(`the plugin's interface failed while handling an interaction: ${settled.message}`);
    }
  };

  // A worker-level error (a module that failed to load, an uncaught throw in the worker's OWN code) is a crash
  // of the same class — the surface has no guest, so it has nothing to draw.
  //
  // THE EVENT IS THE ONLY WITNESS, so it is not thrown away (#1856). This handler used to ignore its argument
  // and emit a fixed sentence, which is what a person then found in `lastError` — a report that names no file,
  // no line and no cause, for the one failure mode that leaves nothing else behind (the guest never started, so
  // there is no guest log either). #1856 sat unreproducible for exactly that reason. `ErrorEvent` carries
  // `message`/`filename`/`lineno`; a cross-origin worker script blanks them by spec, which is itself a
  // diagnosis, so the bare sentence remains the fallback rather than the default.
  worker.onerror = (event: ErrorEvent): void => {
    const where = event.filename === "" ? "" : ` (${event.filename}:${event.lineno}:${event.colno})`;
    const detail = event.message === "" ? "" : `: ${event.message}${where}`;
    kill(`the plugin's interface could not be loaded${detail}`);
  };

  armWall(UI_GUEST_BOOT_WALL_MS, "startup");
  send({
    kind: "boot",
    source: options.source,
    grants: options.grants,
    surfaceIds: options.surfaceIds,
    // THE SEAMS ARE INJECTED FROM HERE, exactly as compose injects the server guest's. `timeLib.now()` is the
    // client's ONE clock (never ambient `Date.now`), and the seed is a real CSPRNG draw rather than
    // `Math.random` — a guest-visible PRNG and a security token have opposite requirements, and taking the
    // seed from the audited source costs nothing.
    clockEpochMs: timeLib.now(),
    randomSeed: crypto.getRandomValues(new Uint32Array(1))[0] ?? 1,
  });

  return {
    deliverEvent: (surfaceId, event, values): void => {
      if (disposed) {
        return;
      }
      armWall(UI_GUEST_WALL_MS, "interaction");
      send({ kind: "event", surfaceId, event, values });
    },
    dispose: (): void => {
      if (disposed) {
        return;
      }
      disposed = true;
      clearWall();
      worker.terminate();
    },
    alive: (): boolean => !disposed,
  };
}
