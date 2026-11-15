// @subject packages/server/src/domain/connection/verbs/resolve.ts
// The add flow's limits read asks `connection.capabilities` for the facts the root already holds. On a local server
// that read must not dial: a model probe there can load the model, which is the wait the read exists to avoid.

import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

const MODEL = "qwen2.5:0.5b";
const BASE_URL = "http://127.0.0.1:11434/v1";
const HTTP_NOT_FOUND = 404;

/** A local Ollama server that answers every read the resolver can make, recording each path it is asked for. */
function recordingOllama(): { readonly fetch: typeof fetch; readonly requested: readonly string[] } {
  const requested: string[] = [];
  const answers: ReadonlyMap<string, () => Response> = new Map([
    ["/v1/models", (): Response => Response.json({ data: [{ id: MODEL }] })],
    ["/api/show", (): Response => Response.json({ ["model_info"]: {}, capabilities: ["completion"] })],
    ["/api/ps", (): Response => Response.json({ models: [] })],
    ["/api/version", (): Response => Response.json({ version: "0.12.0" })],
  ]);
  const scripted: typeof fetch = (input, init) => {
    const url = new URL(new Request(input, init).url);
    requested.push(url.pathname);
    const answer = answers.get(url.pathname);
    return Promise.resolve(answer === undefined ? new Response("{}", { status: HTTP_NOT_FOUND }) : answer());
  };
  return { fetch: scripted, requested };
}

test("the cached capabilities read of a just-added local row dials nothing, where the plain read dials and probes", async () => {
  const server = recordingOllama();
  await using root = await createServerHarness({ startJobs: false, providerFetch: server.fetch });
  const caller = await root.internalCallerFor(root.ownerId);
  const row = await caller.connection.create({ providerId: "ollama", baseUrl: BASE_URL, credentialId: null, model: MODEL, label: "Local Ollama" });

  const beforeCached = server.requested.length;
  const cached = await caller.connection.capabilities({ connectionId: row.id, cachedFacts: true });
  expect(server.requested.slice(beforeCached)).toEqual([]);
  // The read still answers: a generation row whose window nothing stated yet, which is what opens the limits step.
  expect(cached.capability.kind === "generation" ? cached.capability.generation.context.windowEstimated : null).toBe(true);

  // Positive control: the same read without the flag warms the row and probes its model.
  const beforePlain = server.requested.length;
  await caller.connection.capabilities({ connectionId: row.id });
  expect(server.requested.slice(beforePlain)).toEqual(expect.arrayContaining(["/v1/models", "/api/show"]));
});
