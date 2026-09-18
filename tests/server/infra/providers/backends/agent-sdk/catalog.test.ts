// @orb-waive-file test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
// fetchAgentSdkModels (catalog.ts via the backend's `fetchModels`), driven by a fake `query`. Load-bearing:
// the discovery opens a HELD-OPEN streaming query through the mode-1 firewall base (tools disabled, strict
// MCP, no settings), calls the daemon's `supportedModels()` CONTROL call (not a generation turn), normalizes
// the SDK `ModelInfo[]` into the SDK-free `AgentSdkModel[]` (optional flags default falsy, resolvedModel →
// null when absent), and `interrupt()`s the never-started turn in `finally`. A discovery failure becomes a
// typed ProviderError.

import type { AgentSdkModel } from "@orb/contracts/connection";
import { createAgentSdkBackend } from "@orb/server/infra/providers/backends/agent-sdk";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

/** The wired discovery fn (the backend always sets it; the cast drops the contract's `| undefined`). */
type FetchModelsFn = (req: { readonly signal?: AbortSignal }) => Promise<AgentSdkModel[]>;

/** The minimal fake `Query` handle the discovery uses — only `supportedModels()` + `interrupt()`. */
interface FakeQuery {
  readonly supportedModels: () => Promise<readonly unknown[]>;
  readonly interrupt: () => Promise<undefined>;
}

const DISCOVERY_FAILED_RE = /discovery failed/u;
const DISCOVERY_TIMEOUT_RE = /discovery timed out/u;

// The daemon's `supportedModels()` shape (a subset of SDK ModelInfo — snake/camel as the SDK emits).
const SDK_MODELS = [
  {
    value: "sonnet",
    resolvedModel: "claude-sonnet-5",
    displayName: "Sonnet",
    description: "Sonnet 5",
    supportsEffort: true,
    supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
    supportsAdaptiveThinking: true,
  },
  // A row with NO optional flags — normalization must default them (supportsEffort→false, levels→[],
  // adaptive→false) and resolvedModel→null.
  {
    value: "claude-haiku-4-5",
    displayName: "Haiku",
    description: "Haiku 4.5",
  },
];

/** The `query` arg shape the discovery passes (the held-open prompt + the firewalled options). */
interface QueryArgs {
  readonly options?: Record<string, unknown>;
}

/** A fake `query` return: the held-open stream is never iterated for discovery; only `supportedModels()`
 *  + `interrupt()` are used. `supportedModels` resolves the daemon rows; `interrupt` records it fired. */
function fakeQuery(models: readonly unknown[], interruptSpy: () => void): (args: QueryArgs) => FakeQuery {
  return (_args: QueryArgs): FakeQuery => ({
    supportedModels: (): Promise<readonly unknown[]> => Promise.resolve(models),
    interrupt: (): Promise<undefined> => {
      interruptSpy();
      return Promise.resolve(undefined);
    },
  });
}

