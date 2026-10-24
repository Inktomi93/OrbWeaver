// Controls only the inherited channel of actual watchdog children; the application owns their lifetime.
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import type { PluginCapability, PluginView } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import type { PluginHostSeamDeps } from "@orb/server/infra/plugin-host";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { makePluginBundle } from "@orb/testkit/node/composed";

export const PLUGIN_PROCESS_OPERATIONS = { mint: "seam.mintId", read: "storage.get", write: "storage.set", variableWrite: "variables.set" } as const;

function objectValue(value: JsonValue): value is Extract<JsonValue, Record<string, JsonValue>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Read only a named field from the real serialized IPC frame. */
export function frameField(value: unknown, key: string): JsonValue | undefined {
  const envelope = jsonValueSchema.parse(value);
  if (!objectValue(envelope) || typeof envelope["frame"] !== "string") {
    return;
  }
  const frame = jsonValueSchema.parse(JSON.parse(envelope["frame"]));
  return objectValue(frame) ? frame[key] : undefined;
}

/** Change an actual captured bridge request only for an adverse wire-boundary case. */
export function bridgeRequest(value: unknown, operation: string, args: readonly JsonValue[]): JsonValue {
  const envelope = jsonValueSchema.parse(value);
  if (!objectValue(envelope) || typeof envelope["frame"] !== "string") {
    throw new Error("the captured message has no serialized frame");
  }
  const frame = jsonValueSchema.parse(JSON.parse(envelope["frame"]));
  if (!objectValue(frame) || frame["kind"] !== "bridge") {
    throw new Error("the captured message is not a bridge request");
  }
  return { ...envelope, frame: JSON.stringify({ ...frame, operation, args }) };
}

/** Replace one actual command response with adverse wire data while retaining its live request identity. */
export function responseResult(value: unknown, result: JsonValue): JsonValue {
  const envelope = jsonValueSchema.parse(value);
  const id = frameField(value, "id");
  if (!objectValue(envelope) || typeof id !== "string" || !objectValue(result)) {
    throw new Error("the captured command response has no request identity");
  }
  return { ...envelope, frame: JSON.stringify({ kind: "response", id, ...result }) };
}

interface HeldMessage extends Disposable {
  readonly reached: Promise<unknown>;
  readonly release: (replacement?: JsonValue) => void;
}

interface ChildMessageHold {
  readonly event: string;
  readonly matches: (value: unknown) => boolean;
  readonly capture: (value: unknown, deliver: (replacement?: JsonValue) => void) => void;
}

/** Return real children unchanged except for one explicitly held inbound message. */
export function createPluginProcessEdge(): {
  readonly spawn: NonNullable<PluginHostSeamDeps["spawn"]>;
  readonly children: readonly ChildProcess[];
  readonly delivered: readonly unknown[];
  readonly holdNext: (matches: (value: unknown) => boolean, event?: string) => HeldMessage;
} {
  const children: ChildProcess[] = [];
  const delivered: unknown[] = [];
  let hold: ChildMessageHold | undefined;
  const execute: NonNullable<PluginHostSeamDeps["spawn"]> = (...args) => {
    const child = spawn(...args);
    const emit = child.emit.bind(child);
    child.emit = (event: string | symbol, ...values: unknown[]): boolean => {
      const value = values[0];
      const current = hold;
      if (event === current?.event && current.matches(value)) {
        hold = undefined;
        current.capture(value, (replacement) => {
          const forwarded = replacement ?? value;
          if (event === "message") {
            delivered.push(forwarded);
          }
          emit(event, forwarded, ...values.slice(1));
        });
        return true;
      }
      if (event === "message") {
        delivered.push(value);
      }
      return emit(event, ...values);
    };
    children.push(child);
    return child;
  };
  return {
    spawn: execute,
    children,
    delivered,
    holdNext: (matches, event = "message"): HeldMessage => {
      if (hold !== undefined) {
        throw new Error("an inbound plugin message is already held");
      }
      const reached = Promise.withResolvers<unknown>();
      let deliver: ((replacement?: JsonValue) => void) | undefined;
      let released = false;
      const pending: ChildMessageHold = {
        event,
        matches,
        capture: (value, forward) => {
          deliver = forward;
          reached.resolve(value);
          if (released) {
            forward();
          }
        },
      };
      const release = (replacement?: JsonValue): void => {
        if (released) {
          return;
        }
        released = true;
        if (hold === pending) {
          hold = undefined;
        }
        deliver?.(replacement);
      };
      hold = pending;
      return { reached: reached.promise, release, [Symbol.dispose]: () => release() };
    },
  };
}

