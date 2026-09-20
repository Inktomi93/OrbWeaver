// CT: Settings → Connections → Model roles — one row per ROUTABLE TASK, each a Select over the user's
// COMPATIBLE connections writing `connection.setBinding`, beside the persisted readout of what a turn
// resolves TODAY. `listBindings` returns one view per routable task.
//
// THE 2026-08-01 OWNER INCIDENT IS STILL THE POINT OF THIS FILE, and the claim survives the rewrite intact:
// for two hours the pane showed a full "OpenRouter · Claude Sonnet 5" row under a "Saved" chip while the DB
// held nothing and every turn resolved something else. So the readout must come from the PERSISTED read and
// never from what the picker is currently showing — pinned below with the write HELD OPEN, which is the only
// window in which the two can disagree.
//
// Drives the PRODUCTION path: the real contributed sections through the config host's own resolver, with
// every read and the write stubbed at the network (routeTrpc).

import { TASKS } from "@orb/contracts/inference";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
// The row labels + render order are read from their ONE home rather than re-typed — a re-spelled literal is
// how a copy change goes green against a string nobody ships. A deep relative import (the `test-ids.ts`
// precedent in the sibling key-row CT): this module is pure `.ts`, so it is safe in a node-side CT spec,
// while the feature's own front door is a barrel that would pull `.tsx` in with it.
import { ROLE_ROWS_ORDERED } from "../../../../../packages/client/src/features/credentials/lib/connections-model.ts";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ConnectionsSettingsHostedStory, ConnectionsSettingsStory } from "../_ct-stories.tsx";

const AUTOSAVE_STATUS = '[data-slot="autosave-status"]';
const SET_BINDING_ROUTE = /setBinding/;

const CHAT_CONNECTION_ID = "user_connection_ctroles00001";
const UTILITY_CONNECTION_ID = "user_connection_ctroles00002";
const EMBED_CONNECTION_ID = "user_connection_ctroles00003";

/** A `connection.list` row — `UserConnection` plus the two derived fields the pane renders beside it
 *  (`ConnectionView`: the provider's label and the tasks this row may be bound to). */
function connectionRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: CHAT_CONNECTION_ID,
    ownerId: "user_ct_connections",
    label: "OpenRouter · Claude Sonnet 5",
    providerId: "openrouter",
    providerLabel: "OpenRouter",
    credentialId: null,
    baseUrl: null,
    model: "anthropic/claude-sonnet-5",
    api: "auto",
    declared: null,
    extras: null,
    transport: null,
    modelListed: true,
    allowBackground: true,
    tasks: ["chat"],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const CHAT_ROW = connectionRow({});
const UTILITY_ROW = connectionRow({
  id: UTILITY_CONNECTION_ID,
  label: "Cheap utility",
  model: "openai/gpt-5-mini",
  // The row a background task may NOT be bound to — the inline refusal's subject (§5.3a).
  allowBackground: false,
  tasks: ["chat", "summarize", "structured"],
});
const EMBED_ROW = connectionRow({
  id: EMBED_CONNECTION_ID,
  label: "Local embedder",
  providerId: "custom-openai",
  providerLabel: "Your own server",
  model: "Qwen/Qwen3-VL-Embedding-2B",
  tasks: ["embed"],
});

/** One `listBindings` view — one per ROUTABLE task, bound or not. */
function bindingView(task: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { task, binding: null, resolved: null, unavailableCause: null, ...over };
}

/** A view whose binding RESOLVES — what a turn runs on today. */
function resolvedView(task: string, connectionId: string, providerId: string, model: string): Record<string, unknown> {
  return bindingView(task, {
    binding: { id: `connection_binding_ct${task}`, actorKind: "user", userId: "user_ct_connections", ruleId: null, pluginId: null, task, connectionId },
    resolved: { task, connectionId, providerId, model },
  });
}

