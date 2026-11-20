// A server guest's failed `llm.quiet` rejects with the fixed sentence, the provider failure's kind and its retry flag,
// and nothing of the upstream reply. The provider transport is scripted at the network edge, one status per case.
// @subject packages/server/src/infra/plugin-host/process-runtime.ts
// @subject packages/server/src/infra/plugin-host/marshal.ts

import { spawn } from "node:child_process";
import type { PluginCapability, PluginLlmFailureKind } from "@orb/contracts/plugin";
import { PLUGIN_UI_HOST_CALL_FAILED } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import type { GuestOps } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  guestRunner,
  installGuest,
  seedCorpusActors,
} from "@orb/testkit/node/composed";

const UPSTREAM_DETAIL = "upstream detail the guest must not read";
const COMPLETIONS_PATH = "/chat/completions";
const CAPABILITIES = ["llm.quiet"] as const satisfies readonly PluginCapability[];
// The guest reports what its rejection carried, or `null` when the call succeeded.
const OPS = {
  quiet:
    "async (h) => { try { await h.llm.quiet('Summarise this'); return null; } catch (e) { return { name: e.name, message: e.message, kind: e.kind, retryable: e.retryable }; } }",
} satisfies GuestOps;

// Statuses the provider classifies without a retry, so each case answers at once. A retryable kind (a 429 or a 5xx)
// takes the backend's backoff first and crosses by the same path.
const CASES: readonly { readonly status: number; readonly kind: PluginLlmFailureKind }[] = [
  { status: 402, kind: "billing" },
  { status: 404, kind: "model_unavailable" },
  { status: 400, kind: "invalid" },
  // Last: an auth failure can revoke the installer's credential, which would change every case after it.
  { status: 401, kind: "auth_failed" },
];

test("a failed quiet call reaches the guest as the fixed sentence with its kind and retry flag, and no upstream text", {
  tags: ["slow"],
}, async () => {
  let failing: number | null = null;
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A quiet answer.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const network: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (failing !== null && request.method === "POST" && new URL(request.url).pathname.endsWith(COMPLETIONS_PATH)) {
      return new Response(JSON.stringify({ error: { message: UPSTREAM_DETAIL, type: UPSTREAM_DETAIL } }), {
        status: failing,
        headers: { "content-type": "application/json" },
      });
    }
    return await provider.execute(request);
  };
  await using root = await createServerHarness({ pluginSpawn: spawn, providerFetch: network });
  const { owner, connections } = await seedCorpusActors(root);
  const caller = await root.internalCallerFor(owner.userId);
  const pluginId = await installGuest(root, owner, { slug: "quiet-reader", capabilities: CAPABILITIES }, OPS);
  await caller.connection.setBinding({ task: "summarize", connectionId: connections.text.id, actor: { kind: "plugin-grant", pluginId } });
  const run = guestRunner({ root, caller: owner, pluginId, chatId: null });

  // Control: the same call succeeds while the provider answers.
  expect(await run("quiet")).toEqual({ ok: true, value: null });

  for (const { status, kind } of CASES) {
    failing = status;
    const outcome = await run("quiet");
    expect({ status, outcome }).toEqual({
      status,
      outcome: { ok: true, value: { name: "Error", message: PLUGIN_UI_HOST_CALL_FAILED, kind, retryable: false } },
    });
    expect(JSON.stringify(outcome)).not.toContain(UPSTREAM_DETAIL);
  }
});
