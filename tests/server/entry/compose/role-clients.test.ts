// entry/compose/role-clients — THE single RoleClients binder. Pins the wiring the gold-standard composition
// seam depends on: the ASYNC per-user binder resolves each derive-role via `connection.resolveRole` and binds
// a thunk that dispatches through the executor with the RESOLVED credential+model (provenance correct on the
// `*Model` fields). There is no sync vLLM floor — a sync floor silently routed workload roles to vLLM,
// breaking providers.md invariant #6. Stub executor + stub resolveRole isolate the wiring.
// Also pins the CANCELLATION forward: the bound `summarize` puts the caller's AbortSignal onto the provider
// request. `@orb/contracts` is DOM/node-free, so the signal rides `SummarizeCallOptions` (infra) and this
// binder is the only place it becomes `SummarizeRequest.signal` — a dropped forward would leave the chat
// turn's Stop unable to cut a side-LLM that hangs.

import type { ChatApi, ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { EmbedResult, ImageEmbedResult, RerankResult, SummarizeResult } from "@orb/contracts/providers";
import type { ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ConnectionService } from "@orb/server/domain/connection";
import { bindRoleClientsForUser } from "@orb/server/entry/compose";
import type { EmbedRequest, ProviderExecutor, SummarizeRequest } from "@orb/server/infra/providers";
import { expect, test } from "../../../support/fixtures";

const OWNER = castId<UserId>("u_owner");

/** A `ProviderExecutor` that records every `embed` call; the other roles are inert (never exercised here). */
function recordingExecutor(): { executor: ProviderExecutor; embedCalls: EmbedRequest[]; summarizeCalls: SummarizeRequest[] } {
  const embedCalls: EmbedRequest[] = [];
  const summarizeCalls: SummarizeRequest[] = [];
  const executor: ProviderExecutor = {
    embed: (req) => {
      embedCalls.push(req);
      return Promise.resolve({} as unknown as EmbedResult);
    },
    rerank: () => Promise.resolve({} as unknown as RerankResult),
    imageEmbed: () => Promise.resolve({} as unknown as ImageEmbedResult),
    summarize: (req) => {
      summarizeCalls.push(req);
      return Promise.resolve({} as unknown as SummarizeResult);
    },
    runChatTurn: () => Promise.reject(new Error("unused")),
    runAgentTurn: () => Promise.reject(new Error("unused")),
    generateImage: () => Promise.reject(new Error("unused")),
  };
  return { executor, embedCalls, summarizeCalls };
}

/** A `resolveRole` that returns a distinct `model-<role>` + a marker credential per role. */
function stubConnection(): Pick<ConnectionService, "resolveRole"> {
  const conn: Pick<ConnectionService, "resolveRole"> = {
    resolveRole: ({ role }) => {
      const resolved: ResolvedConnection = {
        api: "chat-completions" as ChatApi,
        model: castId<ModelId>(`model-${role}`),
        credential: { source: "vllm" } as unknown as ResolvedCredential,
        // The binder reads `capability.context.window` for the summarizer token-guard tag — supply a minimal one.
        capability: { context: { window: 32_000 } } as unknown as ModelCapability,
      };
      return Promise.resolve(resolved);
    },
  };
  return conn;
}

test("bindRoleClientsForUser dispatches embed through the executor with the resolved credential+model", async () => {
  const { executor, embedCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser({ connection: stubConnection(), executor }, OWNER);

  await clients.embed("hello", { inputType: "query" });

  expect(embedCalls).toHaveLength(1);
  const req = embedCalls[0];
  expect(req?.input).toBe("hello");
  expect(req?.inputType).toBe("query");
  expect(req?.model).toBe("model-embed");
  expect((req?.credential as { source: string }).source).toBe("vllm");
});

test("bindRoleClientsForUser carries provenance-correct *Model tags from the resolved connections", async () => {
  const clients = await bindRoleClientsForUser({ connection: stubConnection(), executor: recordingExecutor().executor }, OWNER);

  expect(clients.embedModel).toBe("model-embed");
  expect(clients.rerankModel).toBe("model-rerank");
  expect(clients.imageEmbedModel).toBe("model-imageEmbed");
  expect(clients.summarizerModel).toBe("model-summarize");
});

test("bindRoleClientsForUser forwards the caller's AbortSignal onto the summarize request", async () => {
  const { executor, summarizeCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser({ connection: stubConnection(), executor }, OWNER);
  const controller = new AbortController();

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }], { temperature: 0.2, signal: controller.signal });

  expect(summarizeCalls).toHaveLength(1);
  // Identity, not presence: a fresh controller would abort nothing.
  expect(summarizeCalls[0]?.signal).toBe(controller.signal);
  expect(summarizeCalls[0]?.temperature).toBe(0.2);
});

test("a summarize call with no signal sends none (no fabricated controller)", async () => {
  const { executor, summarizeCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser({ connection: stubConnection(), executor }, OWNER);

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }]);

  expect(summarizeCalls[0]?.signal).toBeUndefined();
});
