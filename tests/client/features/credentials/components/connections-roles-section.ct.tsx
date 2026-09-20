// CT: Settings → Connections → Model roles — one row per ROUTABLE TASK, each a Select over the user's
// COMPATIBLE connections writing `connection.setBinding`, beside the FOUR-ARM readout of what a turn
// resolves today, a per-clause `Needs:` rail, and the inline background refusal with its repair switch.
// `listBindings` returns one view per routable task.
//
// THE 2026-08-01 OWNER INCIDENT IS STILL THE POINT OF THIS FILE, AND ITS RULING SURVIVES WITH A CHANGED
// INPUT. For two hours the pane showed a full "OpenRouter · Claude Sonnet 5" row under a "Saved" chip while
// the DB held nothing and every turn resolved something else. The ruling was: the readout comes from the
// PERSISTED read and never from what the picker is showing. It still does — `{X}` is always the persisted
// connection. What is new is that the row can now SAY the two disagree ("Not applied yet — a turn still
// uses X."), which is §5.3a's divergence arm and the thing that would have named the incident out loud.
// The held-write arm below is where that is proven, because a held write is the only window in which the
// picker and the persisted read can be observed disagreeing.
//
// THE DIVERGENCE CONDITION IS DRAFT-vs-PERSISTED, NOT REQUEST-IN-FLIGHT — keying it on request state would
// call a SAVED selection unsaved for the length of a `busDriven` write's bus tick.
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
import { ROLE_ROWS_ORDERED, ROLE_STATUS_LABELS } from "../../../../../packages/client/src/features/credentials/lib/connections-model.ts";
import { hitExtent, touchFloorPx } from "../../../../support/browser/touch-floor.ts";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ConnectionsPaneNarrowStory, ConnectionsPaneWideStory, ConnectionsSettingsHostedStory, ConnectionsSettingsStory } from "../_ct-stories.tsx";

const AUTOSAVE_STATUS = '[data-slot="autosave-status"]';
const SET_BINDING_ROUTE = /setBinding/;

const CHAT_CONNECTION_ID = "user_connection_ctroles00001";
const UTILITY_CONNECTION_ID = "user_connection_ctroles00002";
const EMBED_CONNECTION_ID = "user_connection_ctroles00003";
const LOCAL_CHAT_CONNECTION_ID = "user_connection_ctroles00004";

/** A generation capability at the floor — text in, text out, no structured JSON. The CHEAP model §5.3a
 *  warns about: legal on the Utility slot and silently unable to do two of its three jobs. */
const TEXT_ONLY_CAPABILITY = {
  kind: "generation",
  generation: {
    reasoning: { mode: "none", enabled: false },
    sampling: {},
    input: ["text"],
    output: { maxTokens: { min: 1, max: 4096 }, modalities: ["text"] },
    context: { window: 8192, windowEstimated: true },
    turns: { roleHandlingFloor: "none", cacheMinTokens: 1024 },
  },
};

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
/** A chat row on the user's OWN SERVER — the only fixture with a host to name, which is what the blocked
 *  readout's §5.3a sentence ("can't reach {host}.") is derived from. */
const LOCAL_CHAT_ROW = connectionRow({
  id: LOCAL_CHAT_CONNECTION_ID,
  label: "Local chat",
  providerId: "custom-openai",
  providerLabel: "Your own server",
  baseUrl: "http://127.0.0.1:8000/v1",
  model: "Qwen/Qwen3-32B",
  tasks: ["chat"],
});
const EMBED_ROW = connectionRow({
  id: EMBED_CONNECTION_ID,
  label: "Local embedder",
  providerId: "custom-openai",
  providerLabel: "Your own server",
  baseUrl: "http://127.0.0.1:8000/v1",
  model: "Qwen/Qwen3-VL-Embedding-2B",
  tasks: ["embed"],
});

