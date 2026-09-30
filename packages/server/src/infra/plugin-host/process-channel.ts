// Inherited IPC identifies the spawned peer; broker generations prevent buffered work from crossing a restart.
import type { PluginIpcMessage, PluginIpcSend } from "./contract/process-protocol.ts";
import { PLUGIN_BROKER_MESSAGE_MAX_BYTES } from "./process-protocol.ts";

const IPC_QUEUE_FRAME_CAPACITY = 4;
const IPC_QUEUE_MAX_BYTES = PLUGIN_BROKER_MESSAGE_MAX_BYTES * IPC_QUEUE_FRAME_CAPACITY;
const GENERATION_MIN_CHARS = 16;

/** Validate an inherited-channel envelope before routing its serialized frame. */
export function parsePluginIpcMessage(value: unknown): PluginIpcMessage | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const kind = Reflect.get(value, "kind");
  const generation = Reflect.get(value, "generation");
  if (typeof generation !== "string" || generation.length < GENERATION_MIN_CHARS) {
    return null;
  }
  if (kind === "ready") {
    return { kind, generation };
  }
  if (kind === "frame") {
    const frame = Reflect.get(value, "frame");
    return typeof frame === "string" && Buffer.byteLength(frame, "utf8") <= PLUGIN_BROKER_MESSAGE_MAX_BYTES ? { kind, generation, frame } : null;
  }
  const error = Reflect.get(value, "error");
  if (kind === "stopped" && typeof error === "object" && error !== null) {
    const name = Reflect.get(error, "name");
    const message = Reflect.get(error, "message");
    return typeof name === "string" && typeof message === "string" ? { kind, generation, error: { name, message } } : null;
  }
  return null;
}

/** Bound bytes retained in Node's IPC write queue until each send completes. */
export class PluginIpcSender {
  private pendingBytes = 0;
  private closed = false;
  private readonly deliver: PluginIpcSend;
  private readonly fail: (error: Error) => void;
  constructor(deliver: PluginIpcSend, fail: (error: Error) => void) {
    this.deliver = deliver;
    this.fail = fail;
  }

  send(message: PluginIpcMessage): void {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: close() mutates this field between send calls; the analyzer misses cross-method writes.
    if (this.closed) {
      throw new Error("plugin broker: inherited channel is closed");
    }
    const bytes = Buffer.byteLength(JSON.stringify(message), "utf8");
    if (parsePluginIpcMessage(message) === null || this.pendingBytes + bytes > IPC_QUEUE_MAX_BYTES) {
      this.close();
      const error = new RangeError("plugin broker: inherited channel frame or write queue exceeds its byte cap");
      this.fail(error);
      throw error;
    }
    this.pendingBytes += bytes;
    try {
      this.deliver(message, (error) => {
        this.pendingBytes -= bytes;
        if (error !== null && !this.closed) {
          this.close();
          this.fail(error);
        }
      });
    } catch (error) {
      this.pendingBytes -= bytes;
      this.close();
      const failure = error instanceof Error ? error : new Error("plugin broker: inherited channel write failed");
      this.fail(failure);
      throw failure;
    }
  }

  close(): void {
    this.closed = true;
  }
}
