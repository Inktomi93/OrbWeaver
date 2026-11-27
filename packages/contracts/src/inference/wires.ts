// The WIRE axis — how bytes are spelled and parsed. The ONLY inference axis that is CODE: one backend per
// member in `@orb/inference`, and a plugin can never add one — providers are data, wires are not.
// `serves` is the policy CEILING for every provider on the wire (a provider row may narrow it, never
// widen it).

import { z } from "zod";
import type { ChatApi } from "./apis.ts";
import type { Task } from "./tasks.ts";

export const WIRES = ["openai-compat", "anthropic-messages", "google-generative-ai", "agent-sdk", "local-light"] as const;
export type Wire = (typeof WIRES)[number];
export const wireSchema = z.enum(WIRES) satisfies z.ZodType<Wire>;

export interface WireDef {
  /** The chat protocols this wire can speak. A provider row lists a SUBSET. */
  readonly apis: readonly ChatApi[];
  /** The tasks a backend for this wire implements — the ceiling `providerTasks` intersects. */
  readonly serves: readonly Task[];
}

export const WIRE_DEFS: Record<Wire, WireDef> = {
  "google-generative-ai": {
    apis: ["google-generative-ai"],
    serves: ["chat", "summarize", "structured", "generateImage", "embed", "imageEmbed"],
  },
  // Two transports (`openai-compatible`, `openrouter`), one backend over the Vercel AI SDK (§8.1), and two
  // chat protocols: `/chat/completions` and `/responses` (the latter over `@ai-sdk/openai`'s `.responses()`;
  // provider rows list the subset they actually serve).
  // `generateImage` rides the row's `features.images` arm, `rerank` the row's `features.rerankPath`,
  // `imageEmbed` a model whose embedding capability declares `input ∋ image` — the wire CAN serve them;
  // `connectionTasks` + `requirementMet` decide per row.
  "openai-compat": {
    apis: ["chat-completions", "responses"],
    serves: ["chat", "summarize", "structured", "generateImage", "embed", "imageEmbed", "rerank"],
  },
  // First-party API key over `@ai-sdk/anthropic` (§8.5).
  "anthropic-messages": {
    apis: ["anthropic-messages"],
    serves: ["chat", "summarize", "structured"],
  },
  // The subscription's wire and nothing else's.
  "agent-sdk": {
    apis: ["agent-sdk"],
    serves: ["chat", "summarize", "structured"],
  },
  // In-process ONNX runtime; a generation entry in `curated/local-light.json` + a `chat` method widens it.
  "local-light": {
    apis: [],
    serves: ["embed", "imageEmbed", "rerank"],
  },
};
