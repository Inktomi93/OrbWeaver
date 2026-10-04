// CT: plugin provider lifecycle and the saved connection it supplies share one live query client. The test
// warms every connection read before toggling lifecycle state so only correct invalidation can move the UI.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { PluginProviderConnectionLifecycleStory } from "../_ct-stories.tsx";

const PLUGIN_ID = "plugin_ct_provider_lifecycle01";
const CONNECTION_ID = "user_connection_ctprovider001";
const CREDENTIAL_ID = "user_credential_ctprovider001";
const PROVIDER_ID = "plugin:relay/anthropic";
const ROW_NAME = "Relay Claude · claude-sonnet-4";

const RELAY_PROVIDER: TrpcWireOutput<"connection.providersAvailable">[number]["provider"] = {
  id: PROVIDER_ID,
  label: "Anthropic",
  wire: "anthropic-messages",
  auth: "apiKey",
  baseUrl: "https://relay.example/v1",
  apis: ["anthropic-messages"],
  catalog: "url",
  metered: true,
};

const GENERATION_CAPABILITY: NonNullable<TrpcWireOutput<"connection.capabilities">["capability"]> = {
  kind: "generation",
  generation: {
    reasoning: { mode: "none", enabled: false },
    sampling: {},
    input: ["text"],
    output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"], structured: true },
    context: { window: 32_768 },
    tools: { parallel: true },
  },
};

const CAPABILITIES = {
  capability: GENERATION_CAPABILITY,
  baseline: GENERATION_CAPABILITY,
  warnings: [],
  tasks: ["chat", "agent", "summarize", "structured"],
} satisfies TrpcWireOutput<"connection.capabilities">;

const CATALOG_MODELS = {
  listed: true,
  models: [
    {
      id: "anthropic/claude-sonnet-4",
      name: "Claude Sonnet 4",
      contextLength: null,
      promptPrice: null,
      completionPrice: null,
      cacheReadPrice: null,
      cacheWritePrice: null,
      inputModalities: [],
      supportedParameters: [],
    },
  ],
} satisfies TrpcWireOutput<"connection.catalogModels">;

const PLUGIN_STATUSES = ["enabled", "disabled", "errored", "uninstalled"] as const;
type PluginStatus = (typeof PLUGIN_STATUSES)[number];

interface LifecycleStubOptions {
  readonly gitUpdateActivationFails?: boolean;
  readonly pendingReconsent?: boolean;
  readonly setGrantActivationFails?: boolean;
  readonly withSiblingConnection?: boolean;
}

async function stubLifecycle(page: Page, options: LifecycleStubOptions = {}): Promise<TrpcRecorder> {
  let pluginStatus: PluginStatus = "enabled";
  let connectionPresent = true;
  let consentSettled = false;
  let sourceCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const gitUpdate = options.gitUpdateActivationFails === true;
  const pendingReconsent = (): boolean => options.pendingReconsent === true && !consentSettled;
  const providerActive = (): boolean => pluginStatus === "enabled";
  const pluginSource = (): Pick<TrpcWireOutput<"plugin.list">[number], "origin" | "sourceUrl" | "sourceCommit" | "updateSource"> =>
    gitUpdate
      ? { origin: "git", sourceUrl: "https://git.example/relay.git", sourceCommit, updateSource: "git" }
      : { origin: "upload", sourceUrl: null, sourceCommit: null, updateSource: null };
  const connection = (): TrpcWireOutput<"connection.get"> => ({
    id: CONNECTION_ID,
    ownerId: "user_ct_plugin_provider",
    label: "Relay Claude",
    providerId: PROVIDER_ID,
    providerLabel: providerActive() ? "Anthropic · plugin relay" : PROVIDER_ID,
    credentialId: CREDENTIAL_ID,
    baseUrl: null,
    model: "anthropic/claude-sonnet-4",
    api: "auto",
    declared: null,
    extras: null,
    transport: null,
    modelCheck: "listed",
    allowBackground: true,
    promptCache: null,
    tasks: providerActive() ? ["chat", "agent", "summarize", "structured"] : [],
    createdAt: 0,
    updatedAt: 0,
  });
  const siblingConnection = (): TrpcWireOutput<"connection.get"> => ({
    ...connection(),
    id: "user_connection_ctprovider002",
    label: "Relay Haiku",
    model: "anthropic/claude-haiku-4",
  });
  const plugin = (): TrpcWireOutput<"plugin.list">[number] => ({
    id: PLUGIN_ID,
    slug: "relay",
    name: "Relay",
    version: "1.0.0",
    status: pluginStatus === "uninstalled" ? "disabled" : pluginStatus,
    ...pluginSource(),
    declaredCapabilities: options.pendingReconsent === true ? ["chat.read"] : [],
    grantedCapabilities: options.pendingReconsent === true && !pendingReconsent() ? ["chat.read"] : [],
    netHosts: null,
    reconsentPending: pendingReconsent(),
    widenedNetHosts: [],
    builtAgainst: null,
    lastError: pluginStatus === "errored" ? "relay boot failed" : null,
    installedAt: 0,
    updatedAt: 0,
  });

  return await routeTrpc(page, {
    "sessions.me": () => ({ userId: "user_ct_plugin_provider", handle: "plugin_provider", globalRole: "user" }),
    "plugin.list": () => (pluginStatus === "uninstalled" ? [] : [plugin()]),
    "plugin.getLog": () => [],
    "plugin.listSurfaces": () => [],
    "plugin.checkForUpdates": () =>
      gitUpdate ? [{ pluginId: PLUGIN_ID, status: "source-changed", sourceCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }] : [],
    "plugin.upgradeFromStoredGit": () => {
      sourceCommit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
      pluginStatus = "errored";
      return plugin();
    },
    "plugin.setEnabled": ({ enabled }) => {
      pluginStatus = enabled ? "enabled" : "disabled";
      return null;
    },
    "plugin.setGrant": () => {
      consentSettled = true;
      if (options.setGrantActivationFails === true) {
        pluginStatus = "errored";
      }
      return plugin();
    },
    "plugin.uninstall": () => {
      pluginStatus = "uninstalled";
      return null;
    },
    "connection.list": () => [...(connectionPresent ? [connection()] : []), ...(options.withSiblingConnection === true ? [siblingConnection()] : [])],
    "connection.get": ({ connectionId }) => (connectionId === CONNECTION_ID ? connection() : siblingConnection()),
    "connection.listBindings": () => [],
    "connection.providersAvailable": () => (providerActive() ? [{ provider: RELAY_PROVIDER, available: true }] : []),
    "connection.capabilities": () =>
      providerActive() ? CAPABILITIES : trpcError({ code: "NOT_FOUND", message: `provider "${PROVIDER_ID}" is not registered` }),
    "connection.catalogModels": () =>
      providerActive() ? CATALOG_MODELS : trpcError({ code: "NOT_FOUND", message: `provider "${PROVIDER_ID}" is not registered` }),
    "connection.remove": ({ connectionId }): undefined => {
      if (connectionId === CONNECTION_ID) {
        connectionPresent = false;
      }
    },
    "credentials.list": () => [
      { id: CREDENTIAL_ID, provider: PROVIDER_ID, label: "relay key", revokedAt: null, revokedReason: null, createdAt: 0, updatedAt: 0 },
    ],
  });
}

