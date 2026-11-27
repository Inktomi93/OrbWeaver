// @subject packages/inference/src/catalog/endpoint.ts
// A llama.cpp server states what its loaded model is through the status of its embeddings and rerank routes: a 501
// refusal, or a 400 naming a missing input. The probe reads that status whatever the body is, and never follows a
// redirect to a host the connection did not name (the host pin).
import { ProviderError } from "@orb/inference";
import { expect, test } from "@orb/testkit/node";
import { createRuntimeRoot, RUNTIME_ENDPOINT } from "../roles/runtime.fixtures.ts";

const SERVER_ROOT = new URL(RUNTIME_ENDPOINT).origin;
const MODEL = "local/loaded";
const ATTACKER = "http://attacker.invalid/steal";
const RERANK_PATH = "/rerank";
const EMBEDDINGS_PATH = "/v1/embeddings";

interface Probe {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

/** A llama.cpp server: the list and `/props` answer, each probe route answers as scripted, and every URL asked is kept. */
function llamaServer(probes: Readonly<Record<string, Probe>>, requested: string[]): typeof fetch {
  return (input, init) => {
    const request = new Request(input, init);
    const { pathname } = new URL(request.url);
    requested.push(request.url);
    if (pathname === "/v1/models") {
      return Promise.resolve(Response.json({ data: [{ id: MODEL }] }));
    }
    if (pathname === "/props") {
      return Promise.resolve(Response.json({ ["build_info"]: "b5000-abc", ["default_generation_settings"]: { ["n_ctx"]: 8192 } }));
    }
    const probe = probes[pathname];
    return Promise.resolve(
      probe === undefined
        ? new Response("not found", { status: 404 })
        : new Response(probe.body ?? null, { status: probe.status, ...(probe.headers === undefined ? {} : { headers: probe.headers }) }),
    );
  };
}

/** Resolve a chat turn on a llama.cpp connection; the resolve warm runs the kind probes on the connection's own model. */
async function resolveChat(probes: Readonly<Record<string, Probe>>, requested: string[]): Promise<void> {
  await using root = await createRuntimeRoot({ providerFetch: llamaServer(probes, requested) });
  const principal = await root.principalFor(root.ownerId);
  const row = await root.services.connection.create({
    principal,
    providerId: "llama-cpp",
    credentialId: null,
    baseUrl: `${SERVER_ROOT}/v1`,
    model: MODEL,
  });
  await root.services.connection.resolve({ signal: new AbortController().signal, principal, task: "chat", connectionId: row.id });
}

test("a 400 refusal whose body is not JSON still states an embedder", async () => {
  const failure = await resolveChat({ [EMBEDDINGS_PATH]: { status: 400, body: "bad request" } }, []).catch((err: unknown) => err);
  expect(failure).toBeInstanceOf(ProviderError);
  expect(failure).toMatchObject({ kind: "forbidden", message: expect.stringMatching(/\(llama-cpp, embedding\) cannot serve "chat"/u) });
});

test("a 400 refusal that names the missing query states a reranker", async () => {
  const body = JSON.stringify({ error: { message: 'the "query" field is required' } });
  const failure = await resolveChat({ [RERANK_PATH]: { status: 400, body } }, []).catch((err: unknown) => err);
  expect(failure).toMatchObject({ kind: "forbidden", message: expect.stringMatching(/\(llama-cpp, rerank\) cannot serve "chat"/u) });
});

test("a 501 on both routes states a generation model, which a chat turn resolves on", async () => {
  const requested: string[] = [];
  await resolveChat({ [RERANK_PATH]: { status: 501 }, [EMBEDDINGS_PATH]: { status: 501 } }, requested);
  expect(requested.map((url) => new URL(url).pathname)).toEqual(expect.arrayContaining([RERANK_PATH, EMBEDDINGS_PATH]));
});

test("a redirect from a probe route is no answer and is never followed", async () => {
  const requested: string[] = [];
  const redirect: Probe = { status: 302, headers: { location: ATTACKER } };
  await resolveChat({ [RERANK_PATH]: redirect, [EMBEDDINGS_PATH]: redirect }, requested);
  // The probes ran (a mis-wired fixture would leave no probe to refuse), and the redirect target was never asked.
  expect(requested.map((url) => new URL(url).pathname)).toEqual(expect.arrayContaining([RERANK_PATH, EMBEDDINGS_PATH]));
  expect(requested.filter((url) => new URL(url).hostname === new URL(ATTACKER).hostname)).toEqual([]);
});
