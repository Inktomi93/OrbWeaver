// Read-only inventory: production owns registration and eligibility; cache evidence never stands in for a mounted host.
import type { ChatId, PluginId } from "@orb/kit/ids";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Trpc, TrpcClient } from "#data";
import { isRenderedElement } from "../../lib/agent-bridge.ts";
import type { OrbPluginPublication, OrbPluginUiCommand, OrbPluginUiHost, OrbPluginUiReader } from "../../lib/agent-plugin-bridge.ts";
import { PLUGIN_UI_AUDIT_ATTRIBUTES, PLUGIN_UI_COMMAND_LOCATIONS, pluginUiAuditKey } from "../../lib/plugin-ui-audit-attributes.ts";

const menuSchema = z.array(z.string());
const locationSchema = z.enum(PLUGIN_UI_COMMAND_LOCATIONS);

function attributeSelector(name: string, value: string): string {
  return `[${name}="${CSS.escape(value)}"]`;
}

function hostObservation(element: Element, selector: string, index: number): OrbPluginUiHost {
  return {
    selector,
    index,
    visible: isRenderedElement(element),
    inert: element.closest("[inert]") !== null,
    ariaHidden: element.closest('[aria-hidden="true"]') !== null,
  };
}

function surfaceHosts(pluginId: PluginId, surfaceId: string): readonly OrbPluginUiHost[] {
  const selector = attributeSelector(PLUGIN_UI_AUDIT_ATTRIBUTES.surface, pluginUiAuditKey(pluginId, surfaceId));
  return [...document.querySelectorAll(selector)].map((element, index) => hostObservation(element, selector, index));
}

function commandHosts(pluginId: PluginId, name: string, placements: OrbPluginUiCommand["placements"]): OrbPluginUiCommand["hosts"] {
  const identity = attributeSelector(PLUGIN_UI_AUDIT_ATTRIBUTES.command, pluginUiAuditKey(pluginId, name));
  return placements.flatMap(({ target }) => {
    const selector = `${identity}${attributeSelector(PLUGIN_UI_AUDIT_ATTRIBUTES.target, target)}`;
    return [...document.querySelectorAll(selector)].flatMap((element, index) => {
      const location = locationSchema.safeParse(element.getAttribute(PLUGIN_UI_AUDIT_ATTRIBUTES.location));
      return location.success ? [{ ...hostObservation(element, selector, index), target, location: location.data }] : [];
    });
  });
}

function menuHosts(pluginId: PluginId, name: string): readonly OrbPluginUiHost[] {
  const selector = `[${PLUGIN_UI_AUDIT_ATTRIBUTES.menu}]`;
  return [...document.querySelectorAll(selector)].flatMap((element, index) => {
    const raw = element.getAttribute(PLUGIN_UI_AUDIT_ATTRIBUTES.menu);
    let commands: readonly string[] | undefined;
    // Parser errors can contain private DOM values, so retain only the inventory's fixed refusal.
    try {
      const parsed = menuSchema.safeParse(raw === null ? null : JSON.parse(raw));
      commands = parsed.success ? parsed.data : undefined;
    } catch {
      commands = undefined;
    }
    if (commands === undefined) {
      throw new Error("Plugin UI inventory: malformed composer command metadata");
    }
    return commands.includes(pluginUiAuditKey(pluginId, name)) ? [hostObservation(element, selector, index)] : [];
  });
}

/** Build the inventory without fetching surface state, booting guests, or executing commands. */
export function buildAgentPluginUi(client: TrpcClient, trpc: Trpc, queryClient: QueryClient, readChatId: () => ChatId | null): OrbPluginUiReader {
  return async () => {
    const [plugins, surfaces, commands] = await Promise.all([
      client.plugin.list.query(),
      client.plugin.listSurfaces.query(),
      client.plugin.listCommands.query(),
    ]);
    const chatId = readChatId();
    const publication = (pluginId: PluginId, surfaceId: string): readonly OrbPluginPublication[] =>
      (chatId === null ? [null] : [null, chatId]).map((scope) => {
        const state = queryClient.getQueryState(trpc.plugin.getSurfaceState.queryKey({ pluginId, surfaceId, ...(scope === null ? {} : { chatId: scope }) }));
        return {
          chatId: scope,
          status: state?.status ?? null,
          fetchStatus: state?.fetchStatus ?? null,
          published: state?.data === undefined ? null : state.data !== null,
          updatedAt: state?.dataUpdatedAt ?? null,
        };
      });
    return {
      chatId,
      plugins: plugins.map(({ id, slug, name, version, status }) => ({
        id,
        slug,
        name,
        version,
        status,
        surfaces: surfaces
          .filter((surface) => surface.pluginId === id)
          .map((surface) => ({
            id: surface.id,
            anchor: surface.anchor,
            tier: surface.tier,
            title: surface.title,
            ...(surface.toolName === undefined ? {} : { toolName: surface.toolName }),
            ...(surface.toolWireName === undefined ? {} : { toolWireName: surface.toolWireName }),
            publication: surface.tier === "static" && surface.anchor !== "tool-card" ? publication(id, surface.id) : [],
            hosts: surfaceHosts(id, surface.id),
          })),
        commands: commands
          .filter((command) => command.pluginId === id)
          .map(({ name: commandName, describe, group, placements, composerDraft }) => ({
            name: commandName,
            describe,
            group,
            placements,
            ...(composerDraft === undefined ? {} : { composerDraft }),
            hosts: commandHosts(id, commandName, placements),
            menuHosts: menuHosts(id, commandName),
          })),
      })),
    };
  };
}