/** Every routable task unbound — the never-configured pane (there is no default connection, §7.2). */
const UNBOUND = ROLE_ROWS_ORDERED.map((row) => bindingView(row.task));

interface RolesStub {
  readonly recorder: TrpcRecorder;
}

async function stubPane(
  page: Page,
  opts: {
    readonly connections?: readonly Record<string, unknown>[];
    readonly bindings?: readonly Record<string, unknown>[];
  } = {},
): Promise<RolesStub> {
  const recorder = await routeTrpc(page, {
    "sessions.me": () => ({ userId: "user_ct_connections", handle: "owner", globalRole: "owner" }),
    "connection.list": () => opts.connections ?? [CHAT_ROW, UTILITY_ROW, EMBED_ROW],
    "connection.listBindings": () => opts.bindings ?? UNBOUND,
    "credentials.list": () => [],
    "connection.setBinding": () => ({ ok: true }),
  });
  return { recorder };
}

/** Hold `connection.setBinding` open; the returned fn lets it through. Registered AFTER routeTrpc so it wins
 *  the route, then `fallback()`s into the stub once released. */
async function gateTheWrite(page: Page): Promise<() => void> {
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(SET_BINDING_ROUTE, async (route) => {
    await held;
    await route.fallback();
  });
  return release;
}

/** The pane's Select for one role row, by the label the component gives it. */
function roleSelect(page: Page, label: string): Locator {
  return page.getByRole("combobox", { name: `${label} connection` });
}