type PluginService = ServerTestHarness["services"]["plugin"];

interface InstalledGuest {
  readonly caller: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly pluginId: Awaited<ReturnType<PluginService["install"]>>["id"];
  readonly enable: () => ReturnType<PluginService["setGrant"]>;
  readonly invoke: (name: string) => ReturnType<PluginService["invokeUiCommand"]>;
  readonly disable: () => ReturnType<PluginService["setEnabled"]>;
  readonly log: () => ReturnType<PluginService["getLog"]>;
  readonly read: (key: string) => Promise<JsonValue>;
  readonly view: () => Promise<PluginView>;
}

/** Install admitted bytes; enablement and every callback still use the actual plugin service. */
export async function installGuest(root: ServerTestHarness, slug: string, source: string, capabilities: readonly PluginCapability[]): Promise<InstalledGuest> {
  const caller = await root.principalFor(root.ownerId);
  const manifest = pluginManifestSchema.parse({
    id: slug,
    name: slug,
    description: "Native plugin process regression",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities,
  });
  const installed = await root.services.plugin.install({ caller, bundle: makePluginBundle(manifest, source, root.clock.now()), grant: [] });
  const enable = (): ReturnType<PluginService["setGrant"]> =>
    root.services.plugin.setGrant({ caller, pluginId: installed.id, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true });
  const rpc = await root.internalCallerFor(root.ownerId);
  return {
    caller,
    pluginId: installed.id,
    enable,
    invoke: (name: string): ReturnType<PluginService["invokeUiCommand"]> =>
      rpc.plugin.invokeUiCommand({ pluginId: installed.id, name, args: "", chatId: null }),
    disable: (): ReturnType<PluginService["setEnabled"]> => root.services.plugin.setEnabled({ caller, pluginId: installed.id, enabled: false }),
    log: (): ReturnType<PluginService["getLog"]> => root.services.plugin.getLog({ caller, pluginId: installed.id }),
    read: async (key: string): Promise<JsonValue> =>
      jsonValueSchema.parse(
        JSON.parse((await rpc.plugin.uiHostCall({ pluginId: installed.id, fn: "storage.get", argsJson: JSON.stringify([key]) })).resultJson),
      ),
    view: async (): Promise<PluginView> => {
      const found = (await root.services.plugin.list({ caller })).find(({ id }) => id === installed.id);
      if (found === undefined) {
        throw new Error("the installed guest is missing from the owner's plugin list");
      }
      return found;
    },
  };
}

export const NATIVE_TIMEOUT_MS = 30_000;
export const STOPPED = "continuation stopped:";
export const FLOOD_HOST_CALLS = 1024;
export const BASE_GRANTS = ["ui.surface", "storage.kv"] as const;
export const NOOP_COMMAND = 'h.ui.registerCommand({name:"noop",describe:"Native no-op",onRun:()=>{}});';

export function firstChild(edge: ReturnType<typeof createPluginProcessEdge>): ChildProcess {
  const child = edge.children[0];
  if (child === undefined) {
    throw new Error("the production host did not spawn its watchdog");
  }
  return child;
}

export function hasOperation(value: unknown, operation: string): boolean {
  return frameField(value, "kind") === "bridge" && frameField(value, "operation") === operation;
}

export function releasedAuthorities(edge: ReturnType<typeof createPluginProcessEdge>): number {
  return edge.delivered.filter((value) => frameField(value, "kind") === "authority-released").length;
}

export function floatCommand(body: string): string {
  return `const h=orb.host(1);${NOOP_COMMAND}
    h.ui.registerCommand({name:"float",describe:"Continue after return",onRun:()=>{
      void(async()=>{await h.storage.get("gate");${body}})().catch(e=>h.log.warn(${JSON.stringify(STOPPED)}+e.name+":"+e.message));
    }});`;
}
