// @subject packages/client/src/features/credentials/components/connections-list-section.tsx
// Drawing the Connections list for a row the user only looked at reaches no provider. A just-added row bound to Chat
// has never been asked about its server, so the list reads its role from the facts held, and a request goes out only when
// the user asks for one, here by opening the model picker.

import { ROLE_ROWS_ORDERED } from "@orb/client/lib";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { moreActionsName } from "@orb/ui/lib";
import { USED_FOR_LABEL } from "#client/features/credentials/lib/connections-copy.ts";
import { ADD_MODEL_ACTION_LABELS } from "#client/features/credentials/lib/credentials-names.ts";
import type { ConnectionLimitsStory } from "./_connection-limits-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connection-limits-stories/ConnectionLimitsStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "connection.list",
  "connection.listBindings",
  "credentials.list",
  "credentials.storageStatus",
  "connection.providersAvailable",
  "connection.catalogModels",
  "search.spaceStatus",
] as const;
// A server on the user's own network reached through Custom OpenAI-compatible, which warms its row by asking the server
// to identify itself, listing its models and probing the one it serves.
const SERVER_HOST = "box.example.com";
const SERVER_URL = `https://${SERVER_HOST}/v1`;
const SERVER_PROVIDER = "custom-openai";
const SERVER_MODEL = "vendor/served-model";
const SERVER_LABEL = "Own server";
const PUBLIC_ADDRESS = "93.184.215.14";
const HTTP_NOT_FOUND = 404;
const WIDE = { width: 960, viewport: { width: 1440, height: 1000 } } as const;

/** The external server the root reaches, recording every request it is sent. */
function recordingServer(): { readonly fetch: typeof fetch; readonly requested: readonly string[] } {
  const requested: string[] = [];
  const scripted: typeof fetch = (input, init) => {
    const url = new URL(new Request(input, init).url);
    requested.push(url.pathname);
    if (url.hostname === SERVER_HOST && url.pathname === "/v1/models") {
      return Promise.resolve(Response.json({ object: "list", data: [{ id: SERVER_MODEL, object: "model" }] }));
    }
    return Promise.resolve(new Response("{}", { status: HTTP_NOT_FOUND }));
  };
  return { fetch: scripted, requested };
}

async function freshRoot(server: ReturnType<typeof recordingServer>): Promise<ServerTestHarness> {
  return await createServerHarness({
    startJobs: false,
    providerFetch: server.fetch,
    networkExecution: {
      fetch: server.fetch,
      resolver: (hostname: string): Promise<string[]> =>
        hostname === SERVER_HOST ? Promise.resolve([PUBLIC_ADDRESS]) : Promise.reject(new Error(`Unscripted address: ${hostname}`)),
    },
    secretBoxKey: Buffer.alloc(32, 23),
  });
}

test.use({ viewport: WIDE.viewport });

test("the list reads a just-added Chat row from held facts and reaches no provider, until the user opens the model picker", async ({ mount, page }) => {
  const server = recordingServer();
  await using root = await freshRoot(server);
  const caller = await root.internalCallerFor(root.ownerId);
  const row = await caller.connection.create({
    providerId: SERVER_PROVIDER,
    credentialId: null,
    baseUrl: SERVER_URL,
    model: SERVER_MODEL,
    label: SERVER_LABEL,
    // A row that states its kind reads no model list as it is created, so every request below is the list's or the picker's.
    declared: { kind: "generation" },
  });
  await caller.connection.setBinding({ task: "chat", connectionId: row.id });
  // The premise: adding and binding the row asked its server nothing, so whatever the list sends is the list's.
  expect(server.requested).toHaveLength(0);

  const calls = await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...READS]));
  await mount<typeof ConnectionLimitsStory>(STORY, { width: WIDE.width, appearance: appearanceSettingsSchema.parse({}) });
  const listRow = page.locator('[data-slot="list-row-root"]').filter({ hasText: SERVER_LABEL });
  const chatRole = ROLE_ROWS_ORDERED.find(({ task }) => task === "chat")?.label ?? "";
  // The list is drawn, and the row's rail names the role bound to it.
  const usedFor = page.getByRole("group", { name: new RegExp(`^${RegExp.escape(USED_FOR_LABEL)}:.*${RegExp.escape(SERVER_LABEL)}`, "u") });
  await expect(usedFor.getByText(chatRole, { exact: true })).toBeVisible();
  expect(calls.count("connection.listBindings")).toBeGreaterThan(0);
  expect(server.requested).toHaveLength(0);

  // Positive control: opening the model picker asks the server for its list.
  await listRow.getByRole("button", { name: new RegExp(`^${RegExp.escape(moreActionsName(""))}`, "u") }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${RegExp.escape(ADD_MODEL_ACTION_LABELS.server)}`, "u") }).click();
  await expect(page.getByRole("dialog").getByRole("option", { name: new RegExp(RegExp.escape(SERVER_MODEL), "u") })).toBeVisible();
  expect(server.requested).toContain("/v1/models");
});
