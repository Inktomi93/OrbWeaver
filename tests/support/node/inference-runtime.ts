// The inference runtime slice the embeddings connection resolve runs over, faked at the provider edge only. Resolution
// is production's own `resolve` over a connections view scripted from the role clients' bound views; the funnel is
// production's; only the executor is scripted, forwarding to the test's encoders.

import type { Capability, DeclaredCapability, UserConnection } from "@orb/contracts/inference";
import type { ResolvedTaskView, RoleClients } from "@orb/contracts/role-clients";
import type { InferenceDeps } from "@orb/inference";
import { createInferenceRuntime, resolveEmbed } from "@orb/inference";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { createResolveEmbeddingConnection } from "@orb/server/domain/embeddings";
import { makeResolvedSecret, TEST_BASE_URL } from "./factories/resolved-connection.ts";

type EmbeddingRuntime = Parameters<typeof createResolveEmbeddingConnection>[0];
type EmbeddingTask = "embed" | "imageEmbed";

const EMBEDDING_TASKS = ["embed", "imageEmbed"] as const satisfies readonly EmbeddingTask[];
// The scripted rows are never re-stamped, so one fixed instant keeps every resolve deterministic.
const SCRIPTED_AT = 0;

/** One more row a funder owns beyond their bound ones, resolved only when a caller names it. */
export interface ScriptedOwnedRow {
  readonly id: UserConnectionId;
  readonly task: EmbeddingTask;
}

/** The view's capability as the row's declaration: the row states what the scripted encoder makes. */
function declaredOf(capability: Capability): DeclaredCapability {
  if (capability.kind !== "embedding") {
    return { kind: capability.kind };
  }
  const { localTextEncoding: _derived, ...embedding } = capability.embedding;
  return { kind: "embedding", embedding };
}

function rowOf(ownerId: UserId, id: UserConnectionId, task: EmbeddingTask, view: ResolvedTaskView): UserConnection {
  return {
    id,
    ownerId,
    label: `scripted ${task}`,
    providerId: view.providerId,
    credentialId: null,
    baseUrl: TEST_BASE_URL,
    model: view.model,
    api: "auto",
    declared: declaredOf(view.capability),
    extras: null,
    transport: null,
    modelCheck: "listed",
    allowBackground: true,
    promptCache: null,
    createdAt: SCRIPTED_AT,
    updatedAt: SCRIPTED_AT,
  };
}

/** Everything but the stores is the inert edge: no network, no credentials, no accounting. */
function scriptedDeps(stores: Pick<InferenceDeps, "connections" | "bindings">): InferenceDeps {
  const snapshots = new Map<string, string>();
  return {
    ...stores,
    beginEmbeddingAccounting: () => ({ recordBatch: () => Promise.resolve(), finish: () => Promise.resolve() }),
    now: () => SCRIPTED_AT,
    log: { debug: (): void => undefined, info: (): void => undefined, warn: (): void => undefined, error: (): void => undefined },
    span: (_name, fn) => Promise.resolve(fn()),
    superviseDetached: (): void => undefined,
    env: { hostEnvAllowlist: (): Readonly<Record<string, string>> => ({}) },
    app: { name: "orbweaver-test", url: "http://localhost:0" },
    snapshotStore: {
      read: (key) => Promise.resolve(snapshots.get(key) ?? null),
      write: (key, value): Promise<void> => {
        snapshots.set(key, value);
        return Promise.resolve();
      },
      deletePrefix: (prefix): Promise<void> => {
        for (const key of [...snapshots.keys()].filter((candidate) => candidate.startsWith(prefix))) {
          snapshots.delete(key);
        }
        return Promise.resolve();
      },
    },
    resolveCredential: () => Promise.resolve(makeResolvedSecret()),
    providerStore: {
      list: () => Promise.resolve({ rows: [], installs: [] }),
      putAdmin: () => Promise.reject(new Error("the scripted runtime registers no providers")),
      removeAdmin: () => Promise.reject(new Error("the scripted runtime registers no providers")),
      replacePlugin: () => Promise.reject(new Error("the scripted runtime registers no providers")),
      removePlugin: () => Promise.reject(new Error("the scripted runtime registers no providers")),
    },
    agentSdk: {},
    userRuntimeDir: (ownerId) => `/tmp/orb-test/${ownerId}/claude`,
    sdkFetch: () => Promise.reject(new Error("the scripted runtime has no network")),
  };
}

