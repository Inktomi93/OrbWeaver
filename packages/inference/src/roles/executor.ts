// `createProviderExecutor(registry)` — the bound task surface. Each method dispatches on the request's
// resolved WIRE and runs inside the provider span. Policy was decided at RESOLVE (`canFund`,
// `requirementMet`, `connectionTasks`); the executor executes and never selects.

import type { BackendRegistry, ProviderExecutor } from "../contract/backend.ts";
import type { SpanFn } from "../deps.ts";
import { runTask } from "../registry/dispatch.ts";

export function createProviderExecutor(args: { readonly registry: BackendRegistry; readonly span: SpanFn }): ProviderExecutor {
  const { registry, span } = args;
  return {
    runChatTurn: (req) => runTask({ span, registry, task: "chat", pick: (b) => b.runChatTurn, req }),
    runAgentTurn: (req) => runTask({ span, registry, task: "agent", pick: (b) => b.runAgentTurn, req }),
    embed: (req) => runTask({ span, registry, task: "embed", pick: (b) => b.embed, req }),
    rerank: (req) => runTask({ span, registry, task: "rerank", pick: (b) => b.rerank, req }),
    imageEmbed: (req) => runTask({ span, registry, task: "imageEmbed", pick: (b) => b.imageEmbed, req }),
    summarize: (req) => runTask({ span, registry, task: "summarize", pick: (b) => b.summarize, req }),
    structured: (req) => runTask({ span, registry, task: "structured", pick: (b) => b.structured, req }),
    generateImage: (req) => runTask({ span, registry, task: "generateImage", pick: (b) => b.generateImage, req }),
  };
}