test("disable, re-enable and uninstall refresh a warmed provider connection, then removal restores focus to the list", async ({ mount, page }) => {
  const recorder = await stubLifecycle(page);
  const component = await mount(<PluginProviderConnectionLifecycleStory />);

  await expect(component.getByText("Provider unavailable", { exact: true })).toHaveCount(0);
  const sourceRow = component.getByRole("button", { name: ROW_NAME, exact: true });
  await sourceRow.click();
  await expect(component.getByRole("button", { name: "Back to Connections" })).toBeFocused();
  await expect(component.getByText("Model", { exact: true }).first()).toBeVisible();
  await expect.poll(() => recorder.count("connection.capabilities")).toBe(1);
  await component.getByRole("button", { name: "Done", exact: true }).click();
  await expect(sourceRow).toBeFocused();

  await component.getByRole("switch", { name: "Turn Relay off" }).click();
  await expect(component.getByText("Off", { exact: true })).toBeVisible();
  await expect(component.getByText("Provider unavailable", { exact: true })).toBeVisible();
  await expect.poll(() => recorder.count("connection.providersAvailable")).toBeGreaterThan(1);
  await component.getByRole("button", { name: ROW_NAME, exact: true }).click();
  await expect(component.getByRole("button", { name: "Back to Connections" })).toBeFocused();
  await expect(component.getByRole("heading", { name: "Provider unavailable" })).toBeVisible();
  await expect.poll(() => recorder.count("connection.capabilities")).toBe(1);
  await component.getByRole("button", { name: "Back to Connections" }).click();
  await expect(sourceRow).toBeFocused();

  await component.getByRole("switch", { name: "Turn Relay on" }).click();
  await expect(component.getByText("On — nothing granted yet", { exact: true })).toBeVisible();
  await expect(component.getByText("Provider unavailable", { exact: true })).toHaveCount(0);
  await component.getByRole("button", { name: ROW_NAME, exact: true }).click();
  await expect(component.getByText("Model", { exact: true }).first()).toBeVisible();
  await expect.poll(() => recorder.count("connection.capabilities")).toBe(2);
  await component.getByRole("button", { name: "Back to Connections" }).click();

  await component.getByRole("button", { name: "More actions for Relay", exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove", exact: true }).click();
  await page.getByRole("alertdialog", { name: 'Remove "Relay"?' }).getByRole("button", { name: "Remove plugin" }).click();
  await expect(component.getByText("Nothing installed yet.", { exact: false })).toBeVisible();
  await expect(component.getByText("Provider unavailable", { exact: true })).toBeVisible();
  await component.getByRole("button", { name: ROW_NAME, exact: true }).click();
  await expect(component.getByRole("heading", { name: "Provider unavailable" })).toBeVisible();
  const managePlugins = component.getByRole("button", { name: "Manage plugins", exact: true });
  await expect(managePlugins).toBeVisible();
  await managePlugins.click();
  await expect(component.getByTestId("active-config-group")).toHaveText("plugins");
  await expect.poll(() => recorder.count("connection.capabilities")).toBe(2);

  await component.getByRole("button", { name: "Remove connection" }).click();
  await page.getByRole("alertdialog", { name: 'Remove "Relay Claude"?' }).getByRole("button", { name: "Remove" }).click();
  await expect(component.getByText("No connections yet", { exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Add connection" })).toBeFocused();
});

test("deleting an edited row restores focus to the next connection", async ({ mount, page }) => {
  await stubLifecycle(page, { withSiblingConnection: true });
  const component = await mount(<PluginProviderConnectionLifecycleStory />);

  await component.getByRole("switch", { name: "Turn Relay off" }).click();
  await expect(component.getByText("Provider unavailable", { exact: true })).toHaveCount(2);
  await component.getByRole("button", { name: ROW_NAME, exact: true }).click();
  await expect(component.getByRole("button", { name: "Back to Connections" })).toBeFocused();

  await component.getByRole("button", { name: "Remove connection" }).click();
  await page.getByRole("alertdialog", { name: 'Remove "Relay Claude"?' }).getByRole("button", { name: "Remove" }).click();

  await expect(component.getByRole("button", { name: "Relay Haiku · claude-haiku-4", exact: true })).toBeFocused();
  await expect(component.getByRole("button", { name: ROW_NAME, exact: true })).toHaveCount(0);
});

test("a failed re-consent reactivation refreshes the warmed provider connection without dialing the missing provider", async ({ mount, page }) => {
  const recorder = await stubLifecycle(page, { pendingReconsent: true, setGrantActivationFails: true });
  const component = await mount(<PluginProviderConnectionLifecycleStory />);

  await expect(component.getByText("Provider unavailable", { exact: true })).toHaveCount(0);
  await component.getByRole("button", { name: ROW_NAME, exact: true }).click();
  await expect(component.getByText("Model", { exact: true }).first()).toBeVisible();
  await expect.poll(() => recorder.count("connection.capabilities")).toBe(1);
  await component.getByRole("button", { name: "Back to Connections" }).click();

  await component.getByRole("button", { name: "Approve all" }).click();
  await expect(component.getByText("Stopped after an error", { exact: true })).toBeVisible();
  await expect(component.getByText("Provider unavailable", { exact: true })).toBeVisible();
  await expect.poll(() => recorder.count("connection.providersAvailable")).toBeGreaterThan(1);
  await expect
    .poll(() => recorder.lastInput("plugin.setGrant"))
    .toEqual({
      acknowledgedNetHosts: [],
      enable: true,
      grant: ["chat.read"],
      pluginId: PLUGIN_ID,
    });

  await component.getByRole("button", { name: ROW_NAME, exact: true }).click();
  await expect(component.getByRole("heading", { name: "Provider unavailable" })).toBeVisible();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the unavailable editor is the settled branch chosen
  // after both the invalidated provider roster and connection row repainted. A capabilities read would have
  // to mount instead of this branch, so its recorded count is final here; polling could pass while it was 1.
  expect(recorder.count("connection.capabilities")).toBe(1);
});

test("a Git update that loses its provider refreshes the warmed connection into the unavailable editor", async ({ mount, page }) => {
  const recorder = await stubLifecycle(page, { gitUpdateActivationFails: true });
  const component = await mount(<PluginProviderConnectionLifecycleStory />);

  await component.getByRole("button", { name: ROW_NAME, exact: true }).click();
  await expect(component.getByText("Model", { exact: true }).first()).toBeVisible();
  await expect.poll(() => recorder.count("connection.capabilities")).toBe(1);
  await component.getByRole("button", { name: "Back to Connections" }).click();

  await component.getByRole("button", { name: "Check Relay for updates", exact: true }).click();
  const update = component.getByRole("button", { name: "Update Relay from commit bbbbbbbbbbbb", exact: true });
  await expect(update).toBeVisible();
  await update.click();

  await expect(component.getByText("Stopped after an error", { exact: true })).toBeVisible();
  await expect(component.getByText("Provider unavailable", { exact: true })).toBeVisible();
  await expect.poll(() => recorder.count("connection.providersAvailable")).toBeGreaterThan(1);
  await expect
    .poll(() => recorder.lastInput("plugin.upgradeFromStoredGit"))
    .toEqual({ pluginId: PLUGIN_ID, expectedCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" });

  await component.getByRole("button", { name: ROW_NAME, exact: true }).click();
  await expect(component.getByRole("heading", { name: "Provider unavailable" })).toBeVisible();
  await expect.poll(() => recorder.count("connection.capabilities")).toBe(1);
});
