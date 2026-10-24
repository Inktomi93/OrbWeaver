// @subject packages/inference/src/roles/executor.ts
// @subject packages/inference/src/resolve/resolve-task.ts

import { expect, test } from "@orb/testkit/node";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { physicalSdkScenario } from "../backends/agent-sdk/regression-edge.fixtures.ts";
import { createRuntimeRoot, RUNTIME_ENDPOINT, RUNTIME_KEY, RUNTIME_TOKEN, runtimeConnection } from "./runtime.fixtures.ts";

const INPUT = { systemPrompt: "Summarize.", userPrompt: "An owned scene." };

test("a real owned HTTP connection executes, then current funding consent refuses the captured connection before another send", async () => {
  const authorizations: (string | null)[] = [];
  const providerFetch: typeof fetch = (_input, init) => {
    authorizations.push(new Request(_input, init).headers.get("authorization"));
    return Promise.resolve(
      new Response(`data: {"choices":[{"index":0,"delta":{"content":"summary"}}]}\n\n${terminalSseLine()}\n\n`, {
        headers: { "content-type": "text/event-stream" },
      }),
    );
  };
  await using root = await createRuntimeRoot({ providerFetch });
  const connection = await runtimeConnection(root, "summarize", {
    providerId: "custom-openai",
    model: "fixture-model",
    baseUrl: RUNTIME_ENDPOINT,
    key: RUNTIME_KEY,
    allowBackground: true,
    declared: { kind: "generation", features: { detectServer: false } },
  });
  expect((await root.app.runtime.executor.summarize({ connection, inputs: [INPUT] })).items[0]?.text).toBe("summary");
  expect(authorizations).toEqual([`Bearer ${RUNTIME_KEY}`]);
  await root.services.connection.update({
    principal: await root.principalFor(root.ownerId),
    connectionId: connection.connectionId,
    patch: { allowBackground: false },
  });
  await expect(root.app.runtime.executor.summarize({ connection, inputs: [INPUT] })).rejects.toMatchObject({ name: "NoConnectionError", retryable: false });
  expect(authorizations).toHaveLength(1);
});

test("a saved subscription credential reaches native Query and a current revocation refuses before another physical spawn", async () => {
  await using edge = physicalSdkScenario({
    frames: [
      { type: "system", subtype: "init", apiKeySource: "none", model: "claude-opus-5" },
      { type: "assistant", message: { content: [{ type: "text", text: "summary" }], ["stop_reason"]: "end_turn" } },
      {
        type: "result",
        subtype: "success",
        ["is_error"]: false,
        ["num_turns"]: 1,
        ["duration_api_ms"]: 1,
        ["terminal_reason"]: "completed",
        ["total_cost_usd"]: 0,
        errors: [],
        ["permission_denials"]: [],
        usage: { ["input_tokens"]: 5, ["output_tokens"]: 3 },
        modelUsage: {},
      },
    ],
  });
  await using root = await createRuntimeRoot({ sdkSpawn: edge.spawn });
  const connection = await runtimeConnection(root, "summarize", {
    providerId: "claude-sub",
    model: "claude-opus-5",
    baseUrl: null,
    key: RUNTIME_TOKEN,
    allowBackground: true,
  });
  expect((await root.app.runtime.executor.summarize({ connection, inputs: [INPUT] })).items[0]?.text).toBe("summary");
  expect(edge.environments.map((env) => env["CLAUDE_CODE_OAUTH_TOKEN"])).toEqual([RUNTIME_TOKEN]);
  const credentialId = connection.credential.credentialId;
  if (credentialId === null) {
    throw new Error("the persisted subscription lost its credential");
  }
  await root.services.credentials.markRevokedByUser({ principal: await root.principalFor(root.ownerId), credentialId });
  await expect(root.app.runtime.executor.summarize({ connection, inputs: [INPUT] })).rejects.toThrow();
  expect(edge.children).toHaveLength(1);
});
