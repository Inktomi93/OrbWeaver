// backends/agent-sdk/catalog — THE ERROR-PROSE HYGIENE of the THIRD upstream-prose path.
//
// `providerErrorFromHttp`, `fetch-json.ts::safeErrorBody` and this file's `discoveryError` are the three
// places text we did not author becomes a `ProviderError.message`. Until 2026-09-20 this one composed no
// hygiene at all: it interpolated the raw SDK `err.message` and kept the raw thrown object as `cause`, on a
// boundary that is credential-bearing by construction (the daemon spawns under the user's subscription token).
//
// These arms are the planted control in both directions: a secret-shaped literal must not survive, an
// ordinary message must stay READABLE and bounded, and a healthy discovery must still return rows. They drive
// the REAL backend through its injected `query` seam, so nothing under test is mocked.

import type { AgentSdkModel } from "@orb/contracts/inference";
import { createAgentSdkBackend } from "../../../../packages/inference/src/backends/agent-sdk/index.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import type { InferenceLog } from "../../../../packages/inference/src/deps.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeApiKeySecret, newUserId } from "../../_support.ts";

/** `sanitizeApiError`'s cap plus its truncation marker — the bound every provider message obeys. */
const SANITIZED_CEILING = 600;
const TOKEN = "sk-ant-oat01-0123456789abcdef0123456789abcdef";

function silentLog(): InferenceLog {
  const noop: InferenceLog["info"] = (): void => undefined;
  return { debug: noop, info: noop, warn: noop, error: noop };
}

/** The SDK `query` test seam (`deps.agentSdk.query`, typed `unknown` and narrowed by `isQuery`): a function
 *  returning a handle whose `supportedModels()` answers however the arm wants. `interrupt()` is the `finally`
 *  teardown the real path always runs. */
function queryAnswering(supportedModels: () => Promise<unknown>): () => unknown {
  return () => ({ supportedModels, interrupt: (): Promise<void> => Promise.resolve() });
}

function backendWith(query: () => unknown): ReturnType<typeof createAgentSdkBackend> {
  return createAgentSdkBackend({
    now: () => 0,
    log: silentLog(),
    env: { claudeExecutable: "/usr/bin/claude", hostEnvAllowlist: () => ({ PATH: "/usr/bin", HOME: "/home/test" }) },
    userRuntimeDir: (ownerId, tool) => `/tmp/orb-test/${ownerId}/${tool}`,
    agentSdk: { summarizeConcurrency: () => 1, query },
    // No real timer is armed: the discovery bound must never decide one of these arms.
    scheduleTimeout: () => (): void => undefined,
  });
}

async function discoveryFailure(supportedModels: () => Promise<unknown>): Promise<ProviderError> {
  const backend = backendWith(queryAnswering(supportedModels));
  const caught: unknown = await backend.catalog({ ownerId: newUserId(), credential: fakeApiKeySecret(TOKEN) }).catch((err: unknown) => err);
  if (!(caught instanceof ProviderError)) {
    throw new Error(`expected a ProviderError, got ${String(caught)}`);
  }
  return caught;
}

test("a reflected subscription token is scrubbed BY VALUE before anything mangles it (#1809 order)", async () => {
  const error = await discoveryFailure(() => Promise.reject(new Error(`auth rejected for ${TOKEN} — refresh the token`)));

  expect(error.message).not.toContain(TOKEN);
  // The scrub is by VALUE, not by deletion: the operator still reads what the daemon said.
  expect(error.message).toContain("auth rejected");
  expect(error.message).toContain("refresh the token");
  expect(error.kind).toBe("server");
});

test("a noisy SDK message reaches the message as TEXT — markup stripped, control chars dropped, capped", async () => {
  const noisy = `<html><body><h1>Daemon died</h1><p>exit\u0007 ${"filler ".repeat(300)}</p></body></html>`;
  const error = await discoveryFailure(() => Promise.reject(new Error(noisy)));

  expect(error.message).not.toContain("<h1>");
  expect(error.message).not.toContain("\u0007");
  expect(error.message).toContain("Daemon died");
  expect(error.message.length).toBeLessThan(SANITIZED_CEILING);
});

test("the raw thrown SDK object does not survive as `cause` — a later logger cannot serialize what it carried", async () => {
  const raw = Object.assign(new Error(`boom ${TOKEN}`), { responseBody: `{"key":"${TOKEN}"}` });
  const error = await discoveryFailure(() => Promise.reject(raw));

  expect(error.cause).not.toBe(raw);
  expect(JSON.stringify({ message: error.message, cause: error.cause instanceof Error ? error.cause.message : error.cause })).not.toContain(TOKEN);
});

test("a `ProviderError` we minted ourselves passes through untouched — its message is our own vocabulary", async () => {
  const mine = new ProviderError({ kind: "auth_failed", retryable: false, message: "the daemon refused the token" });
  const error = await discoveryFailure(() => Promise.reject(mine));

  expect(error).toBe(mine);
  expect(error.kind).toBe("auth_failed");
});

test("POSITIVE CONTROL — a healthy discovery still normalizes the daemon's rows", async () => {
  const backend = backendWith(
    queryAnswering(() =>
      Promise.resolve([
        {
          value: "sonnet",
          resolvedModel: "claude-sonnet-4-5",
          displayName: "Sonnet",
          description: "the default",
          supportsEffort: true,
          supportedEffortLevels: ["low", "high"],
        },
      ]),
    ),
  );
  const models = await backend.catalog({ ownerId: newUserId(), credential: fakeApiKeySecret(TOKEN) });
  expect(models).toEqual<AgentSdkModel[]>([
    {
      alias: "sonnet",
      resolvedModel: "claude-sonnet-4-5",
      displayName: "Sonnet",
      description: "the default",
      supportsEffort: true,
      effortLevels: ["low", "high"],
      supportsAdaptiveThinking: false,
    },
  ]);
});
