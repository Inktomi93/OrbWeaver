// The Utility role as a CT stubs it: `connection.listBindings` with every routable role unbound except the Utility
// one, which runs on a listed connection or is not set. Pure `.ts`, so a CT spec's node side can import it.

import { ROUTABLE_TASKS } from "@orb/contracts/inference";
import type { TrpcRoutes, TrpcWireOutput } from "./route-trpc.ts";

type BindingView = TrpcWireOutput<"connection.listBindings">[number];
type ConnectionRow = TrpcWireOutput<"connection.list">[number];
type Capability = NonNullable<NonNullable<BindingView["resolved"]>["capability"]>;

export const UTILITY_CONNECTION_ID = "user_connection_ctutility001";

/** A generation capability at the floor: text in, text out, no structured JSON, no pictures. */
export const TEXT_ONLY_CAPABILITY = {
  kind: "generation",
  generation: {
    reasoning: { mode: "none", enabled: false },
    sampling: {},
    input: ["text"],
    output: { maxTokens: { min: 1, max: 4096 }, modalities: ["text"] },
    context: { window: 8192, windowEstimated: true },
    turns: {
      assistantPrefill: false,
      midConversationSystem: false,
      historySystemRows: false,
      roleHandlingFloor: "none",
      explicitPromptCache: false,
      cacheMinTokens: 1024,
    },
  },
} satisfies Capability;

/** The same floor model, able to read pictures. */
export const VISION_CAPABILITY = {
  ...TEXT_ONLY_CAPABILITY,
  generation: { ...TEXT_ONLY_CAPABILITY.generation, input: ["text", "image"] },
} satisfies Capability;

/** The connection the running Utility role resolves to, as `connection.list` returns it. */
export const UTILITY_ROW: ConnectionRow = {
  id: UTILITY_CONNECTION_ID,
  ownerId: "user_ct_utility",
  label: "Cheap utility",
  providerId: "openrouter",
  providerLabel: "OpenRouter",
  credentialId: null,
  baseUrl: null,
  model: "openai/gpt-5-mini",
  api: "auto",
  declared: null,
  extras: null,
  transport: null,
  modelCheck: "listed",
  allowBackground: true,
  promptCache: null,
  tasks: ["chat", "summarize", "structured"],
  createdAt: 0,
  updatedAt: 0,
};

/** Every routable role's view, with the Utility role `running` on {@link UTILITY_ROW} or `unset`. */
export function utilityBindings(state: "running" | "unset", capability: Capability = TEXT_ONLY_CAPABILITY): readonly BindingView[] {
  return ROUTABLE_TASKS.map((task): BindingView => {
    if (task !== "summarize" || state === "unset") {
      return { task, binding: null, resolved: null, unavailableCause: null };
    }
    return {
      task,
      binding: {
        id: "connection_binding_ctutility",
        actorKind: "user",
        userId: "user_ct_utility",
        ruleId: null,
        pluginId: null,
        task,
        connectionId: UTILITY_CONNECTION_ID,
      },
      resolved: {
        task,
        connectionId: UTILITY_CONNECTION_ID,
        providerId: UTILITY_ROW.providerId,
        wire: "openai-compat",
        api: "chat-completions",
        model: UTILITY_ROW.model,
        capability,
        requirement: { ok: true },
      },
      unavailableCause: null,
    };
  });
}

/** The two reads every Utility-aware surface makes, answered with a running Utility model: spread into a mount whose
 *  subject is not the Utility role, so the reads are fed rather than answered `null`. */
export const UTILITY_RUNNING_ROUTES: TrpcRoutes<"connection.list" | "connection.listBindings"> = {
  "connection.list": [UTILITY_ROW],
  "connection.listBindings": utilityBindings("running"),
};

/** The paid-run confirm's reads (its Utility line and the server's call count): a running Utility model and a run that
 *  calls no model, so a job starts at once unless a test overrides the count. Spread into any mount of the jobs
 *  section, which owns the confirm. */
export const PAID_RUN_ROUTES: TrpcRoutes<"connection.list" | "connection.listBindings" | "workloads.estimateModelCalls"> = {
  ...UTILITY_RUNNING_ROUTES,
  "workloads.estimateModelCalls": { calls: 0 },
};
