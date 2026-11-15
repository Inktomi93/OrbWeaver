// @subject packages/contracts/src/inference/tasks.ts
// @subject packages/server/src/domain/connection/verbs/connections.ts
// The text tasks require text output, so a model whose list states image output only serves image generation and no
// chat, and a model whose output nothing states keeps the floor's text and every chat task. A new row nothing describes
// reads its server's list as it is created, since the add dialog binds Chat from the tasks the create returns.
import { unavailableCauseSchema } from "@orb/contracts/inference";
import { MS_PER_MINUTE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createRuntimeRoot, RUNTIME_ENDPOINT, RUNTIME_KEY } from "../roles/runtime.fixtures.ts";

const IMAGE_MODEL = "sdxl-turbo";
const TEXT_MODEL = "vendor/text-model";
const HTTP_UNAVAILABLE = 503;

// The rows as each list states them: LiteRouter marks the kind in `type`, OpenRouter in its output modalities.
const LITEROUTER_ROWS = [{ id: IMAGE_MODEL, ["display_name"]: "SDXL Turbo", object: "model", type: "image", variant: "base" }];
const openRouterRow = (id: string, output: readonly string[]): Record<string, unknown> => ({
  id,
  architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: output },
  ["supported_parameters"]: [],
});
const OPENROUTER_ROWS = [openRouterRow(TEXT_MODEL, ["text"]), openRouterRow(IMAGE_MODEL, ["image"])];

/** A provider whose model list answers `rows` while `up.list` holds, and a 503 otherwise. */
function service(rows: readonly Record<string, unknown>[], up: { list: boolean } = { list: true }): typeof fetch {
  return (input, init) => {
    const { pathname } = new URL(new Request(input, init).url);
    if (!pathname.endsWith("/models")) {
      return Promise.resolve(Response.json({ object: "list", data: [] }));
    }
    return Promise.resolve(up.list ? Response.json({ object: "list", data: rows }) : new Response("{}", { status: HTTP_UNAVAILABLE }));
  };
}

async function created(
  root: ServerTestHarness,
  providerId: string,
  model: string,
): Promise<Awaited<ReturnType<ServerTestHarness["services"]["connection"]["create"]>>> {
  const principal = await root.principalFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: providerId, key: RUNTIME_KEY });
  const baseUrl = providerId === "custom-openai" ? RUNTIME_ENDPOINT : null;
  return await root.services.connection.create({ principal, providerId, credentialId: credential.id, baseUrl, model });
}

test("a LiteRouter image model created before any list read serves image generation and no chat", async () => {
  await using root = await createRuntimeRoot({ providerFetch: service(LITEROUTER_ROWS) });
  expect((await created(root, "literouter", IMAGE_MODEL)).tasks).toEqual(["generateImage"]);
});

test("a LiteRouter image model created after the add dialog's list read serves the same", async () => {
  await using root = await createRuntimeRoot({ providerFetch: service(LITEROUTER_ROWS) });
  const principal = await root.principalFor(root.ownerId);
  const listing = await root.services.connection.draftCatalogModels({
    principal,
    providerId: "literouter",
    key: RUNTIME_KEY,
    signal: new AbortController().signal,
  });
  expect(listing.listed).toBe(true);
  expect((await created(root, "literouter", IMAGE_MODEL)).tasks).toEqual(["generateImage"]);
});

test("a Custom model whose output nothing states keeps every chat task", async () => {
  await using root = await createRuntimeRoot({ providerFetch: service([]) });
  expect((await created(root, "custom-openai", TEXT_MODEL)).tasks).toEqual(expect.arrayContaining(["chat", "summarize"]));
});

test.for([
  { model: TEXT_MODEL, chat: true, image: false },
  { model: IMAGE_MODEL, chat: false, image: true },
])("an OpenRouter model whose catalog states its output serves chat only when that output is text ($model)", async ({ model, chat, image }) => {
  await using root = await createRuntimeRoot({ providerFetch: service(OPENROUTER_ROWS) });
  const { tasks } = await created(root, "openrouter", model);
  expect({ chat: tasks.includes("chat"), image: tasks.includes("generateImage") }).toEqual({ chat, image });
});

// A list that cannot be read at create leaves the model unknown, so it reads as a chat model and can be bound; once the
// list answers, the binding reads unavailable with its cause instead of vanishing.
test("a Chat binding made before the list said the model makes images reads unavailable for an unmet requirement", async () => {
  const up = { list: false };
  await using root = await createRuntimeRoot({ providerFetch: service(LITEROUTER_ROWS, up) });
  const principal = await root.principalFor(root.ownerId);
  const row = await created(root, "literouter", IMAGE_MODEL);
  expect(row.tasks).toContain("chat");
  await root.services.connection.setBinding({ principal, task: "chat", connectionId: row.id });
  up.list = true;
  // Past the mirror's hold on the failed read, so the next read asks the server again.
  root.clock.advance(MS_PER_MINUTE);
  await root.services.connection.capabilities({ principal, connectionId: row.id, signal: new AbortController().signal, listFacts: true });
  const chat = (await root.services.connection.listBindings({ principal, signal: new AbortController().signal })).find((view) => view.task === "chat");
  expect({ bound: chat?.binding?.connectionId, resolved: chat?.resolved, cause: chat?.unavailableCause }).toEqual({
    bound: row.id,
    resolved: null,
    cause: unavailableCauseSchema.enum["requirement-unmet"],
  });
});