// Every ROUTABLE task gets a slot — a task with no row is a capability the user can never point anywhere,
// and the render ORDER is the client's own decision (`ROLE_ROWS_ORDERED`), not the contract tuple's.
test("every routable task gets a row, in the pane's own render order", async ({ mount, page }) => {
  await stubPane(page);
  const component = await mount(<ConnectionsSettingsStory />);

  await expect(component.getByRole("heading", { name: "Model roles" })).toBeVisible();
  const labels = ROLE_ROWS_ORDERED.map((row) => row.label);
  await expect(page.getByRole("combobox")).toHaveCount(labels.length);
  await expect
    .poll(async () => await page.getByRole("combobox").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label"))))
    .toStrictEqual(labels.map((label) => `${label} connection`));
  // The Utility row's §5.3a copy names all three of its consumers — a cheap text-only model bound here
  // silently breaks captioning, so the row may not read as "summaries" alone.
  await expect(page.getByText("Summaries, structured extraction and image captions.", { exact: false })).toBeVisible();
});

test("a connection row speaks in Model roles and carries the exact bulk/background actions", async ({ mount, page }) => {
  await stubPane(page, { connections: [connectionRow({ tasks: TASKS })] });
  await mount(<ConnectionsSettingsStory />);

  const section = page.locator("#config-anchor-connections-connections");
  await expect(section.getByText("OpenRouter · Claude Sonnet 5 · anthropic/claude-sonnet-5", { exact: true })).toBeVisible();
  for (const label of ROLE_ROWS_ORDERED.map((row) => row.label)) {
    await expect(section.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(section.getByText("agent", { exact: true })).toHaveCount(0);
  await expect(section.getByText("structured", { exact: true })).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Use this connection for everything it can serve" })).toBeVisible();
  await expect(section.getByText("Allow background work on this connection", { exact: true })).toBeVisible();
  await expect(section.getByRole("switch", { name: "Allow background work on this connection: OpenRouter · Claude Sonnet 5" })).toBeChecked();
});

// A slot only ever offers what it can actually use: `connection.tasks` is the compatibility fact, and a row
// offered for a task it cannot serve is a binding that resolves to nothing on the first turn.
test("a row offers only the connections that can serve ITS task, plus the unset item", async ({ mount, page }) => {
  await stubPane(page);
  await mount(<ConnectionsSettingsStory />);

  await roleSelect(page, "Chat").click();
  // chat: the chat row and the utility row (both carry `chat`), never the embed-only row.
  await expect(page.getByRole("option", { name: "OpenRouter · Claude Sonnet 5 · anthropic/claude-sonnet-5" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Cheap utility · openai/gpt-5-mini" })).toBeVisible();
  await expect(page.getByRole("option", { name: /Local embedder/ })).toHaveCount(0);
  // A REQUIRED row's unset item says "Not set"; the optional (vector-space) rows say "None" — leaving one
  // unset means search reads nothing, which is not the same sentence as "no default".
  await expect(page.getByRole("option", { name: "Not set" })).toBeVisible();
  await page.keyboard.press("Escape");

  await roleSelect(page, "Image embedding").click();
  await expect(page.getByRole("option", { name: "None" })).toBeVisible();
});

// §5.3a — the SLOT is the first enforcement point for `canFund`: a background task on a row whose
// `allowBackground` is off is refused INLINE, with the reason, at authoring time. Otherwise a user binds
// Utility to a row that cannot fund it and ten consumers go quietly silent.
test("a background task refuses a row with background work off — disabled, with the reason as its description", async ({ mount, page }) => {
  await stubPane(page);
  await mount(<ConnectionsSettingsStory />);

  await roleSelect(page, "Utility model").click();
  const refused = page.getByRole("option", { name: "Cheap utility · openai/gpt-5-mini" });
  await expect(refused).toBeDisabled();
  await expect(refused).toHaveAccessibleDescription("This connection doesn't allow background work — turn it on to use it here.");
  await page.keyboard.press("Escape");

  // The SAME row on an attended task is bindable — the refusal is about the task's spend, not the row.
  await roleSelect(page, "Chat").click();
  await expect(page.getByRole("option", { name: "Cheap utility · openai/gpt-5-mini" })).toBeEnabled();
});

test("picking a connection writes EXACTLY that task's binding", async ({ mount, page }) => {
  const { recorder } = await stubPane(page);
  await mount(<ConnectionsSettingsStory />);

  await roleSelect(page, "Text embedding").click();
  await page.getByRole("option", { name: "Local embedder · Qwen/Qwen3-VL-Embedding-2B" }).click();

  await expect
    .poll(() => recorder.lastInput("connection.setBinding"), { intervals: [20, 50, 100] })
    .toEqual({ task: "embed", connectionId: EMBED_CONNECTION_ID });
  // One row's pick is one write — a slot that patched its neighbours would be the roleDefaults blob again.
  expect(recorder.count("connection.setBinding")).toBe(1);
});

// THE 2026-08-01 INCIDENT, re-pointed at the surface that replaced it. That pane rendered FORM state, so an
// in-flight (or never-landed) pick was painted as though it were live. This one has no form state at all:
// BOTH the picker's value and the readout come from the persisted `listBindings`, and the row goes
// non-interactive while its write is in flight. So the phantom's whole window is closed by construction —
// held write, so the window is observable rather than inferred, and this arm pins that the row says exactly
// ONE thing during it.
test("nothing in the row moves ahead of the write — the pick is never painted as live", async ({ mount, page }) => {
  await stubPane(page, { bindings: [resolvedView("chat", CHAT_CONNECTION_ID, "openrouter", "anthropic/claude-sonnet-5"), ...UNBOUND.slice(1)] });
  const release = await gateTheWrite(page);
  await mount(<ConnectionsSettingsStory />);

  const persisted = page.getByText("A turn uses openrouter · anthropic/claude-sonnet-5.");
  const chat = roleSelect(page, "Chat");
  await expect(persisted).toBeVisible();
  await expect(chat).toContainText("OpenRouter · Claude Sonnet 5");

  await chat.click();
  await page.getByRole("option", { name: "Cheap utility · openai/gpt-5-mini" }).click();

  // IN FLIGHT: the trigger is disabled (no second pick can race the first) and it still names the PERSISTED
  // row — not the one just clicked. The readout agrees with it, because both read the same persisted view.
  await expect(chat).toBeDisabled();
  await expect(chat).toContainText("OpenRouter · Claude Sonnet 5");
  await expect(chat).not.toContainText("Cheap utility");
  await expect(persisted).toBeVisible();

  release();
});

// The unconfigured pane has no default to name (§7.2 — there is no default connection), and it must SAY so
// rather than rendering a blank that reads like a value.
test("an unbound row says a turn uses nothing, and names no model", async ({ mount, page }) => {
  await stubPane(page);
  await mount(<ConnectionsSettingsStory />);

  await expect(page.getByText("A turn uses nothing — no connection is set.").first()).toBeVisible();
  await expect(page.getByText("A turn uses nothing — no connection is set.")).toHaveCount(ROLE_ROWS_ORDERED.length);
});

// A binding that no longer resolves is NOT healed away and NOT rendered as if it worked: the row keeps the
// selection, names the CAUSE in words, and badges it. Silently showing the picked row would send the reader
// looking for a bug in the model instead of at their own unreachable server.
test("a bound row that cannot resolve names its cause, and badges it", async ({ mount, page }) => {
  await stubPane(page, {
    bindings: [
      bindingView("chat", {
        binding: {
          id: "connection_binding_ctchat",
          actorKind: "user",
          userId: "user_ct_connections",
          ruleId: null,
          pluginId: null,
          task: "chat",
          connectionId: CHAT_CONNECTION_ID,
        },
        unavailableCause: "endpoint-unreachable",
      }),
      ...UNBOUND.slice(1),
    ],
  });
  await mount(<ConnectionsSettingsStory />);

  await expect(page.getByText("A turn uses nothing — endpoint-unreachable.")).toBeVisible();
  await expect(page.getByText("endpoint-unreachable", { exact: true })).toBeVisible();
  // …and the picker still shows the row the user chose — the store's value, never a healed substitute.
  await expect(roleSelect(page, "Chat")).toContainText("Claude Sonnet 5");
});

// P2, RE-DERIVED: this pane used to add a SECOND home and a second wording for "Saved" (a bare chip
// top-right against the shell's one bottom-left "Saved · Synced across your devices."). Every role write is
// an immediate mutation now, so the pane has no save state of its own to report at all. HONESTLY LABELLED —
// this is a FENCE, not a defect proof: it passes on today's tree by construction. What it guards is the
// re-introduction of a per-section status chip at this anchor.
test("hosted: the Connections pane paints no save status of its own", async ({ mount, page }) => {
  await stubPane(page, { bindings: [resolvedView("chat", CHAT_CONNECTION_ID, "openrouter", "anthropic/claude-sonnet-5"), ...UNBOUND.slice(1)] });
  await mount(<ConnectionsSettingsHostedStory />);

  // Barrier on a SETTLED rendered arm of the pane before reading the status seam.
  await expect(page.getByText("A turn uses openrouter · anthropic/claude-sonnet-5.")).toBeVisible();
  await expect(page.getByTestId("aggregate")).toHaveText("none");
  await expect(page.locator(AUTOSAVE_STATUS)).toHaveCount(0);
});

// P2, RE-DERIVED: two primaries of the same verb in one viewport, ~60px apart, neither obviously the next
// click. The "Add key" pair is gone with the keys section's add affordance (a key is minted from the
// connection form now), so the live instance of the same claim is the Connections list's "Add connection":
// the empty state owns the verb while there is nothing to list.
test("with nothing saved there is exactly ONE 'Add connection' — the empty state's", async ({ mount, page }) => {
  await stubPane(page, { connections: [] });
  await mount(<ConnectionsSettingsStory />);

  // EmptyState's title is a `<p>`, not a heading — barrier on the settled empty arm before the count.
  await expect(page.getByText("No connections yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add connection" })).toHaveCount(1);
  // And the saved-key view offers no add at all — its empty state teaches where a key comes from instead.
  await expect(page.getByText("No keys yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add key" })).toHaveCount(0);
});