describe("agent-sdk fetchModels (supportedModels discovery)", () => {
  test("normalizes the daemon rows + defaults optional flags + interrupts the turn", async () => {
    const interruptSpy = vi.fn();
    const query = vi.fn(fakeQuery(SDK_MODELS, interruptSpy));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: query as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });

    const models = await (backend.fetchModels as FetchModelsFn)({});

    expect(models).toEqual([
      {
        alias: "sonnet",
        resolvedModel: "claude-sonnet-5",
        displayName: "Sonnet",
        description: "Sonnet 5",
        supportsEffort: true,
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
        supportsAdaptiveThinking: true,
      },
      {
        alias: "claude-haiku-4-5",
        resolvedModel: null,
        displayName: "Haiku",
        description: "Haiku 4.5",
        supportsEffort: false,
        effortLevels: [],
        supportsAdaptiveThinking: false,
      },
    ]);
    // The never-started turn is torn down (no billed generation).
    expect(interruptSpy).toHaveBeenCalledTimes(1);

    // The spawn rides the FIREWALL BASE (tools disabled, strict MCP, no settings — the mode-1 discipline).
    const options = query.mock.calls[0]?.[0]?.options ?? {};
    expect(options["tools"]).toEqual([]);
    expect(options["strictMcpConfig"]).toBe(true);
    expect(options["settingSources"]).toEqual([]);
  });

  test("a wedged supportedModels() hits the bounded timeout → typed ProviderError, still interrupts", async () => {
    // The ROBUSTNESS guarantee: a spawn whose control-channel call never resolves can't hang the refresh.
    // withTimeout races the 15s bound → a retryable `server` ProviderError, and interrupt() STILL runs in
    // the finally (no leaked subprocess on the timeout branch).
    vi.useFakeTimers();
    try {
      const interruptSpy = vi.fn();
      const query = vi.fn(
        (): FakeQuery => ({
          // Never resolves — models the wedged daemon the timeout exists to defend against.
          supportedModels: (): Promise<readonly unknown[]> => new Promise<readonly unknown[]>(() => undefined),
          interrupt: (): Promise<undefined> => {
            interruptSpy();
            return Promise.resolve(undefined);
          },
        }),
      );
      const backend = createAgentSdkBackend({
        now: () => 0,
        query: query as never,
        refreshHostSubToken: () => Promise.resolve(false),
      });

      const pending = (backend.fetchModels as FetchModelsFn)({});
      const assertion = expect(pending).rejects.toThrow(DISCOVERY_TIMEOUT_RE);
      // Drive the fake clock past the 15s discovery bound so the timeout timer fires.
      await vi.advanceTimersByTimeAsync(15_000);
      await assertion;
      // interrupt() ran in the finally even though the primary call never settled — no subprocess leak.
      expect(interruptSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // #1474 item 2: the discovery deadline was NOT a deadline. `withTimeout` bounded supportedModels(), but
  // the `finally` then awaited `interrupt()` unbounded — so a daemon wedged on BOTH control calls kept the
  // caller pending forever despite the advertised 15s bound. The teardown is best-effort billing cleanup;
  // it may never be the thing that outlives the call it is cleaning up after.
  test("a wedged interrupt() cannot hold the caller — the teardown is bounded too, and the models still return", async () => {
    vi.useFakeTimers();
    try {
      const query = vi.fn(
        (): FakeQuery => ({
          supportedModels: (): Promise<readonly unknown[]> => Promise.resolve(SDK_MODELS),
          // Never settles — the wedged-teardown half the discovery bound did not cover.
          interrupt: (): Promise<undefined> => new Promise<undefined>(() => undefined),
        }),
      );
      const backend = createAgentSdkBackend({
        now: () => 0,
        query: query as never,
        refreshHostSubToken: () => Promise.resolve(false),
      });

      const pending = (backend.fetchModels as FetchModelsFn)({});
      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      // Well past the interrupt bound (and under the 15s discovery bound, so a green here is the TEARDOWN
      // deadline firing, never the discovery one).
      await vi.advanceTimersByTimeAsync(5000);
      expect(settled).toBe(true);
      // A timed-out teardown is logged, never thrown: the caller still gets the models it asked for.
      await expect(pending).resolves.toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a discovery failure becomes a typed ProviderError (and still interrupts)", async () => {
    const interruptSpy = vi.fn();
    const query = vi.fn(
      (): FakeQuery => ({
        supportedModels: (): Promise<readonly unknown[]> => Promise.reject(new Error("spawn crashed")),
        interrupt: (): Promise<undefined> => {
          interruptSpy();
          return Promise.resolve(undefined);
        },
      }),
    );
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: query as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });

    await expect((backend.fetchModels as FetchModelsFn)({})).rejects.toThrow(DISCOVERY_FAILED_RE);
    expect(interruptSpy).toHaveBeenCalledTimes(1);
  });
});
