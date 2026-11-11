// A real guest whose one command runs a named host call in the invoking room and logs the outcome, so a suite
// observes what the guest saw through the owner's own plugin log, never a row read or a fake host.
import type { Principal } from "@orb/contracts/identity";
import type { PluginCapability } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { ChatId, PluginId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { z } from "zod";
import type { ServerTestHarness } from "../server.ts";
import { makePluginBundle } from "./plugin.ts";

const COMMAND = "run";

/** One host call per op name: a guest-side arrow `(h, room, a) => Promise<unknown>` over the parsed command args. */
export type GuestOps = Readonly<Record<string, string>>;

const outcomeSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), value: jsonValueSchema }),
  z.strictObject({ ok: z.literal(false), name: z.string() }),
]);
type GuestOutcome = z.infer<typeof outcomeSchema>;

function guestSource(ops: GuestOps): string {
  const table = Object.entries(ops)
    .map(([name, body]) => `${JSON.stringify(name)}: ${body}`)
    .join(",\n");
  return `const h = orb.host(1);
const ops = {
${table}
};
h.ui.registerCommand({ name: ${JSON.stringify(COMMAND)}, describe: "Run one host call", onRun: async ({ args }) => {
  const a = JSON.parse(args);
  try {
    const value = await ops[a.op](h, a.room === false ? null : h.chat.current(), a);
    h.log.info(JSON.stringify({ ok: true, value: value === undefined ? null : value }));
  } catch (error) {
    h.log.info(JSON.stringify({ ok: false, name: String(error && error.name) }));
  }
}});`;
}

interface GuestPlugin {
  readonly slug: string;
  /** The manifest's display name; the slug when omitted. */
  readonly name?: string;
  readonly capabilities: readonly PluginCapability[];
  readonly netHosts?: readonly string[];
}

/** What the guest helpers use of a root: its services and its clock, so a native-time root serves as well. */
interface GuestRoot {
  readonly services: ServerTestHarness["services"];
  readonly clock: Pick<ServerTestHarness["clock"], "now">;
}

/** Install and enable the guest through the owner's own consent verbs; `ui.surface` carries the command. */
export async function installGuest(root: GuestRoot, caller: Principal, plugin: GuestPlugin, ops: GuestOps): Promise<PluginId> {
  const capabilities: PluginCapability[] = ["ui.surface", ...plugin.capabilities];
  const manifest = pluginManifestSchema.parse({
    id: plugin.slug,
    name: plugin.name ?? plugin.slug,
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Runs one host call per command.",
    capabilities,
    ...(plugin.netHosts === undefined ? {} : { netHosts: plugin.netHosts }),
  });
  const installed = await root.services.plugin.install({ caller, bundle: makePluginBundle(manifest, guestSource(ops), root.clock.now()), grant: [] });
  await root.services.plugin.setGrant({ caller, pluginId: installed.id, grant: capabilities, acknowledgedNetHosts: plugin.netHosts ?? [], enable: true });
  return installed.id;
}

/** One macro a guest registers. It resolves to `answer`, or to the number of times it has run (`counts`, kept in the
 *  plugin's own storage), or throws (`throws`), or never settles (`stalls`, a guest past the deadline). */
export interface GuestMacro {
  readonly name: string;
  readonly description: string;
  readonly answer?: string;
  readonly counts?: true;
  readonly throws?: true;
  readonly stalls?: true;
}

/** Install and enable a real guest whose activation registers the given macros. */
export async function installMacroGuest(
  root: ServerTestHarness,
  caller: Principal,
  plugin: Pick<GuestPlugin, "slug" | "name">,
  macros: readonly GuestMacro[],
): Promise<PluginId> {
  const capabilities: PluginCapability[] = macros.some((macro) => macro.counts === true) ? ["chat.transform", "storage.kv"] : ["chat.transform"];
  const manifest = pluginManifestSchema.parse({
    id: plugin.slug,
    name: plugin.name ?? plugin.slug,
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Registers macros.",
    capabilities,
  });
  const source = `const h = orb.host(1);
for (const { answer, counts, throws, stalls, ...macro } of ${JSON.stringify(macros)}) {
  h.macros.register({
    ...macro,
    resolve: async () => {
      if (stalls) {
        return new Promise(() => {});
      }
      if (throws) {
        throw new Error("boom");
      }
      if (counts) {
        const runs = Number((await h.storage.get("runs")) ?? "0") + 1;
        await h.storage.set("runs", String(runs));
        return String(runs);
      }
      return answer ?? "answer";
    },
  });
}`;
  const installed = await root.services.plugin.install({ caller, bundle: makePluginBundle(manifest, source, root.clock.now()), grant: [] });
  await root.services.plugin.setGrant({ caller, pluginId: installed.id, grant: capabilities, acknowledgedNetHosts: [], enable: true });
  return installed.id;
}

interface GuestTarget {
  readonly root: GuestRoot;
  readonly caller: Principal;
  readonly pluginId: PluginId;
  /** The invoking room; `null` runs the command outside any room. */
  readonly chatId: ChatId | null;
}

export type GuestRun = (op: string, args?: Readonly<Record<string, JsonValue>>) => Promise<GuestOutcome>;

/** Run ops through the production command door and read the guest's own report of each. */
export function guestRunner({ root, caller, pluginId, chatId }: GuestTarget): GuestRun {
  return async (op, args = {}) => {
    await root.services.plugin.invokeUiCommand({ caller, pluginId, name: COMMAND, chatId, args: JSON.stringify({ ...args, op, room: chatId !== null }) });
    const [line] = await root.services.plugin.getLog({ caller, pluginId, limit: 1 });
    if (line === undefined) {
      throw new Error(`the guest logged no outcome for '${op}'`);
    }
    return outcomeSchema.parse(JSON.parse(line.message));
  };
}
