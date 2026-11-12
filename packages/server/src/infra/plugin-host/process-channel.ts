// Inherited IPC identifies the spawned peer; broker generations prevent buffered work from crossing a restart.
//
// A FULL QUEUE REFUSES ONE FRAME, NEVER THE CHANNEL (D348). Every hop between the plugin host's processes queues what it
// has not yet written, up to `PLUGIN_IPC_QUEUE_MAX_BYTES`. A frame a plugin sized (a bridge call, its result, a
// command's value or answer, a log line) is offered on its runtime's share and, when it does not fit, refused alone:
// the producer, or a relay through the frame's route, sends the small refusal in its place. Only host control frames
// may use the last `PLUGIN_IPC_CONTROL_HEADROOM_BYTES`, so a refusal always fits, and a control frame that does not fit
// means the channel itself is broken.
import { PLUGIN_IPC_CONTROL_HEADROOM_BYTES, PLUGIN_IPC_QUEUE_MAX_BYTES, PLUGIN_IPC_REFUSAL_MAX_BYTES } from "./budgets.ts";
import type { PluginFrameRoute, PluginIpcMessage, PluginIpcSend } from "./contract/process-protocol.ts";
import { PLUGIN_BROKER_MESSAGE_MAX_BYTES } from "./process-protocol.ts";

const GENERATION_MIN_CHARS = 16;

type IpcFrame = Extract<PluginIpcMessage, { readonly kind: "frame" }>;
/** A frame a plugin sized, with the runtime whose share it uses. */
export type RoutedIpcFrame = IpcFrame & { readonly route: PluginFrameRoute };

function parseRoute(value: unknown): PluginFrameRoute | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const runtimeId: unknown = Reflect.get(value, "runtimeId");
  const refusal: unknown = Reflect.get(value, "refusal");
  if (typeof runtimeId !== "string" || runtimeId.length === 0) {
    return null;
  }
  if (refusal === undefined) {
    return { runtimeId };
  }
  if (typeof refusal !== "object" || refusal === null) {
    return null;
  }
  const frame: unknown = Reflect.get(refusal, "frame");
  const back: unknown = Reflect.get(refusal, "back");
  return typeof frame === "string" && Buffer.byteLength(frame, "utf8") <= PLUGIN_IPC_REFUSAL_MAX_BYTES && typeof back === "boolean"
    ? { runtimeId, refusal: { frame, back } }
    : null;
}

function parseFrame(value: object, generation: string): IpcFrame | null {
  const frame: unknown = Reflect.get(value, "frame");
  if (typeof frame !== "string" || Buffer.byteLength(frame, "utf8") > PLUGIN_BROKER_MESSAGE_MAX_BYTES) {
    return null;
  }
  const route: unknown = Reflect.get(value, "route");
  if (route === undefined) {
    return { kind: "frame", generation, frame };
  }
  const parsed = parseRoute(route);
  return parsed === null ? null : { kind: "frame", generation, frame, route: parsed };
}

/** Validate an inherited-channel envelope before routing its serialized frame. */
export function parsePluginIpcMessage(value: unknown): PluginIpcMessage | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const kind: unknown = Reflect.get(value, "kind");
  const generation: unknown = Reflect.get(value, "generation");
  if (typeof generation !== "string" || generation.length < GENERATION_MIN_CHARS) {
    return null;
  }
  if (kind === "ready") {
    return { kind, generation };
  }
  if (kind === "frame") {
    return parseFrame(value, generation);
  }
  const error: unknown = Reflect.get(value, "error");
  if (kind === "stopped" && typeof error === "object" && error !== null) {
    const name: unknown = Reflect.get(error, "name");
    const message: unknown = Reflect.get(error, "message");
    return typeof name === "string" && typeof message === "string" ? { kind, generation, error: { name, message } } : null;
  }
  return null;
}

/** Bound bytes retained in Node's IPC write queue until each send completes, in total and per plugin runtime. */
export class PluginIpcSender {
  private pendingBytes = 0;
  private readonly pendingByRuntime = new Map<string, number>();
  private closed = false;
  private readonly deliver: PluginIpcSend;
  private readonly fail: (error: Error) => void;
  private readonly shareBytes: number;
  constructor(deliver: PluginIpcSend, fail: (error: Error) => void, shareBytes: number) {
    this.deliver = deliver;
    this.fail = fail;
    this.shareBytes = shareBytes;
  }

  /** Queue a host control frame. The control headroom exists so that one always fits; one that does not, or a
   *  malformed one, is a broken channel. */
  send(message: PluginIpcMessage): void {
    this.assertOpen();
    const bytes = Buffer.byteLength(JSON.stringify(message), "utf8");
    if (parsePluginIpcMessage(message) === null || this.pendingBytes + bytes > PLUGIN_IPC_QUEUE_MAX_BYTES) {
      this.close();
      const error = new RangeError("plugin broker: inherited channel frame or write queue exceeds its byte cap");
      this.fail(error);
      throw error;
    }
    this.write(message, bytes, undefined);
  }

  /** Queue a frame a plugin sized on its runtime's share. False, with the channel left open, when the frame, the
   *  runtime's share or the queue short of its control headroom would pass its bound: the caller refuses that frame. */
  offer(message: RoutedIpcFrame): boolean {
    this.assertOpen();
    const bytes = Buffer.byteLength(JSON.stringify(message), "utf8");
    const runtimeId = message.route.runtimeId;
    const held = this.pendingByRuntime.get(runtimeId) ?? 0;
    if (
      parsePluginIpcMessage(message) === null ||
      this.pendingBytes + bytes > PLUGIN_IPC_QUEUE_MAX_BYTES - PLUGIN_IPC_CONTROL_HEADROOM_BYTES ||
      held + bytes > this.shareBytes
    ) {
      return false;
    }
    this.pendingByRuntime.set(runtimeId, held + bytes);
    this.write(message, bytes, runtimeId);
    return true;
  }

  close(): void {
    this.closed = true;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("plugin broker: inherited channel is closed");
    }
  }

  private release(bytes: number, runtimeId: string | undefined): void {
    this.pendingBytes -= bytes;
    if (runtimeId === undefined) {
      return;
    }
    const held = (this.pendingByRuntime.get(runtimeId) ?? bytes) - bytes;
    if (held > 0) {
      this.pendingByRuntime.set(runtimeId, held);
    } else {
      this.pendingByRuntime.delete(runtimeId);
    }
  }

  private write(message: PluginIpcMessage, bytes: number, runtimeId: string | undefined): void {
    this.pendingBytes += bytes;
    try {
      this.deliver(message, (error) => {
        this.release(bytes, runtimeId);
        if (error !== null && !this.closed) {
          this.close();
          this.fail(error);
        }
      });
    } catch (error) {
      this.release(bytes, runtimeId);
      this.close();
      const failure = error instanceof Error ? error : new Error("plugin broker: inherited channel write failed");
      this.fail(failure);
      throw failure;
    }
  }
}

/** Relay a frame through `target`. A routed frame that does not fit is refused alone: its refusal goes back through
 *  `back` or on through `target` as a control frame, and a frame with no refusal is dropped. */
export function relayFrame(message: IpcFrame, target: PluginIpcSender, back: PluginIpcSender): void {
  const route = message.route;
  if (route === undefined) {
    target.send(message);
    return;
  }
  if (target.offer({ ...message, route }) || route.refusal === undefined) {
    return;
  }
  (route.refusal.back ? back : target).send({ kind: "frame", generation: message.generation, frame: route.refusal.frame });
}
