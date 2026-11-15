// @subject packages/inference/src/backends/http/error-classify.ts
// A 429 before anything streams is retried on every hosted chat wire. With `Retry-After` the retry waits the stated
// seconds; without one it waits the exponential backoff, which never equals that figure.
import type { Wire } from "@orb/contracts/inference";
import { MS_PER_SECOND } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import { observeRuntimeTimers } from "../roles/runtime.fixtures.ts";
import type { ChatScript } from "./runtime.fixtures.ts";
import { driveChat } from "./runtime.fixtures.ts";

const RETRY_AFTER_SECONDS = 2;
const STATED_WAIT_MS = RETRY_AFTER_SECONDS * MS_PER_SECOND;
const REQUEST_TIMEOUT_MS = 50;

const ROWS: readonly { readonly providerId: string; readonly wire: Wire; readonly stop: string }[] = [
  { providerId: "openai", wire: "openai-compat", stop: "stop" },
  { providerId: "openrouter", wire: "openai-compat", stop: "stop" },
  { providerId: "nanogpt", wire: "openai-compat", stop: "stop" },
  { providerId: "literouter", wire: "openai-compat", stop: "stop" },
  { providerId: "anthropic", wire: "anthropic-messages", stop: "end_turn" },
  { providerId: "google", wire: "google-generative-ai", stop: "stop" },
];

function limited(headers: Record<string, string>): () => Response {
  return () => Response.json({ error: { message: "Rate limit exceeded", type: "rate_limit_error" } }, { status: 429, headers });
}

async function retriedTurn(row: (typeof ROWS)[number], headers: Record<string, string>): Promise<{ readonly waitMs: number; readonly reply: string }> {
  const timer = observeRuntimeTimers();
  const cancel = new AbortController();
  const script: ChatScript = { deltas: ["Hi"], stop: row.stop, tokensIn: 3, tokensOut: 1 };
  const outcome = driveChat(row.wire, {
    script,
    providerId: row.providerId,
    refusals: [limited(headers)],
    timers: timer.timers,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    signal: cancel.signal,
  });
  try {
    // Besides each request's idle window, the retry's wait is the one window the turn asks for.
    const wait = await Promise.race([
      timer.next((window) => window.ms !== REQUEST_TIMEOUT_MS, cancel.signal),
      outcome.then((): never => {
        throw new Error("the rate-limited turn settled before asking for its retry window");
      }),
    ]);
    wait.fire();
    return { waitMs: wait.ms, reply: (await outcome).turn.reply };
  } finally {
    cancel.abort();
    await outcome.catch(() => undefined);
  }
}

test.for(ROWS)("a $providerId 429 with Retry-After retries after the stated seconds", async (row) => {
  const { waitMs, reply } = await retriedTurn(row, { ["retry-after"]: String(RETRY_AFTER_SECONDS) });
  expect(waitMs).toBe(STATED_WAIT_MS);
  expect(reply).toBe("Hi");
});

test.for(ROWS)("a $providerId 429 without Retry-After retries after the backoff", async (row) => {
  const { waitMs, reply } = await retriedTurn(row, {});
  expect(waitMs).toBeGreaterThan(0);
  expect(waitMs).not.toBe(STATED_WAIT_MS);
  expect(reply).toBe("Hi");
});
