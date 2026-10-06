// `createProviderExecutor(registry)` — the bound task surface. Each method dispatches on the request's
// resolved WIRE and runs inside the provider span. Policy was decided at RESOLVE (`canFund`,
// `requirementMet`, `connectionTasks`); the executor executes and never selects.

import type { BeginEmbeddingAccounting, EmbeddingAccounting, EmbeddingTask } from "@orb/contracts/embeddings";
import type { EmbedResult, ImageEmbedResult } from "@orb/contracts/providers";
import type { BackendRegistry, ProviderExecutor } from "../contract/backend.ts";
import type { Resolved } from "../contract/resolved.ts";
import type { SpanFn } from "../deps.ts";
import { runTask } from "../registry/dispatch.ts";

async function accounted<T>(accounting: EmbeddingAccounting, run: () => Promise<T>): Promise<T> {
  let result: T;
  try {
    result = await run();
  } catch (error) {
    try {
      await accounting.finish(false);
    } catch (accountingError) {
      // biome-ignore lint/style/useErrorCause: AggregateError takes options in its third argument; both failures remain in errors and the original execution is the cause.
      throw new AggregateError([error, accountingError], "Embedding execution and accounting settlement failed", { cause: error });
    }
    throw error;
  }
  await accounting.finish(true);
  return result;
}

export function createProviderExecutor(args: {
  readonly registry: BackendRegistry;
  readonly span: SpanFn;
  readonly beginEmbeddingAccounting: BeginEmbeddingAccounting;
}): ProviderExecutor {
  const { registry, span, beginEmbeddingAccounting } = args;
  const begin = (connection: Resolved, task: EmbeddingTask): EmbeddingAccounting =>
    beginEmbeddingAccounting({
      ownerId: connection.ownerId,
      connectionId: connection.connectionId,
      providerId: connection.providerId,
      model: connection.model,
      wire: connection.wire,
      task,
    });
  return {
    runChatTurn: (req) => runTask({ span, registry, task: "chat", pick: (b) => b.runChatTurn, req }),
    runAgentTurn: (req) => runTask({ span, registry, task: "agent", pick: (b) => b.runAgentTurn, req }),
    embed: (req): Promise<EmbedResult> => {
      const embeddingAccounting = begin(req.connection, "embed");
      return accounted(embeddingAccounting, () => runTask({ span, registry, task: "embed", pick: (b) => b.embed, req: { ...req, embeddingAccounting } }));
    },
    rerank: (req) => runTask({ span, registry, task: "rerank", pick: (b) => b.rerank, req }),
    imageEmbed: (req): Promise<ImageEmbedResult> => {
      const embeddingAccounting = begin(req.connection, "imageEmbed");
      return accounted(embeddingAccounting, () =>
        runTask({ span, registry, task: "imageEmbed", pick: (b) => b.imageEmbed, req: { ...req, embeddingAccounting } }),
      );
    },
    summarize: (req) => runTask({ span, registry, task: "summarize", pick: (b) => b.summarize, req }),
    structured: (req) => runTask({ span, registry, task: "structured", pick: (b) => b.structured, req }),
    generateImage: (req) => runTask({ span, registry, task: "generateImage", pick: (b) => b.generateImage, req }),
  };
}