/** One `listBindings` view — one per ROUTABLE task, bound or not. */
function bindingView(task: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { task, binding: null, resolved: null, unavailableCause: null, ...over };
}

function binding(task: string, connectionId: string | null): Record<string, unknown> {
  return { id: `connection_binding_ct${task}`, actorKind: "user", userId: "user_ct_connections", ruleId: null, pluginId: null, task, connectionId };
}

/** A view whose binding RESOLVES — what a turn runs on today. */
function resolvedView(
  task: string,
  connectionId: string,
  resolved: { readonly providerId: string; readonly model: string; readonly capability?: unknown },
): Record<string, unknown> {
  return bindingView(task, {
    binding: binding(task, connectionId),
    resolved: {
      task,
      connectionId,
      providerId: resolved.providerId,
      model: resolved.model,
      capability: resolved.capability ?? TEXT_ONLY_CAPABILITY,
      requirement: { ok: true },
    },
  });
}

/** The one resolved row every arm below reuses — the OpenRouter chat connection, at the floor capability. */
const OPENROUTER_RESOLVED = { providerId: "openrouter", model: "anthropic/claude-sonnet-5" };

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
    readonly credentials?: readonly Record<string, unknown>[];
  } = {},
): Promise<RolesStub> {
  const recorder = await routeTrpc(page, {
    "sessions.me": () => ({ userId: "user_ct_connections", handle: "owner", globalRole: "owner" }),
    "connection.list": () => opts.connections ?? [CHAT_ROW, UTILITY_ROW, EMBED_ROW],
    "connection.listBindings": () => opts.bindings ?? UNBOUND,
    // Saved keys turns a credential's registry id into the provider's user-facing LABEL through the
    // registry rows — the one home for `ProviderDef.label`.
    "connection.providersAvailable": () => [],
    "credentials.list": () => opts.credentials ?? [],
    "connection.setBinding": () => ({ ok: true }),
    "connection.update": () => ({ ok: true }),
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
  // §5.3a's RENAME is the full string, and it is the row's HEADING: a user who reads "Summaries" and binds
  // a cheap text-only model silently breaks captioning, so the third consumer is named in the label itself.
  await expect(page.getByText("Utility model — summaries, structured extraction, captions", { exact: true })).toBeVisible();
  // …and F20 rides the section BODY, not only the nav teach text. A room never overrides a role.
  await expect(page.getByText("Rooms never override this", { exact: false })).toBeVisible();
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
  // The switch NAMES the connection it writes — a bare "background" cannot say which row it belongs to in a
  // list of N, and the Model-roles refusal offers this same switch under this same sentence.
  // The SUBJECT rides the accessible NAME; the visible label stays short. A screen-reader user has no row
  // context and needs the subject; a sighted reader already has it, and spelling it in pixels made the
  // trailing cluster wider than the identity block and truncated the connection's own name (measured at
  // 870px on the isolated stage, `config_to_connections`). The shipped one-word "background" had neither.
  const switchName = "Allow background work on OpenRouter · Claude Sonnet 5 · anthropic/claude-sonnet-5";
  await expect(section.getByRole("switch", { name: switchName, exact: true })).toBeChecked();
  await expect(section.getByText("Allow background work", { exact: true })).toBeVisible();
  await expect(section.getByText(switchName, { exact: true })).toHaveCount(0);
});

// THE THREE NO-DEFAULTS ACTIONS LIVE IN A MENU, not on the row. The sweep writes up to six bindings in one
// act — the pane's most consequential and least frequent action — so the row stays scannable and the action
// gets room for the gloss that NAMES what it will write.
test("the sweep is a MENU item whose gloss names the roles it will write", async ({ mount, page }) => {
  await stubPane(page, { connections: [connectionRow({ tasks: ["chat", "summarize", "generateImage"] })] });
  await mount(<ConnectionsSettingsStory />);

  const section = page.locator("#config-anchor-connections-connections");
  // Not a row button any more — that is the whole point of the move.
  await expect(section.getByRole("button", { name: "Use this connection for everything it can serve" })).toHaveCount(0);

  await section.getByRole("button", { name: "More actions for OpenRouter · Claude Sonnet 5 · anthropic/claude-sonnet-5" }).click();
  const sweep = page.getByRole("menuitem", { name: /^Use this connection for everything it can serve/u });
  await expect(sweep).toBeVisible();
  // The undo is knowable BEFORE the click — there is no default to fall back to (§7.2 F2/F16).
  await expect(sweep).toContainText("Sets Chat, Utility model and Image generation to this connection.");
});

// The confirm SHIPS; only its description moved. The shipped sentence was correct and unquantified, and a
// user cannot decide without knowing whether they break one role or five — nor that the KEY survives.
test("confirmed remove names the role COUNT, the roles, and that the key stays in Saved keys", async ({ mount, page }) => {
  await stubPane(page, {
    connections: [connectionRow({ credentialId: "user_credential_ctroles001" })],
    bindings: [
      resolvedView("chat", CHAT_CONNECTION_ID, OPENROUTER_RESOLVED),
      bindingView("summarize", { binding: binding("summarize", CHAT_CONNECTION_ID) }),
      ...UNBOUND.slice(2),
    ],
    credentials: [
      {
        id: "user_credential_ctroles001",
        provider: "openrouter",
        label: "work",
        hasMetadata: false,
        revokedAt: null,
        revokedReason: null,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
  });
  await mount(<ConnectionsSettingsStory />);

  const section = page.locator("#config-anchor-connections-connections");
  // The row's subtitle carries the CREDENTIAL clause: with several connections on one key, which key a row
  // uses is not derivable from anything else on the row.
  await expect(section.getByText('key "work"', { exact: false })).toBeVisible();

  await section.getByRole("button", { name: /^More actions for/u }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("2 model roles use it — Chat and Utility model.");
  await expect(dialog).toContainText("there is no default model");
  await expect(dialog).toContainText('The key "work" stays in Saved keys.');
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
  await expect(page.getByRole("option")).toHaveCount(0);

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
  // SETTLE: a Base UI popup stays mounted through its exit transition, so opening the next picker while the
  // first is still leaving resolves the identical option TWICE and the strict-mode violation reads as a
  // product defect. Barrier on the first listbox being gone.
  await expect(page.getByRole("option")).toHaveCount(0);

  // The SAME row on an attended task is bindable — the refusal is about the task's spend, not the row.
  await roleSelect(page, "Chat").click();
  await expect(page.getByRole("option", { name: "Cheap utility · openai/gpt-5-mini" })).toBeEnabled();
});

// THE REPAIR, which is the half §5.3a adds and the shipped row did not have: a refusal with no adjacent
// remedy sends the user to the connection list to find a switch nobody has told them the name of.
test("the refused row is repaired INLINE — the same sentence plus the switch that resolves it", async ({ mount, page }) => {
  const { recorder } = await stubPane(page);
  await mount(<ConnectionsSettingsStory />);

  const roles = page.locator("#config-anchor-connections-model-roles");
  await expect(roles.getByText("Cheap utility · openai/gpt-5-mini doesn't allow background work — turn it on to use it here.")).toBeVisible();

  const repair = roles.getByRole("switch", { name: "Allow background work on Cheap utility · openai/gpt-5-mini" });
  await expect(repair).not.toBeChecked();
  await repair.click();
  await expect
    .poll(() => recorder.lastInput("connection.update"), { intervals: [20, 50, 100] })
    .toEqual({
      connectionId: UTILITY_CONNECTION_ID,
      patch: { allowBackground: true },
    });
});

test("a role that already RUNS is not offered a repair it does not need", async ({ mount, page }) => {
  // The same refused connection is on the tree; what changed is that Utility resolves, so the row has no
  // problem. Four background rows each offering the same switch would be noise, not help.
  await stubPane(page, { bindings: [...UNBOUND.slice(0, 1), resolvedView("summarize", CHAT_CONNECTION_ID, OPENROUTER_RESOLVED), ...UNBOUND.slice(2)] });
  await mount(<ConnectionsSettingsStory />);

  const roles = page.locator("#config-anchor-connections-model-roles");
  await expect(roles.getByText("A turn uses OpenRouter · Claude Sonnet 5 · anthropic/claude-sonnet-5.")).toBeVisible();
  await expect(roles.getByRole("switch", { name: /^Allow background work on Cheap utility/u })).toHaveCount(0);
});

test("picking a connection writes EXACTLY that task's binding", async ({ mount, page }) => {
  const { recorder } = await stubPane(page);
  await mount(<ConnectionsSettingsStory />);

  await roleSelect(page, "Text embedding").click();
  await page.getByRole("option", { name: "Local embedder · Qwen/Qwen3-VL-Embedding-2B" }).click();

  await expect
    .poll(() => recorder.lastInput("connection.setBinding"), { intervals: [20, 50, 100] })
    .toEqual({ task: "embed", connectionId: EMBED_CONNECTION_ID });
  // SETTLE on the rendered arm first: the row is non-interactive while its write is in flight, so waiting for
  // it to come back enabled reads the recorder after the surface has finished rather than mid-transition.
  await expect(roleSelect(page, "Text embedding")).toBeEnabled();
  // One row's pick is one write — a slot that patched its neighbours would be the roleDefaults blob again.
  await expect.poll(() => recorder.count("connection.setBinding"), { intervals: [20, 50, 100] }).toBe(1);
});

// THE 2026-08-01 INCIDENT, re-pointed at the surface that replaced it — and at the arm §5.3a added for it.
// The readout's `{X}` is STILL the persisted connection while the pick is unreconciled; what the row gains
// is the ability to say the two disagree, instead of painting the pick as though it were live. The write is
// HELD OPEN so the window is observable rather than inferred.
test("an unreconciled pick says 'Not applied yet' and still names what a turn USES", async ({ mount, page }) => {
  await stubPane(page, { bindings: [resolvedView("chat", CHAT_CONNECTION_ID, OPENROUTER_RESOLVED), ...UNBOUND.slice(1)] });
  const release = await gateTheWrite(page);
  await mount(<ConnectionsSettingsStory />);

  const persisted = page.getByText("A turn uses OpenRouter · Claude Sonnet 5 · anthropic/claude-sonnet-5.");
  const chat = roleSelect(page, "Chat");
  await expect(persisted).toBeVisible();
  await expect(chat).toContainText("OpenRouter · Claude Sonnet 5");

  await chat.click();
  await page.getByRole("option", { name: "Cheap utility · openai/gpt-5-mini" }).click();

  // The steady sentence is GONE and the divergence sentence names the PERSISTED row — never the pick. A
  // surface that painted "A turn uses Cheap utility" here would be the 2026-08-01 phantom again.
  await expect(page.getByText("Not applied yet — a turn still uses OpenRouter · Claude Sonnet 5 · anthropic/claude-sonnet-5.")).toBeVisible();
  await expect(persisted).toHaveCount(0);
  await expect(page.getByText("A turn uses Cheap utility · openai/gpt-5-mini.")).toHaveCount(0);

  release();
});

// The unconfigured pane has no default to name (§7.2 — there is no default connection), and it must SAY so
// rather than rendering a blank that reads like a value.
test("an unbound row says nothing is set, and names no model", async ({ mount, page }) => {
  await stubPane(page);
  await mount(<ConnectionsSettingsStory />);

  await expect(page.getByText("Nothing — no connection is set.").first()).toBeVisible();
  await expect(page.getByText("Nothing — no connection is set.")).toHaveCount(ROLE_ROWS_ORDERED.length);
  // The shipped sentence read "A turn uses nothing — …", in which "uses nothing" parses for a beat as
  // "uses [the thing called] nothing". It is gone.
  await expect(page.getByText("A turn uses nothing", { exact: false })).toHaveCount(0);
});

// A binding that no longer resolves is NOT healed away and NOT rendered as if it worked. The shipped row put
// the raw cause CODE in a badge (`endpoint-unreachable`) — a schema word on a user surface; the cause is a
// clause of a SENTENCE now, and the dot carries the state.
test("a bound row that cannot resolve repeats the dot's own words and names the host", async ({ mount, page }) => {
  await stubPane(page, {
    connections: [CHAT_ROW, UTILITY_ROW, LOCAL_CHAT_ROW],
    bindings: [bindingView("chat", { binding: binding("chat", LOCAL_CHAT_CONNECTION_ID), unavailableCause: "endpoint-unreachable" }), ...UNBOUND.slice(1)],
  });
  await mount(<ConnectionsSettingsStory />);

  await expect(page.getByText("Set, but not running — can't reach 127.0.0.1:8000.")).toBeVisible();
  // The raw cause code never reaches the surface.
  await expect(page.getByText("endpoint-unreachable", { exact: true })).toHaveCount(0);
  // …and the picker still shows the row the user chose — the store's value, never a healed substitute.
  await expect(roleSelect(page, "Chat")).toContainText("Local chat");
});

// BOARD D's PROPERTY, ASSERTED: the dot has ONE axis (would a turn run) and it is never the only signal.
// Colour is not a channel a CT can read for a user with colour-vision loss — the accessible name and the
// sentence beside it are, and the blocked pair must agree WORD FOR WORD.
test("every dot state carries a plain-words name, and every state is decidable with the dot removed", async ({ mount, page }) => {
  await stubPane(page, {
    bindings: [
      resolvedView("chat", CHAT_CONNECTION_ID, OPENROUTER_RESOLVED),
      bindingView("summarize", { binding: binding("summarize", UTILITY_CONNECTION_ID), unavailableCause: "background-refused" }),
      ...UNBOUND.slice(2),
    ],
  });
  await mount(<ConnectionsSettingsStory />);

  // `exact` on EVERY one: Playwright's accessible-name match is a SUBSTRING by default, and "Running" is a
  // substring of "Set, but not running" — without it the amber row counts as green and the test lies.
  const roles = page.locator("#config-anchor-connections-model-roles");
  await expect(roles.getByRole("img", { name: ROLE_STATUS_LABELS.running, exact: true })).toHaveCount(1);
  await expect(roles.getByRole("img", { name: ROLE_STATUS_LABELS.blocked, exact: true })).toHaveCount(1);
  await expect(roles.getByRole("img", { name: ROLE_STATUS_LABELS.unset, exact: true })).toHaveCount(4);

  // The blocked readout REPEATS the dot's accessible name, which is what makes the amber dot decidable
  // without colour — and the sentence survives the dot being removed entirely.
  const blockedSentence = `${ROLE_STATUS_LABELS.blocked} — this connection doesn't allow background work.`;
  await expect(roles.getByText(blockedSentence)).toBeVisible();
  await roles.getByRole("img", { name: ROLE_STATUS_LABELS.blocked, exact: true }).evaluate((node) => node.remove());
  await expect(roles.getByText(blockedSentence)).toBeVisible();
  await expect(roles.getByText("A turn uses OpenRouter · Claude Sonnet 5 · anthropic/claude-sonnet-5.")).toBeVisible();
});

// A FAILED REQUIREMENT IS NOT THE DOT. The Utility slot's three consumers fail SEPARATELY, so the rail says
// which part — and a cannot-serve verdict is MUTED with its reason, never destructive colour: a chat model
// that cannot embed is not broken (§5.3a, and the 2026-09-20 review's ruling against the wall of red).
test("the Utility rail judges three clauses, says what each unmet one costs, and leaves the dot green", async ({ mount, page }) => {
  await stubPane(page, { bindings: [...UNBOUND.slice(0, 1), resolvedView("summarize", CHAT_CONNECTION_ID, OPENROUTER_RESOLVED), ...UNBOUND.slice(2)] });
  await mount(<ConnectionsSettingsStory />);

  const roles = page.locator("#config-anchor-connections-model-roles");
  await expect(roles.getByText("Needs:").first()).toBeVisible();
  await expect(roles.getByText("prose", { exact: true })).toBeVisible();
  // The two clauses a floor-capability model fails, each with its OWN consequence — one merged warning
  // could not say that turning nothing on still leaves summaries working.
  await expect(roles.getByText("structured JSON — structured extraction will skip", { exact: true })).toBeVisible();
  await expect(roles.getByText("image input — image captions will skip", { exact: true })).toBeVisible();
  // …and the role still RUNS, so its dot is green. Amber here would say "broken" about a row that
  // summarizes perfectly well.
  await expect(roles.getByRole("img", { name: ROLE_STATUS_LABELS.running, exact: true })).toHaveCount(1);

  // MUTED, not destructive: the failed chips must not paint in the destructive ink reserved for a BOUND
  // role that actually failed. Read the resolved colour rather than a class name.
  const destructive = page.evaluate(() => globalThis.getComputedStyle(document.documentElement).getPropertyValue("--color-destructive").trim());
  // A PLANTED CONTROL for the comparison: an empty token would make "not destructive" true of everything.
  await expect.poll(async () => await destructive).not.toBe("");
  const failedInk = async (): Promise<string> =>
    await roles.getByText("image input — image captions will skip", { exact: true }).evaluate((node) => globalThis.getComputedStyle(node).color);
  await expect.poll(async () => `${await failedInk()}|${await destructive}`).not.toMatch(/^(.+)\|\1$/u);
});

test("an UNJUDGED rail still states the requirement — a requirement the user cannot see is the failure it prevents", async ({ mount, page }) => {
  await stubPane(page);
  await mount(<ConnectionsSettingsStory />);

  const roles = page.locator("#config-anchor-connections-model-roles");
  // Nothing resolves anywhere, so there is no capability to judge against — and the rail is still drawn.
  await expect(roles.getByText("prose", { exact: true })).toBeVisible();
  await expect(roles.getByText("structured JSON", { exact: true })).toBeVisible();
  await expect(roles.getByText("1024-wide vectors", { exact: true }).first()).toBeVisible();
});

// P2, RE-DERIVED: this pane used to add a SECOND home and a second wording for "Saved" (a bare chip
// top-right against the shell's one bottom-left "Saved · Synced across your devices."). Every role write is
// an immediate mutation now, so the pane has no save state of its own to report at all. HONESTLY LABELLED —
// this is a FENCE, not a defect proof: it passes on today's tree by construction. What it guards is the
// re-introduction of a per-section status chip at this anchor.
test("hosted: the Connections pane paints no save status of its own", async ({ mount, page }) => {
  await stubPane(page, { bindings: [resolvedView("chat", CHAT_CONNECTION_ID, OPENROUTER_RESOLVED), ...UNBOUND.slice(1)] });
  await mount(<ConnectionsSettingsHostedStory />);

  // Barrier on a SETTLED rendered arm of the pane before reading the status seam.
  await expect(page.getByText("A turn uses OpenRouter · Claude Sonnet 5 · anthropic/claude-sonnet-5.")).toBeVisible();
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

// ═══ THE TWO MEASURED SETTINGS-BODY WIDTHS (§13 step 3b) ═════════════════════════════════════════════════
// 870 = the context panel CLOSED, 486 = OPEN. A point measurement never proves a range property, and the
// 486 arm is the one a lane ships broken: it is where the 52-character Utility heading, the badge rail and
// the picker all contend for one column.
// A LOOP CANNOT CARRY THE TWO ARMS: playwright-ct rewrites each imported story into a generated component
// const, so a story reached through an array element rather than by its own identifier fails the transform
// ("Identifier … has already been declared", measured on the first cut). Two explicit tests over one shared
// body is the shape the harness allows.
async function stubTheTwoDotStates(page: Page): Promise<void> {
  await stubPane(page, {
    bindings: [
      resolvedView("chat", CHAT_CONNECTION_ID, OPENROUTER_RESOLVED),
      bindingView("summarize", { binding: binding("summarize", EMBED_CONNECTION_ID), unavailableCause: "endpoint-unreachable" }),
      ...UNBOUND.slice(2),
    ],
  });
}

/** The teaching copy that must survive BOTH widths. §13 step 3b's rule: a row gloss WRAPS at 486, it does
 *  not lose its second sentence — and the F20 sentence is exempt from any cut anyone ever writes down. */
const COPY_THAT_NEVER_CUTS = [
  "Rooms never override this: a turn always runs on the connection of whoever triggered it.",
  "Utility model — summaries, structured extraction, captions",
  "Unset falls back to the captioned-text lens.",
  // The badge rail is the row's one unbounded element and it WRAPS rather than truncating — a requirement
  // the user cannot see is the exact failure the badges exist to prevent.
  "1024-wide vectors",
];

/** How many rendered nodes escape the section's own right edge — the honest "does it fit" measure at a
 *  FIXED width with `overflow: visible` (a content-sized mount root agrees with the bug). */
function bleedCount(page: Page): Promise<number> {
  return page.locator("#config-anchor-connections-model-roles").evaluate((section) => {
    const limit = section.getBoundingClientRect().right;
    return [...section.querySelectorAll("*")].filter((node) => node.getBoundingClientRect().right > limit + 1).length;
  });
}

/** How many connection-row TITLES are clipped by their own box. `scrollWidth > clientWidth` on the
 *  truncating span is the honest read: a `text-overflow: ellipsis` name reports its full width in
 *  `scrollWidth` and its painted width in `clientWidth`, so the ellipsis is measurable rather than guessed
 *  from a screenshot. */
function titleTruncationCount(page: Page): Promise<number> {
  return page.locator("#config-anchor-connections-connections").evaluate((section) => {
    const titles = [...section.querySelectorAll('[data-slot="list-row-title"]')];
    return titles.filter((node) => node.scrollWidth > node.clientWidth + 1).length;
  });
}

/** `title width − trailing-cluster width` on the WIDEST connection row, in CSS px. Negative means the
 *  row's controls have taken more of the line than its name, which is the squeeze the 486 arm must not be. */
function identityVersusControls(page: Page): Promise<number> {
  return page.locator("#config-anchor-connections-connections").evaluate((section) => {
    const rows = [...section.querySelectorAll('[data-slot="list-row-root"]')];
    const widths = rows.map((row) => {
      const title = row.querySelector('[data-slot="list-row-title"]');
      const actions = row.querySelector('[data-slot="list-row-actions"]');
      return title === null || actions === null ? 0 : title.getBoundingClientRect().width - actions.getBoundingClientRect().width;
    });
    return Math.min(...widths);
  });
}

test("at 870px (context panel closed) no copy is cut, nothing bleeds, and the switch keeps its gloss", async ({ mount, page }) => {
  await stubTheTwoDotStates(page);
  await mount(<ConnectionsPaneWideStory />);

  const roles = page.locator("#config-anchor-connections-model-roles");
  for (const copy of COPY_THAT_NEVER_CUTS) {
    await expect(roles.getByText(copy, { exact: false }).first()).toBeVisible();
  }
  await expect.poll(async () => await bleedCount(page)).toBe(0);

  // THE WIDE END OF THE CROSSOVER (the 486 arm below is the other): a row wide enough to hold it keeps the
  // switch's visible gloss. Asserted at BOTH ends because a point measurement never proves a range property.
  const connections = page.locator("#config-anchor-connections-connections");
  await expect(connections.getByText("Allow background work", { exact: true }).first()).toBeVisible();
  // …and the row's own NAME is never the thing that truncates — it is the row's identity.
  await expect.poll(async () => await titleTruncationCount(page)).toBe(0);
});

test("at 486px (context panel open) the row's NAME survives — the switch's gloss yields, the switch does not", async ({ mount, page }) => {
  await stubTheTwoDotStates(page);
  await mount(<ConnectionsPaneNarrowStory />);

  const roles = page.locator("#config-anchor-connections-model-roles");
  for (const copy of COPY_THAT_NEVER_CUTS) {
    await expect(roles.getByText(copy, { exact: false }).first()).toBeVisible();
  }
  await expect.poll(async () => await bleedCount(page)).toBe(0);

  // THE NARROW END. The gloss is the ONE redundant element in the trailing cluster — the Switch's own
  // accessible name already carries the whole sentence — so it is what yields, and the row's identity is
  // what it yields TO. A control that disappeared here would be a capability that disappeared.
  const connections = page.locator("#config-anchor-connections-connections");
  await expect(connections.getByText("Allow background work", { exact: true })).toHaveCount(0);
  await expect(connections.getByRole("switch", { name: /^Allow background work on /u }).first()).toBeVisible();
  await expect(connections.getByRole("button", { name: /^More actions for /u }).first()).toBeVisible();

  // STATED LIMIT, MEASURED RATHER THAN WISHED. A 52-character auto-minted label ("OpenRouter · Claude
  // Sonnet 5 · anthropic/claude-sonnet-5") still cannot fit beside a switch and a kebab in a 486px body, so
  // this is NOT a zero-truncation claim — the mock's answer is a STACK (identity full width, cluster on its
  // own line) and `ListRow` renders `actions` as an in-flow sibling with no stacking arm. What IS asserted
  // is the relationship that survives the squeeze: the row's IDENTITY is never narrower than its controls.
  // The gloss drop is what buys that; before it, the cluster was the wider of the two.
  await expect.poll(async () => await identityVersusControls(page)).toBeGreaterThanOrEqual(0);
});

// A COARSE POINTER IS A BROWSER-CONTEXT FLAG, not a viewport: at a fine pointer the floor token answers
// 28px, so a narrow viewport alone would measure the wrong floor. The mocks could not answer this at all —
// `model-roles.html` drew every control as a styled `div` and measured ZERO tappable candidates.
test.describe("coarse pointer — the row's picker and its repair switch meet the touch floor", () => {
  test.use({ hasTouch: true, viewport: { width: 486, height: 900 } });

  test("the picker and the background-repair switch are pressable with a finger", async ({ mount, page }) => {
    // Settled snapshot: pointer class is fixed when the browser CONTEXT is created, not by page state.
    await expect.poll(async () => await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await stubPane(page);
    await mount(<ConnectionsPaneNarrowStory />);

    const floor = await touchFloorPx(page);
    const picker = roleSelect(page, "Utility model");
    await expect(picker).toBeVisible();
    await expect.poll(async () => await hitExtent(picker, "y"), { intervals: [20, 50, 100, 200] }).toBeGreaterThanOrEqual(floor);

    // SCOPED to the roles section: the connection LIST row carries a switch with the IDENTICAL name, which
    // is §5.3a's intent (one switch, named one way on both surfaces) and a page-wide locator's ambiguity.
    const repair = page
      .locator("#config-anchor-connections-model-roles")
      .getByRole("switch", { name: "Allow background work on Cheap utility · openai/gpt-5-mini" });
    await expect(repair).toBeVisible();
    await expect.poll(async () => await hitExtent(repair, "y"), { intervals: [20, 50, 100, 200] }).toBeGreaterThanOrEqual(floor);
    await expect.poll(async () => await hitExtent(repair, "x"), { intervals: [20, 50, 100, 200] }).toBeGreaterThanOrEqual(floor);
  });
});
