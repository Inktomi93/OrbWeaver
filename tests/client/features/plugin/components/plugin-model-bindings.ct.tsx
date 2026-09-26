// CT: a plugin row's "Model it uses" disclosure — one picker per task the plugin routes through its OWN grant
// binding, over the installer's own connections, through the REAL Plugins pane with the network stubbed
// (routeTrpc). Every write is asserted by its full input, so the actor kind, the plugin id and the task are
// pinned on each one; every read state is driven through the same `listBindings` door production reads.

import { ROUTABLE_TASKS } from "@orb/contracts/inference";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import {
  PLUGIN_MODEL_DELETED,
  PLUGIN_MODEL_HEADING,
  PLUGIN_MODEL_NOT_YOURS,
  PLUGIN_MODEL_UNSET,
  pluginModelBackgroundRefused,
  pluginModelReadout,
} from "../../../../../packages/client/src/features/plugin/lib/plugin-copy.ts";
import type { TrpcRecorder, TrpcResponder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { PluginsSurfaceStory } from "../_ct-stories.tsx";

type PluginRow = TrpcWireOutput<"plugin.list">[number];
type ConnectionRow = TrpcWireOutput<"connection.list">[number];
type BindingView = TrpcWireOutput<"connection.listBindings">[number];

const A_PAST_INSTANT = 1_760_000_000_000;
const USER_VIEWER = { userId: "user_ct_plugin", handle: "plugin_user", globalRole: "user" } satisfies TrpcWireOutput<"sessions.me">;
const PLUGIN_ID = "plugin_ctmodel00000000000001";
const CAPTIONER = {
  id: PLUGIN_ID,
  slug: "captioner",
  name: "Captioner",
  version: "1.0.0",
  status: "enabled",
  origin: "upload",
  sourceUrl: null,
  updateSource: null,
  declaredCapabilities: ["chat.read", "llm.quiet"],
  grantedCapabilities: ["chat.read", "llm.quiet"],
  netHosts: null,
  reconsentPending: false,
  widenedNetHosts: [],
  builtAgainst: null,
  lastError: null,
  installedAt: A_PAST_INSTANT,
  updatedAt: A_PAST_INSTANT,
} satisfies PluginRow;

function connectionRow(over: Partial<ConnectionRow>): ConnectionRow {
  return {
    id: "user_connection_ctmodel0001",
    ownerId: "user_ct_plugin",
    label: "Fast captions",
    providerId: "openrouter",
    providerLabel: "OpenRouter",
    credentialId: null,
    baseUrl: null,
    model: "openai/gpt-5-mini",
    api: "auto",
    declared: null,
    extras: null,
    transport: null,
    modelCheck: "listed",
    allowBackground: true,
    promptCache: null,
    tasks: ["chat", "summarize", "structured"],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const FAST = connectionRow({});
/** A row that may not run unattended — the server refuses it for a plugin's text requests. */
const FOREGROUND_ONLY = connectionRow({ id: "user_connection_ctmodel0002", label: "Chat only", allowBackground: false });
/** A row no plugin text request can use: it cannot summarize. */
const EMBEDDER = connectionRow({ id: "user_connection_ctmodel0003", label: "Embedder", tasks: ["embed"] });

function grantBinding(connectionId: string | null): NonNullable<BindingView["binding"]> {
  return { id: "connection_binding_ctmodel", actorKind: "plugin-grant", userId: null, ruleId: null, pluginId: PLUGIN_ID, task: "summarize", connectionId };
}

const RESOLVED_FAST = {
  task: "summarize",
  connectionId: FAST.id,
  providerId: "openrouter",
  wire: "openai-compat",
  api: "chat-completions",
  model: FAST.model,
  capability: {
    kind: "generation",
    generation: {
      reasoning: { mode: "none", enabled: false },
      sampling: {},
      input: ["text"],
      output: { maxTokens: { min: 1, max: 4096 }, modalities: ["text"] },
      context: { window: 8192, windowEstimated: true },
      turns: {
        assistantPrefill: false,
        midConversationSystem: false,
        historySystemRows: false,
        roleHandlingFloor: "none",
        explicitPromptCache: false,
        cacheMinTokens: 1024,
      },
    },
  },
  requirement: { ok: true },
} satisfies NonNullable<BindingView["resolved"]>;

/** One view per routable task; `summarize` carries the scenario. */
function views(summarize: Partial<BindingView>): BindingView[] {
  return ROUTABLE_TASKS.map((task) => ({ task, binding: null, resolved: null, unavailableCause: null, ...(task === "summarize" ? summarize : {}) }));
}

interface StubRoutes {
  readonly bindings?: TrpcResponder<"connection.listBindings">;
  readonly setBinding?: TrpcResponder<"connection.setBinding">;
  readonly plugins?: readonly PluginRow[];
}

async function stub(page: Page, routes: StubRoutes = {}): Promise<TrpcRecorder> {
  return await routeTrpc(page, {
    "plugin.list": () => routes.plugins ?? [CAPTIONER],
    "plugin.listSurfaces": () => [],
    "plugin.getLog": () => [],
    "sessions.me": () => USER_VIEWER,
    "connection.list": () => [FAST, FOREGROUND_ONLY, EMBEDDER],
    "connection.listBindings": routes.bindings ?? views({}),
    "connection.setBinding": routes.setBinding ?? grantBinding(FAST.id),
  });
}

async function openModel(page: Page): Promise<void> {
  await page.getByRole("button", { name: `${PLUGIN_MODEL_HEADING} — ${CAPTIONER.name}` }).click();
}

function picker(page: Page): Locator {
  return page.getByRole("combobox", { name: `Text requests model for ${CAPTIONER.name}` });
}

test("an unset task reads Not set, never the installer's own model it falls back to", async ({ mount, page }) => {
  // The readout resolves through the installer's own binding when the plugin has none, so `resolved` is set.
  await stub(page, { bindings: () => views({ resolved: RESOLVED_FAST }) });
  await mount(<PluginsSurfaceStory />);
  await openModel(page);

  await expect(picker(page)).toHaveText(PLUGIN_MODEL_UNSET);
  await expect(page.getByText(PLUGIN_MODEL_UNSET, { exact: true }).last()).toBeVisible();
  await expect(page.getByText(pluginModelReadout(FAST.label, true))).toHaveCount(0);
});

test("only compatible connections are offered, and each pick writes the plugin-grant actor, the plugin id and the task", async ({ mount, page }) => {
  const recorder = await stub(page);
  await mount(<PluginsSurfaceStory />);
  await openModel(page);

  await picker(page).click();
  await expect(page.getByRole("option", { name: EMBEDDER.label })).toHaveCount(0);
  await page.getByRole("option", { name: FAST.label }).click();
  await expect
    .poll(() => recorder.lastInput("connection.setBinding"))
    .toEqual({ task: "summarize", connectionId: FAST.id, actor: { kind: "plugin-grant", pluginId: PLUGIN_ID } });

  await picker(page).click();
  await page.getByRole("option", { name: PLUGIN_MODEL_UNSET }).click();
  await expect
    .poll(() => recorder.lastInput("connection.setBinding"))
    .toEqual({ task: "summarize", connectionId: null, actor: { kind: "plugin-grant", pluginId: PLUGIN_ID } });
  // Every read of this plugin's bindings names the plugin actor, never the installer's own.
  await expect.poll(() => recorder.lastInput("connection.listBindings")).toEqual({ actor: { kind: "plugin-grant", pluginId: PLUGIN_ID } });
});

test("a saved grant reads back as the connection it runs on", async ({ mount, page }) => {
  await stub(page, { bindings: () => views({ binding: grantBinding(FAST.id), resolved: RESOLVED_FAST }) });
  await mount(<PluginsSurfaceStory />);
  await openModel(page);

  await expect(picker(page)).toHaveText(FAST.label);
  await expect(page.getByText(pluginModelReadout(FAST.label, true))).toBeVisible();
});

test("a saved grant whose connection cannot run says so", async ({ mount, page }) => {
  await stub(page, { bindings: () => views({ binding: grantBinding(FAST.id), resolved: null, unavailableCause: "unavailable" }) });
  await mount(<PluginsSurfaceStory />);
  await openModel(page);

  await expect(page.getByText(pluginModelReadout(FAST.label, false))).toBeVisible();
});

test("a grant whose connection was deleted says so and offers the pick again", async ({ mount, page }) => {
  await stub(page, { bindings: () => views({ binding: grantBinding(null) }) });
  await mount(<PluginsSurfaceStory />);
  await openModel(page);

  await expect(page.getByText(PLUGIN_MODEL_DELETED)).toBeVisible();
  await expect(picker(page)).toHaveText(PLUGIN_MODEL_UNSET);
});

test("a connection that may not run unattended is refused inline beside the picker", async ({ mount, page }) => {
  await stub(page, { setBinding: () => trpcError({ code: "BAD_REQUEST", reason: "connection_background_refused" }) });
  await mount(<PluginsSurfaceStory />);
  await openModel(page);

  await picker(page).click();
  await page.getByRole("option", { name: FOREGROUND_ONLY.label }).click();
  await expect(page.getByRole("alert")).toHaveText(pluginModelBackgroundRefused(FOREGROUND_ONLY.label));
});

test("a refused read of a plugin's bindings shows the read-error surface, never a picker", async ({ mount, page }) => {
  await stub(page, { bindings: () => trpcError({ code: "BAD_REQUEST", reason: "connection_actor_foreign" }) });
  await mount(<PluginsSurfaceStory />);
  await openModel(page);

  await expect(page.locator('[data-slot="query-error"]')).toBeVisible();
  await expect(picker(page)).toHaveCount(0);
});

test("a refused write for a foreign plugin says the plugin is not yours", async ({ mount, page }) => {
  await stub(page, { setBinding: () => trpcError({ code: "BAD_REQUEST", reason: "connection_actor_foreign" }) });
  await mount(<PluginsSurfaceStory />);
  await openModel(page);

  await picker(page).click();
  await page.getByRole("option", { name: FAST.label }).click();
  await expect(page.getByRole("alert")).toHaveText(PLUGIN_MODEL_NOT_YOURS);
});

test("the read shows a loading placeholder, then an error with a retry", async ({ mount, page }) => {
  const held = trpcHold();
  let calls = 0;
  await stub(page, {
    bindings: () => {
      calls += 1;
      return calls === 1 ? held : trpcError({ code: "INTERNAL_SERVER_ERROR" });
    },
  });
  await mount(<PluginsSurfaceStory />);
  await openModel(page);

  await held.requested;
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  await expect(picker(page)).toHaveCount(0);
  held.release(trpcError({ code: "INTERNAL_SERVER_ERROR" }));
  await expect(page.locator('[data-slot="query-error"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("a plugin that routes nothing through its grant has no model disclosure", async ({ mount, page }) => {
  await stub(page, { plugins: [{ ...CAPTIONER, declaredCapabilities: ["chat.read"], grantedCapabilities: ["chat.read"] }] });
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByRole("button", { name: `What it's allowed to do — ${CAPTIONER.name}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `${PLUGIN_MODEL_HEADING} — ${CAPTIONER.name}` })).toHaveCount(0);
});
