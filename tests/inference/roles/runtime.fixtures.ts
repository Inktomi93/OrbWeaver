import "@orb/testkit/node/composed-real.ts";
import type { Capability, DeclaredCapability, EndpointFeatures, GenerationCapability, Task } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, declaredCapabilitySchema } from "@orb/contracts/inference";
import type { Resolved } from "@orb/inference";
import type { ScheduleOp } from "@orb/kit/time";
import type { ControlledTimers } from "@orb/testkit/iso";
import { createControlledTimers, createFrozenClock, makeCapability, makeGenerationCapability } from "@orb/testkit/iso";
import type { ServerHarnessOptions, ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

type ConnectionFields = Omit<Parameters<ServerTestHarness["services"]["connection"]["create"]>[0], "principal">;

export const RUNTIME_KEY = "synthetic-runtime-fixture-key";
export const RUNTIME_TOKEN = "sk-ant-oat01-0123456789abcdef0123456789abcdef";
export const RUNTIME_ENDPOINT = "http://127.0.0.1:8703/v1";

/** Only the owned graph's external bytes and address resolution are scripted. */
export function createRuntimeRoot(options: ServerHarnessOptions = {}): Promise<ServerTestHarness> {
  return createServerHarness({
    startJobs: false,
    secretBoxKey: Buffer.alloc(32, 1),
    networkExecution: {
      resolver: (hostname) => {
        if (hostname === "box.local" || hostname === new URL(RUNTIME_ENDPOINT).hostname) {
          return Promise.resolve(["127.0.0.1"]);
        }
        if (BUILTIN_PROVIDERS.some((provider) => provider.baseUrl !== undefined && new URL(provider.baseUrl).hostname === hostname)) {
          return Promise.resolve(["93.184.215.14"]);
        }
        throw new Error(`unscripted runtime-fixture DNS lookup: ${hostname}`);
      },
    },
    ...options,
  });
}

/** Keep root interval/unref scheduling intact while controlling the task's injected idle window. */
export function runtimeTimers(schedule: ScheduleOp): ControlledTimers {
  return { ...createControlledTimers(createFrozenClock()), timeout: schedule };
}

export interface RequestedWindow {
  readonly ms: number;
  readonly live: () => boolean;
  readonly fire: () => void;
}

/** Observe the root's real scheduling asks; the test, never a global clock, chooses when each fires. */
export function observeRuntimeTimers(): {
  readonly timers: ControlledTimers;
  readonly next: (select: (window: RequestedWindow) => boolean, signal: AbortSignal) => Promise<RequestedWindow>;
} {
  const pending: RequestedWindow[] = [];
  let changed = Promise.withResolvers<void>();
  const schedule: ScheduleOp = (callback, ms) => {
    let active = true;
    pending.push({
      ms,
      live: () => active,
      fire: () => {
        if (active) {
          active = false;
          callback();
        }
      },
    });
    changed.resolve();
    return (): void => {
      active = false;
    };
  };
  return {
    timers: runtimeTimers(schedule),
    next: async (select, signal): Promise<RequestedWindow> => {
      for (;;) {
        signal.throwIfAborted();
        const index = pending.findIndex((window) => window.live() && select(window));
        if (index !== -1) {
          const window = pending.splice(index, 1)[0];
          if (window !== undefined) {
            return window;
          }
        }
        changed = Promise.withResolvers<void>();
        const cancelled = Promise.withResolvers<void>();
        const onAbort = (): void => cancelled.reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
        try {
          await Promise.race([changed.promise, cancelled.promise]);
        } finally {
          signal.removeEventListener("abort", onAbort);
        }
      }
    },
  };
}

/** Author the model facts shared by these wire scripts through the canonical capability builders. */
export function generationCapability(overrides: Partial<GenerationCapability> = {}): Capability {
  return makeCapability(
    makeGenerationCapability({
      reasoning: { mode: "adaptive", enabled: true, effortLevels: ["low", "medium", "high"], displayModes: ["summarized"] },
      sampling: { temperature: { min: 0, max: 1 } },
      input: ["text"],
      tools: { parallel: true },
      output: { maxTokens: { min: 1, max: 8192 }, structured: true, modalities: ["text"] },
      context: { window: 200_000 },
      turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "strict", explicitPromptCache: true },
      ...overrides,
    }),
  );
}

/** Persist the caller's real credential and connection, then let production resolve their authority. */
export async function runtimeConnection<T extends Task>(
  root: ServerTestHarness,
  task: T,
  fields: Omit<ConnectionFields, "credentialId"> & { readonly key?: string },
): Promise<Resolved<T>> {
  const principal = await root.principalFor(root.ownerId);
  const { key, ...connection } = fields;
  const credential = key === undefined ? null : await root.services.credentials.add({ principal, provider: fields.providerId, key });
  const row = await root.services.connection.create({ ...connection, principal, credentialId: credential?.id ?? null });
  const { resolved } = await root.app.runtime.resolve({ principal, task, connectionId: row.id, cachedFacts: true });
  return { ...resolved, task };
}

export interface WireConnectionInput<T extends Task> extends Omit<ConnectionFields, "baseUrl" | "credentialId" | "declared"> {
  readonly task: T;
  readonly baseUrl?: string | null;
  readonly key?: string;
  readonly capability?: Capability;
  readonly declaredFeatures?: EndpointFeatures;
  readonly declared?: DeclaredCapability;
}

/** The test's model declaration is stored data; production owns every fold and authority decision. */
export function wireConnection<T extends Task>(root: ServerTestHarness, input: WireConnectionInput<T>): Promise<Resolved<T>> {
  const { task, key, capability, declaredFeatures, declared, ...fields } = input;
  const provider = root.app.runtime.providers.registry.get(input.providerId, root.ownerId);
  if (provider === undefined) {
    throw new Error(`the wire fixture names no registered provider: ${input.providerId}`);
  }
  const defaultBaseUrl = provider.auth === "endpoint" ? RUNTIME_ENDPOINT : null;
  const defaultKey = provider.auth === "oauthToken" ? RUNTIME_TOKEN : RUNTIME_KEY;
  return runtimeConnection(root, task, {
    ...fields,
    baseUrl: input.baseUrl === undefined ? defaultBaseUrl : input.baseUrl,
    allowBackground: input.allowBackground ?? true,
    ...(key === undefined && provider.auth !== "apiKey" && provider.auth !== "oauthToken" ? {} : { key: key ?? defaultKey }),
    declared: declared ?? declaredCapabilitySchema.parse({ ...capability, features: { detectServer: false, ...declaredFeatures } }),
  });
}