/** One task's production resolve over that task's scripted view. The view is re-read on every resolve, so a test
 *  that re-scripts it sees the next resolve move with it. */
function scriptedTaskRuntime(
  roleClients: { readonly resolved: RoleClients["resolved"] },
  task: EmbeddingTask,
  connectionOf: ((funder: UserId, task: EmbeddingTask) => UserConnectionId) | undefined,
  owned: (funder: UserId) => readonly ScriptedOwnedRow[],
): EmbeddingRuntime["resolve"] {
  const rows = new Map<UserConnectionId, UserConnection>();
  const bound = new Map<UserId, UserConnectionId>();
  const script = async (funder: UserId): Promise<void> => {
    const view = await roleClients.resolved(task);
    if (view === null) {
      bound.delete(funder);
      return;
    }
    const id = connectionOf?.(funder, task) ?? view.connectionId;
    rows.set(id, rowOf(funder, id, task, view));
    bound.set(funder, id);
    for (const extra of owned(funder).filter((row) => row.task === task)) {
      rows.set(extra.id, rowOf(funder, extra.id, task, view));
    }
  };
  const runtime = createInferenceRuntime(
    scriptedDeps({
      connections: {
        get: (id) => Promise.resolve(rows.get(id) ?? null),
        listForOwner: (ownerId) => Promise.resolve([...rows.values()].filter((row) => row.ownerId === ownerId)),
      },
      bindings: {
        lookup: ({ actorKind, actorId, task: bindingTask }) => {
          const connectionId = actorKind === "user" && bindingTask === task ? bound.get(castId<UserId>(actorId)) : undefined;
          return Promise.resolve(
            connectionId === undefined
              ? null
              : { id: mintTypeId(ID_PREFIX.connectionBinding), actorKind, userId: castId<UserId>(actorId), ruleId: null, pluginId: null, task, connectionId },
          );
        },
      },
    }),
  );
  return async (args) => {
    await script(args.principal.userId);
    return await (await runtime).resolve(args);
  };
}

/**
 * Production `resolve` over the role clients' bound views: each task the view binds is a row the funder owns and has
 * bound, named by `connectionOf` (default: the view's own row), and `owned` adds rows the funder holds unbound. The
 * scripted encoders receive the request's abort signal so a test can prove it reaches the model.
 */
export function makeEmbeddingRuntime(
  roleClients: {
    readonly resolved: RoleClients["resolved"];
    readonly embed: (
      input: string | readonly string[],
      opts: { readonly inputType?: "query" | "document"; readonly instruction?: string; readonly signal?: AbortSignal | undefined },
    ) => ReturnType<RoleClients["embed"]>;
    readonly imageEmbed: (
      input: Parameters<RoleClients["imageEmbed"]>[0],
      opts: { readonly signal?: AbortSignal | undefined },
    ) => ReturnType<RoleClients["imageEmbed"]>;
  },
  connectionOf?: (funder: UserId, task: EmbeddingTask) => UserConnectionId,
  owned: (funder: UserId) => readonly ScriptedOwnedRow[] = () => [],
): EmbeddingRuntime {
  // One scripted store and runtime per task: a fake bundle may bind both tasks to one row id with two different models,
  // which one stored row cannot say, so each task's resolve reads its own view of that row.
  const scripted = new Map(EMBEDDING_TASKS.map((task) => [task, scriptedTaskRuntime(roleClients, task, connectionOf, owned)] as const));
  return {
    resolve: (args): ReturnType<EmbeddingRuntime["resolve"]> => {
      const task = args.task;
      const runtime = task === "embed" || task === "imageEmbed" ? scripted.get(task) : undefined;
      if (runtime === undefined) {
        throw new Error(`the scripted runtime resolves embedding tasks only, not "${task}"`);
      }
      return runtime(args);
    },
    funnel: { embed: resolveEmbed },
    executor: {
      embed: (req): ReturnType<EmbeddingRuntime["executor"]["embed"]> =>
        roleClients.embed(req.input, {
          ...(req.inputType === undefined ? {} : { inputType: req.inputType }),
          ...(req.instruction === undefined ? {} : { instruction: req.instruction }),
          signal: req.signal,
        }),
      imageEmbed: (req): ReturnType<EmbeddingRuntime["executor"]["imageEmbed"]> => roleClients.imageEmbed(req.input, { signal: req.signal }),
    },
  };
}
