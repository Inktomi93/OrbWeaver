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
import type { EmbedRequest, ProviderExecutor, StructuredRequest, SummarizeRequest } from "@orb/server/infra/providers";
import { expect, test } from "../../../support/fixtures";

const OWNER = castId<UserId>("u_owner");

/** A `ProviderExecutor` that records `embed` + the two batch roles; the rest are inert. The `summarize` vs
 *  `structured` split lets a test assert the facade routes a `responseFormat` call to the structured role. */
function recordingExecutor(): {
  executor: ProviderExecutor;
  embedCalls: EmbedRequest[];
  summarizeCalls: SummarizeRequest[];
  structuredCalls: StructuredRequest[];
} {
  const embedCalls: EmbedRequest[] = [];
  const summarizeCalls: SummarizeRequest[] = [];
  const structuredCalls: StructuredRequest[] = [];
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
    structured: (req) => {
      structuredCalls.push(req);
      // A REAL minimal SummarizeResult (the split-routing pin reads only which role fired, not the payload).
      return Promise.resolve({ items: [], model: req.model } satisfies SummarizeResult);
    },
    runChatTurn: () => Promise.reject(new Error("unused")),
    runAgentTurn: () => Promise.reject(new Error("unused")),
    generateImage: () => Promise.reject(new Error("unused")),
  };
  return { executor, embedCalls, summarizeCalls, structuredCalls };
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

// The role SPLIT (owner ruling 2026-07-27): the `summarize` facade routes by intent — a plain call is real
// summarization (→ the `summarize` role); a `responseFormat` call is schema-constrained generation (→ the
// `structured` role). Callers are unchanged; the WIRE role + its observability + firewall are now honest.
test("a summarize call with responseFormat routes to the STRUCTURED role, NOT summarize", async () => {
  const { executor, summarizeCalls, structuredCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser({ connection: stubConnection(), executor }, OWNER);

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }], { responseFormat: { name: "x", schema: { type: "object" } } });

  expect(structuredCalls).toHaveLength(1);
  expect(structuredCalls[0]?.responseFormat).toEqual({ name: "x", schema: { type: "object" } });
  expect(summarizeCalls).toHaveLength(0); // the summarize role did NOT fire
});

test("a plain summarize call (no responseFormat) stays on the SUMMARIZE role", async () => {
  const { executor, summarizeCalls, structuredCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser({ connection: stubConnection(), executor }, OWNER);

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }]);

  expect(summarizeCalls).toHaveLength(1);
  expect(structuredCalls).toHaveLength(0);
});
