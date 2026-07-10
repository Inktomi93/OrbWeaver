// Shared mock-SDK stream builder for the agent-sdk backend tests (test-support-dry-punchlist.md W1g) —
// `streamOf()` was byte-identical across runner.test.ts / agent-runner.test.ts / verify-auth.test.ts: wraps
// a plain message array into an async generator so a fake `query` can hand it back without a live SDK spawn.

/** Wrap a plain array of mock-SDK message literals into an async generator — the fake `query()` return
 *  shape every agent-sdk backend test drives instead of a live spawn. */
export function streamOf(messages: readonly unknown[]): AsyncGenerator<never> {
  async function* gen(): AsyncGenerator<never> {
    await Promise.resolve();
    for (const message of messages) {
      yield message as never;
    }
  }
  return gen();
}
